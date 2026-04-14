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
import {
  applyBrowserLocalOfflinePolicy,
  getBrowserLocalRuntimeConfig,
  hasExplicitBrowserLocalRuntimeOptIn,
  hasPersistedBrowserLocalRuntimeConfig,
  hydrateBrowserLocalProviderOptions,
  persistBrowserLocalRuntimeConfig,
  probeBrowserLocalStackSummary,
  shouldAutoProbeBrowserLocalRuntime,
} from "../../../lib/lawdesk/browser-local-runtime";
import { buildSupabaseLocalBootstrap } from "../../../lib/lawdesk/supabase-local-bootstrap.js";
import {
  FALLBACK_PROVIDER_OPTIONS,
  FALLBACK_SKILL_OPTIONS,
  MAX_LOGS,
  MAX_THINKING,
  MODE_OPTIONS,
  QUICK_MISSIONS,
  normalizeAiTaskProviderSelection,
  resolveAiTaskProviderSelection,
  shouldHydrateLocalProviderForAiTask,
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

export default function AITaskModule({ profile, routePath }) {
  const router = useRouter();
  const missionInputRef = useRef(null);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState(FALLBACK_PROVIDER_OPTIONS);
  const [skillCatalog, setSkillCatalog] = useState(FALLBACK_SKILL_OPTIONS);
  const [localStackSummary, setLocalStackSummary] = useState(null);
  const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
  const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
  const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());
  const [ragHealth, setRagHealth] = useState(null);
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

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-lawdesk-providers?include_health=1", { method: "GET" })
      .then(async (payload) => {
        if (!active) return;
        const providers = Array.isArray(payload?.data?.providers) ? payload.data.providers : [];
        const defaultProvider = typeof payload?.data?.defaultProvider === "string" ? payload.data.defaultProvider : "gpt";
        if (!providers.length) return;
        const mappedProviders = providers.map((item) => ({
            value: item.id,
            label: `${item.label}${item.model ? ` · ${item.model}` : ""}${item.status ? ` · ${item.status}` : ""}`,
            disabled: !item.available,
            configured: Boolean(item.configured),
            displayLabel: item.label,
            model: item.model || null,
            status: item.status || null,
            transport: item.transport || null,
            runtimeMode: item.details?.probe?.mode || null,
            host: item.details?.config?.host || null,
            endpoint: item.details?.probe?.endpoint || item.details?.config?.baseUrl || null,
            reason: item.reason || null,
          }));
        setProviderCatalog(mappedProviders);
        setProvider((current) =>
          resolveAiTaskProviderSelection({
            currentProvider: current,
            defaultProvider,
            providers: mappedProviders,
          })
        );
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldHydrateLocalProviderForAiTask(provider, providerCatalog)) {
      return undefined;
    }
    let active = true;
    hydrateBrowserLocalProviderOptions(providerCatalog)
      .then((hydratedProviders) => {
        if (!active || !Array.isArray(hydratedProviders) || !hydratedProviders.length) return;
        const governedProviders = applyBrowserLocalOfflinePolicy(hydratedProviders, localStackSummary);
        const before = JSON.stringify(providerCatalog);
        const after = JSON.stringify(governedProviders);
        if (before !== after) {
          setProviderCatalog(governedProviders);
          setProvider((current) =>
            resolveAiTaskProviderSelection({
              currentProvider: current,
              defaultProvider: localStackSummary?.offlineMode ? "local" : "gpt",
              providers: governedProviders,
            })
          );
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [localStackSummary, providerCatalog, setProvider]);

  useEffect(() => {
    if (!shouldHydrateLocalProviderForAiTask(provider, providerCatalog)) return undefined;
    let active = true;
    probeBrowserLocalStackSummary()
      .then((summary) => {
        if (!active) return;
        setLocalStackSummary(summary);
        setProviderCatalog((current) => applyBrowserLocalOfflinePolicy(current, summary));
      })
      .catch(() => {
        if (!active) return;
        setLocalStackSummary(null);
      });
    return () => {
      active = false;
    };
  }, [provider, providerCatalog]);

  useEffect(() => {
    const runtimeSkills = Array.isArray(localStackSummary?.capabilities?.skillList)
      ? localStackSummary.capabilities.skillList
      : [];
    if (!runtimeSkills.length) return;
    setSkillCatalog(
      runtimeSkills.map((skill) => ({
        value: skill.id,
        label: `${skill.name} · ${skill.category}${skill.offline_ready ? " · offline" : ""}`,
        disabled: skill.available === false,
      }))
    );
  }, [localStackSummary]);

  useEffect(() => {
    setLocalRuntimeDraft(getBrowserLocalRuntimeConfig());
  }, [localStackSummary]);

  const localStackReady = Boolean(localStackSummary?.ok && localStackSummary?.localProvider?.available);

  useEffect(() => {
    if (!localStackSummary?.offlineMode) return;
    if (!hasExplicitBrowserLocalRuntimeOptIn()) return;
    setProvider((current) => (current === "local" ? current : "local"));
  }, [localStackSummary?.offlineMode, setProvider]);

  useEffect(() => {
    const currentOption = providerCatalog.find((item) => item.value === provider);
    if (!currentOption?.disabled) return;
    setProvider(providerCatalog.find((item) => !item.disabled)?.value || "gpt");
  }, [provider, providerCatalog, setProvider]);

  async function refreshLocalStackStatus() {
    setRefreshingLocalStack(true);
    try {
      const summary = await probeBrowserLocalStackSummary();
      setLocalStackSummary(summary);
      const hydratedProviders = await hydrateBrowserLocalProviderOptions(providerCatalog);
      const governedProviders = applyBrowserLocalOfflinePolicy(hydratedProviders, summary);
      setProviderCatalog(governedProviders);
      setProvider((current) =>
        resolveAiTaskProviderSelection({
          currentProvider: current,
          defaultProvider: summary?.offlineMode ? "local" : "gpt",
          providers: governedProviders,
        })
      );
    } catch {
      setLocalStackSummary(null);
    } finally {
      setRefreshingLocalStack(false);
    }
  }

  async function handleSaveLocalRuntimeConfig() {
    persistBrowserLocalRuntimeConfig(localRuntimeDraft);
    setLocalRuntimeConfigOpen(false);
    await refreshLocalStackStatus();
  }

  async function handleCopySupabaseLocalEnvBlock() {
    const envBlock = buildSupabaseLocalBootstrap({ localStackSummary, ragHealth }).envBlock;
    if (!envBlock) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(envBlock);
      }
      pushLog({
        type: "control",
        action: "Env local copiado",
        result: "Bloco de variáveis do Supabase local copiado para a área de transferência.",
      });
    } catch {}
  }

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-dotobot-rag-health?include_upsert=0", { method: "GET" })
      .then((payload) => {
        if (!active) return;
        setRagHealth(payload || null);
      })
      .catch((fetchError) => {
        if (!active) return;
        setRagHealth({
          status: "failed",
          error: fetchError?.message || "Falha no healthcheck RAG.",
          signals: {},
        });
      });
    return () => {
      active = false;
    };
  }, []);

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
      action: "Aprovação concedida",
      result: "A missão recebeu permissão para seguir.",
    });
    if (automation === "waiting_approval") {
      executeMission(mission);
    }
  }

  function handleOpenLlmTest() {
    const query = {
      provider,
    };
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
    if (actionId === "open_llm_test") {
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
    if (actionId === "testar_llm_local") {
      handleOpenLlmTest();
      return;
    }
    if (actionId === "abrir_diagnostico") {
      handleOpenDiagnostics();
      return;
    }
    if (actionId === "diagnose_supabase_local") {
      handleOpenDiagnostics();
      return;
    }
    if (actionId === "open_environment") {
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
  }, [recentHistory.length]);

  useEffect(() => {
    if (taskVisibleCount > tasks.length && tasks.length > 0) {
      setTaskVisibleCount(Math.max(8, tasks.length));
    }
  }, [taskVisibleCount, tasks.length]);

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
  }, [contact360Query, contextSnapshot?.documents, contextSnapshot?.selectedAction?.mission, mission]);

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
  }, [contextSnapshot?.selectedAction, mission, setContextSnapshot, setMission, setMode, setProvider, setShowContext]);

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
