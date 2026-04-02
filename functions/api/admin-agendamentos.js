import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgendamentoForDashboard, listAgendamentosForDashboard } from "../lib/dashboard-data.js";
import { AGENDAMENTO_OUTCOMES, applyAgendamentoOutcome, syncAgendamentoZoomAttendance } from "../lib/agendamento-admin.js";

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

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = body.id ? String(body.id) : "";
    const action = body.action ? String(body.action) : "apply_outcome";
    const outcome = body.outcome ? String(body.outcome) : "";
    const notes = body.notes ? String(body.notes) : "";

    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "Informe o id do agendamento." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const item = await getAgendamentoForDashboard(env, id);
    if (!item) {
      return new Response(JSON.stringify({ ok: false, error: "Agendamento nao encontrado." }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const supabase = {
      supabaseUrl: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    };

    if (action === "sync_zoom_attendance") {
      const result = await syncAgendamentoZoomAttendance(env, supabase, item, {
        applySuggestion: Boolean(body.applySuggestion),
      });

      return new Response(
        JSON.stringify({
          ok: true,
          zoom: {
            participants: result.participants,
            suggestion: result.suggestion,
            applied: result.applied,
          },
          warnings: result.warnings || [],
        }),
        {
          status: 200,
          headers: JSON_HEADERS,
        }
      );
    }

    if (!outcome) {
      return new Response(JSON.stringify({ ok: false, error: "Informe o desfecho do agendamento." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const isValidOutcome = AGENDAMENTO_OUTCOMES.some((entry) => entry.value === outcome);
    if (!isValidOutcome) {
      return new Response(JSON.stringify({ ok: false, error: "Desfecho invalido para o agendamento." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const result = await applyAgendamentoOutcome(
      env,
      supabase,
      item,
      outcome,
      notes
    );

    return new Response(
      JSON.stringify({
        ok: true,
        item: result.updated,
        warnings: result.warnings,
        crm: result.crm,
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao atualizar o desfecho do agendamento." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
