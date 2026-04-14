import { useRef } from "react";
import { isBrowserLocalProvider } from "../../../lib/lawdesk/browser-local-runtime";
import { buildAdminInteractionMessage, resolveAiTaskProvider } from "./aiTaskRunDiagnostics";
import { buildAiTaskRunControls } from "./aiTaskRunControls";
import { executeAiTaskRunLocal } from "./aiTaskRunExecuteLocal";
import { executeAiTaskRunRemote } from "./aiTaskRunExecuteRemote";
import { buildAiTaskExecutionProps, prepareAiTaskRunExecution } from "./aiTaskRunStartState";
import useAiTaskRunPolling from "./useAiTaskRunPolling";
import { resetRunTracking } from "./aiTaskRunStateHelpers";

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

  useAiTaskRunPolling({ activeRun, automation, buildAdminInteractionMessage, classifyTaskAgent, detectModules, extractTaskRunMemoryMatches, formatExecutionSourceLabel, inferTaskPriority, lastEventCursorRef, lastEventSequenceRef, mission, normalizeTaskRunPayload, normalizeTaskStepStatus, nowIso, pollingInFlightRef, pushLog, routePath, runEventIdsRef, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks });

  const { handleContinueLastRun, handlePause, handleStart, handleStop } = buildAiTaskRunControls({ abortRef, activeRun, lastEventCursorRef, lastEventSequenceRef, mission, missionHistory, mode, normalizeTaskRunPayload, nowIso, pauseRef, provider, pushLog, runEventIdsRef, setActiveRun, setAutomation, setError, setEventsTotal, setMission, setMissionHistory, setPaused, setTasks });

  async function executeMission(overrideMission = mission) {
    const effectiveProvider = resolveAiTaskProvider(provider);
    const prepared = prepareAiTaskRunExecution({ approved, automation, buildBlueprint, effectiveProvider, isLocalProvider: isBrowserLocalProvider(effectiveProvider), mission, mode, normalizeMission, nowIso, overrideMission, pauseRef, profile, provider, pushLog, refs: { runEventIdsRef, lastEventCursorRef, lastEventSequenceRef }, resetRunTracking, setActiveRun, setAutomation, setError, setEventsTotal, setExecutionModel, setExecutionSource, setMissionHistory, setPaused, setSelectedTaskId, setTasks, setThinking });
    if (!prepared || prepared.blocked) return;

    const executeProps = buildAiTaskExecutionProps({ abortRef, approved, attachments, detectModules, effectiveProvider, extractTaskRunMemoryMatches, localRunId: prepared.localRunId, mode, normalizedMission: prepared.normalizedMission, nowIso, profile, provider, pushLog, routePath, selectedSkillId, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks });

    if (isBrowserLocalProvider(effectiveProvider)) {
      await executeAiTaskRunLocal({ ...executeProps, classifyTaskAgent, inferTaskPriority, normalizeTaskStepStatus, patchThinking });
      return;
    }

    await executeAiTaskRunRemote({ ...executeProps, formatExecutionSourceLabel, lastEventCursorRef, lastEventSequenceRef, normalizeTaskRunPayload, patchThinking, runEventIdsRef });
  }

  return {
    handleStart: () => handleStart(executeMission),
    handlePause,
    handleStop,
    handleContinueLastRun,
    executeMission,
  };
}
