export const AGENTLAB_ROLLOUT_PHASES = [
  {
    id: "phase-1",
    title: "Fundacao de dados e observabilidade",
    focus: "Espelhar CRM, consolidar conversas e medir gaps reais de resposta.",
  },
  {
    id: "phase-2",
    title: "Modelo de agente e fluxo conversacional",
    focus: "Refinar persona, fallback, handoff, coleta progressiva e modo debate.",
  },
  {
    id: "phase-3",
    title: "Knowledge packs, ingestao e vetorizacao",
    focus: "Ligar FAQ, documentos, PDFs, JSON, CRM e memoria vetorial por agente.",
  },
  {
    id: "phase-4",
    title: "Experimentos, comparacao e feedback",
    focus: "Rodar A/B de prompt, comparar provedores e converter correcoes em melhoria continua.",
  },
  {
    id: "phase-5",
    title: "Governanca legal e etica",
    focus: "Garantir limites de advocacia, seguranca juridica e responsabilidade operacional.",
  },
];

export const AGENTLAB_PROVIDER_MATRIX = [
  {
    id: "provider-cloudflare-workers-ai",
    provider: "Cloudflare Workers AI",
    mode: "remote",
    strengths: ["baixa latencia", "deploy distribuido", "bom para producao"],
    fallback_order: 1,
    agent_scope: ["dotobot-ai", "dotobot-chatbot"],
  },
  {
    id: "provider-ollama-local",
    provider: "Ollama local",
    mode: "local",
    strengths: ["privacidade", "offline", "prototipacao rapida"],
    fallback_order: 2,
    agent_scope: ["dotobot-ai"],
  },
  {
    id: "provider-ollama-cloud",
    provider: "Ollama cloud",
    mode: "remote",
    strengths: ["controle de stack", "modelos custom", "custo previsivel"],
    fallback_order: 3,
    agent_scope: ["dotobot-ai", "agents_lab"],
  },
  {
    id: "provider-openai",
    provider: "OpenAI",
    mode: "remote",
    strengths: ["qualidade geral", "robustez de raciocinio", "multimodal"],
    fallback_order: 4,
    agent_scope: ["dotobot-ai", "experiments"],
  },
  {
    id: "provider-gemini",
    provider: "Gemini",
    mode: "remote",
    strengths: ["janela ampla", "analise de contexto longo", "multimodal"],
    fallback_order: 5,
    agent_scope: ["dotobot-ai", "evaluation"],
  },
];

export const AGENTLAB_EVALUATION_RUBRIC = [
  {
    id: "rubric-understanding",
    label: "Compreensao",
    description: "Se a IA entende o pedido, a intencao e o contexto juridico-operacional.",
    weight: 30,
  },
  {
    id: "rubric-coherence",
    label: "Coerencia",
    description: "Se a resposta se sustenta, evita contradicoes e segue o raciocinio ate o fim.",
    weight: 20,
  },
  {
    id: "rubric-legal-safety",
    label: "Seguranca juridica",
    description: "Se respeita limites eticos, nao inventa fatos e nao promete resultado.",
    weight: 25,
  },
  {
    id: "rubric-usefulness",
    label: "Utilidade",
    description: "Se entrega proximo passo pratico, contexto suficiente e acao executavel.",
    weight: 25,
  },
];

export const AGENTLAB_DEBATE_MODES = [
  {
    id: "debate-critique",
    title: "Critique mode",
    description: "A IA responde e depois revisa a propria saida em busca de falhas, lacunas e riscos.",
  },
  {
    id: "debate-reasoning",
    title: "Reasoning mode",
    description: "A IA explica o encadeamento logico sem expor informacao sensivel desnecessaria.",
  },
  {
    id: "debate-adversarial",
    title: "Adversarial mode",
    description: "A IA e confrontada com contraexemplos e prompts de stress para revelar fragilidades.",
  },
];

export const AGENTLAB_LEARNING_LOOP = [
  "Capturar interacoes reais, correcoes humanas e falhas de classificacao.",
  "Converter correcoes em backlog de treinamento, conhecimento ou workflow.",
  "Rodar nova avaliacao com o mesmo scenario para comparar antes e depois.",
  "Persistir a evolucao por versao de prompt, agente e provedor.",
];

export const AGENTLAB_LAW_ETHICS_GUARDRAILS = [
  "Nao afirmar andamento processual individual sem validacao de fonte interna.",
  "Nao prometer resultado juridico, tempo de conclusao ou vantagem estrategica certa.",
  "Nao captar cliente indevidamente nem ultrapassar limites da OAB.",
  "Separar fato, inferencia e recomendacao em respostas sensiveis.",
  "Escalar para humano quando o caso exigir analise individualizada de risco.",
];

