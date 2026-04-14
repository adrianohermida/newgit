import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { useRouter } from "next/router";
import { getModuleHistory } from "../../../lib/admin/activity-log";
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
import { hasExplicitBrowserLocalRuntimeOptIn } from "../../../lib/lawdesk/browser-local-runtime";
import {
  FALLBACK_PROVIDER_OPTIONS,
  FALLBACK_SKILL_OPTIONS,
  MAX_LOGS,
  MAX_THINKING,
  MODE_OPTIONS,
  QUICK_MISSIONS,
  normalizeAiTaskProviderSelection,
} from "./aiTaskModuleConfig";
import {
  buildBlueprint,
  buildRagAlert,
  extractFirstEmail,
  formatHistoryStatus,
  nowIso,
} from "./aiTaskMissionBlueprint";
import { useAiTaskUiState } from "./useAiTaskUiState";
import { useAiTaskViewModel } from "./useAiTaskViewModel";
import { useAiTaskModuleHistorySync } from "./useAiTaskModuleHistorySync";
import useAiTaskRuntimeHealth from "./useAiTaskRuntimeHealth";

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

  function handleApprove() {
    setApproved(true);
    pushLog({
      type: "control",
      action: "Aprovacao concedida",
      result: "A missao recebeu permissao para seguir.",
    });
    if (automation === "waiting_approval") {
      executeMission(mission);
    }
  }

  function handleOpenLlmTest() {
    const query = { provider };
    if (mission) {
      query.prompt = mission.slice(0, 300);
    }
    router.push({ pathname: "/llm-test", query });
  }

  function handleOpenDiagnostics() {
    router.push("/interno/agentlab/environment");
  }

  function handleOpenDotobot() {
    router.push("/interno");
  }

  function handleLocalStackAction(actionId) {
    if (actionId === "open_llm_test" || actionId === "testar_llm_local") {
      handleOpenLlmTest();
      return;
    }
    if (actionId === "copiar_envs_supabase_local") {
      handleCopySupabaseLocalEnvBlock();
      return;
    }
    if (actionId === "open_runtime_config") {
      setLocalRuntimeConfigOpen(true);
      return;
    }
    if (actionId === "abrir_diagnostico" || actionId === "diagnose_supabase_local" || actionId === "open_environment") {
      handleOpenDiagnostics();
      return;
    }
    if (actionId === "open_ai_task") {
      router.push("/interno/ai-task");
    }
  }

  async function handleLoadContact360() {
    const email = String(contact360Query || "").trim();
    if (!email) return;
    setContact360Loading(true);
    try {
      const payload = await adminFetch("/api/freddy-get-contact-360", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setContact360(payload || null);
      pushLog({
        type: "api",
        action: "contact_360_loaded",
        result: payload?.data?.summary || `Contexto 360 carregado para ${email}.`,
      });
    } catch (loadError) {
      setContact360({
        ok: false,
        error: loadError?.message || "Falha ao consultar contexto 360.",
      });
      pushLog({
        type: "error",
        action: "contact_360_failed",
        result: loadError?.message || "Falha ao consultar contexto 360.",
      });
    } finally {
      setContact360Loading(false);
    }
  }

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

  useEffect(() => {
    if (contact360Query) return;
    const documentEmails = Array.isArray(contextSnapshot?.documents)
      ? contextSnapshot.documents.map((item) => item?.email).filter(Boolean).join(" ")
      : "";
    const seededEmail =
      extractFirstEmail(mission) ||
      extractFirstEmail(contextSnapshot?.selectedAction?.mission) ||
      extractFirstEmail(documentEmails);
    if (seededEmail) {
      setContact360Query(seededEmail);
    }
  }, [contact360Query, contextSnapshot?.documents, contextSnapshot?.selectedAction?.mission, mission, setContact360Query]);

  useEffect(() => {
    if (contextSnapshot?.selectedAction || mission) return;
    const aiTaskHistory = getModuleHistory("ai-task");
    const handoff = aiTaskHistory?.handoffFromDotobot || null;
    if (!handoff?.mission) return;
    setMission(handoff.mission);
    setMode(["assisted", "auto", "manual"].includes(handoff.mode) ? handoff.mode : "assisted");
    const nextHandoffProvider = handoff.provider || "gpt";
    setProvider(
      normalizeAiTaskProviderSelection(
        localStackReady && hasExplicitBrowserLocalRuntimeOptIn() && (nextHandoffProvider === "gpt" || nextHandoffProvider === "cloudflare")
          ? "local"
          : nextHandoffProvider,
        providerCatalog
      )
    );
    setShowContext(true);
    setContextSnapshot((current) => ({
      ...(current || {}),
      module: handoff.moduleKey || current?.module || "dotobot",
      moduleLabel: handoff.moduleLabel || "Dotobot",
      route: handoff.routePath || "/interno/ai-task",
      routePath: handoff.routePath || "/interno/ai-task",
      consoleTags: handoff.tags || ["ai-task", "dotobot"],
      selectedAction: {
        id: handoff.id || "dotobot_handoff",
        label: handoff.label || "Handoff do Dotobot",
        mission: handoff.mission,
        moduleLabel: handoff.moduleLabel || "Dotobot",
      },
    }));
  }, [contextSnapshot?.selectedAction, localStackReady, mission, providerCatalog, setContextSnapshot, setMission, setMode, setProvider, setShowContext]);

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
