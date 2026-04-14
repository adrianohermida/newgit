import {
  getProcessosOverview,
  inspectAudiencias,
  listAdminJobs,
  listAdminOperations,
  listProcessRelations,
  scanOrphanProcesses,
  searchProcesses,
  suggestProcessRelations,
} from "./hmadv-ops.js";
import { buildCoverageFallback, buildQueueFallback, buildRunnerMetricsFallback, buildSchemaStatusFallback, isQueueOverloadError } from "./processos-api-shared.js";

async function withQueueFallback(action) {
  try {
    return await action();
  } catch (error) {
    if (!isQueueOverloadError(error)) throw error;
    return buildQueueFallback({ error });
  }
}

export async function handleProcessosGet(query) {
  const action = String(query.action || "overview");
  if (action === "overview") return { ok: true, data: await withQueueFallback(() => getProcessosOverview()) };
  if (action === "schema_status") return { ok: true, data: buildSchemaStatusFallback() };
  if (action === "runner_metrics") return { ok: true, data: buildRunnerMetricsFallback() };
  if (action === "cobertura_processos") return { ok: true, data: buildCoverageFallback({ page: Number(query.page || 1), pageSize: Number(query.pageSize || 20), unsupported: true }) };
  if (action === "orfaos") return { ok: true, data: await withQueueFallback(() => scanOrphanProcesses(Number(query.limit || 50))) };
  if (action === "inspect_audiencias") return { ok: true, data: await withQueueFallback(() => inspectAudiencias(Number(query.limit || 10))) };
  if (action === "buscar_processos") return { ok: true, data: await withQueueFallback(() => searchProcesses(String(query.query || ""), Number(query.limit || 8))) };
  if (action === "relacoes") {
    return {
      ok: true,
      data: await withQueueFallback(() => listProcessRelations({ page: Number(query.page || 1), pageSize: Number(query.pageSize || 20), query: String(query.query || ""), selectionOnly: String(query.selection || "") === "1" })),
    };
  }
  if (action === "sugestoes_relacoes") {
    return {
      ok: true,
      data: await withQueueFallback(() => suggestProcessRelations({ page: Number(query.page || 1), pageSize: Number(query.pageSize || 20), query: String(query.query || ""), minScore: Number(query.minScore || 0.45), selectionOnly: String(query.selection || "") === "1" })),
    };
  }
  if (action === "historico") return { ok: true, data: await listAdminOperations({ modulo: "processos", limit: Number(query.limit || 20) }) };
  if (action === "jobs") return { ok: true, data: await listAdminJobs({ modulo: "processos", limit: Number(query.limit || 12) }) };
  return null;
}
