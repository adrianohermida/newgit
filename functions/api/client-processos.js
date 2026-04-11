import { requireClientAccess } from "../lib/client-auth.js";
import { listClientProcessos } from "../lib/client-data.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStatusFilterValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["ativo", "ativos"].includes(normalized)) return "ativo";
  if (["baixado", "baixados", "arquivado", "arquivados", "encerrado", "encerrados"].includes(normalized)) return "baixado";
  if (["suspenso", "suspensos", "sobrestado", "sobrestados"].includes(normalized)) return "suspenso";
  return normalized;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireClientAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 12), 50);
    const status = normalizeStatusFilterValue(url.searchParams.get("status"));
    const payload = await listClientProcessos(env, auth.profile, { status });
    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const pagedItems = items.slice(startIndex, startIndex + pageSize);

    return new Response(JSON.stringify({
      ok: true,
      items: pagedItems,
      warning: payload.warning || null,
      filters: {
        status: status || null,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
        hasMore: startIndex + pageSize < total,
      },
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error?.message || "Nao foi possivel carregar os processos do portal.",
    }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
