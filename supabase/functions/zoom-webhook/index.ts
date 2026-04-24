import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zm-signature, x-zm-request-timestamp",
};

async function verifyZoomSignature(secretToken, timestamp, body, signature) {
  const message = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", new TextEncoder().encode(secretToken));
  hmac.update(new TextEncoder().encode(message));
  const digest = await hmac.digest();
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `v0=${hex}` === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );

  const rawBody = await req.text();
  const secretToken = Deno.env.get("ZOOM_SECRET_TOKEN") || "";
  const timestamp = req.headers.get("x-zm-request-timestamp") || "";
  const signature = req.headers.get("x-zm-signature") || "";

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

  const event = payload.event;

  // Validação de URL (exigida pelo Zoom na configuração do webhook)
  if (event === "endpoint.url_validation") {
    const plainToken = payload.payload?.plainToken || "";
    const hmac = createHmac("sha256", new TextEncoder().encode(secretToken));
    hmac.update(new TextEncoder().encode(plainToken));
    const digest = await hmac.digest();
    const encryptedToken = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    return Response.json({ plainToken, encryptedToken }, { headers: corsHeaders });
  }

  // Verificar assinatura
  if (secretToken && timestamp && signature) {
    const valid = await verifyZoomSignature(secretToken, timestamp, rawBody, signature);
    if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401, headers: corsHeaders });
  }

  const meetingObj = payload.payload?.object || {};
  const meetingId = meetingObj.id;

  // Log do evento
  await supabase.from("zoom_webhook_log").insert({
    event_type: event,
    meeting_id: meetingId || null,
    payload,
    processed: false,
  });

  switch (event) {
    case "meeting.started":
      if (meetingId) await supabase.from("zoom_meetings").update({ status: "started", updated_at: new Date().toISOString() }).eq("zoom_meeting_id", meetingId);
      break;

    case "meeting.ended":
      if (meetingId) await supabase.from("zoom_meetings").update({ status: "ended", updated_at: new Date().toISOString() }).eq("zoom_meeting_id", meetingId);
      break;

    case "meeting.participant_joined": {
      if (meetingId) {
        const participant = meetingObj.participant;
        if (participant) {
          const { data: mtg } = await supabase.from("zoom_meetings").select("participants").eq("zoom_meeting_id", meetingId).single();
          if (mtg) {
            const parts = mtg.participants || [];
            if (!parts.some(p => p.user_id === participant.user_id)) {
              parts.push({ user_id: participant.user_id, user_name: participant.user_name, email: participant.email, join_time: participant.join_time });
              await supabase.from("zoom_meetings").update({ participants: parts, updated_at: new Date().toISOString() }).eq("zoom_meeting_id", meetingId);
            }
          }
        }
      }
      break;
    }

    case "recording.completed": {
      const recordingFiles = meetingObj.recording_files || [];
      const hostEmail = meetingObj.host_email;
      const topic = meetingObj.topic;

      // Buscar contato vinculado
      let freshContactId = null;
      let freshContactName = null;
      const { data: mtgRecord } = await supabase.from("zoom_meetings").select("freshsales_contact_id, freshsales_contact_name").eq("zoom_meeting_id", meetingId).single();
      if (mtgRecord?.freshsales_contact_id) {
        freshContactId = mtgRecord.freshsales_contact_id;
        freshContactName = mtgRecord.freshsales_contact_name;
      } else if (hostEmail) {
        const { data: contact } = await supabase.from("freshsales_contacts").select("freshsales_contact_id, name").ilike("email_normalized", hostEmail.toLowerCase()).single();
        if (contact) { freshContactId = contact.freshsales_contact_id; freshContactName = contact.name; }
      }

      // Enfileirar MP4, M4A e TRANSCRIPT
      const priority = ["MP4", "M4A", "TRANSCRIPT"];
      const toProcess = recordingFiles
        .filter(f => priority.includes(f.file_type?.toUpperCase()))
        .sort((a, b) => priority.indexOf(a.file_type?.toUpperCase()) - priority.indexOf(b.file_type?.toUpperCase()));

      for (const f of toProcess) {
        const rid = f.id || `${meetingId}_${f.file_type}_${Date.now()}`;
        await supabase.from("zoom_recordings").upsert({
          zoom_meeting_id: meetingId,
          recording_id: rid,
          recording_type: f.recording_type,
          file_type: f.file_type?.toUpperCase(),
          file_size_bytes: parseInt(f.file_size || "0"),
          download_url: f.download_url,
          play_url: f.play_url,
          recording_start: f.recording_start,
          recording_end: f.recording_end,
          status: "pending",
          freshsales_contact_id: freshContactId,
          webhook_payload: { topic, host_email: hostEmail, contact_name: freshContactName, account_id: payload.account_id },
        }, { onConflict: "recording_id" });
      }

      await supabase.from("zoom_meetings").update({ status: "recorded", updated_at: new Date().toISOString() }).eq("zoom_meeting_id", meetingId);

      // Disparar processador assíncrono
      const sUrl = Deno.env.get("SUPABASE_URL");
      const aKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      fetch(`${sUrl}/functions/v1/zoom-recording-processor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${aKey}` },
        body: JSON.stringify({ meeting_id: meetingId }),
      }).catch(console.error);
      break;
    }
  }

  return Response.json({ received: true, event }, { headers: corsHeaders });
});
