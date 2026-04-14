import { useAiTaskModuleHistorySync } from "./useAiTaskModuleHistorySync";
import { useAiTaskViewModel } from "./useAiTaskViewModel";
import { useAiTaskRun } from "./useAiTaskRun";
import { useAiTaskUiState } from "./useAiTaskUiState";
import useAiTaskModuleActions from "./useAiTaskModuleActions";
import useAiTaskPaginationState from "./useAiTaskPaginationState";
import useAiTaskRuntimeHealth from "./useAiTaskRuntimeHealth";
import useAiTaskShellProps from "./useAiTaskShellProps";

export default function useAiTaskModuleController({
  profile,
  routePath,
  workspace,
  runtimeConfig,
  missionInputRef,
  taskLogic,
  fallbackOptions,
  router,
}) {
  const uiState = useAiTaskUiState(profile);
  const runtimeHealth = useAiTaskRuntimeHealth({
    fallbackProviderOptions: fallbackOptions.providers,
    fallbackSkillOptions: fallbackOptions.skills,
    provider: workspace.provider,
    pushLog: workspace.pushLog,
    setProvider: workspace.setProvider,
  });
  const runState = useAiTaskRun({
    ...taskLogic,
    ...runtimeConfig,
    ...workspace,
    profile,
    routePath,
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
    detectModules: taskLogic.detectModules,
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
    ...workspace,
    contact360: uiState.contact360,
    historyPage: uiState.historyPage,
    recentHistory: workspace.recentHistory,
    routePath,
    taskVisibleCount: uiState.taskVisibleCount,
  });

  const shellProps = useAiTaskShellProps({
    ...workspace,
    contact360: uiState.contact360,
    contact360Loading: uiState.contact360Loading,
    contact360Query: uiState.contact360Query,
    derived,
    handleApprove: moduleActions.handleApprove,
    handleContinueLastRun: runState.handleContinueLastRun,
    handleLoadContact360: moduleActions.handleLoadContact360,
    handleLocalStackAction: moduleActions.handleLocalStackAction,
    handleNextHistoryPage: () => uiState.setHistoryPage((current) => Math.min(derived.historyMeta.totalPages, current + 1)),
    handleOpenDiagnostics: moduleActions.handleOpenDiagnostics,
    handleOpenDotobot: moduleActions.handleOpenDotobot,
    handleOpenLlmTest: moduleActions.handleOpenLlmTest,
    handlePause: runState.handlePause,
    handlePrevHistoryPage: () => uiState.setHistoryPage((current) => Math.max(1, current - 1)),
    handleSaveLocalRuntimeConfig: runtimeHealth.handleSaveLocalRuntimeConfig,
    handleStart: runState.handleStart,
    historyPage: uiState.historyPage,
    localRuntimeConfigOpen: runtimeHealth.localRuntimeConfigOpen,
    localRuntimeDraft: runtimeHealth.localRuntimeDraft,
    localStackSummary: runtimeHealth.localStackSummary,
    missionInputRef,
    openStopModal: runtimeConfig.openStopModal,
    ragHealth: runtimeHealth.ragHealth,
    refreshingLocalStack: runtimeHealth.refreshingLocalStack,
    refreshLocalStackStatus: runtimeHealth.refreshLocalStackStatus,
    routePath,
    setContact360Query: uiState.setContact360Query,
    setLocalRuntimeDraft: runtimeHealth.setLocalRuntimeDraft,
    skillCatalog: runtimeHealth.skillCatalog,
    toggleLocalRuntimeConfig: () => runtimeHealth.setLocalRuntimeConfigOpen((current) => !current),
    providerCatalog: runtimeHealth.providerCatalog,
  });

  return { derived, runState, shellProps, uiState };
}
