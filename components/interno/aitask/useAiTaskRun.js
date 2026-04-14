import { useEffect, useRef } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import {
  invokeBrowserLocalExecute,
  isBrowserLocalProvider,
  normalizeBrowserLocalTaskRun,
  shouldAutoProbeBrowserLocalRuntime,
} from "../../../lib/lawdesk/browser-local-runtime";
import { summarizeTaskRunOrchestration } from "./aiTaskAdapters";

const AI_TASK_CONSOLE_META = {
  consolePane: ["ai-task", "functions", "jobs"],
  domain: "orchestration",
  system: "task-run",
};

function isAdminRuntimeUnavailable(error) {
  const status = Number(error?.status || 0);
  const errorType = String(error?.payload?.errorType || "");
  return status === 404 || status === 405 || errorType === "admin_runtime_unavailable";
}

function isAdminAuthenticationFailure(error) {
  const status = Number(error?.status || 0);
  const errorType = String(error?.payload?.errorType || "");
  return status === 401 || status === 403 || ["authentication", "missing_session", "invalid_session", "inactive_profile", "missing_token"].includes(errorType);
}

function buildAdminInteractionMessage(error, fallbackMessage) {
  if (isAdminAuthenticationFailure(error)) {
    return "Sua sessao administrativa expirou ou perdeu permissao. Faca login novamente no interno para reativar chat e AI Task.";
  }
  if (isAdminRuntimeUnavailable(error)) {
    return "O runtime administrativo do AI Task nao esta publicado neste deploy.";
  }
  return error?.message || fallbackMessage;
}

