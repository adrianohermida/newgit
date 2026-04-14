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
import { executeAiTaskRunLocal } from "./aiTaskRunExecuteLocal";
import { executeAiTaskRunRemote } from "./aiTaskRunExecuteRemote";
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

    setMissionHistory((current) => [{
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
    }, ...current].slice(0, 80));
    setThinking(blueprint.thinking);
    setTasks(blueprint.tasks);
    setSelectedTaskId(blueprint.tasks[0]?.id || null);

    pushLog({
      type: "planner",
      action: "Missao recebida",
      result: `Classificada como ${blueprint.critical ? "critica" : "operacional"} no modo ${mode}.`,
    });
    pushLog({
      type: "planner",
      action: "Mapa de contexto",
      result: `Modulos prioritarios: ${blueprint.modules.join(", ")}.`,
    });

    if (mode === "manual" || (mode === "assisted" && blueprint.critical && !approved)) {
      setAutomation("waiting_approval");
      pushLog({
        type: "control",
        action: "Aguardando aprovacao",
        result: blueprint.critical
          ? "A missao aciona criterio sensivel e requer confirmacao humana."
          : "Modo assistido aguardando liberacao para seguir com a execucao.",
      });
      return;
    }

    const executeProps = {
      abortRef,
      approved,
      attachments,
      detectModules,
      effectiveProvider,
      extractTaskRunMemoryMatches,
      localRunId,
      mode,
      normalizedMission,
      nowIso,
      profile,
      provider,
      pushLog,
      routePath,
      selectedSkillId,
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
    };

    if (isBrowserLocalProvider(effectiveProvider)) {
      await executeAiTaskRunLocal({
        ...executeProps,
        classifyTaskAgent,
        inferTaskPriority,
        normalizeTaskStepStatus,
        patchThinking,
      });
      return;
    }

    await executeAiTaskRunRemote({
      ...executeProps,
      formatExecutionSourceLabel,
      lastEventCursorRef,
      lastEventSequenceRef,
      normalizeTaskRunPayload,
      patchThinking,
      runEventIdsRef,
    });
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
