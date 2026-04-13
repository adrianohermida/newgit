import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillPartesFromPublicacoes,
  createPublicacoesAdminJob,
  createProcessesFromPublicacoes,
  getPublicacoesAdminJob,
  getPublicationActivityTypes,
  getPublicacoesOverview,
  getPublicacoesValidationMap,
  jsonError,
  jsonOk,
  listAdminJobs,
  listAdminOperations,
  listCreateProcessCandidates,
  listProcessCoverage,
  listPublicationActivityBacklog,
  listPartesExtractionCandidates,
  logAdminOperation,
  processPublicacoesAdminJob,
  runSyncWorker,
  savePublicacoesValidation,
  syncPublicationActivities,
  syncPartesFromPublicacoes,
} from "../lib/hmadv-ops.js";
import {
  getContactDetail,
  listLinkedPartes,
  listUnlinkedPartes,
  reconcilePartesContacts,
} from "../lib/hmadv-contacts.js";

function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isJobInfraError(error) {
  const message = String(error?.message || "");
  return message.includes("operacao_jobs") && (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("PGRST205")
  );
}

function isQueueOverloadError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Too many subrequests") ||
    message.includes("subrequests") ||
    message.includes("Worker exceeded resource limits") ||
    message.includes("exceeded resource limits")
  );
}

function buildQueueFallback({ page, pageSize, error }) {
  return {
    page,
    pageSize,
    totalRows: 0,
    items: [],
    limited: true,
    error: error?.message || "Fila em modo reduzido por sobrecarga.",
  };
}

function isLegacyPartesAction(action) {
  return action === "backfill_partes" || action === "sincronizar_partes" || action === "reconciliar_partes_contatos";
}

function buildLegacyPartesActionError() {
  return new Error("As acoes de partes foram centralizadas no modulo de processos. Use /interno/processos para extracao, reconciliacao e CRM de partes.");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mapIntegratedQueueItem(source, row) {
  return {
    ...row,
    queueSource: source,
    unifiedKey: `${source}:${row?.key || row?.numero_cnj || row?.processo_id || row?.id || ""}`,
    selectionValue: row?.key || row?.numero_cnj || row?.processo_id || row?.id || "",
  };
}

function matchesIntegratedQuery(row, query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const fields = [
    row?.numero_cnj,
    row?.titulo,
    row?.account_id_freshsales,
    row?.sample_partes_novas?.map((item) => item?.nome).join(" | "),
    row?.sample_partes_existentes?.map((item) => item?.nome).join(" | "),
    row?.sample_partes?.map((item) => item?.nome).join(" | "),
    row?.snippet,
  ];
  return normalizeSearchText(fields.filter(Boolean).join(" ")).includes(normalized);
}

async function collectIntegratedQueueSlice(env, { source = "todos", page = 1, pageSize = 20, query = "" } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetEnd = safePage * safePageSize;
  const maxScans = Math.min(60, Math.max(6, Math.ceil((targetEnd + safePageSize) / 50) + 2));
  const queueSources = source === "todos" ? ["processos", "partes"] : [source];
  const loaders = {
    processos: async (nextPage) => listCreateProcessCandidates(env, { page: nextPage, pageSize: 50 }),
    partes: async (nextPage) => listPartesExtractionCandidates(env, { page: nextPage, pageSize: 50 }),
  };
  const rows = [];
  let limited = false;

  for (const queueSource of queueSources) {
    let nextPage = 1;
    let scans = 0;
    let hasMore = true;
    while (hasMore && scans < maxScans && rows.length < targetEnd + safePageSize) {
      const payload = await loaders[queueSource](nextPage);
      const currentItems = (payload?.items || [])
        .filter((item) => matchesIntegratedQuery(item, query))
        .map((item) => mapIntegratedQueueItem(queueSource, item));
      rows.push(...currentItems);
      hasMore = Boolean(payload?.hasMore) || ((payload?.items || []).length >= 50);
      if (payload?.limited) limited = true;
      nextPage += 1;
      scans += 1;
      if (!(payload?.items || []).length) break;
    }
    if (hasMore) limited = true;
  }

  const ordered = rows.sort((left, right) => {
    const leftCount = Number(left?.partes_novas || left?.partes_detectadas || left?.publicacoes || 0);
    const rightCount = Number(right?.partes_novas || right?.partes_detectadas || right?.publicacoes || 0);
    if (rightCount !== leftCount) return rightCount - leftCount;
    return String(left?.numero_cnj || "").localeCompare(String(right?.numero_cnj || ""));
  });
  const pageItems = ordered.slice((safePage - 1) * safePageSize, safePage * safePageSize);
  const validations = await getPublicacoesValidationMap(env, pageItems.map((item) => item.numero_cnj));
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: limited ? Math.max(ordered.length, targetEnd + 1) : ordered.length,
    totalEstimated: limited,
    hasMore: ordered.length > safePage * safePageSize || limited,
    limited,
    items: pageItems.map((item) => ({ ...item, validation: validations[item.numero_cnj] || null })),
  };
}

