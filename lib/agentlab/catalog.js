export const AGENTLAB_ROLLOUT_PHASES = [
  {
    id: "phase-1",
    title: "Fundacao de dados e observabilidade",
    focus: "Espelhar CRM, consolidar conversas e medir gaps reais de resposta.",
  },
  {
    id: "phase-2",
    title: "Modelo de agente e fluxo conversacional",
    focus: "Refinar persona, fallback, handoff e coleta progressiva.",
  },
  {
    id: "phase-3",
    title: "Knowledge packs e contextos de negocio",
    focus: "Ligar FAQ, respostas predefinidas, CRM e jornada do cliente.",
  },
  {
    id: "phase-4",
    title: "Workflows criticos no Freddy",
    focus: "Status processual, financeiro, agendamento, qualificacao e handoff.",
  },
];

export const AGENTLAB_KNOWLEDGE_PACKS = [
  {
    id: "honorarios",
    title: "Honorarios e pagamentos",
    description: "Parcelamento, cartao, boleto, segunda via e politica financeira.",
    priority: "alta",
  },
  {
    id: "consulta",
    title: "Consulta e agendamento",
    description: "Triagem comercial, agenda, documentos e consulta online/presencial.",
    priority: "alta",
  },
  {
    id: "portal",
    title: "Portal, boletos e documentos",
    description: "Acesso ao portal, envio de arquivos, comprovantes e autosservico.",
    priority: "alta",
  },
  {
    id: "processual",
    title: "Perguntas de processo",
    description: "Perguntas frequentes de andamento, limites do que a IA pode afirmar e regras de handoff.",
    priority: "alta",
  },
];

export const AGENTLAB_WORKFLOW_BACKLOG = [
  {
    id: "wf-status",
    title: "Status do processo",
    outcome: "Responder com seguranca ou transferir com resumo quando houver risco processual.",
  },
  {
    id: "wf-pagamento",
    title: "2a via e pagamento",
    outcome: "Resolver autoatendimento financeiro e reduzir friccao de cobranca.",
  },
  {
    id: "wf-agendamento",
    title: "Agendamento de consulta",
    outcome: "Qualificar, captar dados minimos e conduzir o proximo passo comercial.",
  },
  {
    id: "wf-qualificacao",
    title: "Qualificacao de lead",
    outcome: "Identificar urgencia, perfil da divida e aderencia ao servico.",
  },
  {
    id: "wf-handoff",
    title: "Handoff inteligente",
    outcome: "Transferir com contexto, resumo e motivo da escalacao.",
  },
  {
    id: "wf-contexto",
    title: "Recuperacao de contexto do cliente",
    outcome: "Usar CRM, historico e fase do relacionamento antes de responder.",
  },
];

export const AGENTLAB_WEEKLY_SPRINT = {
  unanswered: "Top 20 unanswered",
  poorResponses: "Top 10 poor responses",
  workflows: "Top 5 workflows novos",
  content: "Top 10 conteudos novos",
};
