import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  backfillPartesFromPublicacoes,
  getPublicacoesOverview,
  listAdminJobs,
  listAdminOperations,
  listCreateProcessCandidates,
  listPartesExtractionCandidates,
  runAdviseBackfill,
  runAdviseSync,
  runSyncWorker,
} from "../../lib/admin/hmadv-ops.js";
import {
  createProcessesFromPublicacoes,
  createPublicacoesAdminJob,
  getPublicationActivityTypes,
  getPublicacoesAdminJob,
  getPublicacoesValidationMap,
  listPublicationActivityBacklog,
  listProcessCoverage,
  logAdminOperation,
  processPublicacoesAdminJob,
  savePublicacoesValidation,
  syncPartesFromPublicacoes,
  syncPublicationActivities,
} from "../../functions/lib/hmadv-ops.js";
import {
  getContactDetail,
  listLinkedPartes,
  listUnlinkedPartes,
  reconcilePartesContacts,
} from "../../functions/lib/hmadv-contacts.js";

const runtimeEnv = process.env;

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

function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isLegacyPartesAction(action) {
  return action === "backfill_partes" || action === "sincronizar_partes" || action === "reconciliar_partes_contatos";
}

function buildLegacyPartesActionError() {
  return "As acoes de partes foram centralizadas no modulo de processos. Use /interno/processos para extracao, reconciliacao e CRM de partes.";
}

function mapIntegratedQueueItem(source, row) {
  return {
    ...row,
    queueSource: source,
    enrichmentLabel: source === "partes" ? "partes novas" : "publicacoes",
    enrichmentCount: Number(row?.partes_novas || row?.partes_detectadas || row?.publicacoes || 0),
    unifiedKey: `${source}:${row?.key || row?.numero_cnj || row?.processo_id || row?.id || ""}`,
    selectionValue: row?.key || row?.numero_cnj || row?.processo_id || row?.id || "",
    validation: row?.validation || null,
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

async function collectIntegratedQueueSlice({ source = "todos", page = 1, pageSize = 20, query = "" } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetEnd = safePage * safePageSize;
  const maxScans = Math.min(240, Math.max(12, Math.ceil((targetEnd * 1.5) / 50) + 6));
  const queueSources = source === "todos" ? ["processos", "partes"] : [source];
  const loaders = {
    processos: async (nextPage) => listCreateProcessCandidates({ page: nextPage, pageSize: 50 }),
    partes: async (nextPage) => listPartesExtractionCandidates({ page: nextPage, pageSize: 50 }),
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
  const validations = await getPublicacoesValidationMap(
    runtimeEnv,
    pageItems.map((item) => item?.numero_cnj).filter(Boolean)
  );
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: limited ? Math.max(ordered.length, targetEnd + 1) : ordered.length,
    totalEstimated: limited,
    hasMore: ordered.length > safePage * safePageSize || limited,
    limited,
    items: pageItems.map((item) => ({
      ...item,
      validation: validations[item.numero_cnj] || item.validation || null,
    })),
  };
}

async function collectIntegratedSelection({ source = "todos", query = "", limit = 500 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 500), 5000));
  const maxScans = Math.min(240, Math.max(12, Math.ceil((safeLimit * 1.5) / 50) + 8));
  const queueSources = source === "todos" ? ["processos", "partes"] : [source];
  const loaders = {
    processos: async (nextPage) => listCreateProcessCandidates({ page: nextPage, pageSize: 50 }),
    partes: async (nextPage) => listPartesExtractionCandidates({ page: nextPage, pageSize: 50 }),
  };
  const selected = new Set();
  let limited = false;
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
    if (hasMore) limited = true;
  }
  return {
    totalRows: selected.size,
    items: [...selected],
    limited: selected.size >= safeLimit || limited,
  };
}

