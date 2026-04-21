import { requireAdminAccess } from "../lib/admin-auth.js";
import { getCloudflareDocsCatalog, searchCloudflareDocs } from "../lib/cloudflare-docs-cache.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function authError(auth) {
  return json({ ok: false, error: auth.error, errorType: auth.errorType || "authentication" }, auth.status || 401);
}

export async function onRequestOptions() {
  return new Response("", { status: 204, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return authError(auth);
  try {
    const catalog = await getCloudflareDocsCatalog(context.env);
    return json({ ok: true, ...catalog });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Falha ao carregar catálogo Cloudflare." }, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return authError(auth);
  try {
    const body = await context.request.json().catch(() => ({}));
    const items = await searchCloudflareDocs(context.env, body.query, body.limit);
    return json({ ok: true, items, count: items.length, query: String(body.query || "") });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Falha ao pesquisar docs Cloudflare." }, 500);
  }
}
