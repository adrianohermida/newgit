import { patchAgendamento } from "./agendamento-helpers.js";
import { runAgendamentoStatusIntegrations } from "./agendamento-integrations.js";
import { listZoomMeetingParticipants } from "./zoom-admin.js";
import { executeCrmAutomationRules } from "./crm-automation-executor.js";

const OUTCOME_PATCHES = {
  attended: (nowIso, notes) => ({
    status: "compareceu",
    meeting_outcome: "compareceu",
    meeting_outcome_notes: notes || null,
    attended_at: nowIso,
    updated_at: nowIso,
  }),
  no_show: (nowIso, notes) => ({
    status: "ausencia",
    meeting_outcome: "ausencia",
    meeting_outcome_notes: notes || null,
    no_show_at: nowIso,
    updated_at: nowIso,
  }),
  return_requested: (nowIso, notes) => ({
    meeting_outcome: "pedido_retorno",
    meeting_outcome_notes: notes || null,
    crm_last_event: "return_requested",
    updated_at: nowIso,
  }),
  proposal_sent: (nowIso, notes) => ({
    meeting_outcome: "proposta_enviada",
    meeting_outcome_notes: notes || null,
    proposal_sent_at: nowIso,
    crm_last_event: "proposal_sent",
    updated_at: nowIso,
  }),
  proposal_pending: (nowIso, notes) => ({
    meeting_outcome: "proposta_pendente",
    meeting_outcome_notes: notes || null,
    crm_last_event: "proposal_pending",
    updated_at: nowIso,
  }),
  proposal_review: (nowIso, notes) => ({
    meeting_outcome: "proposta_revisao",
    meeting_outcome_notes: notes || null,
    crm_last_event: "proposal_review",
    updated_at: nowIso,
  }),
  proposal_accepted: (nowIso, notes) => ({
    meeting_outcome: "proposta_aceita",
    meeting_outcome_notes: notes || null,
    proposal_accepted_at: nowIso,
    crm_last_event: "proposal_accepted",
    updated_at: nowIso,
  }),
  proposal_refused: (nowIso, notes) => ({
    meeting_outcome: "proposta_recusada",
    meeting_outcome_notes: notes || null,
    proposal_refused_at: nowIso,
    crm_last_event: "proposal_refused",
    updated_at: nowIso,
  }),
  contract_sent: (nowIso, notes) => ({
    meeting_outcome: "contrato_enviado",
    meeting_outcome_notes: notes || null,
    contract_sent_at: nowIso,
    crm_last_event: "contract_sent",
    updated_at: nowIso,
  }),
  client_active: (nowIso, notes) => ({
    meeting_outcome: "cliente_ativo",
    meeting_outcome_notes: notes || null,
    client_activated_at: nowIso,
    crm_last_event: "client_active",
    updated_at: nowIso,
  }),
  client_inactive: (nowIso, notes) => ({
    meeting_outcome: "cliente_inativo",
    meeting_outcome_notes: notes || null,
    client_deactivated_at: nowIso,
    crm_last_event: "client_inactive",
    updated_at: nowIso,
  }),
};

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return message.includes("Could not find the") || message.includes("column") || message.includes("schema cache");
}

export const AGENDAMENTO_OUTCOMES = [
  { value: "attended", label: "Compareceu" },
  { value: "no_show", label: "Ausência" },
  { value: "return_requested", label: "Pedir retorno" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "proposal_pending", label: "Proposta pendente" },
  { value: "proposal_review", label: "Revisão de proposta" },
  { value: "proposal_accepted", label: "Proposta aceita" },
  { value: "proposal_refused", label: "Proposta recusada" },
  { value: "contract_sent", label: "Contrato enviado" },
  { value: "client_active", label: "Cliente ativo" },
  { value: "client_inactive", label: "Cliente inativo" },
];

