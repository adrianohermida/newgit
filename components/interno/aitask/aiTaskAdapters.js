import { detectRelevantModulesForMission } from "../../../lib/admin/module-registry.js";
import { normalizeTaskRunPayload } from "../../../lib/admin/task-runner-shared.js";
import { formatLawdeskProviderLabel } from "../../../lib/lawdesk/providers.js";

export function detectModules(mission) {
  if (!mission) return ["dashboard"];
  if (/peticao|recurso|contestacao|acao|agravo/i.test(mission)) return ["documentos-juridicos"];
  if (/audiencia|processo|cnj/i.test(mission)) return ["processos"];
  if (/cliente|contato|cobranca/i.test(mission)) return ["clientes"];
  return detectRelevantModulesForMission(mission);
}

export function requiresApproval(mission) {
  return /deletar|excluir|cancelar|remover|destruir/i.test(mission || "");
}

export function normalizeMission(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatExecutionSourceLabel(source) {
  return formatLawdeskProviderLabel(source);
}

export function classifyTaskAgent(step = {}) {
  const tool = String(step?.tool || "").toLowerCase();
  const action = String(step?.action || step?.title || step?.name || "").toLowerCase();
  const combined = `${tool} ${action}`;

  if (/critic|review|validate|validar|approval|approve|compliance/.test(combined)) return "Critic";
  if (/plan|planner|breakdown|roteiro|plano/.test(combined)) return "Planner";
  if (/rag|memory|retrieve|retrieval|context|search|obsidian|supabase/.test(combined)) return "Retriever";
  if (/supervisor|orchestr|coord|dispatch|govern/.test(combined)) return "Supervisor";
  if (/local|cloudflare|workers_ai|executor|execute|run|chat|tool_call|backend/.test(combined)) return "Executor";
  return "Dotobot";
}

export function normalizeTaskStepStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["ok", "done", "completed", "success"].includes(normalized)) return "done";
  if (["fail", "failed", "error", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (["queued", "pending", "waiting", "planned"].includes(normalized)) return "pending";
  return "running";
}

export function inferTaskPriority(step = {}) {
  const combined = `${step?.tool || ""} ${step?.action || step?.title || ""}`.toLowerCase();
  if (/approval|critic|review|compliance/.test(combined)) return "medium";
  if (/rag|memory|retrieve|context/.test(combined)) return "medium";
  return "high";
}

export function summarizeTaskRunOrchestration(orchestration) {
  const subagents = Array.isArray(orchestration?.subagents) ? orchestration.subagents.filter(Boolean) : [];
  const tasks = Array.isArray(orchestration?.tasks) ? orchestration.tasks.filter(Boolean) : [];
  const availableModules = Array.isArray(orchestration?.available_modules)
    ? orchestration.available_modules.filter(Boolean)
    : [];
  const parallelGroups = Array.from(new Set(tasks.map((task) => task?.parallel_group).filter(Boolean)));
  const stages = Array.from(new Set(tasks.map((task) => task?.stage).filter(Boolean)));
  const moduleKeys = Array.from(new Set([
    ...tasks.flatMap((task) => Array.isArray(task?.module_keys) ? task.module_keys : []),
    ...availableModules.map((module) => typeof module === "string" ? module : module?.key).filter(Boolean),
  ]));
  const dependencyEdges = tasks.reduce((total, task) => {
    const dependencies = Array.isArray(task?.depends_on) ? task.depends_on : Array.isArray(task?.dependencies) ? task.dependencies : [];
    return total + dependencies.filter(Boolean).length;
  }, 0);

  return {
    enabled: Boolean(orchestration?.multi_agent || subagents.length || tasks.length),
    multiAgent: Boolean(orchestration?.multi_agent),
    subagents,
    tasks,
    availableModules,
    parallelGroups,
    stages,
    moduleKeys,
    dependencyEdges,
  };
}

export function extractTaskRunResultText(...sources) {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source?.result?.message === "string" && source.result.message.trim()) {
      return source.result.message.trim();
    }
    if (typeof source?.resultText === "string" && source.resultText.trim()) {
      return source.resultText.trim();
    }
    if (typeof source?.result === "string" && source.result.trim()) {
      return source.result.trim();
    }
    if (source?.result != null && typeof source.result !== "string") {
      try {
        return JSON.stringify(source.result);
      } catch {
        return String(source.result);
      }
    }
  }
  return "";
}

export function extractTaskRunMemoryMatches(rag) {
  if (!rag) return [];
  if (Array.isArray(rag?.retrieval?.matches)) return rag.retrieval.matches;
  if (Array.isArray(rag?.retrieved_context)) return rag.retrieved_context;
  return [];
}

export { normalizeTaskRunPayload };
