import { appendActivityLog, appendOperationalNote, setModuleHistory } from "../../../lib/admin/activity-log";

const AI_TASK_WORKSPACE_META = {
  consolePane: "ai-task",
  domain: "workspace",
  system: "task-planning",
};

export function createAiTaskWorkspaceActions(props) {
  const { contextSnapshot, missionInputRef, normalizeAttachmentsFromEvent, nowIso, pushLog, setAttachments, setAutomation, setContextSnapshot, setError, setExecutionModel, setExecutionSource, setEventsTotal, setLastQuickAction, setMission, setMode, setProvider, setSelectedSkillId, setSelectedTaskId, setShowContext, setShowTasks } = props;

  function handleMissionChange(value) {
    setMission(value);
    setError(null);
  }

  function handleQuickMission(value) {
    setMission(value);
    setError(null);
    missionInputRef.current?.focus();
  }

  function handleModuleAction(action, moduleEntry, routePath) {
    if (!action?.mission) return;
    const createdAt = nowIso();
    const moduleLabel = moduleEntry?.label || moduleEntry?.key || "Modulo";
    const nextRoute = action.routePath || routePath || contextSnapshot?.route || "/interno/ai-task";
    const consoleTags = Array.from(new Set(["ai-task", ...(moduleEntry?.consoleTags || []), action.kind].filter(Boolean)));
    const nextQuickAction = { id: action.id || `${Date.now()}_quick_action`, label: action.label || "Playbook", mission: action.mission, moduleKey: moduleEntry?.key || null, moduleLabel, routePath: nextRoute, tags: consoleTags, kind: action.kind || "mission", createdAt };

    setMission(action.mission);
    setMode("assisted");
    setShowContext(true);
    setShowTasks(true);
    setAutomation("idle");
    setError(null);
    setLastQuickAction(nextQuickAction);
    setContextSnapshot((current) => ({ ...(current || {}), module: moduleEntry?.key || current?.module || "ai-task", moduleLabel, route: nextRoute, routePath: nextRoute, consoleTags, selectedAction: nextQuickAction, quickActions: moduleEntry?.quickActions || current?.quickActions || [], capabilities: moduleEntry?.capabilities || current?.capabilities || [], selectedSkillId: current?.selectedSkillId || "" }));

    appendActivityLog({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, module: "ai-task", component: "AITaskQuickAction", label: "AI Task: playbook acionado", action: "ai_task_quick_action", method: "UI", path: nextRoute, ...AI_TASK_WORKSPACE_META, status: "success", tags: consoleTags, response: [`Playbook: ${nextQuickAction.label}`, `Modulo: ${moduleLabel}`, `Rota: ${nextRoute}`, `Missao: ${action.mission}`].join("\n") });
    appendOperationalNote({ type: "ai-task-playbook", text: `Playbook "${nextQuickAction.label}" preparado para ${moduleLabel}.`, meta: nextQuickAction });
    setModuleHistory("dotobot", { handoffFromAiTask: nextQuickAction, consoleTags, routePath: routePath || "/interno" });
    pushLog({ type: "control", action: "Playbook preparado", result: `${nextQuickAction.label} em ${moduleLabel} deixou a missao pronta para execucao no console.` });
    missionInputRef.current?.focus();
  }

  function handleSendToDotobot(payload, routePath) {
    const missionText = typeof payload === "string" ? payload : payload?.mission;
    if (!missionText) return;
    const handoff = { id: typeof payload === "object" && payload?.id ? payload.id : `${Date.now()}_ai_task_to_dotobot`, label: typeof payload === "object" && payload?.label ? payload.label : "Missao enviada ao Dotobot", mission: missionText, moduleKey: typeof payload === "object" ? payload?.moduleKey || contextSnapshot?.module || "ai-task" : contextSnapshot?.module || "ai-task", moduleLabel: typeof payload === "object" ? payload?.moduleLabel || contextSnapshot?.moduleLabel || "AI Task" : contextSnapshot?.moduleLabel || "AI Task", routePath: routePath || contextSnapshot?.route || "/interno", tags: Array.from(new Set(["ai-task", "dotobot", ...((typeof payload === "object" && payload?.tags) || contextSnapshot?.consoleTags || [])])), createdAt: nowIso() };

    setModuleHistory("dotobot", { handoffFromAiTask: handoff, consoleTags: handoff.tags, routePath: handoff.routePath, workspaceOpen: true });
    appendActivityLog({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, module: "dotobot", component: "AITaskHandoff", label: "AI Task: handoff para Dotobot", action: "ai_task_to_dotobot_handoff", method: "UI", path: handoff.routePath, consolePane: ["dotobot", "ai-task"], domain: "handoff", system: "copilot", status: "success", tags: handoff.tags, response: [`Origem: AI Task`, `Modulo: ${handoff.moduleLabel}`, `Missao: ${handoff.mission}`].join("\n") });
    appendOperationalNote({ type: "ai-task-dotobot-handoff", text: `Missao enviada do AI Task para o Dotobot: ${handoff.label}.`, meta: handoff });
    pushLog({ type: "control", action: "Handoff para Dotobot", result: `${handoff.label} foi enviado ao copiloto com contexto compartilhado.` });
  }

  function handleAttachmentChange(event) {
    setAttachments(normalizeAttachmentsFromEvent(event));
  }

  function handleAttachmentDrop(fileList) {
    const dropped = Array.from(fileList || []).slice(0, 8).map((file) => ({ name: file.name, type: file.type || "file", size: file.size }));
    setAttachments(dropped);
  }

  function handleReplay(task) {
    if (!task?.goal) return;
    setMission(task.goal);
    setSelectedTaskId(task.id);
    setMode("assisted");
    setAutomation("idle");
    pushLog({ type: "control", action: "Replay selecionado", result: `A missao "${task.title}" foi carregada novamente para execucao.` });
    missionInputRef.current?.focus();
  }

  function handleSelectRun(item) {
    if (!item) return;
    setMission(typeof item.mission === "string" ? item.mission : "");
    setMode(["assisted", "auto", "manual"].includes(String(item.mode || "").trim()) ? String(item.mode).trim() : "assisted");
    setProvider(typeof item.provider === "string" ? item.provider : "gpt");
    setSelectedSkillId(typeof item.selectedSkillId === "string" ? item.selectedSkillId : "");
    setAutomation(typeof item.status === "string" ? item.status : "idle");
    setExecutionSource(typeof item.source === "string" ? item.source : null);
    setExecutionModel(typeof item.model === "string" ? item.model : null);
    setEventsTotal(Number.isFinite(Number(item.eventsTotal)) ? Number(item.eventsTotal) : 0);
    setContextSnapshot((current) => ({ ...(current || {}), orchestration: item.orchestration || current?.orchestration || null, module: item.module || current?.module || null, route: item.route || current?.route || "/interno/ai-task" }));
  }

  return { handleAttachmentChange, handleAttachmentDrop, handleMissionChange, handleModuleAction, handleQuickMission, handleReplay, handleSelectRun, handleSendToDotobot };
}
