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

export const AGENTLAB_DEFAULT_AGENT_PROFILES = [
  {
    id: "default-dotobot-chatbot-profile",
    agent_ref: "dotobot-chatbot",
    agent_name: "DotoBot",
    agent_kind: "chatbot",
    primary_channel: "freshchat",
    business_goal: "Atender o primeiro contato com alta conversao, responder duvidas frequentes com seguranca e encaminhar apenas o que realmente precisa de humano.",
    persona_prompt:
      "Voce e o DotoBot, chatbot inicial da Hermida Maia Advocacia. Seja acolhedor, claro e comercial na medida certa. Seu papel e fazer triagem, orientar o proximo passo e reduzir friccao. Nunca invente status processual e nunca prometa resultado juridico.",
    response_policy:
      "Responder em PT-BR, com frases curtas, sem juridiques. Priorizar autoatendimento em agendamento, consulta, honorarios, portal, segunda via e remarcacao. Em temas processuais sensiveis, coletar o minimo necessario e escalar.",
    knowledge_strategy: [
      "Priorizar respostas rapidas, FAQs e fluxos curtos de alta frequencia.",
      "Usar contexto do CRM antes de repetir perguntas ja respondidas pelo lead ou cliente.",
      "Empurrar o cliente para confirmacao, remarcacao, consulta e proximo passo comercial.",
    ],
    workflow_strategy: [
      "Resolver com fluxo automatizado os cenarios de agendamento, remarcacao, consulta e financeiro basico.",
      "Usar handoff apenas em processo individualizado, conflito sensivel ou excecao operacional.",
      "Registrar contexto suficiente para o humano continuar sem fazer o cliente repetir tudo.",
    ],
    handoff_rules: [
      "Transferir quando o cliente pedir status especifico do processo.",
      "Transferir quando houver reclamacao sensivel, crise emocional ou divergencia de dados.",
      "Transferir quando o caso sair do escopo de triagem comercial e autoatendimento.",
    ],
    created_at: null,
    updated_at: null,
  },
  {
    id: "default-dotobot-ai-profile",
    agent_ref: "dotobot-ai",
    agent_name: "DotoBot AI",
    agent_kind: "ai_agent",
    primary_channel: "all_channels",
    business_goal: "Qualificar leads juridicos com seguranca, reduzir friccao no agendamento e acelerar a conversao comercial sem violar o codigo de etica da advocacia.",
    persona_prompt:
      "Voce e o assistente inicial da Hermida Maia Advocacia. Seja claro, acolhedor e objetivo. Nunca faca promessa de resultado, nunca invente status processual e nunca ofereca orientacao juridica conclusiva sem contexto suficiente. Priorize triagem, proximo passo e coleta minima de dados.",
    response_policy:
      "Respostas curtas, em PT-BR, sem juridiquês desnecessario. Em temas sensiveis ou processuais, limitar-se a orientacao geral e acionar handoff humano quando houver risco de interpretacao juridica individualizada.",
    knowledge_strategy: [
      "Usar FAQs segmentadas por tema: consulta, honorarios, portal, financeiro, documentos e processo.",
      "Cruzar resposta com contexto do CRM antes de repetir perguntas ao cliente.",
      "Separar conteudo estatico de dado dinamico consultado via workflow.",
    ],
    workflow_strategy: [
      "Agendamento com links de confirmar, cancelar e remarcar.",
      "Qualificacao de lead por urgencia, tema e capacidade de comparecimento.",
      "Handoff com resumo automatico para financeiro, processual e comercial.",
    ],
    handoff_rules: [
      "Sempre transferir em duvida processual individualizada.",
      "Transferir em reclamacao, urgencia emocional ou conflito sensivel.",
      "Transferir quando houver divergencia entre CRM e fala do cliente.",
    ],
    created_at: null,
    updated_at: null,
  },
];

export const AGENTLAB_DEFAULT_IMPROVEMENT_QUEUE = [
  {
    id: "queue-unanswered-financeiro",
    agent_ref: "dotobot-chatbot",
    category: "knowledge",
    title: "Cobrir perguntas de financeiro e 2a via",
    description: "Treinar respostas e fluxos para boleto, parcelamento, comprovante e confirmacao de pagamento.",
    priority: "alta",
    status: "backlog",
    source_channel: "agentlab-default",
    sprint_bucket: "Sprint atual",
  },
  {
    id: "queue-processual-handoff",
    agent_ref: "dotobot-ai",
    category: "handoff",
    title: "Aprimorar handoff processual sensivel",
    description: "Garantir que o agente nao invente andamento de processo e transfira com resumo util.",
    priority: "alta",
    status: "doing",
    source_channel: "agentlab-default",
    sprint_bucket: "Sprint atual",
  },
  {
    id: "queue-noshow-recuperacao",
    agent_ref: "dotobot-chatbot",
    category: "workflow",
    title: "Recuperacao de no-show e remarcacao",
    description: "Refinar fluxo de ausencia para elevar remarcacao e reduzir perda comercial.",
    priority: "media",
    status: "backlog",
    source_channel: "agentlab-default",
    sprint_bucket: "Proxima sprint",
  },
];

