import { runLawdeskChat } from "./chat.js";
import { buildDotobotRepositoryContext } from "./capabilities.js";
import { canExecuteSkill, detectSkillFromQuery, enrichContextWithSkill } from "./skill_registry.js";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 300;
const DEFAULT_WAIT_FOR_CHANGE_MS = 0;
const MAX_WAIT_FOR_CHANGE_MS = 12000;

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

async function loadRunFromSupabase(env, runId, options = {}) {
  const config = getSupabaseConfig(env);
  if (!config.enabled || !runId) return null;
  const sinceEventId = typeof options?.sinceEventId === "string" ? options.sinceEventId.trim() : "";

  const runs = await supabaseRequest(
    env,
    `${config.runsTable}?select=*&id=eq.${encodeURIComponent(runId)}&limit=1`
  ).catch(() => []);

  const run = Array.isArray(runs) ? runs[0] : null;
  if (!run) return null;

  const eventFilters = [`run_id=eq.${encodeURIComponent(runId)}`];
  if (sinceEventId) {
    eventFilters.push(`id=gt.${encodeURIComponent(sinceEventId)}`);
  }
  const events = await supabaseRequest(
    env,
    `${config.eventsTable}?select=*&${eventFilters.join("&")}&order=created_at.asc&limit=${MAX_EVENTS}`
  ).catch(() => []);

  const eventCountRows = await supabaseRequest(
    env,
    `${config.eventsTable}?select=id&run_id=eq.${encodeURIComponent(runId)}&order=created_at.asc&limit=${MAX_EVENTS}`
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
    events_total: Array.isArray(eventCountRows) ? eventCountRows.length : null,
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

async function resolveRun(env, runId) {
  const store = getStore();
  let run = store.get(runId) || null;
  if (!run) {
    run = await loadRunFromSupabase(env, runId).catch(() => null);
    if (run) {
      store.set(runId, run);
    }
  }
  return run;
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
    ...current,
    events: [...(current.events || []), event],
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

function getEventsSince(events = [], sinceEventId = "") {
  if (!Array.isArray(events) || !events.length) {
    return {
      events: [],
      cursor: null,
      total: 0,
    };
  }

  const normalizedSince = typeof sinceEventId === "string" ? sinceEventId.trim() : "";
  let nextEvents = events;
  if (normalizedSince) {
    const index = events.findIndex((event) => event?.id === normalizedSince);
    if (index >= 0) {
      nextEvents = events.slice(index + 1);
    }
  }

  return {
    events: nextEvents,
    cursor: events[events.length - 1]?.id || null,
    total: events.length,
  };
}

function getSuggestedPollIntervalMs(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "queued" || normalized === "executing") return 1200;
  if (normalized === "failed" || normalized === "completed" || normalized === "canceled") return 0;
  return 2500;
}

function isTerminalRunStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "completed" || normalized === "failed" || normalized === "canceled";
}

function normalizeWaitForChangeMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WAIT_FOR_CHANGE_MS;
  return Math.min(parsed, MAX_WAIT_FOR_CHANGE_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await persistRun(env, baseRun).catch(() => null);

  await appendRunEvent(env, store, baseRun.id, createEvent("run.planning", "Planejamento da tarefa iniciado."));

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
        await persistRun(env, failedRun).catch(() => null);
        await appendRunEvent(env, store, baseRun.id, createEvent("run.denied", "Execucao bloqueada por policy de permissao.", {
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
      await appendRunEvent(env, store, baseRun.id, createEvent("run.skill_detected", `Skill detectada: ${detectedSkill.name}.`, {
        skill: {
          id: detectedSkill.id,
          name: detectedSkill.name,
          category: detectedSkill.category,
        },
      }));
    }
  }

  const executingRun = patchRun(store, baseRun.id, (run) => ({ ...run, status: "executing" }));
  await persistRun(env, executingRun).catch(() => null);
  await appendRunEvent(env, store, baseRun.id, createEvent("run.executing", "Execucao no backend iniciada."));

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

      const completedRun = patchRun(store, baseRun.id, (run) => ({
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
      await persistRun(env, completedRun).catch(() => null);

      await appendRunEvent(env, store, baseRun.id, createEvent("run.completed", "Execucao concluida com sucesso.", {
        status: data?.status || "ok",
        sessionId: data?.sessionId || null,
        stepsCount: Array.isArray(data?.steps) ? data.steps.length : 0,
      }));
    } catch (error) {
      const failedRun = patchRun(store, baseRun.id, (run) => ({
        ...run,
        status: "failed",
        result: null,
        error: error?.message || "Falha ao executar TaskRun.",
      }));
      await persistRun(env, failedRun).catch(() => null);
      await appendRunEvent(env, store, baseRun.id, createEvent("run.failed", "Execucao falhou.", {
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

export async function getTaskRun(env, payload = {}) {
  const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
  const sinceEventId = typeof payload?.sinceEventId === "string" ? payload.sinceEventId.trim() : "";
  const waitForChangeMs = normalizeWaitForChangeMs(payload?.waitForChangeMs);
  if (!runId) {
    return {
      ok: false,
      status: 400,
      error: "Campo runId obrigatorio.",
      errorType: "validation",
    };
  }

  const store = getStore();
  const cachedRun = store.get(runId) || null;
  let run = cachedRun || (await loadRunFromSupabase(env, runId, { sinceEventId }).catch(() => null));
  if (!run) {
    return {
      ok: false,
      status: 404,
      error: "TaskRun nao encontrado.",
      errorType: "not_found",
    };
  }

  let eventWindow = cachedRun ? getEventsSince(run.events || [], sinceEventId) : {
    events: run.events || [],
    cursor: (Array.isArray(run.events) && run.events.length ? run.events[run.events.length - 1]?.id : sinceEventId || null),
    total: Number.isFinite(Number(run?.events_total)) ? Number(run.events_total) : null,
  };

  if (
    waitForChangeMs > 0 &&
    sinceEventId &&
    !eventWindow.events.length &&
    !isTerminalRunStatus(run?.status)
  ) {
    const deadline = Date.now() + waitForChangeMs;
    while (Date.now() < deadline) {
      await sleep(350);
      const latestFromStore = store.get(runId) || null;
      if (latestFromStore) {
        run = latestFromStore;
        eventWindow = getEventsSince(run.events || [], sinceEventId);
      } else {
        const refreshed = await loadRunFromSupabase(env, runId, { sinceEventId }).catch(() => null);
        if (refreshed) {
          run = refreshed;
          eventWindow = {
            events: run.events || [],
            cursor: (Array.isArray(run.events) && run.events.length ? run.events[run.events.length - 1]?.id : sinceEventId || null),
            total: Number.isFinite(Number(run?.events_total)) ? Number(run.events_total) : null,
          };
        }
      }

      if (eventWindow.events.length || isTerminalRunStatus(run?.status)) {
        break;
      }
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      run: compactRun(run),
      events: eventWindow.events,
      eventsCursor: eventWindow.cursor,
      eventsTotal: eventWindow.total,
      pollIntervalMs: getSuggestedPollIntervalMs(run?.status),
      ...(run?.result || {}),
    },
  };
}

export async function cancelTaskRun(env, payload = {}) {
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
  const run = await resolveRun(env, runId);
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
  await persistRun(env, canceledRun).catch(() => null);

  await appendRunEvent(env, store, runId, createEvent("run.canceled", "Execucao cancelada pelo operador."));

  return {
    ok: true,
    status: 200,
    data: {
      run: compactRun(canceledRun),
      events: canceledRun?.events || [],
    },
  };
}

export async function continueTaskRun(env, payload = {}, features = {}, options = {}) {
  const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
  if (!runId) {
    return {
      ok: false,
      status: 400,
      error: "Campo runId obrigatorio.",
      errorType: "validation",
    };
  }

  const previousRun = await resolveRun(env, runId);
  if (!previousRun) {
    return {
      ok: false,
      status: 404,
      error: "TaskRun nao encontrado para continuidade.",
      errorType: "not_found",
    };
  }

  if (previousRun.status === "executing" || previousRun.status === "queued") {
    return {
      ok: true,
      status: 200,
      data: {
        run: compactRun(previousRun),
        events: previousRun.events || [],
        continued: false,
      },
    };
  }

  const nextPayload = {
    query: previousRun.mission,
    mode: previousRun.mode,
    provider: previousRun.provider,
    context: {
      ...(previousRun.context || {}),
      continued_from_run_id: previousRun.id,
    },
    waitForCompletion: Boolean(payload?.waitForCompletion),
  };

  const started = await startTaskRun(env, nextPayload, features, options);
  if (started?.ok) {
    const newRunId = started?.data?.run?.id;
    if (newRunId) {
      await appendRunEvent(
        env,
        getStore(),
        newRunId,
        createEvent("run.continued", `Run continuado a partir de ${previousRun.id}.`, {
          previous_run_id: previousRun.id,
        })
      ).catch(() => null);
    }
  }
  return started;
}