export async function applyAgendamentoOutcome(env, supabase, agendamento, outcome, notes = "") {
  const patchBuilder = OUTCOME_PATCHES[outcome];
  if (!patchBuilder) {
    throw new Error("Desfecho de agendamento inválido.");
  }

  const nowIso = new Date().toISOString();
  const warnings = [];
  let updated = agendamento;

  try {
    const patched = await patchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      patchBuilder(nowIso, notes)
    );
    if (patched) {
      updated = patched;
    }
  } catch (error) {
    if (isMissingColumnError(error)) {
      warnings.push("As colunas locais de desfecho ainda nao existem em agendamentos. O CRM sera atualizado mesmo assim.");
    } else {
      throw error;
    }
  }

  const integrationResult = await runAgendamentoStatusIntegrations(
    env,
    supabase,
    { ...updated, meeting_outcome: outcome, meeting_outcome_notes: notes || null },
    outcome,
    {}
  );

  warnings.push(...integrationResult.warnings);

  const automation = await executeCrmAutomationRules(env, outcome, {
    sourceSystem: "agendamento_admin",
    sourceRef: agendamento.id,
    agendamento: updated,
    crm: integrationResult.freshsales || null,
    zoom: integrationResult.zoomSnapshot || null,
  }).catch((error) => {
    warnings.push(error.message);
    return null;
  });

  if (automation?.warnings?.length) {
    warnings.push(...automation.warnings);
  }

  return {
    updated,
    warnings,
    crm: integrationResult.freshsales || null,
    zoomSnapshot: integrationResult.zoomSnapshot || null,
    automation,
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferAttendanceSuggestion(agendamento, participants = []) {
  const email = normalizeText(agendamento.email);
  const name = normalizeText(agendamento.nome);
  const normalizedParticipants = participants.map((participant) => ({
    ...participant,
    user_email_normalized: normalizeText(participant.user_email || participant.email),
    name_normalized: normalizeText(participant.name || participant.user_name),
  }));

  const matchedByEmail = normalizedParticipants.find((participant) => participant.user_email_normalized && participant.user_email_normalized === email) || null;
  const matchedByName = normalizedParticipants.find((participant) => participant.name_normalized && name && participant.name_normalized.includes(name)) || null;
  const matchedParticipant = matchedByEmail || matchedByName || null;

  if (matchedParticipant) {
    return {
      suggestedOutcome: "attended",
      confidence: matchedByEmail ? "high" : "medium",
      reason: matchedByEmail
        ? "Encontramos o participante do Zoom com o mesmo e-mail do cliente."
        : "Encontramos um participante do Zoom com nome compatível com o cliente.",
      matchedParticipant,
      participants: normalizedParticipants,
    };
  }

  if (normalizedParticipants.length === 0) {
    return {
      suggestedOutcome: "no_show",
      confidence: "medium",
      reason: "A reunião não trouxe participantes no relatório do Zoom.",
      matchedParticipant: null,
      participants: normalizedParticipants,
    };
  }

  return {
    suggestedOutcome: null,
    confidence: "low",
    reason: "Há participantes no Zoom, mas nenhum match seguro com o cliente.",
    matchedParticipant: null,
    participants: normalizedParticipants,
  };
}

export async function syncAgendamentoZoomAttendance(env, supabase, agendamento, options = {}) {
  if (!agendamento.zoom_meeting_id) {
    throw new Error("Este agendamento ainda não possui zoom_meeting_id para consulta de presença.");
  }

  const payload = await listZoomMeetingParticipants(env, agendamento.zoom_meeting_id);
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  const suggestion = inferAttendanceSuggestion(agendamento, participants);

  let applied = null;
  let warnings = [];
  if (options.applySuggestion && suggestion.suggestedOutcome) {
    const outcomeResult = await applyAgendamentoOutcome(
      env,
      supabase,
      agendamento,
      suggestion.suggestedOutcome,
      `Sugestão automática baseada no Zoom. ${suggestion.reason}`
    );
    applied = {
      outcome: suggestion.suggestedOutcome,
      item: outcomeResult.updated,
      crm: outcomeResult.crm,
    };
    warnings = outcomeResult.warnings;
  }

  return {
    payload,
    participants,
    suggestion,
    applied,
    warnings,
  };
}