export const AGENTLAB_DEFAULT_TRAINING_SCENARIOS = [
  {
    id: "scenario-honorarios",
    agent_ref: "dotobot-chatbot",
    category: "financeiro",
    difficulty: "media",
    scenario_name: "Honorarios e formas de pagamento",
    user_message: "Quais sao os honorarios e voces parcelam no cartao?",
    expected_intent: "honorarios_pagamento",
    score_threshold: 0.85,
  },
  {
    id: "scenario-status-processo",
    agent_ref: "dotobot-ai",
    category: "processual",
    difficulty: "alta",
    scenario_name: "Pedido de status processual sensivel",
    user_message: "Sou cliente e quero saber como esta meu processo contra o banco.",
    expected_intent: "status_processual",
    score_threshold: 0.9,
  },
  {
    id: "scenario-agendamento",
    agent_ref: "dotobot-chatbot",
    category: "agendamento",
    difficulty: "media",
    scenario_name: "Agendamento de consulta",
    user_message: "Quero agendar uma consulta para esta semana.",
    expected_intent: "agendamento_consulta",
    score_threshold: 0.85,
  },
  {
    id: "scenario-no-show",
    agent_ref: "dotobot-chatbot",
    category: "recuperacao",
    difficulty: "media",
    scenario_name: "Recuperacao de no-show",
    user_message: "Perdi minha consulta, ainda consigo remarcar?",
    expected_intent: "remarcacao",
    score_threshold: 0.85,
  },
];

export const AGENTLAB_CRM_AUTOMATION_RULES = [
  {
    id: "crm-booked",
    event_key: "booked",
    title: "Agendamento criado",
    description: "Criar contexto comercial inicial e iniciar aquecimento da reuniao.",
    pipeline_stage: "Reuniao",
    lifecycle_stage: "Triagem",
    meeting_stage: "Agendamento",
    sequence_name: "Pre-consulta",
    journey_name: "Jornada de confirmacao",
    email_template: "confirmacao_agendamento",
    whatsapp_template: "whatsapp_confirmacao_agendamento",
    enabled: true,
    execution_mode: "semi_auto",
    notes: "Usar links de confirmar, cancelar e remarcar no CRM.",
  },
  {
    id: "crm-confirmed",
    event_key: "confirmed",
    title: "Presenca confirmada",
    description: "Elevar a confianca do lead e preparar briefing da consulta.",
    pipeline_stage: "Reuniao",
    lifecycle_stage: "Conectado",
    meeting_stage: "Confirmação de presença",
    sequence_name: "Lembrete de consulta",
    journey_name: "Jornada de comparecimento",
    email_template: "lembrete_consulta",
    whatsapp_template: "whatsapp_lembrete_consulta",
    enabled: true,
    execution_mode: "semi_auto",
    notes: "Ideal para disparar lembrete automatico e checklist de documentos.",
  },
  {
    id: "crm-attended",
    event_key: "attended",
    title: "Consulta realizada",
    description: "Entrar em pos-consulta comercial e abrir trilha de negociacao.",
    pipeline_stage: "Negociação",
    lifecycle_stage: "Conectado",
    meeting_stage: "Confirmação de presença",
    negotiation_stage: "Envio de Proposta",
    sequence_name: "Follow-up pos-consulta",
    journey_name: "Jornada de proposta",
    email_template: "pos_consulta_proposta",
    whatsapp_template: "whatsapp_pos_consulta",
    enabled: true,
    execution_mode: "manual",
    notes: "Recomendado quando houve aderencia comercial apos a reuniao.",
  },
  {
    id: "crm-no-show",
    event_key: "no_show",
    title: "Ausencia do cliente",
    description: "Recuperar a oportunidade e estimular remarcacao.",
    pipeline_stage: "Reuniao",
    lifecycle_stage: "Pedido de retorno",
    meeting_stage: "Ausência",
    sequence_name: "Recuperacao no-show",
    journey_name: "Jornada de remarcacao",
    email_template: "no_show_recuperacao",
    whatsapp_template: "whatsapp_no_show",
    enabled: true,
    execution_mode: "semi_auto",
    notes: "Deve oferecer link de remarcacao e prazo curto de resposta.",
  },
  {
    id: "crm-proposal-accepted",
    event_key: "proposal_accepted",
    title: "Proposta aceita",
    description: "Mover para fechamento e preparar contrato.",
    pipeline_stage: "Fechamento",
    lifecycle_stage: "Conectado",
    negotiation_stage: "Proposta Aceita",
    closing_stage: "Envio de contrato",
    sequence_name: "Onboarding de fechamento",
    journey_name: "Jornada de contrato",
    email_template: "envio_contrato",
    whatsapp_template: "whatsapp_envio_contrato",
    enabled: true,
    execution_mode: "manual",
    notes: "Normalmente depende de validacao interna antes do envio do contrato.",
  },
];

