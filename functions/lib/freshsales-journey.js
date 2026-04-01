import { getCleanEnvValue } from "./env.js";

export const FRESHSALES_LIFECYCLE_STAGES = [
  "Triagem",
  "Novo",
  "Conectado",
  "Retorno",
  "Pedido de retorno",
  "Visitante",
  "Fornecedor",
  "Não qualificado",
];

export const FRESHSALES_MEETING_STAGES = [
  "Agendamento",
  "Confirmação de presença",
  "Ausência",
  "Reagendamento",
  "Cancelamento de reunião",
];

export const FRESHSALES_NEGOTIATION_STAGES = [
  "Envio de Proposta",
  "Pendente de aceite",
  "Revisão de proposta",
  "Proposta Aceita",
  "Proposta Recusada",
];

export const FRESHSALES_CLOSING_STAGES = [
  "Envio de contrato",
  "Revisão de termos",
  "Pendente de assinatura",
  "Desistência",
];

export const FRESHSALES_CLIENT_STAGES = ["Ativo", "Inativo"];

function parseJsonEnv(value, fallback = {}) {
  const raw = getCleanEnvValue(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getFreshsalesJourneyConfig(env) {
  return {
    lifecycleField: getCleanEnvValue(env.FRESHSALES_CONTACT_LIFECYCLE_FIELD) || "cf_fase_ciclo_vida",
    meetingField: getCleanEnvValue(env.FRESHSALES_CONTACT_MEETING_FIELD) || "cf_reuniao_status",
    negotiationField: getCleanEnvValue(env.FRESHSALES_CONTACT_NEGOTIATION_FIELD) || "cf_negociacao_status",
    closingField: getCleanEnvValue(env.FRESHSALES_CONTACT_CLOSING_FIELD) || "cf_fechamento_status",
    clientField: getCleanEnvValue(env.FRESHSALES_CONTACT_CLIENT_FIELD) || "cf_cliente_status",
    stageValueMap: parseJsonEnv(env.FRESHSALES_STAGE_VALUE_MAP, {}),
    salesActivityTypeByEvent: parseJsonEnv(env.FRESHSALES_ACTIVITY_TYPE_BY_EVENT, {}),
  };
}

export function buildFreshsalesJourneyUpdate(eventType, agendamento, env) {
  const config = getFreshsalesJourneyConfig(env);
  const update = {};

  const mappedValue = (fieldKey, fallback) =>
    config.stageValueMap?.[fieldKey]?.[fallback] ?? fallback;

  switch (eventType) {
    case "booked":
      update[config.lifecycleField] = mappedValue("lifecycle", "Triagem");
      update[config.meetingField] = mappedValue("meeting", "Agendamento");
      break;
    case "confirmed":
      update[config.lifecycleField] = mappedValue("lifecycle", "Conectado");
      update[config.meetingField] = mappedValue("meeting", "Confirmação de presença");
      break;
    case "cancelled":
      update[config.meetingField] = mappedValue("meeting", "Cancelamento de reunião");
      break;
    case "rescheduled":
      update[config.meetingField] = mappedValue("meeting", "Reagendamento");
      break;
    case "no_show":
      update[config.meetingField] = mappedValue("meeting", "Ausência");
      break;
    default:
      break;
  }

  return {
    contact_update: update,
    metadata: {
      appointment_subject: `Consulta Jurídica - ${agendamento.area}`,
      appointment_notes: agendamento.observacoes || null,
      email: agendamento.email || null,
      phone: agendamento.telefone || null,
      contact_name: agendamento.nome || null,
    },
  };
}

export function buildFreshsalesAppointmentPayload(agendamento, zoomSnapshot = null, env = {}) {
  const config = getFreshsalesJourneyConfig(env);
  const startAt = new Date(`${agendamento.data}T${agendamento.hora}:00-03:00`).toISOString();
  const endAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

  return {
    appointment: {
      title: `Consulta Jurídica - ${agendamento.area}`,
      from_date: startAt,
      end_date: endAt,
      description: [
        `Cliente: ${agendamento.nome}`,
        `E-mail: ${agendamento.email}`,
        `Telefone: ${agendamento.telefone}`,
        `Área: ${agendamento.area}`,
        zoomSnapshot?.zoom_join_url ? `Zoom: ${zoomSnapshot.zoom_join_url}` : null,
      ].filter(Boolean).join("\n"),
      location: zoomSnapshot?.zoom_join_url || "Sala virtual a definir",
      owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
      external_id: agendamento.id || null,
      custom_field: {
        crm_event_source: "site_agendamento",
        crm_event_status: agendamento.status || "pendente",
        crm_meeting_stage: buildFreshsalesJourneyUpdate("booked", agendamento, env).contact_update[config.meetingField] || "Agendamento",
        zoom_join_url: zoomSnapshot?.zoom_join_url || null,
        zoom_meeting_id: zoomSnapshot?.zoom_meeting_id || null,
      },
    },
  };
}
