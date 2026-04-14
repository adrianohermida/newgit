export const NAV_ITEMS = [
  { href: "/interno", label: "Visao geral", group: "Workspace", icon: "dashboard" },
  { href: "/interno/copilot", label: "Copilot", group: "Workspace", icon: "copilot" },
  { href: "/interno/agentlab", label: "AgentLab", group: "Workspace", icon: "labs" },
  { href: "/interno/ai-task", label: "AI Task", group: "IA", icon: "spark" },
  { href: "/llm-test", label: "LLM Test", group: "IA", icon: "flask" },
  { href: "/interno/processos", label: "Processos", group: "Operacao", icon: "briefcase" },
  { href: "/interno/publicacoes", label: "Publicacoes", group: "Operacao", icon: "document" },
  { href: "/interno/jobs", label: "Jobs", group: "Operacao", icon: "layers" },
  { href: "/interno/aprovacoes", label: "Aprovacoes", group: "Operacao", icon: "shield" },
  { href: "/interno/contacts", label: "Contatos", group: "CRM", icon: "users" },
  { href: "/interno/leads", label: "Leads", group: "CRM", icon: "target" },
  { href: "/interno/agendamentos", label: "Agenda", group: "CRM", icon: "calendar" },
  { href: "/interno/financeiro", label: "Financeiro", group: "Gestao", icon: "wallet" },
  { href: "/interno/posts", label: "Conteudo", group: "Gestao", icon: "megaphone" },
  { href: "/interno/market-ads", label: "Market Ads", group: "Gestao", icon: "chart" },
  { href: "/interno/integration-kit", label: "Integration Kit", group: "Infra", icon: "plug" },
  { href: "/interno/setup-integracao", label: "Setup Inicial", group: "Infra", icon: "settings" },
];

export function normalizeDisplayName(profile) {
  return profile?.full_name || profile?.email || "Hermida Maia";
}
