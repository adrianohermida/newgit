import { useRef } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import {
  isBrowserLocalProvider,
  invokeBrowserLocalExecute,
  normalizeBrowserLocalTaskRun,
} from "../../../lib/lawdesk/browser-local-runtime";
import { summarizeTaskRunOrchestration } from "./aiTaskAdapters";
import {
  buildAdminInteractionMessage,
  buildAiTaskDiagnostic,
  resolveAiTaskProvider,
  stringifyDiagnostic,
} from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { continueAiTaskRun } from "./aiTaskRunContinue";
import { stopAiTaskRun } from "./aiTaskRunStop";
import useAiTaskRunPolling from "./useAiTaskRunPolling";
import { mapTaskRunSteps } from "./aiTaskRunStepMapper";
import { markTasksAsFailed, resetRunTracking, updateHistoryItem } from "./aiTaskRunStateHelpers";

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

  useAiTaskRunPolling({
    activeRun,
    automation,
    buildAdminInteractionMessage,
    classifyTaskAgent,
    detectModules,
    extractTaskRunMemoryMatches,
    formatExecutionSourceLabel,
    inferTaskPriority,
    lastEventCursorRef,
    lastEventSequenceRef,
    mission,
    normalizeTaskRunPayload,
    normalizeTaskStepStatus,
    nowIso,
    pollingInFlightRef,
    pushLog,
    routePath,
    runEventIdsRef,
    setActiveRun,
    setAutomation,
    setContextSnapshot,
    setError,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setMissionHistory,
    setSelectedTaskId,
    setTasks,
  });

  async function executeMission(overrideMission = mission) {
    const normalizedMission = normalizeMission(overrideMission);
    if (!normalizedMission || automation === "running") return;
    const effectiveProvider = resolveAiTaskProvider(provider);

    const blueprint = buildBlueprint(normalizedMission, profile, mode, effectiveProvider);
    const localRunId = `${Date.now()}_run`;
    setError(null);
    resetRunTracking({ runEventIdsRef, lastEventCursorRef, lastEventSequenceRef });
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
          const mappedTasks = mapTaskRunSteps(backendSteps, {
            runId: normalized.run?.id || localRunId,
            nowIso,
            fallbackDescription: "Execucao local do ai-core",
            normalizeTaskStepStatus,
            inferTaskPriority,
            classifyTaskAgent,
          }).map((task) => ({ ...task, created_at: localStartedAt }));
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
          updateHistoryItem(current, (item) => item.id === localRunId, (item) => ({
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
          }))
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
          updateHistoryItem(current, (item) => item.id === localRunId, (item) => ({ ...item, status: "failed", updated_at: nowIso(), error: message }))
        );
        setTasks((current) => markTasksAsFailed(current, nowIso, message, true));
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
        const mappedTasks = mapTaskRunSteps(backendSteps, {
          runId: run?.id || localRunId,
          nowIso,
          fallbackDescription: "Execução do backend",
          normalizeTaskStepStatus: (status) => (status === "ok" ? "done" : status === "fail" ? "failed" : "running"),
          inferTaskPriority: () => "high",
          classifyTaskAgent: (step) => step?.tool || "Dotobot",
        });
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
        updateHistoryItem(current, (item) => item.id === localRunId, (item) => ({
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
        }))
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
        updateHistoryItem(current, (item) => item.id === localRunId, (item) => ({ ...item, status: "failed", updated_at: nowIso(), error: message }))
      );
      setTasks((current) => markTasksAsFailed(current, nowIso, message));
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
    await stopAiTaskRun({
      abortRef,
      activeRun,
      lastEventCursorRef,
      lastEventSequenceRef,
      nowIso,
      pauseRef,
      pushLog,
      runEventIdsRef,
      setActiveRun,
      setAutomation,
      setEventsTotal,
      setPaused,
      setTasks,
    });
  }

  async function handleContinueLastRun() {
    await continueAiTaskRun({
      lastEventCursorRef,
      lastEventSequenceRef,
      mission,
      missionHistory,
      mode,
      normalizeTaskRunPayload,
      nowIso,
      provider,
      pushLog,
      runEventIdsRef,
      setActiveRun,
      setAutomation,
      setError,
      setEventsTotal,
      setMission,
      setMissionHistory,
    });
  }

  return { handleStart, handlePause, handleStop, handleContinueLastRun, executeMission };
}