async function loadIntegratedDetail(numeroCnj) {
  const safeNumeroCnj = String(numeroCnj || "").trim();
  if (!safeNumeroCnj) {
    throw new Error("numeroCnj obrigatorio.");
  }
  const coverage = await listProcessCoverage(runtimeEnv, {
    page: 1,
    pageSize: 5,
    query: safeNumeroCnj,
    onlyPending: false,
  });
  const linkedPartes = await listLinkedPartes(runtimeEnv, {
    page: 1,
    pageSize: 20,
    query: safeNumeroCnj,
  });
  const pendingPartes = await listUnlinkedPartes(runtimeEnv, {
    page: 1,
    pageSize: 20,
    query: safeNumeroCnj,
  });
  const linkedContactId =
    linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id || "";
  const contactDetail = linkedContactId
    ? await getContactDetail(runtimeEnv, linkedContactId).catch(() => null)
    : null;
  const validations = await getPublicacoesValidationMap(runtimeEnv, [safeNumeroCnj]);
  const validationHistoryRaw = await listAdminOperations({
    modulo: "publicacoes",
    limit: 100,
  });
  const validationHistory = (validationHistoryRaw.items || [])
    .filter((item) => String(item?.acao || "").includes("salvar_validacao"))
    .filter((item) => {
      const payloadNumbers = parseProcessNumbers(item?.payload?.processNumbers || []);
      return payloadNumbers.includes(safeNumeroCnj);
    })
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      status: item?.payload?.status || "",
      note: item?.payload?.note || "",
      updatedBy: item?.payload?.updatedBy || null,
      createdAt: item?.created_at || item?.finished_at || null,
    }));
  return {
    coverage,
    linkedPartes,
    pendingPartes,
    contactDetail,
    validation: validations[safeNumeroCnj] || null,
    validationHistory,
  };
}

async function runInlinePublicacoesAction(action, body) {
  const processNumbers = parseProcessNumbers(body?.processNumbers);
  const requestedLimit = Number(body?.limit || 0);
  if (action === "backfill_partes") {
    return backfillPartesFromPublicacoes({
      processNumbers,
      limit: requestedLimit || 15,
      apply: Boolean(body?.apply),
    });
  }
  if (action === "sincronizar_partes") {
    return syncPartesFromPublicacoes(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "criar_processos_publicacoes") {
    return createProcessesFromPublicacoes(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "sincronizar_publicacoes_activity") {
    return syncPublicationActivities(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 5,
    });
  }
  if (action === "reconciliar_partes_contatos") {
    return reconcilePartesContacts(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 10,
      apply: body?.apply !== undefined ? Boolean(body.apply) : true,
    });
  }
  throw new Error(`Acao inline de publicacoes nao suportada: ${action}`);
}

