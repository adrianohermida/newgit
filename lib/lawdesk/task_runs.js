import { runLawdeskChat } from "./chat.js";
import { buildDotobotRepositoryContext } from "./capabilities.js";
import { canExecuteSkill, detectSkillFromQuery, enrichContextWithSkill } from "./skill_registry.js";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 300;

function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSupabaseConfig(env = {}) {
  const url = cleanEnvValue(env.SUPABASE_URL) || cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) || null;
  const serviceKey = cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || null;
  return {
    enabled: Boolean(url && serviceKey),
    url,
    serviceKey,
    runsTable: cleanEnvValue(env.DOTOBOT_TASK_RUNS_TABLE) || "dotobot_task_runs",
    eventsTable: cleanEnvValue(env.DOTOBOT_TASK_RUN_EVENTS_TABLE) || "dotobot_task_run_events",
  };
}

async function supabaseRequest(env, path, init = {}) {
  const config = getSupabaseConfig(env);
  if (!config.enabled) {
    throw new Error("Supabase task run persistence not configured.");
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function toDbRunPayload(run) {
  return {
    id: run.id,
    mission: run.mission,
    mode: run.mode,
    provider: run.provider,
    status: run.status,
    route: run?.context?.route || null,
    actor_profile: run?.context?.profile || null,
    result: run.result || null,
    error: run.error || null,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };
}

async function persistRun(env, run) {
  const config = getSupabaseConfig(env);
  if (!config.enabled || !run?.id) return;
  await supabaseRequest(
    env,
    `${config.runsTable}?on_conflict=id`,
    {
      method: "POST",
      body: JSON.stringify(toDbRunPayload(run)),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    }
  );
}

async function persistEvent(env, runId, event) {
  const config = getSupabaseConfig(env);
  if (!config.enabled || !runId || !event?.id) return;
  await supabaseRequest(
    env,
    `${config.eventsTable}?on_conflict=id`,
    {
      method: "POST",
      body: JSON.stringify({
        id: event.id,
        run_id: runId,
        event_type: event.type || null,
        message: event.message || null,
        data: event.data || null,
        created_at: event.ts || nowIso(),
      }),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    }
  );
}

async function loadRunFromSupabase(env, runId) {
  const config = getSupabaseConfig(env);
  if (!config.enabled || !runId) return null;

  const runs = await supabaseRequest(
    env,
    `${config.runsTable}?select=*&id=eq.${encodeURIComponent(runId)}&limit=1`
  ).catch(() => []);

  const run = Array.isArray(runs) ? runs[0] : null;
  if (!run) return null;

  const events = await supabaseRequest(
    env,
    `${config.eventsTable}?select=*&run_id=eq.${encodeURIComponent(runId)}&order=created_at.asc&limit=${MAX_EVENTS}`
  ).catch(() => []);

  return {
    id: run.id,
    mission: run.mission,
    mode: run.mode,
    provider: run.provider,
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    context: {
      route: run.route || "/interno/ai-task",
      profile: run.actor_profile || null,
    },
    result: run.result || null,
    error: run.error || null,
    events: Array.isArray(events)
      ? events.map((item) => ({
          id: item.id,
          ts: item.created_at,
          type: item.event_type || "task_run_event",
          message: item.message || "Evento sem mensagem.",
          data: item.data || null,
        }))
      : [],
  };
}

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

async function appendRunEvent(env, store, runId, event) {
  const run = patchRun(store, runId, (current) => ({
    ...run,
    events: [...(run.events || []), event],
  }));
  if (run) {
    await Promise.allSettled([persistEvent(env, runId, event), persistRun(env, run)]);
  }
  return run;
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

export async function startTaskRun(env, payload = {}, features = {}, options = {}) {
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

  const skillPayload = detectedSkill
    ? {
        id: detectedSkill.id,
        name: detectedSkill.name,
        category: detectedSkill.category,
      }
    : null;

  const processRun = async () => {
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

      patchRun(store, baseRun.id, (run) => ({
        ...run,
        status: "completed",
        result: {
          status: data?.status || "ok",
          sessionId: data?.sessionId || null,
          stepsCount: Array.isArray(data?.steps) ? data.steps.length : 0,
          resultText: toSafeResultText(data),
          steps: Array.isArray(data?.steps) ? data.steps : [],
          logs: Array.isArray(data?.logs) ? data.logs : [],
          rag: data?.rag || null,
        },
        error: null,
      }));

      appendRunEvent(store, baseRun.id, createEvent("run.completed", "Execucao concluida com sucesso.", {
        status: data?.status || "ok",
        sessionId: data?.sessionId || null,
        stepsCount: Array.isArray(data?.steps) ? data.steps.length : 0,
      }));
    } catch (error) {
      patchRun(store, baseRun.id, (run) => ({
        ...run,
        status: "failed",
        result: null,
        error: error?.message || "Falha ao executar TaskRun.",
      }));
      appendRunEvent(store, baseRun.id, createEvent("run.failed", "Execucao falhou.", {
        error: error?.message || "Falha nao especificada.",
      }));
    }
  };

  const shouldWaitForCompletion = Boolean(payload?.waitForCompletion);
  if (shouldWaitForCompletion) {
    await processRun();
    const run = store.get(baseRun.id);
    const completedWithError = run?.status === "failed";
    return {
      ok: !completedWithError,
      status: completedWithError ? 500 : 200,
      ...(completedWithError
        ? {
            error: run?.error || "Falha ao executar TaskRun.",
            errorType: "internal",
          }
        : {}),
      data: {
        run: compactRun(run),
        events: run?.events || [],
        skill: skillPayload,
        ...(run?.result || {}),
      },
    };
  }

  // Fire-and-forget para permitir UI acompanhar progresso por polling.
  const waitUntil = typeof options?.waitUntil === "function" ? options.waitUntil : null;
  if (waitUntil) {
    waitUntil(processRun());
  } else {
    Promise.resolve(processRun()).catch(() => null);
  }

  const queuedRun = store.get(baseRun.id);
  return {
    ok: true,
    status: 202,
    data: {
      run: compactRun(queuedRun),
      events: queuedRun?.events || [],
      skill: skillPayload,
    },
  };
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
      ...(run?.result || {}),
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
