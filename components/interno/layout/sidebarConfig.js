export const NAV_ITEMS = [
  { href: "/interno", label: "Visao geral" },
  { href: "/interno/copilot", label: "Copilot" },
  { href: "/interno/ai-task", label: "AI Task" },
  { href: "/interno/aprovacoes", label: "Aprovacoes" },
  { href: "/interno/financeiro", label: "Financeiro" },
  { href: "/interno/jobs", label: "Jobs" },
  { href: "/interno/processos", label: "Processos" },
  { href: "/interno/publicacoes", label: "Publicacoes" },
  { href: "/interno/contacts", label: "Contatos" },
  { href: "/interno/agentlab", label: "AgentLab" },
  { href: "/interno/integration-kit", label: "Integration Kit" },
  { href: "/interno/setup-integracao", label: "Setup Inicial" },
  { href: "/llm-test", label: "LLM Test" },
  { href: "/interno/posts", label: "Conteudo" },
  { href: "/interno/agendamentos", label: "Agenda" },
  { href: "/interno/leads", label: "Leads" },
  { href: "/interno/market-ads", label: "Market Ads" },
];

export function normalizeDisplayName(profile) {
  return profile?.full_name || profile?.email || "Hermida Maia";
}
