import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import AITaskProductShell from "./AITaskProductShell";
import ConfirmModal from "./ConfirmModal";
import {
  normalizeAttachmentsFromEvent,
  trimRecentHistory,
} from "./aiTaskState";
import {
  classifyTaskAgent,
  detectModules,
  extractTaskRunMemoryMatches,
  formatExecutionSourceLabel,
  inferTaskPriority,
  normalizeMission,
  normalizeTaskStepStatus,
  normalizeTaskRunPayload,
  requiresApproval,
} from "./aiTaskAdapters";
import { useAiTaskRun } from "./useAiTaskRun";
import { useAiTaskWorkspace } from "./useAiTaskWorkspace";
import {
  FALLBACK_PROVIDER_OPTIONS,
  FALLBACK_SKILL_OPTIONS,
  MAX_LOGS,
  MAX_THINKING,
  MODE_OPTIONS,
  QUICK_MISSIONS,
} from "./aiTaskModuleConfig";
import {
  buildBlueprint,
  buildRagAlert,
  formatHistoryStatus,
  nowIso,
} from "./aiTaskMissionBlueprint";
import { useAiTaskUiState } from "./useAiTaskUiState";
import { useAiTaskViewModel } from "./useAiTaskViewModel";
import { useAiTaskModuleHistorySync } from "./useAiTaskModuleHistorySync";
import useAiTaskRuntimeHealth from "./useAiTaskRuntimeHealth";
import useAiTaskModuleActions from "./useAiTaskModuleActions";

