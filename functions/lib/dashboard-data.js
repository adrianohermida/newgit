import { fetchSupabaseAdmin } from "./supabase-rest.js";

function buildAgendamentosQuery(filters = {}) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,nome,email,telefone,area,data,hora,status,observacoes,google_event_id,token_confirmacao,token_cancelamento,token_remarcacao,admin_token_confirmacao,admin_token_cancelamento,admin_token_remarcacao,created_at,updated_at,confirmed_at,cancelled_at,cancelled_by,rescheduled_at,rescheduled_by,original_data,original_hora"
  );
  params.set("order", "data.desc,hora.desc");

  if (filters.status) {
    params.set("status", `eq.${filters.status}`);
  }

  if (filters.dateFrom) {
    params.append("data", `gte.${filters.dateFrom}`);
  }

  if (filters.dateTo) {
    params.append("data", `lte.${filters.dateTo}`);
  }

  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }

  return `agendamentos?${params.toString()}`;
}

export async function listAgendamentosForDashboard(env, filters = {}) {
  return fetchSupabaseAdmin(env, buildAgendamentosQuery(filters));
}

export async function getAgendamentoForDashboard(env, id) {
  const rows = await fetchSupabaseAdmin(
    env,
    `agendamentos?select=${encodeURIComponent(
      "id,nome,email,telefone,area,data,hora,status,observacoes,google_event_id,token_confirmacao,token_cancelamento,token_remarcacao,admin_token_confirmacao,admin_token_cancelamento,admin_token_remarcacao,created_at,updated_at,confirmed_at,cancelled_at,cancelled_by,rescheduled_at,rescheduled_by,original_data,original_hora"
    )}&id=eq.${encodeURIComponent(id)}&limit=1`
  );

  return Array.isArray(rows) ? rows[0] || null : null;
}
