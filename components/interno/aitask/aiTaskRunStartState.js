export function prepareAiTaskRunExecution(props) {
  const { approved, automation, buildBlueprint, effectiveProvider, isLocalProvider, mission, mode, normalizeMission, nowIso, overrideMission, pauseRef, profile, provider, pushLog, refs, setActiveRun, setAutomation, setError, setEventsTotal, setExecutionModel, setExecutionSource, setMissionHistory, setPaused, setSelectedTaskId, setTasks, setThinking } = props;
  const normalizedMission = normalizeMission(overrideMission);
  if (!normalizedMission || automation === "running") return null;
  const blueprint = buildBlueprint(normalizedMission, profile, mode, effectiveProvider);
  const localRunId = `${Date.now()}_run`;

  setError(null);
  props.resetRunTracking(refs);
  setAutomation("running");
  setEventsTotal(0);
  setExecutionSource(null);
  setExecutionModel(null);
  setPaused(false);
  pauseRef.current = false;
  if (!isLocalProvider) {
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

  if (mode !== "manual" && (mode !== "assisted" || !blueprint.critical || approved)) {
    return { blueprint, localRunId, normalizedMission, provider };
  }

  setAutomation("waiting_approval");
  pushLog({
    type: "control",
    action: "Aguardando aprovacao",
    result: blueprint.critical
      ? "A missao aciona criterio sensivel e requer confirmacao humana."
      : "Modo assistido aguardando liberacao para seguir com a execucao.",
  });
  return { blocked: true, blueprint, localRunId, normalizedMission, provider };
}

export function buildAiTaskExecutionProps(props) {
  const { abortRef, approved, attachments, detectModules, effectiveProvider, extractTaskRunMemoryMatches, localRunId, mode, normalizedMission, nowIso, profile, provider, pushLog, routePath, selectedSkillId, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks } = props;
  return {
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
}
