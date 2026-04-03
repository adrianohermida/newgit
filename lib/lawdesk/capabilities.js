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
  { key: "content", label: "Conteudo e posts", allowedActions: ["listar", "criar", "editar"] },
  { key: "agentlab", label: "Orquestracao de agentes", allowedActions: ["governanca", "sync", "avaliacao", "treinamento"] },
];

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
  const routeHints = uniqueByRoute([
    ...INTERNAL_MODULES,
    { key: "current_route", label: "Rota atual", route: currentRoute },
  ]);

  return {
    workspace: "lawdesk_internal",
    objective: "assistencia operacional para escritorio de advocacia",
    currentRoute,
    actor: {
      id: profile.id || null,
      email: profile.email || null,
      role: profile.role || null,
    },
    modules: routeHints,
    authorizedToolGroups: AUTHORIZED_TOOL_GROUPS,
    policies: {
      scope: "all_repository_modules",
      executionMode: "authorized_tools_only",
      preserveBusinessLogicBoundaries: true,
      requireStructuredResponses: true,
    },
  };
}

