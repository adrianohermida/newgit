import { useRef, useState } from "react";
import { useRouter } from "next/router";
import AITaskProductShell from "./AITaskProductShell";
import ConfirmModal from "./ConfirmModal";
import { normalizeAttachmentsFromEvent, trimRecentHistory } from "./aiTaskState";
import {
  classifyTaskAgent,
  detectModules,
  extractTaskRunMemoryMatches,
  formatExecutionSourceLabel,
  inferTaskPriority,
  normalizeMission,
  normalizeTaskStepStatus,
  normalizeTaskRunPayload,
} from "./aiTaskAdapters";
import { useAiTaskRun } from "./useAiTaskRun";
import { useAiTaskWorkspace } from "./useAiTaskWorkspace";
import {
  FALLBACK_PROVIDER_OPTIONS,
  FALLBACK_SKILL_OPTIONS,
  MAX_LOGS,
  MAX_THINKING,
} from "./aiTaskModuleConfig";
import { buildBlueprint, nowIso } from "./aiTaskMissionBlueprint";
import { useAiTaskUiState } from "./useAiTaskUiState";
import { useAiTaskViewModel } from "./useAiTaskViewModel";
import { useAiTaskModuleHistorySync } from "./useAiTaskModuleHistorySync";
import useAiTaskRuntimeHealth from "./useAiTaskRuntimeHealth";
import useAiTaskModuleActions from "./useAiTaskModuleActions";
import useAiTaskPaginationState from "./useAiTaskPaginationState";
import useAiTaskShellProps from "./useAiTaskShellProps";

