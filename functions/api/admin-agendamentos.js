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

    const status = url.searchParams.get("status") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const limit = url.searchParams.get("limit") || "20";

    const items = await listAgendamentosForDashboard(env, {
      status,
      dateFrom,
      dateTo,
      limit: Number(limit) || 20,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        items,
        profile: {
          id: auth.profile.id,
          email: auth.profile.email,
          role: auth.profile.role,
        },
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao carregar agendamentos." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
