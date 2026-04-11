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
