import { listUserFacingDotobotTools } from "./tool_catalog.js";
import { listExternalAppCoverage, listHmadvEdgeFunctions } from "./platform_catalog.js";
import { buildDotobotToolTrainingPrompt } from "./tool_training.js";

const INTERNAL_MODULES = [
  { key: "interno_overview", label: "Visao Geral", route: "/interno" },
  { key: "interno_aprovacoes", label: "Aprovacoes", route: "/interno/aprovacoes" },
  { key: "interno_processos", label: "Processos", route: "/interno/processos" },
  { key: "interno_publicacoes", label: "Publicacoes", route: "/interno/publicacoes" },
  { key: "interno_contacts", label: "Contacts", route: "/interno/contacts" },
  { key: "interno_agentlab", label: "AgentLab", route: "/interno/agentlab" },
  { key: "interno_posts", label: "Posts", route: "/interno/posts" },
  { key: "interno_agendamentos", label: "Agendamentos", route: "/interno/agendamentos" },
  { key: "interno_leads", label: "Leads", route: "/interno/leads" },
];

const AUTHORIZED_TOOL_GROUPS = [
  { key: "crm", label: "CRM e relacoes", allowedActions: ["ler_dados", "sincronizar", "enriquecer", "auditar"] },
  { key: "processos", label: "Processos judiciais", allowedActions: ["consultar", "atualizar", "monitorar", "vincular"] },
  { key: "publicacoes", label: "Publicacoes e andamentos", allowedActions: ["listar", "classificar", "reprocessar"] },
  { key: "agendamentos", label: "Agenda e consultas", allowedActions: ["listar", "detalhar", "acompanhar"] },
  { key: "freshchat", label: "Freshchat e atendimento", allowedActions: ["sincronizar", "consultar", "atualizar"] },
  { key: "freshdesk", label: "Freshdesk e suporte", allowedActions: ["listar", "abrir", "acompanhar"] },
  { key: "financeiro", label: "Financeiro e deals", allowedActions: ["listar", "sincronizar", "auditar"] },
  { key: "pipeline", label: "Pipeline HMADV", allowedActions: ["monitorar", "executar", "auditar"] },
  { key: "slack", label: "Slack e notificacoes", allowedActions: ["publicar", "monitorar"] },
  { key: "oauth", label: "Autenticacao Freshworks", allowedActions: ["consultar", "renovar"] },
  { key: "ia", label: "Enriquecimento por IA", allowedActions: ["enriquecer", "resumir", "classificar"] },
  { key: "content", label: "Conteudo e posts", allowedActions: ["listar", "criar", "editar"] },
  { key: "agentlab", label: "Orquestracao de agentes", allowedActions: ["governanca", "sync", "avaliacao", "treinamento"] },
];

const DOTOBOT_SYSTEM_PROMPT = [
  "Voce e o Dotobot, assistente interno da Hermida Maia Advocacia.",
  "Fale sempre em PT-BR, com tom profissional, calmo, objetivo e acolhedor.",
  "Seu papel e apoiar membros internos do escritorio com triagem, resumo de contexto, proximo passo operacional e orientacao geral.",
  "Voce atua como assistente juridico inteligente, analista estrategico, operador do sistema Lawdesk e suporte interno do escritorio.",
  "Seu contexto inclui Direito do Consumidor, Superendividamento (Lei 14.181/2021), Direito Civil, processos judiciais e administrativos e producao de pecas processuais.",
  "Interprete a intencao do usuario: analisar caso, criar documento, sugerir proximo passo, organizar informacoes ou orientar uso do sistema.",
  "Nunca invente status processual, prazos, documentos ou resultados.",
  "Nunca prometa ganho de causa ou resultado juridico.",
  "Quando faltar informacao, faca perguntas curtas e especificas antes de concluir.",
  "Quando o tema for processual, estrategico ou sensivel, explique de forma geral e recomende validacao humana com o time responsavel.",
  "Nao use ingles nem linguagem excessivamente tecnica; prefira frases curtas e claras.",
  "Se o usuario pedir um resumo, entregue em bullets objetivos.",
  "Sempre que possivel, estruture a resposta, sugira acoes praticas e relacione a resposta com os modulos do sistema como processos, clientes, financeiro, documentos e agenda.",
  "Se o usuario pedir algo como analise juridica, peticao, estrategia ou organizacao, entregue a resposta nesse formato.",
  "Se nao houver informacao suficiente, solicite mais dados sem inventar nada.",
  "Se houver contexto relevante do RAG ou do CRM, use-o explicitamente e deixe claro o que veio de memoria/contexto e o que e inferencia.",
].join(" ");

function uniqueByRoute(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.route || item.key || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDotobotRepositoryContext(input = {}) {
  const currentRoute = typeof input.route === "string" ? input.route : "/interno";
  const profile = input.profile || {};
  const toolCatalog = listUserFacingDotobotTools().map((tool) => ({
    id: tool.id,
    title: tool.title,
    group: tool.group,
    visibility: tool.visibility,
    description: tool.description,
  }));
  const edgeFunctionCatalog = listHmadvEdgeFunctions().map((item) => ({
    name: item.name,
    domain: item.domain,
    exposure: item.exposure,
    purpose: item.purpose,
  }));
  const externalAppsCoverage = listExternalAppCoverage();
  const toolTrainingPrompt = buildDotobotToolTrainingPrompt({
    toolCatalog,
    externalAppsCoverage,
  });
  const routeHints = uniqueByRoute([
    ...INTERNAL_MODULES,
    { key: "current_route", label: "Rota atual", route: currentRoute },
  ]);

  return {
    workspace: "lawdesk_internal",
    objective: "assistencia operacional para escritorio de advocacia",
    mission:
      "Aumentar produtividade, qualidade tecnica e eficiencia do escritorio Hermida Maia Advocacia com suporte juridico interno de alta performance.",
    locale: "pt-BR",
    assistant: {
      name: "Dotobot",
      role: "assistente juridico interno",
      persona: "profissional, acolhedora, objetiva e prudente",
      system_prompt: DOTOBOT_SYSTEM_PROMPT,
      capabilities: [
        "analisar situacoes juridicas",
        "sugerir estrategias processuais",
        "auxiliar na elaboracao de pecas",
        "explicar fundamentos legais",
        "ajudar na gestao de tarefas",
        "apoiar no uso do sistema",
        "identificar riscos e priorizar atividades",
      ],
    },
    currentRoute,
    actor: {
      id: profile.id || null,
      email: profile.email || null,
      role: profile.role || null,
    },
    modules: routeHints,
    authorizedToolGroups: AUTHORIZED_TOOL_GROUPS,
    toolCatalog,
    edgeFunctionCatalog,
    externalAppsCoverage,
    toolTrainingPrompt,
    policies: {
      scope: "all_repository_modules",
      executionMode: "authorized_tools_only",
      preserveBusinessLogicBoundaries: true,
      requireStructuredResponses: true,
    },
  };
}
