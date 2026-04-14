import { detectModules, requiresApproval } from "./aiTaskAdapters";

export function formatHistoryStatus(status) {
  const labels = { running: "Executando", done: "Concluido", failed: "Falhou", stopped: "Parado", idle: "Pronto" };
  return labels[status] || String(status || "Indefinido");
}

export function nowIso() {
  return new Date().toISOString();
}

export function extractFirstEmail(value = "") {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

export function buildRagAlert(health) {
  if (!health || health.status === "operational") return null;
  const signals = health.signals || {};
  if (signals.supabaseAuthMismatch) return { tone: "danger", title: "Embedding RAG bloqueado por autenticacao", body: "O Supabase respondeu com falha de autenticacao. Revise o DOTOBOT_SUPABASE_EMBED_SECRET no app e na function dotobot-embed." };
  if (signals.appEmbedSecretMissing) return { tone: "warning", title: "Segredo do embed ausente no app", body: "O dashboard esta sem DOTOBOT_SUPABASE_EMBED_SECRET, entao embedding e consulta vetorial podem falhar ou ficar superficiais." };
  return { tone: "warning", title: "RAG degradado no momento", body: health.error || "Embedding, consulta vetorial ou persistencia de memoria nao estao integros. Abra o diagnostico para revisar secrets e backends." };
}

export function buildBlueprint(normalizedMission, profile, mode, provider) {
  const modules = detectModules(normalizedMission);
  const critical = requiresApproval(normalizedMission);
  const steps = [
    { id: "intake", title: "Receber missao", description: "Interpretar o pedido, identificar urgencia e classificar a natureza da tarefa.", status: "pending", dependsOn: [], agent: "Dotobot", priority: "high" },
    { id: "context", title: "Recuperar contexto", description: "Buscar memoria, documentos e sinais do modulo relevante antes de decidir o proximo passo.", status: "pending", dependsOn: ["intake"], agent: "Dotobot", priority: critical ? "high" : "medium" },
    { id: "plan", title: "Montar plano", description: "Quebrar a missao em tarefas executaveis com ordem, dependencia e risco visivel.", status: "pending", dependsOn: ["context"], agent: "Planner", priority: "high" },
    { id: "execute", title: "Executar tarefa principal", description: "Acionar o backend e executar a primeira acao relevante com transparencia total.", status: "pending", dependsOn: ["plan"], agent: provider === "local" ? "Modelo local" : "Dotobot", priority: "high" },
    { id: "critic", title: "Validar resposta", description: "Checar consistencia, risco juridico, lacunas e necessidade de aprovacao humana.", status: "pending", dependsOn: ["execute"], agent: "Critic", priority: "medium" },
  ];
  const thinking = [
    { id: "thought-intake", title: "Leitura da missao", timestamp: nowIso(), summary: `Interpretando solicitacao como tarefa ${critical ? "critica" : "operacional"} no modo ${mode}.`, details: [`Pedido normalizado: ${normalizedMission || "missao vazia"}`, `Modulos candidatos: ${modules.join(", ")}`, `Responsavel visivel: ${profile?.full_name || profile?.email || "Hermida Maia Advocacia"}`], expanded: true },
    { id: "thought-context", title: "Contexto e memoria", timestamp: nowIso(), summary: "Selecionando memoria relevante e sinais do modulo atual.", details: ["Fontes candidatas: Supabase embeddings, Obsidian fallback, contexto de rota e perfil.", "Caso o contexto esteja insuficiente, a execucao segue em modo conservador."], expanded: false },
    { id: "thought-tools", title: "Selecao de ferramentas", timestamp: nowIso(), summary: `Ferramentas provaveis: ${modules.join(" + ")}.`, details: ["O orquestrador prioriza leitura, classificacao, consolidacao e validacao antes de acionar acao sensivel.", critical ? "Aprovacao manual sera exigida para etapas destrutivas ou sensiveis." : "Execucao pode seguir sem bloqueio se o modo permitir."], expanded: false },
  ];
  const tasks = steps.map((step, index) => ({ id: `${Date.now()}_${index}`, title: step.title, goal: step.description, description: step.description, step, steps: [step.description], status: index === 0 ? "running" : "pending", priority: step.priority, assignedAgent: step.agent, created_at: nowIso(), updated_at: nowIso(), logs: [], dependencies: step.dependsOn }));
  return { mission: normalizedMission, critical, modules, tasks, thinking };
}
