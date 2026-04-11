import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  freshchatGet,
  resolveFreshworksAccessToken,
  safeAgentSnapshot,
} from "../_shared/freshworks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { accessToken, authMode, config } = await resolveFreshworksAccessToken();

    const [account, agents, groups, roles, channels] = await Promise.allSettled([
      freshchatGet("/v2/account", accessToken, config.freshchatBaseUrl),
      freshchatGet("/v2/agents", accessToken, config.freshchatBaseUrl),
      freshchatGet("/v2/groups", accessToken, config.freshchatBaseUrl),
      freshchatGet("/v2/roles", accessToken, config.freshchatBaseUrl),
      freshchatGet("/v2/channels", accessToken, config.freshchatBaseUrl),
    ]);

    const agentsPayload =
      agents.status === "fulfilled"
        ? (agents.value as any)?.agents ?? (agents.value as any)?.data ?? agents.value
        : [];

    const normalizedAgents = Array.isArray(agentsPayload)
      ? agentsPayload.map(safeAgentSnapshot)
      : [];

    return jsonResponse({
      success: true,
      auth_mode: authMode,
      freshchat_base_url: config.freshchatBaseUrl,
      source_summary: config.sourceSummary,
      account:
        account.status === "fulfilled"
          ? (account.value as any)?.account ?? account.value
          : { error: String(account.reason) },
      counts: {
        agents: normalizedAgents.length,
        groups:
          groups.status === "fulfilled"
            ? Array.isArray((groups.value as any)?.groups)
              ? (groups.value as any).groups.length
              : null
            : null,
        roles:
          roles.status === "fulfilled"
            ? Array.isArray((roles.value as any)?.roles)
              ? (roles.value as any).roles.length
              : null
            : null,
        channels:
          channels.status === "fulfilled"
            ? Array.isArray((channels.value as any)?.channels)
              ? (channels.value as any).channels.length
              : null
            : null,
      },
      agents: normalizedAgents,
      diagnostics: {
        groups: groups.status === "fulfilled" ? "ok" : String(groups.reason),
        roles: roles.status === "fulfilled" ? "ok" : String(roles.reason),
        channels: channels.status === "fulfilled" ? "ok" : String(channels.reason),
      },
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

