import { runLawdeskChat } from "./chat.js";
import { buildDotobotRepositoryContext } from "./capabilities.js";
import { canExecuteSkill, detectSkillFromQuery, enrichContextWithSkill } from "./skill_registry.js";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 300;

function nowIso() {
  return new Date().toISOString();
}

function createEvent(type, message, data = null) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: nowIso(),
    type,
    message,
    data,
  };
}

function getStore() {
  if (!globalThis.__HMDAV_TASK_RUNS__) {
    globalThis.__HMDAV_TASK_RUNS__ = new Map();
  }
  const store = globalThis.__HMDAV_TASK_RUNS__;
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [key, value] of store.entries()) {
    const updated = Date.parse(value?.updated_at || value?.created_at || 0);
    if (!Number.isFinite(updated) || updated < cutoff) {
      store.delete(key);
    }
  }
  return store;
}

function toSafeResultText(data) {
  if (!data) return "";
  if (typeof data.resultText === "string") return data.resultText;
  if (typeof data.result === "string") return data.result;
  if (data.result != null) return JSON.stringify(data.result);
  return "";
}

function createTaskRunRecord({ mission, mode, provider, context }) {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: runId,
    mission,
    mode: mode || "assisted",
    provider: provider || "gpt",
    status: "queued",
    created_at: nowIso(),
    updated_at: nowIso(),
    context: {
      route: context?.route || "/interno/ai-task",
      profile: context?.profile || null,
    },
    events: [createEvent("run.created", "Run criado e enfileirado.")],
    result: null,
    error: null,
  };
}

function patchRun(store, runId, updater) {
  const current = store.get(runId);
  if (!current) return null;
  const next = updater(current);
  next.updated_at = nowIso();
  next.events = (next.events || []).slice(-MAX_EVENTS);
  store.set(runId, next);
  return next;
}

function appendRunEvent(store, runId, event) {
  return patchRun(store, runId, (run) => ({
    ...run,
    events: [...(run.events || []), event],
  }));
}

function compactRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    mission: run.mission,
    mode: run.mode,
    provider: run.provider,
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    context: run.context,
    error: run.error || null,
    result: run.result || null,
  };
}

