/**
 * slack-notify — Edge Function para enviar notificações ao canal #dotobot no Slack.
 * 
 * Usa SLACK_USER_TOKEN (xoxp) como token principal pois tem chat:write.
 * Fallback para SLACK_BOT_TOKEN se necessário.
 * 
 * Payload esperado:
 * {
 *   "message": "texto da mensagem",
 *   "blocks": [...] (opcional, blocos Slack Block Kit),
 *   "channel": "C..." (opcional, usa SLACK_NOTIFY_CHANNEL por padrão),
 *   "action": "list_channels" (opcional, para listar canais e descobrir IDs)
 * }
 */

const SLACK_API = "https://slack.com/api";

function getBestToken(): string {
  // Preferir USER_TOKEN pois tem mais escopos (chat:write)
  return Deno.env.get("SLACK_USER_TOKEN") 
    || Deno.env.get("SLACK_BOT_TOKEN") 
    || Deno.env.get("SLACK_ACCESS_TOKEN") 
    || "";
}

Deno.serve(async (req) => {
  try {
    const token = getBestToken();
    if (!token) {
      return new Response(JSON.stringify({ error: "Nenhum token Slack configurado" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "send";

    // Ação: listar canais para descobrir IDs
    if (action === "list_channels") {
      const r = await fetch(`${SLACK_API}/conversations.list?types=public_channel,private_channel&limit=200`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      const channels = (data.channels || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        is_private: c.is_private,
        is_member: c.is_member
      }));
      return new Response(JSON.stringify({ ok: true, channels }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Ação: enviar mensagem
    const channel = body.channel || Deno.env.get("SLACK_NOTIFY_CHANNEL") || "C09E59J77EU";
    const message = body.message || "Notificação do pipeline HMADV";
    const blocks = body.blocks || null;

    const payload: Record<string, any> = {
      channel,
      text: message,
      unfurl_links: false,
      unfurl_media: false
    };

    if (blocks) {
      payload.blocks = blocks;
    }

    const r = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!data.ok) {
      return new Response(JSON.stringify({ error: data.error, detail: data }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, ts: data.ts, channel: data.channel }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
