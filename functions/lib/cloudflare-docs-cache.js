function getDocsNamespace(env) {
  return env.CLOUDFLARE_DOCS_KV || env.HMADV_DOCS_KV || null;
}

async function listCatalogFromKv(namespace) {
  const listing = await namespace.list({ prefix: "cloudflare-docs:" });
  return (listing.keys || []).map((item) => ({
    id: item.name.replace(/^cloudflare-docs:/, ""),
    name: item.metadata?.name || item.name.replace(/^cloudflare-docs:/, ""),
    path: item.metadata?.path || null,
    tags: item.metadata?.tags || [],
  }));
}

export async function getCloudflareDocsCatalog(env) {
  const namespace = getDocsNamespace(env);
  if (!namespace) {
    return {
      items: [],
      diagnostics: ["Binding KV CLOUDFLARE_DOCS_KV ausente; catálogo cloud não carregado."],
    };
  }
  return {
    items: await listCatalogFromKv(namespace),
    diagnostics: [],
  };
}

export async function searchCloudflareDocs(env, query, limit = 5) {
  const namespace = getDocsNamespace(env);
  const normalized = String(query || "").trim().toLowerCase();
  if (!namespace || !normalized) {
    return [];
  }
  const catalog = await listCatalogFromKv(namespace);
  const scored = [];
  for (const item of catalog) {
    const payload = await namespace.get(`cloudflare-docs:${item.id}`, "json");
    const text = String(payload?.text || "").toLowerCase();
    const score = normalized.split(/\s+/).reduce((sum, term) => sum + (text.includes(term) ? term.length : 0), 0);
    if (!score) continue;
    scored.push({
      ...item,
      score,
      snippet: String(payload?.snippet || payload?.text || "").slice(0, 320),
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Number(limit || 5)));
}
