import { requireAdminAccess } from "../lib/admin-auth.js";
import { buildFeatureFlags } from "../../lib/lawdesk/feature-flags.js";
import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import {
  cancelTaskRun,
  continueTaskRun,
  getTaskRun,
  startTaskRun,
} from "../../lib/lawdesk/task_runs.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message, status = 500, extra = {}) {
  return jsonResponse(
    {
      ok: false,
      error: message || "Falha no endpoint administrativo do Lawdesk.",
      ...extra,
    },
    status
  );
}

function jsonAdminAuthError(auth) {
  return jsonError(auth?.error || "Nao autorizado.", auth?.status || 401, {
    errorType: auth?.errorType || "authentication",
    details: auth?.details || null,
  });
}

async function handleTaskRunAction(env, action, body) {
  const features = buildFeatureFlags(env);

  if (action === "task_run_start") {
    return startTaskRun(env, body, features, {});
  }
  if (action === "task_run_get") {
    return getTaskRun(env, {
      runId: body.runId || body.id,
      sinceEventId: body.sinceEventId,
      sinceSequence: body.sinceSequence,
      waitForChangeMs: body.waitForChangeMs,
    });
  }
  if (action === "task_run_cancel") {
    return cancelTaskRun(env, {
      runId: body.runId || body.id,
    });
  }
  if (action === "task_run_continue") {
    return continueTaskRun(
      env,
      {
        runId: body.runId || body.id,
        waitForCompletion: body.waitForCompletion,
      },
      features,
      {}
    );
  }

  return null;
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 204 });
  }

  if (context.request.method !== "POST") {
    return jsonError("Metodo nao permitido.", 405);
  }

  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonAdminAuthError(auth);
  }

  try {
    const body = await context.request.json();
    const action = String(body?.action || "").trim();

    if (action) {
      const taskRunResult = await handleTaskRunAction(context.env, action, body);
      if (!taskRunResult) {
        return jsonError("Acao administrativa invalida.", 400);
      }
      return jsonResponse(taskRunResult, taskRunResult.status || (taskRunResult.ok ? 200 : 500));
    }

    if (!String(body?.query || "").trim()) {
      return jsonError("Campo query obrigatorio.", 400);
    }

    const chat = await runLawdeskChat(context.env, body);
    return jsonResponse({
      ok: true,
      data: {
        result: chat?.resultText || chat?.result?.message || "",
        ...chat,
      },
    });
  } catch (error) {
    return jsonError(error?.message || "Falha ao processar requisicao administrativa.", 500);
  }
}