export default function AITaskModule({ profile, routePath }) {
  const router = useRouter();
  const missionInputRef = useRef(null);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const uiState = useAiTaskUiState(profile);
  const workspace = useAiTaskWorkspace({
    missionInputRef,
    normalizeAttachmentsFromEvent,
    trimRecentHistory,
    nowIso,
    maxThinking: MAX_THINKING,
    maxLogs: MAX_LOGS,
    profile,
  });
  const runtimeHealth = useAiTaskRuntimeHealth({
    fallbackProviderOptions: FALLBACK_PROVIDER_OPTIONS,
    fallbackSkillOptions: FALLBACK_SKILL_OPTIONS,
    provider: workspace.provider,
    pushLog: workspace.pushLog,
    setProvider: workspace.setProvider,
  });
  const runState = useAiTaskRun({
    mission: workspace.mission,
    mode: workspace.mode,
    provider: workspace.provider,
    selectedSkillId: workspace.selectedSkillId,
    approved: workspace.approved,
    attachments: workspace.attachments,
    profile,
    routePath,
    automation: workspace.automation,
    activeRun: workspace.activeRun,
    missionHistory: workspace.missionHistory,
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
    pushLog: workspace.pushLog,
    patchThinking: workspace.patchThinking,
    setMission: workspace.setMission,
    setAutomation: workspace.setAutomation,
    setError: workspace.setError,
    setEventsTotal: workspace.setEventsTotal,
    setExecutionSource: workspace.setExecutionSource,
    setExecutionModel: workspace.setExecutionModel,
    setPaused: workspace.setPaused,
    setActiveRun: workspace.setActiveRun,
    setMissionHistory: workspace.setMissionHistory,
    setThinking: workspace.setThinking,
    setTasks: workspace.setTasks,
    setSelectedTaskId: workspace.setSelectedTaskId,
    setContextSnapshot: workspace.setContextSnapshot,
    setLatestResult: workspace.setLatestResult,
  });
  const moduleActions = useAiTaskModuleActions({
    automation: workspace.automation,
    contact360Query: uiState.contact360Query,
    contextSnapshot: workspace.contextSnapshot,
    handleCopySupabaseLocalEnvBlock: runtimeHealth.handleCopySupabaseLocalEnvBlock,
    localStackReady: runtimeHealth.localStackReady,
    mission: workspace.mission,
    provider: workspace.provider,
    providerCatalog: runtimeHealth.providerCatalog,
    pushLog: workspace.pushLog,
    router,
    setApproved: workspace.setApproved,
    setContact360: uiState.setContact360,
    setContact360Loading: uiState.setContact360Loading,
    setContact360Query: uiState.setContact360Query,
    setContextSnapshot: workspace.setContextSnapshot,
    setLocalRuntimeConfigOpen: runtimeHealth.setLocalRuntimeConfigOpen,
    setMission: workspace.setMission,
    setMode: workspace.setMode,
    setProvider: workspace.setProvider,
    setShowContext: workspace.setShowContext,
  });
  const derived = useAiTaskViewModel({
    automation: workspace.automation,
    contextSnapshot: workspace.contextSnapshot,
    detectModules,
    historyPage: uiState.historyPage,
    logs: workspace.logs,
    mission: workspace.mission,
    mode: workspace.mode,
    recentHistory: workspace.recentHistory,
    search: workspace.search,
    selectedLogFilter: workspace.selectedLogFilter,
    selectedTaskId: workspace.selectedTaskId,
    taskVisibleCount: uiState.taskVisibleCount,
    tasks: workspace.tasks,
  });

  useAiTaskPaginationState({
    recentHistoryLength: workspace.recentHistory.length,
    setHistoryPage: uiState.setHistoryPage,
    setTaskVisibleCount: uiState.setTaskVisibleCount,
    taskCount: workspace.tasks.length,
    taskVisibleCount: uiState.taskVisibleCount,
  });

  useAiTaskModuleHistorySync({
    activeRun: workspace.activeRun,
    approved: workspace.approved,
    attachments: workspace.attachments,
    automation: workspace.automation,
    contact360: uiState.contact360,
    contextSnapshot: workspace.contextSnapshot,
    error: workspace.error,
    eventsTotal: workspace.eventsTotal,
    executionModel: workspace.executionModel,
    executionSource: workspace.executionSource,
    historyPage: uiState.historyPage,
    lastQuickAction: workspace.lastQuickAction,
    latestResult: workspace.latestResult,
    logs: workspace.logs,
    mission: workspace.mission,
    mode: workspace.mode,
    paused: workspace.paused,
    provider: workspace.provider,
    recentHistory: workspace.recentHistory,
    routePath,
    selectedTaskId: workspace.selectedTaskId,
    showContext: workspace.showContext,
    showTasks: workspace.showTasks,
    taskVisibleCount: uiState.taskVisibleCount,
    tasks: workspace.tasks,
    thinking: workspace.thinking,
  });

  const shellProps = useAiTaskShellProps({
    activeRun: workspace.activeRun,
    approved: workspace.approved,
    attachments: workspace.attachments,
    contact360: uiState.contact360,
    contact360Loading: uiState.contact360Loading,
    contact360Query: uiState.contact360Query,
    contextSnapshot: workspace.contextSnapshot,
    derived,
    error: workspace.error,
    eventsTotal: workspace.eventsTotal,
    executionModel: workspace.executionModel,
    executionSource: workspace.executionSource,
    handleApprove: moduleActions.handleApprove,
    handleAttachmentChange: workspace.handleAttachmentChange,
    handleAttachmentDrop: workspace.handleAttachmentDrop,
    handleContinueLastRun: runState.handleContinueLastRun,
    handleLoadContact360: moduleActions.handleLoadContact360,
    handleLocalStackAction: moduleActions.handleLocalStackAction,
    handleMissionChange: workspace.handleMissionChange,
    handleModuleAction: workspace.handleModuleAction,
    handleNextHistoryPage: () => uiState.setHistoryPage((current) => Math.min(derived.historyMeta.totalPages, current + 1)),
    handleOpenDiagnostics: moduleActions.handleOpenDiagnostics,
    handleOpenDotobot: moduleActions.handleOpenDotobot,
    handleOpenLlmTest: moduleActions.handleOpenLlmTest,
    handlePause: runState.handlePause,
    handlePrevHistoryPage: () => uiState.setHistoryPage((current) => Math.max(1, current - 1)),
    handleQuickMission: workspace.handleQuickMission,
    handleReplay: workspace.handleReplay,
    handleSelectRun: workspace.handleSelectRun,
    handleSendToDotobot: workspace.handleSendToDotobot,
    handleSaveLocalRuntimeConfig: runtimeHealth.handleSaveLocalRuntimeConfig,
    handleStart: runState.handleStart,
    historyPage: uiState.historyPage,
    localRuntimeConfigOpen: runtimeHealth.localRuntimeConfigOpen,
    localRuntimeDraft: runtimeHealth.localRuntimeDraft,
    localStackSummary: runtimeHealth.localStackSummary,
    latestResult: workspace.latestResult,
    mission: workspace.mission,
    missionInputRef,
    openStopModal: () => setStopModalOpen(true),
    paused: workspace.paused,
    provider: workspace.provider,
    providerCatalog: runtimeHealth.providerCatalog,
    ragHealth: runtimeHealth.ragHealth,
    recentHistory: workspace.recentHistory,
    refreshingLocalStack: runtimeHealth.refreshingLocalStack,
    refreshLocalStackStatus: runtimeHealth.refreshLocalStackStatus,
    routePath,
    selectedSkillId: workspace.selectedSkillId,
    setContact360Query: uiState.setContact360Query,
    setLocalRuntimeDraft: runtimeHealth.setLocalRuntimeDraft,
    setProvider: workspace.setProvider,
    setSelectedSkillId: workspace.setSelectedSkillId,
    setShowContext: workspace.setShowContext,
    skillCatalog: runtimeHealth.skillCatalog,
    thinking: workspace.thinking,
    toggleLocalRuntimeConfig: () => runtimeHealth.setLocalRuntimeConfigOpen((current) => !current),
  });

  return (
    <div>
      <AITaskProductShell
        headerProps={shellProps.headerProps}
        selectedTaskId={workspace.selectedTaskId}
        selectedTask={derived.selectedTask}
        setSelectedTaskId={workspace.setSelectedTaskId}
        hasMoreTasks={derived.hasMoreTasks}
        onLoadMoreTasks={() => uiState.setTaskVisibleCount((current) => Math.min(workspace.tasks.length, current + 8))}
        taskColumns={derived.taskColumns}
        tasks={workspace.tasks}
        visibleTasks={derived.visibleTasks}
        executionProps={shellProps.executionProps}
        runsPaneProps={shellProps.runsPaneProps}
        contextRailProps={shellProps.contextRailProps}
      />
      <ConfirmModal
        open={stopModalOpen}
        title="Parar execução atual"
        body="Esta ação interrompe a run ativa, marca as tarefas em andamento como interrompidas e encerra o acompanhamento atual."
        confirmLabel="Parar execução"
        cancelLabel="Voltar"
        onCancel={() => setStopModalOpen(false)}
        onConfirm={async () => {
          setStopModalOpen(false);
          await runState.handleStop();
        }}
      />
    </div>
  );
}