export const AGENTLAB_DEFAULT_QUICK_REPLIES = [
  {
    id: "qr-consulta-online",
    agent_ref: "dotobot-chatbot",
    category: "agendamento",
    title: "Consulta online",
    shortcut: "/consultaonline",
    body: "Podemos agendar sua consulta online. Se quiser, eu ja te envio o link com horarios disponiveis.",
  },
  {
    id: "qr-honorarios",
    agent_ref: "dotobot-chatbot",
    category: "financeiro",
    title: "Honorarios",
    shortcut: "/honorarios",
    body: "Os honorarios dependem do caso e da estrategia. Posso adiantar como funciona a consulta e, se fizer sentido, seguimos para avaliacao.",
  },
  {
    id: "qr-status-processo",
    agent_ref: "dotobot-ai",
    category: "processual",
    title: "Status processual",
    shortcut: "/statusprocesso",
    body: "Para andamento processual individualizado, o ideal e validar no seu cadastro. Posso registrar seu pedido para nosso time conferir com seguranca.",
  },
  {
    id: "qr-segunda-via",
    agent_ref: "dotobot-chatbot",
    category: "financeiro",
    title: "Segunda via",
    shortcut: "/2via",
    body: "Posso te orientar sobre segunda via, comprovante ou confirmacao de pagamento. Se preferir, tambem posso direcionar para o financeiro.",
  },
];

export const AGENTLAB_DEFAULT_INTENTS = [
  {
    id: "intent-agendamento",
    agent_ref: "dotobot-chatbot",
    label: "agendamento_consulta",
    examples: ["Quero agendar uma consulta", "Tem horario para esta semana?"],
    policy: "Automatizar com coleta minima e link de agenda.",
  },
  {
    id: "intent-honorarios",
    agent_ref: "dotobot-chatbot",
    label: "honorarios_pagamento",
    examples: ["Quanto custa?", "Vocês parcelam no cartao?"],
    policy: "Responder de forma geral sem prometer condicao final antes da triagem.",
  },
  {
    id: "intent-processual",
    agent_ref: "dotobot-ai",
    label: "status_processual",
    examples: ["Como esta meu processo?", "Teve novidade no meu caso?"],
    policy: "Nao inventar andamento. Priorizar handoff humano.",
  },
  {
    id: "intent-remarcacao",
    agent_ref: "dotobot-chatbot",
    label: "remarcacao",
    examples: ["Preciso remarcar", "Perdi a consulta, consigo outro horario?"],
    policy: "Oferecer remarcacao rapida e registrar no CRM.",
  },
];

export const AGENTLAB_DEFAULT_HANDOFF_PLAYBOOKS = [
  {
    id: "handoff-processual",
    agent_ref: "dotobot-ai",
    trigger: "status_processual",
    destination: "time_processual",
    summary: "Transferir com numero do processo, nome do cliente e ultimo contexto da conversa.",
  },
  {
    id: "handoff-financeiro",
    agent_ref: "dotobot-chatbot",
    trigger: "honorarios_pagamento",
    destination: "financeiro",
    summary: "Transferir com tema financeiro, duvida e status do relacionamento no CRM.",
  },
  {
    id: "handoff-comercial",
    agent_ref: "dotobot-chatbot",
    trigger: "agendamento_consulta",
    destination: "comercial",
    summary: "Transferir quando houver urgencia, lead qualificado ou duvida fora do escopo automatico.",
  },
];

export const AGENTLAB_DEFAULT_WORKFLOW_LIBRARY = [
  {
    id: "wf-lib-status",
    agent_ref: "dotobot-ai",
    title: "Status processual seguro",
    type: "handoff_first",
    status: "backlog",
    notes: "Workflow para coletar dados minimos e transferir sem risco etico.",
  },
  {
    id: "wf-lib-financeiro",
    agent_ref: "dotobot-chatbot",
    title: "Financeiro e 2a via",
    type: "self_service",
    status: "em_modelagem",
    notes: "Workflow para boleto, comprovante e confirmacao de pagamento.",
  },
  {
    id: "wf-lib-agendamento",
    agent_ref: "dotobot-chatbot",
    title: "Agendamento e remarcacao",
    type: "conversion",
    status: "ativo",
    notes: "Workflow ligado ao fluxo principal de agenda, Zoom e CRM.",
  },
];

export const AGENTLAB_DEFAULT_KNOWLEDGE_SOURCES = [
  {
    id: "ks-faq-financeiro",
    agent_ref: "dotobot-chatbot",
    source_type: "faq",
    title: "FAQ financeiro e pagamentos",
    status: "prioritario",
    notes: "Cobrir honorarios, parcelamento, 2a via e comprovantes.",
  },
  {
    id: "ks-faq-processual",
    agent_ref: "dotobot-ai",
    source_type: "faq",
    title: "FAQ processual com limite etico",
    status: "prioritario",
    notes: "Explicar o que a IA pode e nao pode afirmar sobre processos.",
  },
  {
    id: "ks-urls-institucionais",
    agent_ref: "dotobot-chatbot",
    source_type: "url",
    title: "Paginas institucionais confiaveis",
    status: "ativo",
    notes: "Usar apenas URLs oficiais e atualizadas do escritorio.",
  },
];