async function collectIntegratedSelection(env, { source = "todos", query = "", limit = 500 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 500), 5000));
  const maxScans = Math.min(120, Math.max(12, Math.ceil(safeLimit / 50) + 4));
  const queueSources = source === "todos" ? ["processos", "partes"] : [source];
  const loaders = {
    processos: async (nextPage) => listCreateProcessCandidates(env, { page: nextPage, pageSize: 50 }),
    partes: async (nextPage) => listPartesExtractionCandidates(env, { page: nextPage, pageSize: 50 }),
  };
  const selected = new Set();
  for (const queueSource of queueSources) {
    let nextPage = 1;
    let scans = 0;
    let hasMore = true;
    while (hasMore && scans < maxScans && selected.size < safeLimit) {
      const payload = await loaders[queueSource](nextPage);
      for (const item of payload?.items || []) {
        if (matchesIntegratedQuery(item, query) && item?.numero_cnj) selected.add(item.numero_cnj);
        if (selected.size >= safeLimit) break;
      }
      hasMore = Boolean(payload?.hasMore) || ((payload?.items || []).length >= 50);
      nextPage += 1;
      scans += 1;
      if (!(payload?.items || []).length) break;
    }
  }
  return {
    totalRows: selected.size,
    items: [...selected],
    limited: selected.size >= safeLimit,
  };
}

async function loadIntegratedDetail(env, numeroCnj) {
  const coverage = await listProcessCoverage(env, {
    page: 1,
    pageSize: 5,
    query: numeroCnj,
    onlyPending: false,
  });
  const linkedPartes = await listLinkedPartes(env, { page: 1, pageSize: 20, query: numeroCnj });
  const pendingPartes = await listUnlinkedPartes(env, { page: 1, pageSize: 20, query: numeroCnj });
  const linkedContactId =
    linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id || "";
  const contactDetail = linkedContactId ? await getContactDetail(env, linkedContactId).catch(() => null) : null;
  const validations = await getPublicacoesValidationMap(env, [numeroCnj]);
  const validationHistoryRaw = await listAdminOperations(env, { modulo: "publicacoes", limit: 100 });
  const validationHistory = (validationHistoryRaw.items || [])
    .filter((item) => String(item?.acao || "").includes("salvar_validacao"))
    .filter((item) => {
      const payloadNumbers = parseProcessNumbers(item?.payload?.processNumbers || []);
      return payloadNumbers.includes(numeroCnj);
    })
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      status: item?.payload?.status || "",
      note: item?.payload?.note || "",
      updatedBy: item?.payload?.updatedBy || null,
      createdAt: item?.created_at || item?.finished_at || null,
      statusLabel: item?.payload?.status || "",
    }));
  return {
    coverage,
    linkedPartes,
    pendingPartes,
    contactDetail,
    validation: validations[numeroCnj] || null,
    validationHistory,
  };
}

async function runInlinePublicacoesAction(env, action, body) {
  const processNumbers = parseProcessNumbers(body.processNumbers);
  const requestedLimit = Number(body.limit || 0);
  if (action === "backfill_partes") {
    return backfillPartesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 15,
      apply: Boolean(body.apply),
    });
  }
  if (action === "sincronizar_partes") {
    return syncPartesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "criar_processos_publicacoes") {
    return createProcessesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "sincronizar_publicacoes_activity") {
    return syncPublicationActivities(env, {
      processNumbers,
      limit: requestedLimit || 5,
    });
  }
  if (action === "reconciliar_partes_contatos") {
    return reconcilePartesContacts(env, {
      processNumbers,
      limit: requestedLimit || 10,
      apply: body.apply !== undefined ? Boolean(body.apply) : true,
    });
  }
  throw new Error(`Acao inline de publicacoes nao suportada: ${action}`);
}

