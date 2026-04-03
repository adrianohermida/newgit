import { buildFreshchatPublicConfig } from "../lib/freshchat-web.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=300",
};

export async function onRequestGet(context) {
  try {
    return new Response(JSON.stringify(buildFreshchatPublicConfig(context.env)), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao montar configuracao publica do Freshchat.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
