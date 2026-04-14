import { continueAiTaskRun } from "./aiTaskRunContinue";
import { stopAiTaskRun } from "./aiTaskRunStop";

export function buildAiTaskRunControls(props) {
  const { activeRun, lastEventCursorRef, lastEventSequenceRef, mission, missionHistory, mode, normalizeTaskRunPayload, nowIso, pauseRef, provider, pushLog, runEventIdsRef, setActiveRun, setAutomation, setError, setEventsTotal, setMission, setMissionHistory, setPaused, setTasks } = props;

  function handleStart(executeMission) {
    executeMission(mission);
  }

  function handlePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
    setAutomation(pauseRef.current ? "paused" : "running");
    pushLog({
      type: "control",
      action: pauseRef.current ? "Pausa acionada" : "Execucao retomada",
      result: pauseRef.current ? "A orquestracao foi pausada pelo operador." : "A orquestracao retomou o fluxo.",
    });
  }

  async function handleStop() {
    await stopAiTaskRun({
      abortRef: props.abortRef,
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

  return { handleContinueLastRun, handlePause, handleStart, handleStop };
}
