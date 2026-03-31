export const AGENTLAB_WORKFLOW_BACKLOG = [
  {
    id: "qualificacao-lead",
    title: "Qualificacao de lead",
    priority: "Alta",
    owner: "CRM + Messaging",
    objective: "Capturar contexto comercial, area de interesse, urgencia e origem antes de mandar para humano.",
    status: "Planejado",
  },
  {
    id: "status-processo",
    title: "Status do processo",
    priority: "Alta",
    owner: "AI Agent + CRM",
    objective: "Reduzir transferencias manuais quando o cliente pede andamento, portal, publicacao ou documento.",
    status: "Planejado",
  },
  {
    id: "faturas-pagamentos",
    title: "Faturas e pagamentos",
    priority: "Alta",
    owner: "Financeiro + CRM",
    objective: "Atender 2a via, PIX, portal financeiro e confirmacao de pagamento com handoff seguro.",
    status: "Planejado",
  },
  {
    id: "agendamento-consulta",
    title: "Agendamento de consulta",
    priority: "Media",
    owner: "Chatbot + Agenda",
    objective: "Converter intencao comercial em consulta marcada com regras de disponibilidade e follow-up.",
    status: "Planejado",
  },
  {
    id: "handoff-inteligente",
    title: "Handoff inteligente",
    priority: "Alta",
    owner: "Messaging + Operacao",
    objective: "Transferir com resumo, dados coletados, tags e proximo passo em vez de repassar a conversa vazia.",
    status: "Planejado",
  },
  {
    id: "follow-up-comercial",
    title: "Follow-up comercial",
    priority: "Media",
    owner: "CRM + Sequences",
    objective: "Sincronizar conversa com jornada, sequencia de vendas e proxima acao do dono do lead.",
    status: "Planejado",
  },
];

export const AGENTLAB_KNOWLEDGE_PACKS = [
  {
    id: "honorarios-formas-pagamento",
    title: "Honorarios e formas de pagamento",
    sourceType: "Respostas predefinidas + FAQ",
    goal: "Reduzir respostas vagas sobre valores, parcelamento, PIX, faturas e portal.",
  },
  {
    id: "consulta-agendamento",
    title: "Consulta e agendamento",
    sourceType: "FAQ + Workflow",
    goal: "Padronizar orientacao sobre consulta, documentos iniciais e disponibilidade.",
  },
  {
    id: "andamento-processual",
    title: "Andamento processual",
    sourceType: "CRM + Knowledge base",
    goal: "Separar perguntas gerais de pedidos sensiveis sobre status de processo.",
  },
  {
    id: "portal-boletos-documentos",
    title: "Portal, boletos e documentos",
    sourceType: "URLs + Files + FAQ",
    goal: "Dar respostas prontas sobre portal do cliente, links, comprovantes e arquivos.",
  },
  {
    id: "superendividamento-playbooks",
    title: "Playbooks de superendividamento",
    sourceType: "Persona + Knowledge base",
    goal: "Ensinar a IA a qualificar e responder dentro da tese comercial e juridica do escritorio.",
  },
];

export const AGENTLAB_RESPONSE_PLAYBOOKS = [
  {
    title: "Abertura curta",
    rule: "Saudar, identificar area macro e oferecer 2 a 3 caminhos claros em uma unica mensagem.",
  },
  {
    title: "Coleta progressiva",
    rule: "Pedir nome, email e telefone apenas quando a proxima acao realmente precisar desses dados.",
  },
  {
    title: "Falha elegante",
    rule: "Explicar o limite da IA, resumir o que faltou e oferecer handoff ou workflow alternativo.",
  },
  {
    title: "Transferencia com contexto",
    rule: "Sempre anexar resumo, canal, intencao, urgencia e dados coletados antes do handoff.",
  },
];

export const AGENTLAB_DASHBOARD_MODULES = [
  {
    title: "Agents",
    description: "Cadastro, status, ownership e escopo operacional de cada agente conectado ao workspace.",
  },
  {
    title: "Knowledge",
    description: "Fontes, coverage por tema, lacunas, links e backlog editorial para alimentar o Freddy.",
  },
  {
    title: "Workflows",
    description: "Mapa dos fluxos desejados, trigger phrases, APIs usadas e status de rollout por canal.",
  },
  {
    title: "Training",
    description: "Centro de treinamento com cenarios, scorecards, recomendacoes e benchmarking do agente.",
  },
  {
    title: "Evaluation",
    description: "Top perguntas sem resposta, feedback ruim, gargalos de handoff e oportunidades de melhoria.",
  },
  {
    title: "CRM Layer",
    description: "Leads, contas, deals, atividades e sinais comerciais que devem enriquecer a conversa.",
  },
];

export const AGENTLAB_EVALUATION_BACKLOG = [
  {
    title: "Top 20 unanswered",
    objective: "Revisar semanalmente as perguntas sem resposta e transformalas em knowledge pack, workflow ou handoff rule.",
  },
  {
    title: "Top 10 poor responses",
    objective: "Corrigir respostas vagas, longas ou desalinhadas com a estrategia comercial do escritorio.",
  },
  {
    title: "Top intent gaps",
    objective: "Mapear clusters de perguntas recorrentes que ainda nao possuem fonte ou fluxo adequado.",
  },
  {
    title: "Handoff quality",
    objective: "Medir se a transferencia chega com contexto suficiente para o humano continuar sem retrabalho.",
  },
];

export const AGENTLAB_WEEKLY_SPRINTS = [
  "Top 20 unanswered",
  "Top 10 poor responses",
  "Top 5 workflows novos",
  "Top 10 conteudos novos",
];

export const AGENTLAB_ROLLOUT_PHASES = [
  {
    phase: "Fase 1",
    title: "Fundacao de dados e observabilidade",
    deliverables: [
      "Snapshots locais de contacts, sales_accounts e deals",
      "Catalogo de campos do Freshsales",
      "Leitura consolidada no Supabase",
      "Baseline de consultas, handoffs e fontes uteis",
    ],
  },
  {
    phase: "Fase 2",
    title: "Modelo de agente e fluxo conversacional",
    deliverables: [
      "Persona curta, comercial e segura",
      "Coleta progressiva de dados",
      "Fallback em dois niveis",
      "Handoff por regra de negocio",
    ],
  },
  {
    phase: "Fase 3",
    title: "Enriquecimento de recursos",
    deliverables: [
      "FAQs, respostas predefinidas e artigos",
      "URLs, PDFs e base operacional",
      "Contexto de CRM, jornada, sequencia e canal",
      "Separacao entre conteudo estatico e consulta dinamica",
    ],
  },
  {
    phase: "Fase 4",
    title: "Workflows prioritarios no Freddy",
    deliverables: [
      "Status do processo",
      "2a via, pagamento e fatura",
      "Agendamento de consulta",
      "Qualificacao de lead, handoff e recuperacao de contexto",
    ],
  },
];
