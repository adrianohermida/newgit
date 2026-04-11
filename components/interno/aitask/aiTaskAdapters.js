import { detectRelevantModulesForMission } from "../../../lib/admin/module-registry";
import { normalizeTaskRunPayload } from "../../../lib/admin/task-runner";

export function detectModules(mission) {
  return detectRelevantModulesForMission(mission);
}

export function requiresApproval(mission) {
  return /deletar|excluir|cancelar|remover|destruir/i.test(mission || "");
}

export function normalizeMission(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatExecutionSourceLabel(source) {
  const labels = { openai: "OpenAI", cloudflare: "Cloudflare AI", local: "Modelo local", custom: "Custom" };
  return labels[source] || source || "n/a";
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