export async function startTaskRun(env, payload = {}, features = {}) {
  const mission = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!mission) {
    return {
      ok: false,
      status: 400,
      error: "Campo query obrigatorio para iniciar TaskRun.",
      errorType: "validation",
    };
  }

  const mode = typeof payload?.mode === "string" ? payload.mode : "assisted";
  const provider = typeof payload?.provider === "string" ? payload.provider : "gpt";
  const context = payload?.context || {};
  const store = getStore();
  const baseRun = createTaskRunRecord({ mission, mode, provider, context });
  store.set(baseRun.id, baseRun);

  appendRunEvent(store, baseRun.id, createEvent("run.planning", "Planejamento da tarefa iniciado."));

  const repositoryContext = buildDotobotRepositoryContext(context);
  let enhancedContext = repositoryContext;
  let detectedSkill = null;

  if (features?.chat?.skillsDetection) {
    detectedSkill = detectSkillFromQuery(mission);
    if (detectedSkill) {
      const userContext = {
        role: repositoryContext?.actor?.role || context?.profile?.role || null,
        authorizedToolGroups: repositoryContext?.authorizedToolGroups || [],
      };
      const allowed = canExecuteSkill(userContext, detectedSkill);
      if (!allowed) {
        const failedRun = patchRun(store, baseRun.id, (run) => ({
          ...run,
          status: "failed",
          error: "Skill detectada sem permissao para o perfil atual.",
          result: null,
        }));
        appendRunEvent(store, baseRun.id, createEvent("run.denied", "Execucao bloqueada por policy de permissao.", {
          skill: detectedSkill.id,
        }));
        return {
          ok: false,
          status: 403,
          error: "Perfil sem permissao para executar a skill detectada.",
          errorType: "forbidden",
          data: {
            run: compactRun(failedRun),
            events: failedRun?.events || [],
          },
        };
      }

      enhancedContext = enrichContextWithSkill(repositoryContext, detectedSkill);
      appendRunEvent(store, baseRun.id, createEvent("run.skill_detected", `Skill detectada: ${detectedSkill.name}.`, {
        skill: {
          id: detectedSkill.id,
          name: detectedSkill.name,
          category: detectedSkill.category,
        },
      }));
    }
  }

  appendRunEvent(store, baseRun.id, createEvent("run.executing", "Execucao no backend iniciada."));
  patchRun(store, baseRun.id, (run) => ({ ...run, status: "executing" }));

  try {
    const data = await runLawdeskChat(env, {
      query: mission,
      context: {
        ...context,
        repositoryContext: enhancedContext,
        features,
        task_run: {
          id: baseRun.id,
          mode,
          provider,
        },
      },
    });

    const completedRun = patchRun(store, baseRun.id, (run) => ({
      ...run,
      status: "completed",
      result: {
        status: data?.status || "ok",
        sessionId: data?.sessionId || null,
        stepsCount: Array.isArray(data?.steps) ? data.steps.length : 0,
        resultText: toSafeResultText(data),
      },
      error: null,
    }));

    appendRunEvent(store, baseRun.id, createEvent("run.completed", "Execucao concluida com sucesso.", {
      status: data?.status || "ok",
      sessionId: data?.sessionId || null,
      stepsCount: Array.isArray(data?.steps) ? data.steps.length : 0,
    }));

    return {
      ok: true,
      status: 200,
      data: {
        run: compactRun(completedRun),
        events: completedRun?.events || [],
        skill: detectedSkill
          ? {
              id: detectedSkill.id,
              name: detectedSkill.name,
              category: detectedSkill.category,
            }
          : null,
        ...data,
      },
    };
  } catch (error) {
    const failedRun = patchRun(store, baseRun.id, (run) => ({
      ...run,
      status: "failed",
      result: null,
      error: error?.message || "Falha ao executar TaskRun.",
    }));
    appendRunEvent(store, baseRun.id, createEvent("run.failed", "Execucao falhou.", {
      error: error?.message || "Falha nao especificada.",
    }));

    return {
      ok: false,
      status: 500,
      error: error?.message || "Falha ao executar TaskRun.",
      errorType: "internal",
      data: {
        run: compactRun(failedRun),
        events: failedRun?.events || [],
      },
    };
  }
}

export function getTaskRun(payload = {}) {
  const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
  if (!runId) {
    return {
      ok: false,
      status: 400,
      error: "Campo runId obrigatorio.",
      errorType: "validation",
    };
  }

  const store = getStore();
  const run = store.get(runId);
  if (!run) {
    return {
      ok: false,
      status: 404,
      error: "TaskRun nao encontrado.",
      errorType: "not_found",
    };
  }

  return {
    ok: true,
    status: 200,
    data: {
      run: compactRun(run),
      events: run.events || [],
    },
  };
}

export function cancelTaskRun(payload = {}) {
  const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
  if (!runId) {
    return {
      ok: false,
      status: 400,
      error: "Campo runId obrigatorio.",
      errorType: "validation",
    };
  }

  const store = getStore();
  const run = store.get(runId);
  if (!run) {
    return {
      ok: false,
      status: 404,
      error: "TaskRun nao encontrado.",
      errorType: "not_found",
    };
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "canceled") {
    return {
      ok: true,
      status: 200,
      data: {
        run: compactRun(run),
        events: run.events || [],
      },
    };
  }

  const canceledRun = patchRun(store, runId, (current) => ({
    ...current,
    status: "canceled",
    error: "Execucao cancelada pelo operador.",
    result: null,
  }));

  appendRunEvent(store, runId, createEvent("run.canceled", "Execucao cancelada pelo operador."));

  return {
    ok: true,
    status: 200,
    data: {
      run: compactRun(canceledRun),
      events: canceledRun?.events || [],
    },
  };
}