async function drainPublicacoesJobs({ preferredId = null, maxChunks = 6 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 1), 1));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;

  while (chunks < safeChunks) {
    let job = null;
    if (preferredId) {
      job = await getPublicacoesAdminJob(runtimeEnv, preferredId);
      preferredId = null;
      if (job && !["pending", "running"].includes(String(job.status || ""))) {
        job = null;
      }
    }
    if (!job) {
      const listed = await listAdminJobs({
        modulo: "publicacoes",
        limit: 20,
      });
      job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    }
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processPublicacoesAdminJob(runtimeEnv, job.id);
    chunks += 1;
    if (!activeJob || !["pending", "running"].includes(String(activeJob.status || ""))) {
      continue;
    }
  }

  if (!completedAll) {
    const listed = await listAdminJobs({
      modulo: "publicacoes",
      limit: 20,
    });
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

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "overview") {
        const data = await getPublicacoesOverview();
        return res.status(200).json({ ok: true, data });
      }
      if (action === "candidatos_processos") {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 20);
        let data;
        try {
          data = await listCreateProcessCandidates({
            page,
            pageSize,
          });
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ page, pageSize, error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "candidatos_partes") {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 20);
        let data;
        try {
          data = await listPartesExtractionCandidates({
            page,
            pageSize,
          });
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ page, pageSize, error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "historico") {
        const data = await listAdminOperations({
          modulo: "publicacoes",
          limit: Number(req.query.limit || 20),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "jobs") {
        const data = await listAdminJobs({
          modulo: "publicacoes",
          limit: Number(req.query.limit || 20),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "job_status") {
        const data = await getPublicacoesAdminJob(runtimeEnv, req.query.id);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "mesa_integrada") {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 20);
        const query = String(req.query.query || "");
        const source = String(req.query.source || "todos");
        let data;
        try {
          data = await collectIntegratedQueueSlice({
            page,
            pageSize,
            query,
            source,
          });
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ page, pageSize, error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "mesa_integrada_selecao") {
        const data = await collectIntegratedSelection({
          query: String(req.query.query || ""),
          source: String(req.query.source || "todos"),
          limit: Number(req.query.limit || 500),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "detalhe_integrado") {
        const data = await loadIntegratedDetail(String(req.query.numeroCnj || ""));
        return res.status(200).json({ ok: true, data });
      }
      if (action === "publicacoes_pendentes") {
        const data = await listPublicationActivityBacklog(runtimeEnv, {
          page: Number(req.query.page || 1),
          pageSize: Number(req.query.pageSize || 20),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "activity_types") {
        let data;
        try {
          data = await getPublicationActivityTypes(runtimeEnv);
        } catch (error) {
          data = {
            items: [],
            unavailable: true,
            error: error?.message || "Falha ao consultar tipos de activity no Freshsales.",
          };
        }
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao GET invalida." });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      const adminIdentity = auth.profile?.email || auth.user?.email || auth.user?.id || "";
      if (isLegacyPartesAction(action)) {
        return res.status(409).json({ ok: false, error: buildLegacyPartesActionError() });
      }
      if (action === "create_job") {
        try {
          if (isLegacyPartesAction(String(req.body?.jobAction || ""))) {
            return res.status(409).json({ ok: false, error: buildLegacyPartesActionError() });
          }
          const data = await createPublicacoesAdminJob(runtimeEnv, {
            action: String(req.body?.jobAction || ""),
            payload: {
              processNumbers: parseProcessNumbers(req.body?.processNumbers),
              limit: Number(req.body?.limit || 0),
              jobControl: req.body?.jobControl || null,
            },
          });
          return res.status(200).json({ ok: true, data });
        } catch (error) {
          if (!isJobInfraError(error)) {
            throw error;
          }
          const result = await runInlinePublicacoesAction(String(req.body?.jobAction || ""), req.body || {});
          try {
            await logAdminOperation(runtimeEnv, {
              modulo: "publicacoes",
              acao: `${String(req.body?.jobAction || "")}_inline_fallback`,
              status: "success",
              payload: req.body || {},
              result,
            });
          } catch {}
          return res.status(200).json({
            ok: true,
            data: {
              legacy_inline: true,
              action: String(req.body?.jobAction || ""),
              reason: "operacao_jobs_unavailable",
              result,
            },
          });
        }
      }
      if (action === "run_job_chunk") {
        const data = await processPublicacoesAdminJob(runtimeEnv, req.body?.id);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_pending_jobs") {
        const data = await drainPublicacoesJobs({
          preferredId: req.body?.id || null,
          maxChunks: Number(req.body?.maxChunks || 1),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "criar_processos_publicacoes") {
        const data = await createProcessesFromPublicacoes(runtimeEnv, {
          processNumbers: parseProcessNumbers(req.body?.processNumbers),
          limit: Number(req.body?.limit || 10),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "sincronizar_publicacoes_activity") {
        const data = await syncPublicationActivities(runtimeEnv, {
          processNumbers: parseProcessNumbers(req.body?.processNumbers),
          limit: Number(req.body?.limit || 5),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "salvar_validacao") {
        const data = await savePublicacoesValidation(runtimeEnv, {
          processNumbers: parseProcessNumbers(req.body?.processNumbers),
          status: String(req.body?.status || ""),
          note: String(req.body?.note || ""),
          updatedBy: adminIdentity,
        });
        try {
          await logAdminOperation(runtimeEnv, {
            modulo: "publicacoes",
            acao: action,
            status: "success",
            payload: {
              ...req.body,
              updatedBy: adminIdentity,
            },
            result: data,
          });
        } catch {}
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_sync_worker") {
        const data = await runSyncWorker();
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_advise_sync") {
        const data = await runAdviseSync({
          maxPaginas: Number(req.body?.maxPaginas || req.body?.limit || 12),
          porPagina: Number(req.body?.porPagina || 50),
          processNumbers: parseProcessNumbers(req.body?.processNumbers),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_advise_backfill") {
        const data = await runAdviseBackfill();
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao POST invalida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha no modulo administrativo de publicacoes." });
  }
}
