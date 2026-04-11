import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  getAdminJob,
  jsonError,
  jsonOk,
  listAdminJobs,
  processProcessAdminJob,
  processPublicacoesAdminJob,
  updateAdminJob,
} from "../lib/hmadv-ops.js";
import { processContactAdminJob } from "../lib/hmadv-contacts.js";

function normalizeStatuses(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRestartPayload(job) {
  const requestedCount = Math.max(0, Number(job?.requested_count || 0));
  return {
    status: requestedCount > 0 ? "pending" : "completed",
    processed_count: 0,
    success_count: 0,
    error_count: 0,
    result_summary: requestedCount > 0 ? {} : { requested_count: 0 },
    result_sample: [],
    last_error: null,
    started_at: null,
    finished_at: requestedCount > 0 ? null : new Date().toISOString(),
  };
}

function buildPortalJobPatch(job, nextStatus) {
  const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
  const now = new Date().toISOString();
  const requested = Math.max(1, Number(job?.requested_count || 1));
  if (nextStatus === "running") {
    return {
      status: "running",
      started_at: job?.started_at || now,
      finished_at: null,
      result_summary: {
        ...(job?.result_summary || {}),
        triage_status: "em_analise",
        last_transition_at: now,
      },
    };
  }
  if (nextStatus === "completed") {
    return {
      status: "completed",
      started_at: job?.started_at || now,
      finished_at: now,
      processed_count: requested,
      success_count: Math.max(1, Number(job?.success_count || 1)),
      result_summary: {
        ...(job?.result_summary || {}),
        triage_status: "concluido",
        resolved_from: payload?.source || "portal",
        last_transition_at: now,
      },
      last_error: null,
    };
  }
  if (nextStatus === "error") {
    return {
      status: "error",
      started_at: job?.started_at || now,
      finished_at: now,
      processed_count: Math.max(0, Number(job?.processed_count || 0)),
      error_count: Math.max(1, Number(job?.error_count || 1)),
      result_summary: {
        ...(job?.result_summary || {}),
        triage_status: "falhou",
        last_transition_at: now,
      },
    };
  }
  return {};
}

async function processJobNow(env, job) {
  const modulo = String(job?.modulo || "").trim();
  if (modulo === "contacts") return processContactAdminJob(env, job.id);
  if (modulo === "processos") return processProcessAdminJob(env, job.id);
  if (modulo === "publicacoes") return processPublicacoesAdminJob(env, job.id);
  throw new Error(`Modulo de job ainda sem processador central: ${modulo || "desconhecido"}.`);
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const url = new URL(context.request.url);
    const action = String(url.searchParams.get("action") || "list");

    if (action === "detail") {
      const jobId = String(url.searchParams.get("jobId") || "");
      if (!jobId) return jsonError(new Error("jobId obrigatorio."), 400);
      const data = await getAdminJob(context.env, jobId);
      return jsonOk({ data });
    }

    if (action !== "list") {
      return jsonError(new Error("Acao GET invalida."), 400);
    }

    const data = await listAdminJobs(context.env, {
      modulo: String(url.searchParams.get("modulo") || ""),
      limit: Number(url.searchParams.get("limit") || 60),
      offset: Number(url.searchParams.get("offset") || 0),
      statuses: normalizeStatuses(url.searchParams.get("statuses") || ""),
    });
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const body = await context.request.json();
    const action = String(body.action || "").trim();
    const jobId = String(body.jobId || "").trim();
    if (!jobId) return jsonError(new Error("jobId obrigatorio."), 400);

    const job = await getAdminJob(context.env, jobId);
    if (!job) return jsonError(new Error("Job nao encontrado."), 404);

    if (action === "pause") {
      if (!["pending", "running", "retry_wait"].includes(String(job.status || ""))) {
        return jsonError(new Error("Somente jobs pendentes ou em execucao podem ser pausados."), 400);
      }
      const data = await updateAdminJob(context.env, job.id, { status: "paused" });
      return jsonOk({ data });
    }

    if (action === "resume") {
      if (String(job.status || "") !== "paused") {
        return jsonError(new Error("Somente jobs pausados podem ser retomados."), 400);
      }
      const data = await updateAdminJob(context.env, job.id, { status: "pending", finished_at: null });
      return jsonOk({ data });
    }

    if (action === "restart") {
      const data = await updateAdminJob(context.env, job.id, buildRestartPayload(job));
      return jsonOk({ data });
    }

    if (action === "cancel") {
      if (["completed", "cancelled"].includes(String(job.status || ""))) {
        return jsonOk({ data: job });
      }
      const data = await updateAdminJob(context.env, job.id, {
        status: "cancelled",
        finished_at: new Date().toISOString(),
      });
      return jsonOk({ data });
    }

    if (action === "run_now") {
      if (["paused", "completed", "cancelled"].includes(String(job.status || ""))) {
        return jsonError(new Error("Este job nao pode ser executado agora neste estado."), 400);
      }
      const data = await processJobNow(context.env, job);
      return jsonOk({ data });
    }

    if (action === "mark_running") {
      if (String(job?.modulo || "") !== "portal") {
        return jsonError(new Error("Acao disponivel apenas para jobs do portal."), 400);
      }
      const data = await updateAdminJob(context.env, job.id, buildPortalJobPatch(job, "running"));
      return jsonOk({ data });
    }

    if (action === "mark_completed") {
      if (String(job?.modulo || "") !== "portal") {
        return jsonError(new Error("Acao disponivel apenas para jobs do portal."), 400);
      }
      const data = await updateAdminJob(context.env, job.id, buildPortalJobPatch(job, "completed"));
      return jsonOk({ data });
    }

    if (action === "mark_error") {
      if (String(job?.modulo || "") !== "portal") {
        return jsonError(new Error("Acao disponivel apenas para jobs do portal."), 400);
      }
      const data = await updateAdminJob(context.env, job.id, buildPortalJobPatch(job, "error"));
      return jsonOk({ data });
    }

    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