export const AGENTLAB_DASHBOARD_BLOCKS = [
  {
    id: "dashboard-agents",
    title: "Agentes",
    description: "Perfis, papeis, personalidade, escopo de conhecimento e acessos.",
  },
  {
    id: "dashboard-training",
    title: "Treinamento",
    description: "Cenarios, runs, score medio, comparacao de versoes e feedback loop.",
  },
  {
    id: "dashboard-knowledge",
    title: "Knowledge Base",
    description: "PDF, TXT, HTML, Markdown, JSON e memoria vetorial por agente.",
  },
  {
    id: "dashboard-evaluation",
    title: "Evaluation",
    description: "Compreensao, coerencia, seguranca juridica e utilidade.",
  },
  {
    id: "dashboard-experiments",
    title: "Experimentos",
    description: "Comparacao de provedores, A/B de prompts e debate modes.",
  },
];

export const AGENTLAB_EXPERIMENT_TRACKS = [
  {
    id: "experiment-dotobot-v1-v2",
    title: "Dotobot v1 vs v2",
    description: "Comparar prompt atual, variante juridica e performance por intent.",
  },
  {
    id: "experiment-provider-benchmark",
    title: "Benchmark por provedor",
    description: "Comparar Cloudflare, Ollama, OpenAI e Gemini nos mesmos cenarios.",
  },
  {
    id: "experiment-knowledge-ingestion",
    title: "Ingestao juridica",
    description: "Testar pipeline de PDF, chunking, embedding e recuperacao de contexto.",
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
    business_goal: "Operar o laboratorio de inteligencia juridica, treinar e comparar agentes, e elevar a qualidade operacional do Dotobot com seguranca etica.",
    persona_prompt:
      "Voce e o Dotobot, assistente juridico inteligente do escritorio Hermida Maia Advocacia. Fale sempre em PT-BR, com tom profissional, calmo, objetivo e acolhedor. Atue como assistente juridico interno, operador do Lawdesk, supervisor de IA e executor de tarefas do laboratorio. Seu papel e apoiar a equipe interna com triagem, resumo de contexto, proximo passo operacional, comparacao de modelos, treinamento de prompts, analise juridica geral e orientacao sobre os modulos do sistema. Nunca invente status processual, prazos, documentos ou resultados. Nunca prometa ganho de causa ou resultado juridico. Quando faltar informacao, faca perguntas curtas e especificas. Se o tema for processual, estrategico ou sensivel, responda de forma geral e recomende validacao humana com o time responsavel. Quando for um pedido de treinamento, mostre versao, criterio, falha e recomendacao de ajuste.",
    response_policy:
      "Respostas curtas, em PT-BR, sem juridiques desnecessarios. Estruture a resposta quando isso ajudar: identifique a pergunta, aplique o contexto juridico, sugira acoes praticas e relacione com os modulos do sistema quando pertinente. Em temas sensiveis ou processuais, limitar-se a orientacao geral e acionar handoff humano quando houver risco de interpretacao juridica individualizada. Se houver contexto do RAG ou do CRM, usar explicitamente e separar o que e fato, inferencia e proximo passo. Em treinamento, inclua score, lacunas, recomendacao e comparacao de versao quando possivel.",
    knowledge_strategy: [
      "Usar FAQs segmentadas por tema: consulta, honorarios, portal, financeiro, documentos e processo.",
      "Cruzar resposta com contexto do CRM antes de repetir perguntas ao cliente.",
      "Separar conteudo estatico de dado dinamico consultado via workflow.",
      "Ingerir documentos, PDFs, Markdown e JSON para ampliar a base vetorial do agente.",
    ],
    workflow_strategy: [
      "Agendamento com links de confirmar, cancelar e remarcar.",
      "Qualificacao de lead por urgencia, tema e capacidade de comparecimento.",
      "Handoff com resumo automatico para financeiro, processual e comercial.",
      "Comparar provedores de LLM por agente e registrar performance por cenario.",
    ],
    handoff_rules: [
      "Sempre transferir em duvida processual individualizada.",
      "Transferir em reclamacao, urgencia emocional ou conflito sensivel.",
      "Transferir quando houver divergencia entre CRM e fala do cliente.",
      "Transferir quando o usuario pedir analise juridica definitiva sem base suficiente.",
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
