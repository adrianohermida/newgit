import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  freshchatGet,
  resolveFreshworksAccessToken,
  safeAgentSnapshot,
} from "../_shared/freshworks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agentId = String(body.agent_id ?? body.agentId ?? "").trim();

    if (!agentId) {
      return jsonResponse({ error: "agent_id is required" }, 400);
    }

    const { accessToken, authMode, config } = await resolveFreshworksAccessToken();
    const payload = await freshchatGet(`/v2/agents/${encodeURIComponent(agentId)}`, accessToken, config.freshchatBaseUrl);
    const agent = (payload as any)?.agent ?? payload;

    return jsonResponse({
      success: true,
      auth_mode: authMode,
      freshchat_base_url: config.freshchatBaseUrl,
      agent: safeAgentSnapshot(agent),
      raw_keys: agent && typeof agent === "object" ? Object.keys(agent).sort() : [],
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500,
    );
  }
});
