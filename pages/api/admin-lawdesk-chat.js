import { requireAdminNode } from "../../lib/admin/node-auth";
import { buildFeatureFlags } from "../../lib/lawdesk/feature-flags";
import { runLawdeskChat } from "../../lib/lawdesk/chat";
import {
  cancelTaskRun,
  continueTaskRun,
  getTaskRun,
  startTaskRun,
} from "../../lib/lawdesk/task_runs";

function sendJson(res, payload, status = 200) {
  res.status(status).json(payload);
}

function sendError(res, message, status = 500, extra = {}) {
  sendJson(
    res,
    {
      ok: false,
      error: message || "Falha no endpoint administrativo do Lawdesk.",
      ...extra,
    },
    status
  );
}

function sendAdminAuthError(res, auth) {
  sendError(res, auth?.error || "Nao autorizado.", auth?.status || 401, {
    errorType: auth?.errorType || "authentication",
    details: auth?.details || null,
  });
}

async function handleTaskRunAction(action, body) {
  const features = buildFeatureFlags(process.env);

  if (action === "task_run_start") {
    return startTaskRun(process.env, body, features, {});
  }
  if (action === "task_run_get") {
    return getTaskRun(process.env, {
      runId: body.runId || body.id,
      sinceEventId: body.sinceEventId,
      sinceSequence: body.sinceSequence,
      waitForChangeMs: body.waitForChangeMs,
    });
  }
  if (action === "task_run_cancel") {
    return cancelTaskRun(process.env, {
      runId: body.runId || body.id,
    });
  }
  if (action === "task_run_continue") {
    return continueTaskRun(
      process.env,
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendError(res, "Metodo nao permitido.", 405);
    return;
  }

  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    sendAdminAuthError(res, auth);
    return;
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body && typeof req.body === "object"
          ? req.body
          : {};

    const action = String(body?.action || "").trim();

    if (action) {
      const taskRunResult = await handleTaskRunAction(action, body);
      if (!taskRunResult) {
        sendError(res, "Acao administrativa invalida.", 400);
        return;
      }

      sendJson(res, taskRunResult, taskRunResult.status || (taskRunResult.ok ? 200 : 500));
      return;
    }

    if (!String(body?.query || "").trim()) {
      sendError(res, "Campo query obrigatorio.", 400);
      return;
    }

    const chat = await runLawdeskChat(process.env, body);
    sendJson(res, {
      ok: true,
      data: {
        result: chat?.resultText || chat?.result?.message || "",
        ...chat,
      },
    });
  } catch (error) {
    sendError(res, error?.message || "Falha ao processar requisicao administrativa.", 500);
  }
}
