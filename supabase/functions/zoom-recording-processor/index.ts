import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRESHSALES_BASE = "https://hmadv-org.myfreshworks.com/crm/sales/api";

async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function uploadToFreshsalesDocuments(contactId, fileName, fileBlob, metadata) {
  const fsKey = Deno.env.get("FRESHSALES_API_KEY");
  try {
    const formData = new FormData();
    formData.append("document[file]", fileBlob, fileName);
    formData.append("document[name]", fileName);
    formData.append("document[description]",
      `Gravação Zoom — ${metadata.meetingTopic}\nData: ${metadata.meetingDate}\nDuração: ${metadata.duration}\nTipo: ${metadata.recordingType}`
    );
    formData.append("document[folder_name]", "Gravações Zoom");

    const uploadRes = await fetch(`${FRESHSALES_BASE}/documents`, {
      method: "POST",
      headers: { Authorization: `Token token=${fsKey}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error(`[zoom-processor] Upload falhou: ${uploadRes.status} — ${await uploadRes.text()}`);
      return null;
    }

    const uploadData = await uploadRes.json();
    const documentId = uploadData?.document?.id?.toString() || uploadData?.id?.toString();
    if (!documentId) { console.error("[zoom-processor] Document ID não retornado:", JSON.stringify(uploadData)); return null; }

    // Associar ao contato
    const assocRes = await fetch(`${FRESHSALES_BASE}/contacts/${contactId}/documents`, {
      method: "POST",
      headers: { Authorization: `Token token=${fsKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId }),
    });

    if (!assocRes.ok) {
      // Fallback: registrar como atividade
      await fetch(`${FRESHSALES_BASE}/activities`, {
        method: "POST",
        headers: { Authorization: `Token token=${fsKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          activity: {
            title: `Gravação Zoom: ${metadata.meetingTopic}`,
            notes: `Gravação disponível em Documents.\nData: ${metadata.meetingDate}\nDuração: ${metadata.duration}`,
            targetable_type: "Contact",
            targetable_id: parseInt(contactId),
            activity_type_id: 31001147694,
            owner_id: 31000147944,
          }
        }),
      });
    }

    const documentUrl = uploadData?.document?.url || `${FRESHSALES_BASE}/documents/${documentId}`;
    return { documentId, documentUrl };
  } catch (e) {
    console.error("[zoom-processor] Erro no upload:", e);
    return null;
  }
}

async function processRecording(recording, zoomToken, supabase) {
  const recordingId = recording.recording_id;
  const downloadUrl = recording.download_url;
  const fileType = recording.file_type;
  const freshContactId = recording.freshsales_contact_id;
  const webhookPayload = recording.webhook_payload || {};

  await supabase.from("zoom_recordings").update({ status: "downloading", updated_at: new Date().toISOString() }).eq("recording_id", recordingId);

  const urlWithToken = downloadUrl.includes("?") ? `${downloadUrl}&access_token=${zoomToken}` : `${downloadUrl}?access_token=${zoomToken}`;
  const fileRes = await fetch(urlWithToken, { headers: { Authorization: `Bearer ${zoomToken}` } });
  if (!fileRes.ok) throw new Error(`Download falhou: ${fileRes.status}`);

  const fileBlob = await fileRes.blob();
  const extMap = { MP4: { ext: "mp4", mime: "video/mp4" }, M4A: { ext: "m4a", mime: "audio/mp4" }, TRANSCRIPT: { ext: "vtt", mime: "text/vtt" }, CHAT: { ext: "txt", mime: "text/plain" } };
  const fileInfo = extMap[fileType] || { ext: "mp4", mime: "video/mp4" };

  const topic = webhookPayload.topic || `Reunião ${recording.zoom_meeting_id}`;
  const meetingDate = new Date(recording.recording_start || Date.now()).toLocaleDateString("pt-BR");
  const durationSec = recording.duration_seconds || 0;
  const durationStr = durationSec > 0 ? `${Math.floor(durationSec / 60)}min ${durationSec % 60}s` : "N/A";
  const fileName = `Zoom_${topic.replace(/[^a-zA-Z0-9]/g, "_")}_${meetingDate.replace(/\//g, "-")}_${fileType}.${fileInfo.ext}`;

  await supabase.from("zoom_recordings").update({ status: "uploading", updated_at: new Date().toISOString() }).eq("recording_id", recordingId);

  const result = await uploadToFreshsalesDocuments(
    freshContactId,
    fileName,
    new Blob([await fileBlob.arrayBuffer()], { type: fileInfo.mime }),
    { meetingTopic: topic, meetingDate, duration: durationStr, recordingType: fileType }
  );

  if (result) {
    await supabase.from("zoom_recordings").update({
      status: "done",
      freshsales_document_id: result.documentId,
      freshsales_document_url: result.documentUrl,
      updated_at: new Date().toISOString(),
    }).eq("recording_id", recordingId);
    await supabase.from("zoom_meetings").update({
      metadata: { last_recording_doc_id: result.documentId, last_recording_doc_url: result.documentUrl, recording_uploaded_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq("zoom_meeting_id", recording.zoom_meeting_id);
    console.log(`[zoom-processor] ✓ doc ${result.documentId} vinculado ao contato ${freshContactId}`);
  } else {
    throw new Error("Upload retornou null");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  let meetingId = null;
  try { const b = await req.json().catch(() => ({})); meetingId = b?.meeting_id || null; } catch {}

  let query = supabase.from("zoom_recordings").select("*").in("status", ["pending", "downloading"]).lt("retry_count", 3).order("created_at", { ascending: true }).limit(10);
  if (meetingId) query = query.eq("zoom_meeting_id", meetingId);

  const { data: recordings, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  if (!recordings?.length) return Response.json({ processed: 0, message: "Nenhuma gravação pendente" }, { headers: corsHeaders });

  let zoomToken;
  try { zoomToken = await getZoomAccessToken(); }
  catch (e) { return Response.json({ error: `Zoom auth: ${e.message}` }, { status: 500, headers: corsHeaders }); }

  const results = {};
  for (const rec of recordings) {
    try {
      await processRecording(rec, zoomToken, supabase);
      results[rec.recording_id] = "done";
    } catch (e) {
      const retry = (rec.retry_count || 0) + 1;
      await supabase.from("zoom_recordings").update({
        status: retry >= 3 ? "error" : "pending",
        error_message: e.message,
        retry_count: retry,
        updated_at: new Date().toISOString(),
      }).eq("recording_id", rec.recording_id);
      results[rec.recording_id] = `error: ${e.message}`;
    }
  }

  return Response.json({ processed: recordings.length, results }, { headers: corsHeaders });
});
