import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgendamentoForDashboard, listAgendamentosForDashboard } from "../lib/dashboard-data.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const item = await getAgendamentoForDashboard(env, id);
      return new Response(JSON.stringify({ ok: true, item }), {
        status: item ? 200 : 404,
        headers: JSON_HEADERS,
      });
    }

    const items = await listAgendamentosForDashboard(env, {
      status: url.searchParams.get("status") || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      limit: Number(url.searchParams.get("limit") || "50"),
    });

    return new Response(JSON.stringify({ ok: true, items: Array.isArray(items) ? items : [] }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error.message ||
          "A leitura administrativa de agendamentos nao conseguiu consultar o projeto Supabase atual.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
