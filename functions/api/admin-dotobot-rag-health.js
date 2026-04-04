import { requireAdminAccess } from "../lib/admin-auth.js";
import { runDotobotRagHealth } from "../../lib/lawdesk/rag.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function parseBoolean(value, defaultValue = true) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  const url = new URL(request.url);
  const includeUpsert = parseBoolean(url.searchParams.get("include_upsert"), true);
  const topK = Number(url.searchParams.get("top_k") || 3);
  const query = url.searchParams.get("query") || "healthcheck dotobot memory retrieval";

  try {
    const result = await runDotobotRagHealth(env, {
      includeUpsert,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 3,
      query,
    });
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao executar admin-dotobot-rag-health.",
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}

export default { onRequestGet };

