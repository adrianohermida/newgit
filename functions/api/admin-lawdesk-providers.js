import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  getDefaultLawdeskProvider,
  listLawdeskProviders,
  runLawdeskProvidersHealth,
} from "../../lib/lawdesk/providers.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function onRequestOptions() {
  return new Response("", { status: 204, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdminAccess(context.request, context.env);
    if (!auth.ok) {
      return jsonResponse(
        {
          ok: false,
          error: auth.error || "Nao autorizado.",
          errorType: auth.errorType || "authentication",
          details: auth.details || null,
        },
        auth.status || 401
      );
    }

    const url = new URL(context.request.url);
    const includeHealth = parseBoolean(url.searchParams.get("include_health"), false);
    const providers = listLawdeskProviders(context.env);
    const defaultProvider = getDefaultLawdeskProvider(context.env);

    let health = null;
    if (includeHealth) {
      try {
        health = await runLawdeskProvidersHealth(context.env);
      } catch (error) {
        health = {
          ok: false,
          loaded: false,
          status: "failed",
          error: error?.message || "Falha ao executar health dos providers.",
          providers,
          summary: {
            total: providers.length,
            operational: 0,
            configured: providers.filter((item) => item?.configured).length,
            failed: providers.length,
            defaultProvider,
          },
        };
      }
    }

    return jsonResponse({
      ok: true,
      data: {
        providers: health?.providers || providers,
        health,
        defaultProvider,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error?.message || "Falha ao carregar admin-lawdesk-providers.",
      },
      500
    );
  }
}