async function drainPublicacoesJobs(env, { preferredId = null, maxChunks = 6 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 1), 1));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;

  while (chunks < safeChunks) {
    let job = null;
    if (preferredId) {
      job = await getPublicacoesAdminJob(env, preferredId);
      preferredId = null;
      if (job && !["pending", "running"].includes(String(job.status || ""))) {
        job = null;
      }
    }
    if (!job) {
      const listed = await listAdminJobs(env, { modulo: "publicacoes", limit: 20 });
      job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    }
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processPublicacoesAdminJob(env, job.id);
    chunks += 1;
    if (!activeJob || !["pending", "running"].includes(String(activeJob.status || ""))) {
      continue;
    }
  }

  if (!completedAll) {
    const listed = await listAdminJobs(env, { modulo: "publicacoes", limit: 20 });
    completedAll = !(listed.items || []).some((item) => ["pending", "running"].includes(String(item.status || "")));
    if (!activeJob?.id) {
      activeJob = (listed.items || [])[0] || null;
    }
  }

  return {
    job: activeJob,
    chunksProcessed: chunks,
    completedAll,
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const url = new URL(context.request.url);
    const action = String(url.searchParams.get("action") || "overview");
    if (action === "overview") {
      const data = await getPublicacoesOverview(context.env);
      return jsonOk({ data });
    }
    if (action === "candidatos_processos") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      try {
        const data = await listCreateProcessCandidates(context.env, { page, pageSize });
        return jsonOk({ data });
      } catch (error) {
        if (isQueueOverloadError(error)) {
          return jsonOk({ data: buildQueueFallback({ page, pageSize, error }) });
        }
        throw error;
      }
    }
    if (action === "candidatos_partes") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      try {
        const data = await listPartesExtractionCandidates(context.env, { page, pageSize });
        return jsonOk({ data });
      } catch (error) {
        if (isQueueOverloadError(error)) {
          return jsonOk({ data: buildQueueFallback({ page, pageSize, error }) });
        }
        throw error;
      }
    }
    if (action === "mesa_integrada") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      const query = String(url.searchParams.get("query") || "");
      const source = String(url.searchParams.get("source") || "todos");
      try {
        const data = await collectIntegratedQueueSlice(context.env, { page, pageSize, query, source });
        return jsonOk({ data });
      } catch (error) {
        if (isQueueOverloadError(error)) {
          return jsonOk({ data: buildQueueFallback({ page, pageSize, error }) });
        }
        throw error;
      }
    }
    if (action === "mesa_integrada_selecao") {
      const query = String(url.searchParams.get("query") || "");
      const source = String(url.searchParams.get("source") || "todos");
      const limit = Number(url.searchParams.get("limit") || 500);
      try {
        const data = await collectIntegratedSelection(context.env, { query, source, limit });
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "detalhe_integrado") {
      const numeroCnj = String(url.searchParams.get("numero_cnj") || "").replace(/\D+/g, "");
      if (!numeroCnj) {
        return jsonError(new Error("numero_cnj obrigatorio."), 400);
      }
      const data = await loadIntegratedDetail(context.env, numeroCnj);
      return jsonOk({ data });
    }
    if (action === "publicacoes_pendentes") {
      const data = await listPublicationActivityBacklog(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "activity_types") {
      const data = await getPublicationActivityTypes(context.env);
      return jsonOk({ data });
    }
    if (action === "historico") {
      const data = await listAdminOperations(context.env, {
        modulo: "publicacoes",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "jobs") {
      const data = await listAdminJobs(context.env, {
        modulo: "publicacoes",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "job_status") {
      const data = await getPublicacoesAdminJob(context.env, url.searchParams.get("id"));
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao GET invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    async function runLogged(fn) {
      try {
        const data = await fn();
        await logAdminOperation(context.env, { modulo: "publicacoes", acao: action, status: "success", payload: body, result: data });
        return jsonOk({ data });
      } catch (error) {
        await logAdminOperation(context.env, { modulo: "publicacoes", acao: action, status: "error", payload: body, error: error.message || "Falha operacional." });
        return jsonError(error, 500);
      }
    }
    if (isLegacyPartesAction(action)) {
      return jsonError(buildLegacyPartesActionError(), 409);
    }
    if (action === "create_job") {
      try {
          if (isLegacyPartesAction(String(body.jobAction || ""))) {
            return jsonError(buildLegacyPartesActionError(), 409);
          }
          const data = await createPublicacoesAdminJob(context.env, {
            action: String(body.jobAction || ""),
            payload: {
              processNumbers: parseProcessNumbers(body.processNumbers),
              limit: Number(body.limit || 0),
              jobControl: body.jobControl || null,
            },
          });
        return jsonOk({ data });
      } catch (error) {
        if (isJobInfraError(error)) {
          try {
            const result = await runInlinePublicacoesAction(context.env, String(body.jobAction || ""), body);
            await logAdminOperation(context.env, {
              modulo: "publicacoes",
              acao: `${String(body.jobAction || "")}_inline_fallback`,
              status: "success",
              payload: body,
              result,
            });
            return jsonOk({
              data: {
                legacy_inline: true,
                action: String(body.jobAction || ""),
                reason: "operacao_jobs_unavailable",
                result,
              },
            });
          } catch (inlineError) {
            await logAdminOperation(context.env, {
              modulo: "publicacoes",
              acao: `${String(body.jobAction || "")}_inline_fallback`,
              status: "error",
              payload: body,
              error: inlineError.message || "Falha no fallback inline.",
            });
            return jsonError(inlineError, 500);
          }
        }
        return jsonError(error, 500);
      }
    }
    if (action === "run_job_chunk") {
      try {
        const data = await processPublicacoesAdminJob(context.env, body.id);
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "run_pending_jobs") {
      try {
        const data = await drainPublicacoesJobs(context.env, {
          preferredId: body.id || null,
          maxChunks: Number(body.maxChunks || 1),
        });
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "criar_processos_publicacoes") {
      return runLogged(async () => createProcessesFromPublicacoes(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "sincronizar_publicacoes_activity") {
      return runLogged(async () => syncPublicationActivities(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 5),
      }));
    }
    if (action === "salvar_validacao") {
      body.updatedBy = auth.profile?.email || auth.user?.email || auth.user?.id || "";
      return runLogged(async () => savePublicacoesValidation(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        status: String(body.status || ""),
        note: String(body.note || ""),
        updatedBy: body.updatedBy,
      }));
    }
    if (action === "run_sync_worker") {
      return runLogged(async () => runSyncWorker(context.env));
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