function stringifyDiagnostic(value, limit = 12000) {
  if (value === undefined || value === null) return "";
  let text = "";
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildAiTaskDiagnostic({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? String(summary).trim() : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function resolveAiTaskProvider(provider) {
  if (!isBrowserLocalProvider(provider)) return provider;
  return shouldAutoProbeBrowserLocalRuntime() ? provider : "gpt";
}

export function useAiTaskRun({
  mission,
  mode,
  provider,
  selectedSkillId,
  approved,
  attachments,
  profile,
  routePath,
  automation,
  activeRun,
  missionHistory,
  detectModules,
  normalizeMission,
  buildBlueprint,
  nowIso,
  normalizeTaskRunPayload,
  normalizeTaskStepStatus,
  classifyTaskAgent,
  inferTaskPriority,
  extractTaskRunMemoryMatches,
  formatExecutionSourceLabel,
  pushLog,
  patchThinking,
  setMission,
  setAutomation,
  setError,
  setEventsTotal,
  setExecutionSource,
  setExecutionModel,
  setPaused,
  setActiveRun,
  setMissionHistory,
  setThinking,
  setTasks,
  setSelectedTaskId,
  setContextSnapshot,
  setLatestResult,
}) {
  const pollingInFlightRef = useRef(false);
  const lastEventCursorRef = useRef(null);
  const lastEventSequenceRef = useRef(null);
  const runEventIdsRef = useRef(new Set());
  const abortRef = useRef(null);
  const pauseRef = useRef(false);

  useEffect(() => {
    let runId = activeRun?.id;
    if (!runId) {
      const localRunId = `${Date.now()}_run`;
      setActiveRun({ id: localRunId, startedAt: nowIso(), mission });
      runId = localRunId;
    }

    const terminalStates = new Set(["done", "failed", "stopped"]);
    if (terminalStates.has(automation)) return undefined;

    let disposed = false;
    let timerId = null;
    let nextDelayMs = 150;

    const scheduleNextPoll = (delayMs) => {
      if (disposed) return;
      timerId = setTimeout(poll, Math.max(250, Number(delayMs) || 2500));
    };

    const poll = async () => {
      if (disposed || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const startedAt = Date.now();
        const pollLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        appendActivityLog({
          id: pollLogId,
          module: "ai-task",
          component: "AITaskPolling",
          label: "AI Task: consultar run",
          action: "ai_task_run_poll",
          method: "POST",
          path: "/api/admin-lawdesk-chat",
          expectation: "Consultar novos eventos e status da execução",
          request: stringifyDiagnostic({
            action: "task_run_get",
            runId,
            sinceEventId: lastEventCursorRef.current || null,
            sinceSequence: lastEventSequenceRef.current || null,
          }),
          ...AI_TASK_CONSOLE_META,
          status: "running",
          startedAt,
        });
        const payload = await adminFetch("/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "task_run_get",
            runId,
            sinceEventId: lastEventCursorRef.current || undefined,
            sinceSequence: lastEventSequenceRef.current || undefined,
            waitForChangeMs: Math.min(Math.max(nextDelayMs * 3, 1500), 10000),
          }),
        });

        const normalized = normalizeTaskRunPayload(payload);
        updateActivityLog(pollLogId, {
          status: "success",
          durationMs: Date.now() - startedAt,
          response: buildAiTaskDiagnostic({
            title: "AI Task poll",
            summary: normalized?.status || "poll_ok",
            sections: [
              { label: "run", value: normalized?.run || null },
              { label: "events", value: (normalized?.events || []).slice(-8) },
              { label: "steps", value: (normalized?.steps || []).slice(-8) },
              { label: "rag", value: normalized?.rag || null },
            ],
          }),
        });
        const run = normalized.run;
        const events = normalized.events;
        if (normalized.eventsCursor) {
          lastEventCursorRef.current = normalized.eventsCursor;
        }
        if (normalized.eventsCursorSequence != null) {
          lastEventSequenceRef.current = normalized.eventsCursorSequence;
        }
        nextDelayMs = normalized.pollIntervalMs != null ? normalized.pollIntervalMs : 2500;
        if (normalized.eventsTotal != null) {
          setEventsTotal(normalized.eventsTotal);
        }
        for (const event of events.slice(-20)) {
          const eventId = event?.id;
          if (!eventId || runEventIdsRef.current.has(eventId)) continue;
          runEventIdsRef.current.add(eventId);
          const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
          const eventModel = event?.data?.model || null;
          pushLog({
            type: "backend",
            action: event?.type || "task_run_event",
            result: `${event?.message || "Evento sem mensagem."}${eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""}`,
          });
        }

        const runStatus = run?.status;
        if (normalized.source) setExecutionSource(normalized.source);
        if (normalized.model) setExecutionModel(normalized.model);
        if (normalized.resultText) setLatestResult(normalized.resultText);

        if (normalized.steps.length) {
          const mappedTasks = normalized.steps.map((step, index) => {
            const label = step?.action || step?.title || `Etapa ${index + 1}`;
            const dependencies = Array.isArray(step?.dependencies) ? step.dependencies : Array.isArray(step?.dependsOn) ? step.dependsOn : [];
            return {
              id: `${run?.id || runId}_step_${index + 1}`,
              title: label,
              goal: label,
              description: label || "Execucao do backend",
              step,
              steps: [label || "Execucao do backend"],
              status: normalizeTaskStepStatus(step?.status),
              priority: inferTaskPriority(step),
              assignedAgent: classifyTaskAgent(step),
              stage: step?.stage || null,
              parallelGroup: step?.parallel_group || null,
              moduleKeys: Array.isArray(step?.module_keys) ? step.module_keys : [],
              orchestrationTaskId: step?.id || step?.task_id || null,
              created_at: nowIso(),
              updated_at: nowIso(),
              logs: step?.error ? [step.error] : [],
              dependencies,
              dependencyCount: dependencies.length,
            };
          });
          setTasks(mappedTasks);
          setSelectedTaskId(mappedTasks[0]?.id || null);
        }

        if (normalized.rag) {
          setContextSnapshot((current) => ({
            ...(current || {}),
            module: detectModules(run?.mission || mission).join(", "),
            memory: extractTaskRunMemoryMatches(normalized.rag),
            documents: normalized.rag?.documents || [],
            ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
            route: routePath || "/interno/ai-task",
            orchestration: normalized.orchestration || current?.orchestration || null,
          }));
        }

        if (normalized.orchestration) {
          const orchestrationSummary = summarizeTaskRunOrchestration(normalized.orchestration);
          setMissionHistory((current) =>
            current.map((item) =>
              item.id === runId
                ? {
                    ...item,
                    orchestration: normalized.orchestration,
                    module: orchestrationSummary.moduleKeys.join(", ") || item.module || null,
                  }
                : item
            )
          );
        }

        if (runStatus === "completed" || runStatus === "failed" || runStatus === "canceled") {
          setAutomation(runStatus === "completed" ? "done" : runStatus === "canceled" ? "stopped" : "failed");
          setActiveRun(null);
          setMissionHistory((current) =>
            current.map((item) =>
              item.id === runId
                ? {
                    ...item,
                    status: runStatus === "completed" ? "done" : "failed",
                    updated_at: nowIso(),
                    result: run?.result?.status || runStatus,
                    error: run?.error || item.error,
                  }
                : item
            )
          );

          if (runStatus === "completed") {
            setTasks((current) =>
              current.map((task) =>
                task.status === "pending" || task.status === "running"
                  ? { ...task, status: "done", updated_at: nowIso() }
                  : task
              )
            );
          }

          if (runStatus === "failed" || runStatus === "canceled") {
            setTasks((current) =>
              current.map((task) =>
                task.status === "pending" || task.status === "running"
                  ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), run?.error || "Execução interrompida."] }
                  : task
              )
            );
          }
          nextDelayMs = 0;
        }
      } catch (pollError) {
        if (!disposed) {
          appendActivityLog({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            module: "ai-task",
            component: "AITaskPolling",
            label: "AI Task: falha ao consultar run",
            action: "ai_task_run_poll_error",
            method: "POST",
            path: "/api/admin-lawdesk-chat",
            ...AI_TASK_CONSOLE_META,
            status: "error",
            startedAt: Date.now(),
            error: buildAiTaskDiagnostic({
              title: "Falha no polling do AI Task",
              summary: pollError?.message || "Falha ao consultar status da execução.",
              sections: [
                { label: "error", value: pollError?.payload || pollError?.stack || pollError },
                { label: "runId", value: runId },
                { label: "cursor", value: { eventId: lastEventCursorRef.current, sequence: lastEventSequenceRef.current } },
              ],
            }),
          });
          pushLog({
            type: "warning",
            action: "Polling TaskRun",
            result: pollError?.message || "Falha ao consultar status da execução.",
          });
        }
        if (!disposed && isAdminRuntimeUnavailable(pollError)) {
          disposed = true;
          setError(pollError?.message || "Runtime administrativo indisponivel.");
          setAutomation("failed");
          setActiveRun(null);
          nextDelayMs = 0;
        } else if (!disposed && isAdminAuthenticationFailure(pollError)) {
          disposed = true;
          setError(buildAdminInteractionMessage(pollError, "Sessao administrativa indisponivel."));
          setAutomation("failed");
          setActiveRun(null);
          nextDelayMs = 0;
        } else {
          nextDelayMs = 4000;
        }
      } finally {
        pollingInFlightRef.current = false;
        if (
          !disposed &&
          activeRun?.id &&
          nextDelayMs > 0
        ) {
          scheduleNextPoll(nextDelayMs);
        }
      }
    };

    scheduleNextPoll(nextDelayMs);

    return () => {
      disposed = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    activeRun?.id,
    automation,
    detectModules,
    extractTaskRunMemoryMatches,
    formatExecutionSourceLabel,
    mission,
    normalizeTaskRunPayload,
    nowIso,
    pushLog,
    routePath,
    setActiveRun,
    setAutomation,
    setContextSnapshot,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setMissionHistory,
    setSelectedTaskId,
    setTasks,
  ]);

  async function executeMission(overrideMission = mission) {
    const normalizedMission = normalizeMission(overrideMission);
    if (!normalizedMission || automation === "running") return;
    const effectiveProvider = resolveAiTaskProvider(provider);

    const blueprint = buildBlueprint(normalizedMission, profile, mode, effectiveProvider);
    const localRunId = `${Date.now()}_run`;
    setError(null);
    runEventIdsRef.current.clear();
    lastEventCursorRef.current = null;
    lastEventSequenceRef.current = null;
    setAutomation("running");
    setEventsTotal(0);
    setExecutionSource(null);
    setExecutionModel(null);
    setPaused(false);
    pauseRef.current = false;
    if (!isBrowserLocalProvider(effectiveProvider)) {
      setActiveRun({ id: localRunId, startedAt: nowIso(), mission: normalizedMission });
    }
    setMissionHistory((current) => [
      {
        id: localRunId,
        mission: normalizedMission,
        mode,
        provider: effectiveProvider,
        status: "running",
        source: null,
        model: null,
        orchestration: null,
        module: blueprint.modules.join(", ") || null,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      ...current,
    ].slice(0, 80));
    setThinking(blueprint.thinking);
    setTasks(blueprint.tasks);
    setSelectedTaskId(blueprint.tasks[0]?.id || null);

    pushLog({
      type: "planner",
      action: "Missão recebida",
      result: `Classificada como ${blueprint.critical ? "crítica" : "operacional"} no modo ${mode}.`,
    });
    pushLog({
      type: "planner",
      action: "Mapa de contexto",
      result: `Módulos prioritários: ${blueprint.modules.join(", ")}.`,
    });

    if (mode === "manual" || (mode === "assisted" && blueprint.critical && !approved)) {
      setAutomation("waiting_approval");
      pushLog({
        type: "control",
        action: "Aguardando aprovação",
        result: blueprint.critical
          ? "A missão aciona critério sensível e requer confirmação humana."
          : "Modo assistido aguardando liberação para seguir com a execução.",
      });
      return;
    }

    if (isBrowserLocalProvider(effectiveProvider)) {
      const localStartedAt = nowIso();
      const startStartedAt = Date.now();
      const startLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const localContext = {
        route: routePath || "/interno/ai-task",
        mission: normalizedMission,
        mode,
        provider: effectiveProvider,
        forceIntent: selectedSkillId ? "skill" : undefined,
        selectedSkillId: selectedSkillId || undefined,
        selectedSkill: selectedSkillId ? { id: selectedSkillId } : undefined,
        approved,
        attachments,
        assistant: { surface: "ai-task", orchestration: "planner-executor-critic" },
        profile: {
          id: profile?.id || null,
          email: profile?.email || null,
          role: profile?.role || null,
        },
      };

      pushLog({
        type: "api",
        action: "Iniciando AI Core local",
        result: "POST browser://local-ai-core/execute",
      });

      appendActivityLog({
        id: startLogId,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: iniciar run local",
        action: "ai_task_run_start_local",
        method: "POST",
        path: "browser://local-ai-core/execute",
        expectation: "Criar uma execucao local no ai-core do navegador",
        ...AI_TASK_CONSOLE_META,
        request: buildAiTaskDiagnostic({
          title: "AI Task local start",
          summary: normalizedMission,
          sections: [
            { label: "mission", value: normalizedMission },
            { label: "mode", value: mode },
            { label: "provider", value: effectiveProvider },
            { label: "attachments", value: attachments },
            { label: "context", value: localContext },
          ],
        }),
        status: "running",
        startedAt: startStartedAt,
      });

      try {
        const rawLocalPayload = await invokeBrowserLocalExecute({
          query: normalizedMission,
          context: localContext,
        });
        const normalized = normalizeBrowserLocalTaskRun(rawLocalPayload, {
          runId: localRunId,
          mission: normalizedMission,
          mode,
          provider: effectiveProvider,
          startedAt: localStartedAt,
        });
        const backendSteps = normalized.steps || [];

        updateActivityLog(startLogId, {
          status: normalized?.status === "failed" ? "error" : "success",
          durationMs: Date.now() - startStartedAt,
          response: buildAiTaskDiagnostic({
            title: "AI Task local result",
            summary: normalized?.status || "completed",
            sections: [
              { label: "run", value: normalized?.run || null },
              { label: "events", value: normalized?.events || [] },
              { label: "steps", value: backendSteps },
              { label: "rag", value: normalized?.rag || null },
            ],
          }),
        });

        if (backendSteps.length) {
          const mappedTasks = backendSteps.map((step, index) => ({
            id: `${normalized.run?.id || localRunId}_step_${index + 1}`,
            title: step?.action || step?.title || `Etapa ${index + 1}`,
            goal: step?.action || step?.title || `Etapa ${index + 1}`,
            description: step?.action || step?.title || "Execucao local do ai-core",
            step,
            steps: [step?.action || step?.title || "Execucao local do ai-core"],
            status: normalizeTaskStepStatus(step?.status),
            priority: inferTaskPriority(step),
            assignedAgent: classifyTaskAgent(step),
            stage: step?.stage || null,
            parallelGroup: step?.parallel_group || null,
            moduleKeys: Array.isArray(step?.module_keys) ? step.module_keys : [],
            orchestrationTaskId: step?.id || step?.task_id || null,
            created_at: localStartedAt,
            updated_at: nowIso(),
            logs: step?.error ? [step.error] : [],
            dependencies: Array.isArray(step?.dependencies) ? step.dependencies : Array.isArray(step?.dependsOn) ? step.dependsOn : [],
          }));
          setTasks(mappedTasks);
          setSelectedTaskId(mappedTasks[0]?.id || null);
        }

        if (normalized.source) setExecutionSource(normalized.source);
        if (normalized.model) setExecutionModel(normalized.model);
        if (normalized.eventsTotal != null) setEventsTotal(normalized.eventsTotal);
        if (normalized.resultText) {
          setLatestResult(normalized.resultText);
          pushLog({
            type: "reporter",
            action: "Resposta local recebida",
            result: `${normalized.resultText.slice(0, 160)}${normalized.model ? ` [${normalized.model}]` : ""}`,
          });
        }

        if (normalized.rag) {
          setContextSnapshot({
            module: detectModules(normalizedMission).join(", "),
            memory: extractTaskRunMemoryMatches(normalized.rag),
            documents: normalized.rag?.documents || [],
            ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
            route: routePath || "/interno/ai-task",
            orchestration: normalized.orchestration || null,
          });
        }

        const orchestrationSummary = summarizeTaskRunOrchestration(normalized.orchestration);

        patchThinking((current) => [
          {
            id: `${Date.now()}_local_response`,
            title: "Resposta operacional local",
            timestamp: nowIso(),
            summary: normalized.orchestration?.multi_agent
              ? `O ai-core local distribuiu a missão entre ${normalized.orchestration?.subagents?.length || 0} subagentes.`
              : "O ai-core local executou a trilha diretamente no navegador.",
            details: (backendSteps.length ? backendSteps : normalized.events || [])
              .slice(0, 6)
              .map((item) =>
                item?.action ||
                item?.title ||
                item?.type ||
                `${item?.agent_role || "Executor"} · ${item?.stage || "execution"}`
              ),
            expanded: true,
          },
          ...current,
        ]);

        setMissionHistory((current) =>
          current.map((item) =>
            item.id === localRunId
              ? {
                ...item,
                id: normalized.run?.id || item.id,
                status: normalized.status === "completed" ? "done" : "failed",
                updated_at: nowIso(),
                result: normalized.run?.result?.status || normalized.status,
                source: normalized.source || null,
                model: normalized.model || null,
                orchestration: normalized.orchestration || null,
                module: orchestrationSummary.moduleKeys.join(", ") || item.module || null,
                eventsTotal: normalized.eventsTotal != null ? normalized.eventsTotal : item.eventsTotal,
              }
            : item
        )
        );

        setAutomation(normalized.status === "completed" ? "done" : "failed");
        setActiveRun(null);
        pushLog({
          type: "critic",
          action: "Validacao local",
          result:
            normalized.status === "completed"
              ? "Execucao local concluida com sucesso."
              : "Execucao local terminou com falhas rastreaveis no ai-core.",
        });
      } catch (missionError) {
        const message = missionError?.message || "Falha ao executar a missao no ai-core local.";
        appendActivityLog({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          module: "ai-task",
          component: "AITaskRun",
          label: "AI Task: falha na execucao local",
          action: "ai_task_run_local_error",
          method: "POST",
          path: "browser://local-ai-core/execute",
          ...AI_TASK_CONSOLE_META,
          status: "error",
          startedAt: Date.now(),
          error: buildAiTaskDiagnostic({
            title: "Falha na execucao local do AI Task",
            summary: message,
            sections: [
              { label: "mission", value: normalizedMission },
              { label: "mode", value: mode },
              { label: "provider", value: provider },
              { label: "error", value: missionError?.payload || missionError?.stack || missionError },
            ],
          }),
        });
        setError(message);
        setAutomation("failed");
        setMissionHistory((current) =>
          current.map((item) => (item.id === localRunId ? { ...item, status: "failed", updated_at: nowIso(), error: message } : item))
        );
        setTasks((current) =>
          current.map((task) =>
            task.status === "running" || task.status === "pending"
              ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), message] }
              : task
          )
        );
        setActiveRun(null);
        pushLog({ type: "error", action: "Execucao local interrompida", result: message });
      } finally {
        abortRef.current = null;
      }
      return;
    }

    try {
      const startStartedAt = Date.now();
      const startLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      pushLog({
        type: "api",
        action: "Iniciando TaskRun",
            result: "POST /api/admin-lawdesk-chat (action=task_run_start)",
      });
      appendActivityLog({
        id: startLogId,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: iniciar run",
        action: "ai_task_run_start",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        expectation: "Criar uma nova run da missão no backend",
        ...AI_TASK_CONSOLE_META,
        request: buildAiTaskDiagnostic({
          title: "AI Task start",
          summary: normalizedMission,
          sections: [
            { label: "mission", value: normalizedMission },
            { label: "mode", value: mode },
            { label: "provider", value: effectiveProvider },
            { label: "attachments", value: attachments },
            { label: "context", value: {
              route: routePath || "/interno/ai-task",
              approved,
              automation,
              profile: {
                id: profile?.id || null,
                email: profile?.email || null,
                role: profile?.role || null,
              },
            } },
          ],
        }),
        status: "running",
        startedAt: startStartedAt,
      });

      const payload = await adminFetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "task_run_start",
          query: normalizedMission,
          mode,
          provider: effectiveProvider,
          context: {
            route: routePath || "/interno/ai-task",
            mission: normalizedMission,
            mode,
            provider: effectiveProvider,
            forceIntent: selectedSkillId ? "skill" : undefined,
            selectedSkillId: selectedSkillId || undefined,
            selectedSkill: selectedSkillId ? { id: selectedSkillId } : undefined,
            approved,
            attachments,
            assistant: { surface: "ai-task", orchestration: "planner-executor-critic" },
            profile: {
              id: profile?.id || null,
              email: profile?.email || null,
              role: profile?.role || null,
            },
          },
        }),
      });

      const normalized = normalizeTaskRunPayload(payload);
      updateActivityLog(startLogId, {
        status: normalized?.status === "failed" ? "error" : "success",
        durationMs: Date.now() - startStartedAt,
        response: buildAiTaskDiagnostic({
          title: "AI Task start result",
          summary: normalized?.status || "run_started",
          sections: [
            { label: "run", value: normalized?.run || null },
            { label: "events", value: (normalized?.events || []).slice(-12) },
            { label: "steps", value: (normalized?.steps || []).slice(-12) },
            { label: "rag", value: normalized?.rag || null },
          ],
        }),
      });
      const run = normalized.run;
      if (run?.id) {
        setActiveRun({ id: run.id, startedAt: run.created_at || nowIso(), mission: normalizedMission });
      }

      const backendEvents = normalized.events;
      backendEvents.slice(-12).forEach((event) => {
        if (event?.id) runEventIdsRef.current.add(event.id);
        const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
        const eventModel = event?.data?.model || null;
        pushLog({
          type: "backend",
          action: event?.type || "task_run_event",
          result: `${event?.message || "Evento sem mensagem."}${eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""}`,
        });
      });
      if (normalized.eventsCursor) {
        lastEventCursorRef.current = normalized.eventsCursor;
      } else if (backendEvents.length) {
        lastEventCursorRef.current = backendEvents[backendEvents.length - 1]?.id || null;
      }
      if (normalized.eventsCursorSequence != null) {
        lastEventSequenceRef.current = normalized.eventsCursorSequence;
      } else if (backendEvents.length) {
        const seq = Number(backendEvents[backendEvents.length - 1]?.seq);
        lastEventSequenceRef.current = Number.isFinite(seq) ? seq : null;
      }
      if (normalized.eventsTotal != null) {
        setEventsTotal(normalized.eventsTotal);
      } else if (backendEvents.length) {
        setEventsTotal(backendEvents.length);
      }

      const backendSteps = normalized.steps;
      if (backendSteps.length) {
        const mappedTasks = backendSteps.map((step, index) => ({
          id: `${run?.id || localRunId}_step_${index + 1}`,
          title: step?.action || step?.title || `Etapa ${index + 1}`,
          goal: step?.action || step?.title || `Etapa ${index + 1}`,
          description: step?.action || step?.title || "Execução do backend",
          step,
          steps: [step?.action || step?.title || "Execução do backend"],
          status: step?.status === "ok" ? "done" : step?.status === "fail" ? "failed" : "running",
          priority: "high",
          assignedAgent: step?.tool || "Dotobot",
          stage: step?.stage || null,
          parallelGroup: step?.parallel_group || null,
          moduleKeys: Array.isArray(step?.module_keys) ? step.module_keys : [],
          orchestrationTaskId: step?.id || step?.task_id || null,
          created_at: nowIso(),
          updated_at: nowIso(),
          logs: step?.error ? [step.error] : [],
          dependencies: Array.isArray(step?.dependencies) ? step.dependencies : Array.isArray(step?.dependsOn) ? step.dependsOn : [],
        }));
        setTasks(mappedTasks);
        setSelectedTaskId(mappedTasks[0]?.id || null);
      } else {
        setTasks((current) =>
          current.map((task) => ({
            ...task,
            status: run?.status === "failed" ? "failed" : run?.status === "completed" ? "done" : task.status,
            updated_at: nowIso(),
          }))
        );
      }

      const resultText = normalized.resultText;
      const responseSource = normalized.source;
      const responseModel = normalized.model;
      if (responseSource) setExecutionSource(responseSource);
      if (responseModel) setExecutionModel(responseModel);
      if (resultText) {
        setLatestResult(resultText);
        pushLog({
          type: "reporter",
          action: "Resposta recebida",
          result: typeof resultText === "string"
            ? `${resultText.slice(0, 160)}${responseSource ? ` [${responseSource}${responseModel ? ` / ${responseModel}` : ""}]` : ""}`
            : "Resultado estruturado entregue.",
        });
      } else {
        pushLog({
          type: "reporter",
          action: "Resposta pendente",
          result: "TaskRun iniciado. O resultado final será carregado automaticamente.",
        });
      }

      if (backendSteps.length) {
        patchThinking((current) => [
          {
            id: `${Date.now()}_response`,
            title: "Resposta operacional",
            timestamp: nowIso(),
            summary: "Backend retornou passos reais para auditoria.",
            details: backendSteps.slice(0, 6).map((step) => step?.action || step?.title || JSON.stringify(step)),
            expanded: true,
          },
          ...current,
        ]);
      }

      if (normalized.rag) {
        setContextSnapshot({
          module: detectModules(normalizedMission).join(", "),
          memory: extractTaskRunMemoryMatches(normalized.rag),
          documents: normalized.rag?.documents || [],
          ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
          route: routePath || "/interno/ai-task",
          orchestration: normalized.orchestration || null,
        });
      }

      const runStatus = normalized.status;
      const orchestrationSummary = summarizeTaskRunOrchestration(normalized.orchestration);
      if (runStatus === "completed" || runStatus === "failed" || runStatus === "canceled") {
        setActiveRun(null);
      }
      setMissionHistory((current) =>
        current.map((item) =>
          item.id === localRunId
            ? {
                ...item,
                id: run?.id || item.id,
                status: runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "running",
                updated_at: nowIso(),
                result: run?.result?.status || runStatus,
                source: responseSource || item.source || null,
                model: responseModel || item.model || null,
                orchestration: normalized.orchestration || item.orchestration || null,
                module: orchestrationSummary.moduleKeys.join(", ") || item.module || null,
                eventsTotal: normalized.eventsTotal != null ? normalized.eventsTotal : item.eventsTotal,
              }
            : item
        )
      );

      setAutomation(runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "running");
      pushLog({
        type: "critic",
        action: "Validacao",
        result:
          runStatus === "completed"
            ? "Execucao concluida com trilha de eventos do backend."
            : runStatus === "failed"
              ? "Execucao falhou no backend com status rastreavel."
              : "Execucao iniciada no backend e aguardando conclusao.",
      });
    } catch (missionError) {
      const message = buildAdminInteractionMessage(missionError, "Falha ao executar a missao.");
      appendActivityLog({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: falha na execução",
        action: "ai_task_run_error",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        ...AI_TASK_CONSOLE_META,
        status: "error",
        startedAt: Date.now(),
        error: buildAiTaskDiagnostic({
          title: "Falha na execução do AI Task",
          summary: message,
          sections: [
            { label: "mission", value: normalizedMission },
            { label: "mode", value: mode },
            { label: "provider", value: provider },
            { label: "error", value: missionError?.payload || missionError?.stack || missionError },
          ],
        }),
      });
      setError(message);
      setAutomation("failed");
      setMissionHistory((current) =>
        current.map((item) => (item.id === localRunId ? { ...item, status: "failed", updated_at: nowIso(), error: message } : item))
      );
      setTasks((current) =>
        current.map((task) =>
          task.status === "running"
            ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), message] }
            : task
        )
      );
      pushLog({ type: "error", action: "Execução interrompida", result: message });
    } finally {
      abortRef.current = null;
    }
  }

  function handleStart() {
    executeMission(mission);
  }

  function handlePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
    setAutomation(pauseRef.current ? "paused" : "running");
    pushLog({
      type: "control",
      action: pauseRef.current ? "Pausa acionada" : "Execução retomada",
      result: pauseRef.current ? "A orquestração foi pausada pelo operador." : "A orquestração retomou o fluxo.",
    });
  }

  async function handleStop() {
    abortRef.current?.abort();
    const runId = activeRun?.id;
    if (runId) {
      try {
        const cancelStartedAt = Date.now();
        const cancelLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        appendActivityLog({
          id: cancelLogId,
          module: "ai-task",
          component: "AITaskRun",
          label: "AI Task: cancelar run",
          action: "ai_task_run_cancel",
          method: "POST",
          path: "/api/admin-lawdesk-chat",
          expectation: "Cancelar a execução ativa",
          ...AI_TASK_CONSOLE_META,
          request: stringifyDiagnostic({ action: "task_run_cancel", runId }),
          status: "running",
          startedAt: cancelStartedAt,
        });
        const payload = await adminFetch("/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "task_run_cancel", runId }),
        });
        updateActivityLog(cancelLogId, {
          status: "success",
          durationMs: Date.now() - cancelStartedAt,
          response: buildAiTaskDiagnostic({
            title: "AI Task cancel",
            summary: payload?.data?.run?.status || "cancel_requested",
            sections: [{ label: "payload", value: payload }],
          }),
        });
        const canceledStatus = payload?.data?.run?.status;
        if (canceledStatus === "canceled") {
          pushLog({ type: "backend", action: "run.canceled", result: "Cancelamento confirmado pelo backend." });
        }
      } catch (cancelError) {
        appendActivityLog({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          module: "ai-task",
          component: "AITaskRun",
          label: "AI Task: falha ao cancelar",
          action: "ai_task_run_cancel_error",
          method: "POST",
          path: "/api/admin-lawdesk-chat",
          ...AI_TASK_CONSOLE_META,
          status: "error",
          startedAt: Date.now(),
          error: buildAiTaskDiagnostic({
            title: "Falha ao cancelar AI Task",
            summary: cancelError?.message || "Falha ao confirmar cancelamento.",
            sections: [
              { label: "runId", value: runId },
              { label: "error", value: cancelError?.payload || cancelError?.stack || cancelError },
            ],
          }),
        });
        pushLog({
          type: "warning",
          action: "Cancelamento parcial",
          result: cancelError?.message || "Falha ao confirmar cancelamento no backend.",
        });
      }
    }
    pauseRef.current = false;
    setPaused(false);
    setAutomation("stopped");
    runEventIdsRef.current.clear();
    lastEventCursorRef.current = null;
    lastEventSequenceRef.current = null;
    setEventsTotal(0);
    setActiveRun(null);
    setTasks((current) =>
      current.map((task) => (task.status === "running" ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), "Interrompido pelo operador."] } : task))
    );
    pushLog({ type: "control", action: "Execução parada", result: "Operador interrompeu a orquestração." });
  }

  async function handleContinueLastRun() {
    const lastRecoverable = missionHistory.find((item) => item.status === "failed" || item.status === "stopped");
    if (!lastRecoverable?.id) {
      pushLog({ type: "warning", action: "Retomada", result: "Não há run falhada/parada para retomar." });
      return;
    }

    try {
      setError(null);
      setAutomation("running");
      runEventIdsRef.current.clear();
      lastEventCursorRef.current = null;
      lastEventSequenceRef.current = null;
      setEventsTotal(0);
      const continueStartedAt = Date.now();
      const continueLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      appendActivityLog({
        id: continueLogId,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: retomar run",
        action: "ai_task_run_continue",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        expectation: "Retomar uma run falhada ou parada",
        ...AI_TASK_CONSOLE_META,
        request: stringifyDiagnostic({
          action: "task_run_continue",
          runId: lastRecoverable.id,
          mission: lastRecoverable.mission,
          mode: lastRecoverable.mode,
          provider: lastRecoverable.provider,
        }),
        status: "running",
        startedAt: continueStartedAt,
      });
      const payload = await adminFetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "task_run_continue",
          runId: lastRecoverable.id,
          waitForCompletion: false,
        }),
      });

      const normalized = normalizeTaskRunPayload(payload);
      updateActivityLog(continueLogId, {
        status: "success",
        durationMs: Date.now() - continueStartedAt,
        response: buildAiTaskDiagnostic({
          title: "AI Task continue",
          summary: normalized?.status || "continue_requested",
          sections: [
            { label: "run", value: normalized?.run || null },
            { label: "events", value: (normalized?.events || []).slice(-8) },
          ],
        }),
      });
      const continuedRun = normalized.run;
      if (continuedRun?.id) {
        setActiveRun({
          id: continuedRun.id,
          startedAt: continuedRun.created_at || nowIso(),
          mission: continuedRun.mission || lastRecoverable.mission || mission,
        });
        setMission(continuedRun.mission || lastRecoverable.mission || mission);
        setMissionHistory((current) => [
          {
            id: continuedRun.id,
            mission: continuedRun.mission || lastRecoverable.mission || mission,
            mode: continuedRun.mode || mode,
            provider: continuedRun.provider || provider,
            status: "running",
            source: null,
            model: null,
            created_at: continuedRun.created_at || nowIso(),
            updated_at: continuedRun.updated_at || nowIso(),
          },
          ...current,
        ].slice(0, 80));
      }
      if (normalized.eventsTotal != null) {
        setEventsTotal(normalized.eventsTotal);
      }

      pushLog({
        type: "control",
        action: "Retomada iniciada",
        result: continuedRun?.id
          ? `Run retomado com novo id ${continuedRun.id}.`
          : "Run anterior ainda estava em execucao; acompanhamento mantido.",
      });
    } catch (continueError) {
      const message = buildAdminInteractionMessage(continueError, "Falha ao retomar run.");
      appendActivityLog({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: falha ao retomar",
        action: "ai_task_run_continue_error",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        ...AI_TASK_CONSOLE_META,
        status: "error",
        startedAt: Date.now(),
        error: buildAiTaskDiagnostic({
          title: "Falha ao retomar AI Task",
          summary: message,
          sections: [
            { label: "run", value: lastRecoverable },
            { label: "error", value: continueError?.payload || continueError?.stack || continueError },
          ],
        }),
      });
      setError(message);
      setAutomation("failed");
      pushLog({ type: "error", action: "Retomada falhou", result: message });
    }
  }

  return { handleStart, handlePause, handleStop, handleContinueLastRun, executeMission };
}
