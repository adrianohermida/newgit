import { buildFeatureFlags } from "./feature-flags.js";
import { runLawdeskChat } from "./chat.js";
import { cancelTaskRun, continueTaskRun, getTaskRun, startTaskRun } from "./task_runs.js";

export function buildAdminChatErrorPayload(message, extra = {}) {
  return {
    ok: false,
    error: message || "Falha no endpoint administrativo do Lawdesk.",
    ...extra,
  };
}

async function handleTaskRunAction(env, action, body) {
  const features = buildFeatureFlags(env);
  if (action === "task_run_start") return startTaskRun(env, body, features, {});
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

export function normalizeAdminChatBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body || "{}");
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

export async function resolveAdminChatResponse(env, requestBody) {
  const body = normalizeAdminChatBody(requestBody);
  const action = String(body?.action || "").trim();

  if (action) {
    const taskRunResult = await handleTaskRunAction(env, action, body);
    if (!taskRunResult) {
      return {
        status: 400,
        payload: buildAdminChatErrorPayload("Acao administrativa invalida."),
      };
    }
    return {
      status: taskRunResult.status || (taskRunResult.ok ? 200 : 500),
      payload: taskRunResult,
    };
  }

  if (!String(body?.query || "").trim()) {
    return {
      status: 400,
      payload: buildAdminChatErrorPayload("Campo query obrigatorio."),
    };
  }

  const chat = await runLawdeskChat(env, body);
  return {
    status: 200,
    payload: {
      ok: true,
      data: {
        result: chat?.resultText || chat?.result?.message || "",
        ...chat,
      },
    },
  };
}