export default function AITaskModule({ profile, routePath }) {
  const router = useRouter();
  const missionInputRef = useRef(null);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const { contact360, contact360Loading, contact360Query, historyPage, setContact360, setContact360Loading, setContact360Query, setHistoryPage, setTaskVisibleCount, taskVisibleCount } = useAiTaskUiState(profile);
  const {
    activeRun,
    approved,
    attachments,
    automation,
    contextSnapshot,
    error,
    eventsTotal,
    executionModel,
    executionSource,
    latestResult,
    lastQuickAction,
    logs,
    mission,
    missionHistory,
    mode,
    paused,
    provider,
    selectedSkillId,
    recentHistory,
    search,
    selectedLogFilter,
    selectedTaskId,
    showContext,
    showTasks,
    tasks,
    thinking,
    handleAttachmentChange,
    handleAttachmentDrop,
    handleModuleAction,
    handleMissionChange,
    handleQuickMission,
    handleReplay,
    handleSendToDotobot,
    handleSelectRun,
    patchThinking,
    pushLog,
    setActiveRun,
    setApproved,
    setAutomation,
    setContextSnapshot,
    setError,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setMission,
    setMissionHistory,
    setMode,
    setPaused,
    setProvider,
    setSelectedSkillId,
    setSearch,
    setSelectedLogFilter,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
  } = useAiTaskWorkspace({
    missionInputRef,
    normalizeAttachmentsFromEvent,
    trimRecentHistory,
    nowIso,
    maxThinking: MAX_THINKING,
    maxLogs: MAX_LOGS,
    profile,
  });

  const {
    handleCopySupabaseLocalEnvBlock,
    handleSaveLocalRuntimeConfig,
    localRuntimeConfigOpen,
    localRuntimeDraft,
    localStackReady,
    localStackSummary,
    providerCatalog,
    ragHealth,
    refreshingLocalStack,
    refreshLocalStackStatus,
    setLocalRuntimeConfigOpen,
    setLocalRuntimeDraft,
    skillCatalog,
  } = useAiTaskRuntimeHealth({
    fallbackProviderOptions: FALLBACK_PROVIDER_OPTIONS,
    fallbackSkillOptions: FALLBACK_SKILL_OPTIONS,
    provider,
    pushLog,
    setProvider,
  });


  const { executeMission, handleContinueLastRun, handlePause, handleStart, handleStop } = useAiTaskRun({
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
  });
  const { handleApprove, handleLoadContact360, handleLocalStackAction, handleOpenDiagnostics, handleOpenDotobot, handleOpenLlmTest } = useAiTaskModuleActions({
    automation,
    contact360Query,
    contextSnapshot,
    handleCopySupabaseLocalEnvBlock,
    localStackReady,
    mission,
    provider,
    providerCatalog,
    pushLog,
    router,
    setApproved,
    setContact360,
    setContact360Loading,
    setContact360Query,
    setContextSnapshot,
    setLocalRuntimeConfigOpen,
    setMission,
    setMode,
    setProvider,
    setShowContext,
  });

  const derived = useAiTaskViewModel({
    automation,
    contextSnapshot,
    detectModules,
    historyPage,
    logs,
    mission,
    mode,
    recentHistory,
    search,
    selectedLogFilter,
    selectedTaskId,
    taskVisibleCount,
    tasks,
  });

  useEffect(() => {
    setHistoryPage(1);
  }, [recentHistory.length, setHistoryPage]);

  useEffect(() => {
    if (taskVisibleCount > tasks.length && tasks.length > 0) {
      setTaskVisibleCount(Math.max(8, tasks.length));
    }
  }, [taskVisibleCount, tasks.length, setTaskVisibleCount]);


  useAiTaskModuleHistorySync({
    activeRun,
    approved,
    attachments,
    automation,
    contact360,
    contextSnapshot,
    error,
    eventsTotal,
    executionModel,
    executionSource,
    historyPage,
    lastQuickAction,
    latestResult,
    logs,
    mission,
    mode,
    paused,
    provider,
    recentHistory,
    routePath,
    selectedTaskId,
    showContext,
    showTasks,
    taskVisibleCount,
    tasks,
    thinking,
  });

  return (
    <div>
      <AITaskProductShell
        headerProps={{
          stateLabel: derived.stateLabel,
          provider,
          contextSnapshot,
          selectedSkillId,
          skillOptions: skillCatalog,
          providerOptions: providerCatalog,
          localStackSummary,
          ragHealth,
          ragAlert: buildRagAlert(ragHealth),
          onProviderChange: setProvider,
          onSkillChange: setSelectedSkillId,
          activeModeLabel: derived.activeModeLabel,
          executionSource,
          executionModel,
          eventsTotal,
          paused,
          handlePause,
          handleStop: () => setStopModalOpen(true),
          handleContinueLastRun,
          handleApprove,
          handleOpenLlmTest,
          handleOpenDiagnostics,
          handleOpenDotobot,
          handleRefreshLocalStack: refreshLocalStackStatus,
          handleLocalStackAction,
          localRuntimeConfigOpen,
          onToggleLocalRuntimeConfig: () => setLocalRuntimeConfigOpen((current) => !current),
          localRuntimeDraft,
          onLocalRuntimeDraftChange: setLocalRuntimeDraft,
          onSaveLocalRuntimeConfig: handleSaveLocalRuntimeConfig,
          refreshingLocalStack,
          formatExecutionSourceLabel,
        }}
        selectedTaskId={selectedTaskId}
        selectedTask={derived.selectedTask}
        setSelectedTaskId={setSelectedTaskId}
        hasMoreTasks={derived.hasMoreTasks}
        onLoadMoreTasks={() => setTaskVisibleCount((current) => Math.min(tasks.length, current + 8))}
        taskColumns={derived.taskColumns}
        tasks={tasks}
        visibleTasks={derived.visibleTasks}
        executionProps={{
          activeRun,
          attachments,
          compactLogs: derived.compactLogs,
          error,
          handleAttachmentChange,
          handleAttachmentDrop,
          handleContinueLastRun,
          handleMissionChange,
          handleQuickMission,
          handleReplay,
          handleSendToDotobot,
          handleStart,
          latestResult,
          mission,
          missionInputRef,
          moduleDrivenQuickMissions: derived.moduleDrivenQuickMissions,
          nowIso,
          paused,
          routePath,
          selectedTask: derived.selectedTask,
          thinking,
        }}
        runsPaneProps={{
          className: "",
          recentHistory,
          visibleHistory: derived.historyMeta.items,
          activeRunId: activeRun?.id || null,
          formatHistoryStatus,
          formatExecutionSourceLabel,
          nowIso,
          onSelectRun: handleSelectRun,
          historyPage,
          historyTotalPages: derived.historyMeta.totalPages,
          onPrevPage: () => setHistoryPage((current) => Math.max(1, current - 1)),
          onNextPage: () => setHistoryPage((current) => Math.min(derived.historyMeta.totalPages, current + 1)),
        }}
        contextRailProps={{
          showContext,
          setShowContext,
          contextSnapshot,
          contextModuleEntries: derived.contextModuleEntries,
          mission,
          routePath,
          approved,
          quickMissions: derived.moduleDrivenQuickMissions,
          handleModuleAction,
          handleQuickMission,
          selectedTask: derived.selectedTask,
          handleSendToDotobot,
          handleReplay,
          detectModules,
          contact360Query,
          onContact360QueryChange: setContact360Query,
          onLoadContact360: handleLoadContact360,
          contact360Loading,
          contact360,
        }}
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
          await handleStop();
        }}
      />
    </div>
  );
}
