import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { useDeferredValue, useEffect, useMemo } from "react";
import { useMediaQuery } from "react-responsive";

import { useRouter } from "next/router";
import { adminFetch } from "../../lib/admin/api";
import {
  applyBrowserLocalOfflinePolicy,
  clearBrowserLocalInferenceFailure,
  getBrowserLocalRuntimeConfig,
  hasExplicitBrowserLocalRuntimeOptIn,
  hasPersistedBrowserLocalRuntimeConfig,
  hydrateBrowserLocalProviderOptions,
  invokeBrowserLocalExecute,
  invokeBrowserLocalMessages,
  isBrowserLocalProvider,
  persistBrowserLocalRuntimeConfig,
  probeBrowserLocalStackSummary,
  shouldAutoProbeBrowserLocalRuntime,
} from "../../lib/lawdesk/browser-local-runtime";
import { buildOfflineHealthSnapshot } from "../../lib/lawdesk/offline-health.js";
import { buildLocalBootstrapPlan } from "../../lib/lawdesk/local-bootstrap.js";
import { buildSupabaseLocalBootstrap } from "../../lib/lawdesk/supabase-local-bootstrap.js";
import { useSupabaseBrowser } from "../../lib/supabase";
import DotobotMessageBubble from "./DotobotMessageBubble";
import DotobotCollapsedTrigger from "./DotobotCollapsedTrigger";
import DotobotCompactConversationCard from "./DotobotCompactConversationCard";
import DotobotCompactComposer from "./DotobotCompactComposer";
import DotobotCompactRuntimeDiagnostics from "./DotobotCompactRuntimeDiagnostics";
import DotobotAccessGate from "./DotobotAccessGate";
import DotobotConversationMenu from "./DotobotConversationMenu";
import DotobotEmbeddedCompactRail from "./DotobotEmbeddedCompactRail";
import DotobotEmbeddedStandardRail from "./DotobotEmbeddedStandardRail";
import DotobotStandardHistoryRail from "./DotobotStandardHistoryRail";
import DotobotStandardConversationCenter from "./DotobotStandardConversationCenter";
import DotobotWorkspaceHeader from "./DotobotWorkspaceHeader";
import { useInternalTheme } from "./InternalThemeProvider";
import {
  FocusedCopilotAside,
  FocusedConversationCenter,
  FocusedHistoryRail,
  FocusedWorkspaceTopbar,
  GenericCopilotRightRail,
} from "./copilot";
import DotobotWorkspaceShell from "./copilot/DotobotWorkspaceShell";
import { cancelTaskRun, createPendingTaskRun, pollTaskRun, startTaskRun } from "./dotobotTaskRun";
import {
  buildCopilotContextPayload,
  buildConversationRuntimeMetadata,
  normalizeRightPanelTabs,
  RIGHT_PANEL_META,
} from "./dotobotPanelContext";
import { buildLocalInferenceAlert, buildRagAlert } from "./dotobotPanelAlerts";
import {
  buildLocalFallbackActions,
  buildLocalFallbackResponse,
  buildModuleFallbackPlaybook,
  buildRagSummary,
} from "./dotobotPanelFallback";
import {
  COPILOT_QUICK_SHORTCUTS,
  DotobotModal,
  getVoiceRecognition,
  SLASH_COMMANDS,
  TaskStatusChip,
} from "./dotobotPanelUi";
import {
  buildAgentLabIncidentPreview,
  buildAgentLabQueuePreview,
  buildAgentLabSyncPreview,
  buildAgentLabTrainingPreview,
  buildLinkedDotobotTaskRuns,
  extractAgentLabSubagents,
  formatBytes,
  formatInlinePanelValue,
  formatRuntimeTimeLabel,
  parseProviderPresentation,
} from "./dotobotPanelInsights";
import {
  buildDiagnosticReport,
  DOTOBOT_CONSOLE_META,
  DOTOBOT_TASK_CONSOLE_META,
  getLastTask,
  normalizeAttachment,
  safeLocalGet,
  safeLocalSet,
  stringifyDiagnostic,
} from "./dotobotPanelUtils";
import { appendActivityLog, getModuleHistory, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";
import {
  handleCopilotDebug as emitCopilotDebug,
  logDotobotUi as emitDotobotUiLog,
} from "./dotobotPanelLogging";
import { useDotobotAdminSession } from "./dotobotPanelRuntime";
import useDotobotPersistedBootstrap from "./useDotobotPersistedBootstrap";
import useDotobotAgentLabActions from "./useDotobotAgentLabActions";
import useDotobotConversationActions from "./useDotobotConversationActions";
import useDotobotConversationViewModel from "./useDotobotConversationViewModel";
import useDotobotComposerActions from "./useDotobotComposerActions";
import useDotobotRightRailViewModel from "./useDotobotRightRailViewModel";
import useDotobotShellState from "./useDotobotShellState";
import useDotobotShellUiEffects from "./useDotobotShellUiEffects";
import {
  CHAT_STORAGE_PREFIX,
  CONVERSATIONS_STORAGE_PREFIX,
  MAX_ATTACHMENTS,
  MAX_CONVERSATIONS,
  MAX_HISTORY,
  MAX_TASKS,
  PREF_STORAGE_PREFIX,
  TASK_STORAGE_PREFIX,
  buildConversationStorageKey,
  buildDotobotGlobalContext,
  buildStorageKey,
  extractAssistantResponseText,
  isTaskCommand,
  mergeConversationAttachments,
  nowIso,
  safeText,
  summarizeConversation,
  syncConversationSnapshots,
} from "./dotobotPanelState";
import {
  DOTOBOT_LAYOUT_STORAGE_PREFIX,
  LEGAL_ACTIONS,
  MODE_OPTIONS,
  PROVIDER_OPTIONS,
  QUICK_PROMPTS,
  SKILL_OPTIONS,
  buildLocalStackUnavailableSummary,
  inferCopilotModuleFromRoute,
  normalizeWorkspaceProvider,
  resolveWorkspaceProviderSelection,
  shouldHydrateBrowserLocalProvider,
} from "./dotobotPanelConfig";

export default function DotobotCopilot({
  profile,
  routePath,
  initialWorkspaceOpen = true,
  defaultCollapsed = false,
  compactRail = false,
  showCollapsedTrigger = true,
  embeddedInInternoShell = false,
  focusedWorkspaceMode = false,
  allowedRightPanelTabs = null,
  defaultRightPanelTab = null,
}) {
  const internalTheme = useInternalTheme();
  const isLightTheme = internalTheme?.isLightTheme === true;
  const isFullscreenCopilot = routePath === "/interno/copilot";
  const isFocusedCopilotShell = focusedWorkspaceMode || (embeddedInInternoShell && isFullscreenCopilot);
  const isRailConversationShell = embeddedInInternoShell && !isFullscreenCopilot;
  const isConversationCentricShell = isFocusedCopilotShell || isRailConversationShell;
  const suppressInnerChrome = false;
  const isCompactViewport = useMediaQuery({ maxWidth: 640 });
  const availableRightPanelTabs = useMemo(
    () => normalizeRightPanelTabs(
      allowedRightPanelTabs || (isFocusedCopilotShell ? ["modules", "ai-task"] : ["modules", "ai-task", "agentlabs", "context"]),
      "modules"
    ),
    [allowedRightPanelTabs, isFocusedCopilotShell]
  );
  const initialRightPanelTab = useMemo(() => {
    if (defaultRightPanelTab && availableRightPanelTabs.includes(defaultRightPanelTab)) return defaultRightPanelTab;
    if (isFullscreenCopilot && availableRightPanelTabs.includes("modules")) return "modules";
    return availableRightPanelTabs[0];
  }, [availableRightPanelTabs, defaultRightPanelTab, isFullscreenCopilot]);
  // Estado de autenticacao/admin
  const { supabase, loading: supaLoading, configError } = useSupabaseBrowser();
  const { isAdmin, authChecked } = useDotobotAdminSession({ supabase, supaLoading });
  // Integracao com extensao
  const { extensionReady, lastResponse, sendCommand } = useDotobotExtensionBridge();
  const router = useRouter();
  const logDotobotUi = (label, action, payload = {}, patch = {}) =>
    emitDotobotUiLog({
      routePath,
      label,
      action,
      payload,
      stringifyDiagnostic,
      meta: DOTOBOT_CONSOLE_META,
      patch,
    });
  const handleCopilotDebug = () => emitCopilotDebug(routePath);
  const chatStorageKey = useMemo(() => buildStorageKey(CHAT_STORAGE_PREFIX, profile), [profile]);
  const taskStorageKey = useMemo(() => buildStorageKey(TASK_STORAGE_PREFIX, profile), [profile]);
  const prefStorageKey = useMemo(() => buildStorageKey(PREF_STORAGE_PREFIX, profile), [profile]);
  const layoutStorageKey = useMemo(() => buildStorageKey(DOTOBOT_LAYOUT_STORAGE_PREFIX, profile), [profile]);
  const conversationStorageKey = useMemo(() => buildConversationStorageKey(profile), [profile]);
  const shellState = useDotobotShellState({
    defaultCollapsed,
    initialRightPanelTab,
    initialWorkspaceOpen,
    isFullscreenCopilot,
  });
  const {
    activeConversationId,
    agentLabActionState,
    agentLabSnapshot,
    agentLabSnapshotRequestedRef,
    attachments,
    composerRef,
    confirmModal,
    conversationMenuId,
    conversationMenuRef,
    conversationSearch,
    conversationSearchInputRef,
    conversationSort,
    contextEnabled,
    conversations,
    error,
    fileInputRef,
    input,
    isCollapsed,
    isRecording,
    lastConsumedAiTaskHandoffId,
    loading,
    localRuntimeConfigOpen,
    localRuntimeDraft,
    localStackAutoprobeRef,
    localStackSummary,
    messages,
    mode,
    notificationsEnabled,
    pendingRetrigger,
    projectFilterRef,
    provider,
    providerCatalog,
    providerCatalogRequestedRef,
    ragHealth,
    ragHealthRequestedRef,
    recognitionRef,
    refreshingLocalStack,
    renameModal,
    rightPanelTab,
    scrollRef,
    selectedProjectFilter,
    selectedSkillId,
    showArchived,
    showSlashCommands,
    skillCatalog,
    taskHistory,
    taskStatusRef,
    uiState,
    uiToasts,
    workspaceLayoutMode,
    workspaceOpen,
    setActiveConversationId,
    setAgentLabActionState,
    setAgentLabSnapshot,
    setAttachments,
    setConfirmModal,
    setContextEnabled,
    setConversationMenuId,
    setConversationSearch,
    setConversationSort,
    setConversations,
    setError,
    setInput,
    setIsRecording,
    setLastConsumedAiTaskHandoffId,
    setLoading,
    setLocalRuntimeConfigOpen,
    setLocalRuntimeDraft,
    setLocalStackSummary,
    setMessages,
    setMode,
    setNotificationsEnabled,
    setPendingRetrigger,
    setProjectFilter,
    setProvider,
    setProviderCatalog,
    setRagHealth,
    setRefreshingLocalStack,
    setRenameModal,
    setRightPanelTab,
    setSelectedProjectFilter,
    setSelectedSkillId,
    setShowArchived,
    setShowSlashCommands,
    setSkillCatalog,
    setTaskHistory,
    setUiState,
    setUiToasts,
    setWorkspaceLayoutMode,
    setWorkspaceOpen,
  } = shellState;
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  useDotobotShellUiEffects({
    composerRef,
    conversationMenuId,
    conversationMenuRef,
    defaultCollapsed,
    setConversationMenuId,
    setIsCollapsed: shellState.setIsCollapsed,
    setWorkspaceOpen,
  });

  useDotobotPersistedBootstrap({
    chatStorageKey,
    conversationStorageKey,
    initialRightPanelTab,
    initialWorkspaceOpen,
    isFullscreenCopilot,
    layoutStorageKey,
    prefStorageKey,
    setActiveConversationId,
    setAttachments,
    setContextEnabled,
    setConversations,
    setMessages,
    setMode,
    setProvider,
    setRightPanelTab,
    setSelectedSkillId,
    setTaskHistory,
    setWorkspaceLayoutMode,
    setWorkspaceOpen,
    taskStorageKey,
  });

  const conversationActions = useDotobotConversationActions({
    activeConversationId,
    attachments,
    composerRef,
    contextEnabled,
    conversations,
    maxAttachments: MAX_ATTACHMENTS,
    maxConversations: MAX_CONVERSATIONS,
    messages,
    mode,
    normalizeAttachment,
    provider,
    providerCatalog,
    pushUiToast,
    routePath,
    scrollConversationToBottom,
    selectedSkillId,
    setActiveConversationId,
    setAttachments,
    setConfirmModal,
    setContextEnabled,
    setConversations,
    setError,
    setInput,
    setMessages,
    setMode,
    setProvider,
    setRenameModal,
    setSelectedSkillId,
    setTaskHistory,
    setWorkspaceOpen,
    taskHistory,
  });
  const {
    archiveConversation,
    attachFilesToConversation,
    createConversationFromCurrentState,
    deleteConversation,
    handleConcatConversation,
    renameConversation,
    selectConversation,
    shareConversation,
    updateConversationById: updateConversationRecord,
  } = conversationActions;

  useEffect(() => {
    if (providerCatalogRequestedRef.current) return undefined;
    providerCatalogRequestedRef.current = true;
    let active = true;
    let timeoutId = null;
    let idleId = null;
    const loadProviderCatalog = () => {
      adminFetch(
        `/api/admin-lawdesk-providers?include_health=${isFocusedCopilotShell ? 0 : 1}`,
        { method: "GET" },
        { allowFailurePayload: true }
      )
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
            offlineMode: Boolean(payload?.data?.offlineMode),
          }));
          const hydratedProviders = shouldHydrateBrowserLocalProvider({
            focusedWorkspace: isFocusedCopilotShell,
            selectedProvider: defaultProvider,
            providers: mappedProviders,
          })
            ? await hydrateBrowserLocalProviderOptions(mappedProviders)
            : mappedProviders;
          if (!active) return;
          setProviderCatalog(hydratedProviders);
          setProvider((current) =>
            resolveWorkspaceProviderSelection({
              currentProvider: current,
              defaultProvider,
              providers: hydratedProviders,
            })
          );
        })
        .catch(() => null);
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(loadProviderCatalog, { timeout: isFocusedCopilotShell ? 1600 : 500 });
    } else {
      timeoutId = window.setTimeout(loadProviderCatalog, isFocusedCopilotShell ? 1200 : 0);
    }
    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (idleId && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [isFocusedCopilotShell]);

  useEffect(() => {
    const shouldLoadRagHealth =
      provider === "local" ||
      localRuntimeConfigOpen ||
      rightPanelTab === "agentlabs" ||
      !isFocusedCopilotShell;
    if (!shouldLoadRagHealth) return undefined;
    if (ragHealthRequestedRef.current && provider !== "local" && !localRuntimeConfigOpen && rightPanelTab !== "agentlabs") {
      return undefined;
    }
    ragHealthRequestedRef.current = true;
    let active = true;
    adminFetch("/api/admin-dotobot-rag-health?include_upsert=0", { method: "GET" }, { allowFailurePayload: true })
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
  }, [isFocusedCopilotShell, localRuntimeConfigOpen, provider, rightPanelTab]);

  async function loadAgentLabSnapshot(options = {}) {
    const silent = options?.silent === true;
    if (!silent) {
      setAgentLabSnapshot((current) => ({
        loading: true,
        error: null,
        data: current?.data || null,
      }));
    }
    try {
      const payload = await adminFetch("/api/admin-agentlab", { method: "GET" });
      setAgentLabSnapshot({
        loading: false,
        error: null,
        data: payload?.data || null,
      });
      return payload?.data || null;
    } catch (fetchError) {
      setAgentLabSnapshot({
        loading: false,
        error: fetchError?.message || "Falha ao carregar AgentLab.",
        data: null,
      });
      return null;
    }
  }

  function scrollConversationToBottom() {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current;
    const applyScroll = () => {
      viewport.scrollTop = viewport.scrollHeight;
    };
    applyScroll();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        applyScroll();
        window.requestAnimationFrame(applyScroll);
      });
    }
  }

  function exportActiveConversation() {
    if (typeof window === "undefined") return;
    const payload = {
      conversation: activeConversation || null,
      messages,
      attachments,
      exportedAt: nowIso(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(activeConversation?.title || "conversa-principal").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  function pushUiToast(toast) {
    const normalized = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tone: toast?.tone || "neutral",
      title: toast?.title || "Dotobot",
      body: toast?.body || "",
    };
    setUiToasts((current) => [...current, normalized].slice(-4));
  }

  function dismissUiToast(toastId) {
    setUiToasts((current) => current.filter((item) => item.id !== toastId));
  }

  function renderConversationMenu(conversation) {
    return (
      <DotobotConversationMenu
        compact={false}
        conversation={conversation}
        conversationMenuId={conversationMenuId}
        conversationMenuRef={conversationMenuRef}
        isLightTheme={isLightTheme}
        onArchive={archiveConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onShare={shareConversation}
        setConversationMenuId={setConversationMenuId}
      />
    );
  }

  useEffect(() => {
    const shouldLoadAgentLab =
      rightPanelTab === "agentlabs" ||
      String(routePath || "").includes("/agentlab");
    if (!shouldLoadAgentLab || agentLabSnapshotRequestedRef.current) return;
    agentLabSnapshotRequestedRef.current = true;
    loadAgentLabSnapshot();
  }, [rightPanelTab, routePath]);

  useEffect(() => {
    if (!uiToasts.length) return undefined;
    const timeoutId = window.setTimeout(() => {
      setUiToasts((current) => current.slice(1));
    }, 4200);
    return () => window.clearTimeout(timeoutId);
  }, [uiToasts]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationsEnabled(window.Notification.permission === "granted");
  }, []);

  useEffect(() => {
    const canAutoProbe =
      shouldAutoProbeBrowserLocalRuntime() &&
      (!isFocusedCopilotShell || provider === "local" || localRuntimeConfigOpen);
    if (!canAutoProbe) return undefined;
    if (localStackAutoprobeRef.current && isFocusedCopilotShell && provider !== "local" && !localRuntimeConfigOpen) {
      return undefined;
    }
    localStackAutoprobeRef.current = true;
    let active = true;
    probeBrowserLocalStackSummary()
      .then((summary) => {
        if (!active) return;
        setLocalStackSummary(summary);
        setProviderCatalog((current) => applyBrowserLocalOfflinePolicy(current, summary));
      })
      .catch((probeError) => {
        if (!active) return;
        setLocalStackSummary(buildLocalStackUnavailableSummary(probeError));
      });
    return () => {
      active = false;
    };
  }, [isFocusedCopilotShell, localRuntimeConfigOpen, provider]);

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

  async function refreshLocalStackStatus() {
    setRefreshingLocalStack(true);
    try {
      const summary = await probeBrowserLocalStackSummary();
      setLocalStackSummary(summary);
      const hydratedCatalog = await hydrateBrowserLocalProviderOptions(providerCatalog);
      const governedCatalog = applyBrowserLocalOfflinePolicy(hydratedCatalog, summary);
      setProviderCatalog(governedCatalog);
      setProvider((current) =>
        resolveWorkspaceProviderSelection({
          currentProvider: current,
          defaultProvider: summary?.offlineMode ? "local" : "gpt",
          providers: governedCatalog,
        })
      );
    } catch (probeError) {
      const summary = buildLocalStackUnavailableSummary(probeError);
      setLocalStackSummary(summary);
      setProviderCatalog((current) => applyBrowserLocalOfflinePolicy(current, summary));
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
      logDotobotUi(
        "Dotobot: envs Supabase local copiadas",
        "dotobot_supabase_local_env_copy",
        { size: envBlock.length },
        { component: "DotobotLocalPersistence" }
      );
    } catch {}
  }

  function handleLocalStackAction(actionId) {
    if (actionId === "retry_runtime_local") {
      clearBrowserLocalInferenceFailure();
      refreshLocalStackStatus();
      pushUiToast({
        tone: "neutral",
        title: "Retry do runtime local iniciado",
        body: "O Dotobot limpou a falha recente e abriu um teste rápido do runtime local.",
      });
      openLlmTest("local", input || "Responda em até 2 linhas como o runtime local está operando.");
      return;
    }
    if (actionId === "open_llm_test") {
      pushUiToast({
        tone: "neutral",
        title: "Abrindo LLM Test",
        body: "Vamos validar o runtime local fora da conversa para isolar o comportamento.",
      });
      openLlmTest("local", input);
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
      openLlmTest("local", input || "Resuma em 3 bullets como o runtime local está operando offline.");
      return;
    }
    if (actionId === "abrir_diagnostico") {
      router.push("/interno/agentlab/environment");
      return;
    }
    if (actionId === "diagnose_supabase_local") {
      router.push("/interno/agentlab/environment");
      return;
    }
    if (actionId === "open_environment") {
      router.push("/interno/agentlab/environment");
      return;
    }
    if (actionId === "open_ai_task") {
      router.push("/interno/ai-task");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalSet(chatStorageKey, JSON.stringify(messages.slice(-MAX_HISTORY)));
    setTimeout(() => {
      scrollConversationToBottom();
    }, 50);
  }, [messages, chatStorageKey, activeConversationId]);

  // Restaura anexos ao alternar conversa
  useEffect(() => {
    if (!activeConversationId) return;
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv && Array.isArray(conv.attachments)) {
      setAttachments(conv.attachments);
    } else {
      setAttachments([]);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalSet(taskStorageKey, JSON.stringify(taskHistory.slice(-MAX_TASKS)));
  }, [taskHistory, taskStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!conversations.length) return;
    const next = syncConversationSnapshots({
      conversations,
      activeConversationId,
      messages,
      taskHistory,
      attachments,
      metadata: buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled, routePath }),
    });
    safeLocalSet(conversationStorageKey, JSON.stringify(next));
    setConversations(next);
  }, [messages, taskHistory, attachments, activeConversationId, conversationStorageKey, mode, provider, selectedSkillId, contextEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalSet(
      prefStorageKey,
      JSON.stringify({
        mode,
        provider,
        selectedSkillId,
        contextEnabled,
        workspaceOpen,
        activeConversationId,
      })
    );
  }, [mode, provider, selectedSkillId, contextEnabled, workspaceOpen, activeConversationId, prefStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalSet(layoutStorageKey, workspaceLayoutMode);
  }, [layoutStorageKey, workspaceLayoutMode]);

  useEffect(() => {
    if (availableRightPanelTabs.includes(rightPanelTab)) return;
    setRightPanelTab(availableRightPanelTabs[0]);
  }, [availableRightPanelTabs, rightPanelTab]);

  useEffect(() => {
    const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
    const activeTask = getLastTask(taskHistory);
    setModuleHistory("dotobot", {
      routePath: routePath || "/interno",
      extensionReady,
      lastExtensionResponse: lastResponse || null,
      uiState,
      loading,
      error: error || null,
      mode,
      provider,
      selectedSkillId,
      contextEnabled,
      workspaceOpen,
      isCollapsed,
      activeConversationId,
      activeConversation: activeConversation
        ? {
            id: activeConversation.id,
            title: activeConversation.title || "",
            updatedAt: activeConversation.updatedAt || activeConversation.updated_at || null,
            archived: Boolean(activeConversation.archived),
          }
        : null,
      messages: messages.slice(-20),
      taskHistory: taskHistory.slice(0, 20),
      activeTask,
      attachments,
      conversationCount: conversations.length,
      filters: {
        conversationSearch,
        conversationSort,
        showArchived,
      },
    });
  }, [
    activeConversationId,
    attachments,
    contextEnabled,
    conversationSearch,
    conversationSort,
    conversations,
    error,
    extensionReady,
    isCollapsed,
    lastResponse,
    loading,
    messages,
    mode,
    provider,
    selectedSkillId,
    routePath,
    showArchived,
    taskHistory,
    uiState,
    workspaceOpen,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    taskHistory.forEach((task) => {
      const previousStatus = taskStatusRef.current.get(task.id);
      if (
        previousStatus &&
        previousStatus !== task.status &&
        ["completed", "done", "failed", "error", "canceled"].includes(String(task.status || "").toLowerCase())
      ) {
        const title = task.status === "failed" || task.status === "error" ? "Dotobot: tarefa com falha" : "Dotobot: tarefa concluída";
        const body = task.query || task.title || "Execução finalizada";
        pushUiToast({
          tone: task.status === "failed" || task.status === "error" ? "danger" : "success",
          title,
          body,
        });
        if (notificationsEnabled && "Notification" in window) {
          try {
            new window.Notification(title, { body });
          } catch {}
        }
      }
      taskStatusRef.current.set(task.id, task.status);
    });
  }, [notificationsEnabled, taskHistory]);

  // Copilot sempre disponivel, apenas colapsa visualmente
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      const normalizedKey = String(event.key || "").toLowerCase();
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK) {
        event.preventDefault();
        setWorkspaceOpen(true);
        composerRef.current?.focus();
        pushUiToast({
          tone: "neutral",
          title: "Composer em foco",
          body: "O atalho Ctrl/Cmd+K deixou o Dotobot pronto para digitação imediata.",
        });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && ["1", "2", "3", "4"].includes(normalizedKey)) {
        event.preventDefault();
        setWorkspaceOpen(true);
        const tabMap = {
          "1": { tab: "modules", title: "Painel lateral: módulos" },
          "2": { tab: "ai-task", title: "Painel lateral: AI Task" },
          "3": { tab: "agentlabs", title: "Painel lateral: AgentLabs" },
          "4": { tab: "context", title: "Painel lateral: contexto" },
        };
        const selection = tabMap[normalizedKey];
        if (selection && availableRightPanelTabs.includes(selection.tab)) {
          setRightPanelTab(selection.tab);
          pushUiToast({
            tone: "neutral",
            title: selection.title,
            body: "O painel da direita foi reposicionado sem sair da conversa.",
          });
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && normalizedKey === "o") {
        event.preventDefault();
        router.push("/interno/copilot");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && normalizedKey === "a") {
        event.preventDefault();
        router.push("/interno/ai-task");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && normalizedKey === "g") {
        event.preventDefault();
        router.push("/interno/agentlab");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [availableRightPanelTabs, router]);

  useEffect(() => {
    if (!attachments.length) return undefined;
    return () => {
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, [attachments]);

  useEffect(() => {
    if (!pendingRetrigger) return;
    setInput(pendingRetrigger);
    setPendingRetrigger(null);
    composerRef.current?.focus();
  }, [pendingRetrigger]);

  useEffect(() => {
    const dotobotHistory = getModuleHistory("dotobot");
    const handoff = dotobotHistory?.handoffFromAiTask || null;
    if (!handoff?.mission) return;
    if (handoff.id && handoff.id === lastConsumedAiTaskHandoffId) return;
    if (input && input.trim()) return;
    setLastConsumedAiTaskHandoffId(handoff.id || null);
    setWorkspaceOpen(true);
    setMode("task");
    if (handoff.routePath) {
      logDotobotUi("Dotobot: handoff recebido do AI Task", "dotobot_handoff_received", handoff, {
        component: "DotobotHandoff",
      });
    }
    setInput(handoff.mission);
    pushUiToast({
      tone: "success",
      title: "Handoff recebido do AI Task",
      body: handoff.mission,
    });
    setTimeout(() => composerRef.current?.focus(), 50);
  }, [input, lastConsumedAiTaskHandoffId]);

  function syncTaskHistory(taskId, updater) {
    setTaskHistory((current) => current.map((task) => (task.id === taskId ? updater(task) : task)));
  }

    // Estados visuais detalhados
    const stateLabel = {
      idle: "Pronto",
      responding: "Pensando...",
      thinking: "Pensando...",
      typing: "Digitando...",
      executing: "Executando...",
      waiting: "Aguardando aprovacao...",
    }[uiState] || "Pronto";

  async function handleSubmit(event) {
    event.preventDefault();
    await submitQuery(input);
  }

  function handleResetChat() {
    setMessages([]);
    setAttachments([]);
    setError(null);
    if (activeConversationId) {
      updateConversationRecord(activeConversationId, {
        messages: [],
        attachments: [],
        preview: "Sem mensagens ainda",
      });
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(chatStorageKey);
    }
  }

  function handleResetTasks() {
    setTaskHistory([]);
    if (activeConversationId) {
      updateConversationRecord(activeConversationId, {
        taskHistory: [],
      });
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(taskStorageKey);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      handleFileDrop(files);
    }
  }

  function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      handleFileDrop(files);
    }
  }

  function handleOpenFiles() {
    fileInputRef.current?.click();
  }

  function handleFilesSelected(event) {
    handleFileDrop(event.target.files);
    event.target.value = "";
  }

  async function handleEnableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await window.Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    pushUiToast({
      tone: permission === "granted" ? "success" : "warning",
      title: permission === "granted" ? "Notificações ativadas" : "Notificações não liberadas",
      body:
        permission === "granted"
          ? "O Dotobot agora pode avisar conclusão e falha de tarefas como um cockpit residente."
          : "Sem a permissão do navegador, o painel continua usando avisos internos dentro da interface.",
    });
  }

  function handleReuseTaskMission(task) {
    const mission = String(task?.mission || task?.query || task?.title || "").trim();
    if (!mission) return;
    setInput(mission);
      setMode(task?.mode || mode);
      setProvider(normalizeWorkspaceProvider(task?.provider || provider, providerCatalog));
    setWorkspaceOpen(true);
    setRightPanelTab("ai-task");
    setTimeout(() => composerRef.current?.focus(), 60);
  }
  const { runAgentLabSync, runAgentLabTrainingScenario, updateAgentLabIncidentItemStatus, updateAgentLabQueueItemStatus } = useDotobotAgentLabActions({
    loadAgentLabSnapshot,
    setAgentLabActionState,
  });

  function handleQuickAction(prompt) {
    setMode("task");
    setWorkspaceOpen(true);
    setInput(prompt);
    setShowSlashCommands(true);
    pushUiToast({
      tone: "neutral",
      title: "Atalho operacional preparado",
      body: String(prompt || "").replace(/^\/\w+\s*/, "").slice(0, 110) || "O prompt rápido foi carregado no compositor.",
    });
    composerRef.current?.focus();
  }

  async function handleCopyMessage(message) {
    const text = String(message?.text || "").trim();
    if (!text) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      logDotobotUi("Dotobot: mensagem copiada", "dotobot_message_copy", {
        role: message?.role || "assistant",
        size: text.length,
      }, { component: "DotobotMessageActions" });
    } catch {}
  }

  function handleReuseMessage(message) {
    const text = String(message?.text || "").trim();
    if (!text) return;
    setWorkspaceOpen(true);
    setInput(text);
    setShowSlashCommands(text.trimStart().startsWith("/"));
    setTimeout(() => composerRef.current?.focus(), 50);
  }

  function handleOpenMessageInAiTask(message) {
    const text = String(message?.text || "").trim();
    if (!text) return;
    const handoff = {
      id: `${Date.now()}_dotobot_message_handoff`,
      label: "Resposta do Dotobot",
      mission: text,
      moduleKey: "dotobot",
      moduleLabel: "Dotobot",
      routePath: routePath || "/interno",
      mode,
      provider,
      tags: ["ai-task", "dotobot", "message"],
      createdAt: nowIso(),
      conversationId: activeConversationId || null,
    };
    setModuleHistory("ai-task", {
      routePath: "/interno/ai-task",
      handoffFromDotobot: handoff,
      consoleTags: handoff.tags,
    });
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      module: "ai-task",
      component: "DotobotMessageActions",
      label: "Dotobot: resposta enviada ao AI Task",
      action: "dotobot_message_to_ai_task",
      method: "UI",
      path: "/interno/ai-task",
      status: "success",
      tags: handoff.tags,
      response: buildDiagnosticReport({
        title: "Mensagem enviada ao AI Task",
        summary: text.slice(0, 300),
        sections: [{ label: "handoff", value: handoff }],
      }),
    });
    router.push("/interno/ai-task");
  }

  function handleMessageAction(action, message) {
    if (!action) return;
    if (action.kind === "route" && action.target) {
      router.push(action.target);
      return;
    }
    if (action.kind === "local_action" && action.target) {
      handleLocalStackAction(action.target);
      return;
    }
    if (action.kind === "composer_seed") {
      const text = String(action.target || message?.text || "").trim();
      if (!text) return;
      setWorkspaceOpen(true);
      setInput(text);
      setShowSlashCommands(text.trimStart().startsWith("/"));
      setTimeout(() => composerRef.current?.focus(), 50);
    }
  }

  function handleSlashCommand(command) {
    setInput(`${command.value} `);
    setShowSlashCommands(false);
    composerRef.current?.focus();
  }

  function openLlmTest(nextProvider = provider, nextPrompt = input) {
    const query = { provider: nextProvider };
    if (String(nextPrompt || "").trim()) {
      query.prompt = String(nextPrompt).trim().slice(0, 300);
    }
    router.push({ pathname: "/llm-test", query });
  }

  function toggleVoiceInput() {
    const Recognition = getVoiceRecognition();
    if (!Recognition) {
      setError("Transcricao por voz nao suportada neste navegador.");
      logDotobotUi("Voz nao suportada", "dotobot_voice_not_supported", {
        browser: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }, { component: "DotobotVoice", status: "error", error: "Transcricao por voz nao suportada neste navegador." });
      return;
    }

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) {
        setInput((current) => {
          const prefix = current.trim();
          return prefix ? `${prefix} ${transcript}` : transcript;
        });
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function handleRetry(task) {
    if (!task?.query) return;
    setPendingRetrigger(task.query);
      setMode(task.mode || mode);
      setProvider(normalizeWorkspaceProvider(task.provider || provider, providerCatalog));
    setContextEnabled(task.contextEnabled ?? contextEnabled);
    if (task.attachments?.length) {
      setError("Reenvio com anexos locais nao e suportado automaticamente. Reanexe os arquivos se necessario.");
      logDotobotUi("Reenvio com anexo bloqueado", "dotobot_retrigger_requires_attachments", {
        taskId: task?.id || null,
        attachments: task.attachments,
      }, { component: "DotobotReplay", status: "error", error: "Reenvio com anexos locais nao e suportado automaticamente." });
    }
    setWorkspaceOpen(true);
  }

  function handlePause(task) {
    syncTaskHistory(task.id, (current) => ({
      ...current,
      status: current.status === "paused" ? "running" : "paused",
      logs: [...(current.logs || []), current.status === "paused" ? "Retomado pelo operador." : "Pausa solicitada pelo operador."],
    }));
  }

  function handleCancel(task) {
    setConfirmModal({
      title: "Cancelar execução",
      body: "Deseja cancelar esta execução do Dotobot?",
      confirmLabel: "Cancelar execução",
      onConfirm: async () => {
        try {
          await cancelTaskRun(task.id);
        } catch {}
        syncTaskHistory(task.id, (current) => ({
          ...current,
          status: "canceled",
          canceled: true,
          logs: [...(current.logs || []), "Execucao cancelada pelo operador."],
        }));
        setConfirmModal(null);
      },
    });
  }

  const runningCount = taskHistory.filter((item) => item.status === "running").length;
  const activeTask = getLastTask(taskHistory);
  const ragSummary = buildRagSummary(activeTask?.rag);
  const activeStatus = loading || runningCount || uiState !== "idle" ? "processing" : "online";
  const uiStateLabel =
    uiState === "responding"
      ? "Respondendo"
      : uiState === "planning"
        ? "Planejando"
        : uiState === "executing"
          ? "Executando"
          : "Idle";
  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[0];
  const activeProviderOption = providerCatalog.find((item) => item.value === provider) || null;
  const activeProviderPresentation = parseProviderPresentation(activeProviderOption || "Nuvem principal");
  const localStackReady = Boolean(localStackSummary?.ok && localStackSummary?.localProvider?.available);
  const localStackTone = localStackReady ? "border-[#234034] text-[#80C7A1]" : "border-[#5b2d2d] text-[#f2b2b2]";
  const localStackLabel = localStackReady ? "Stack local pronto" : "Stack local pendente";
  const localRuntimeLabel = localStackSummary?.localProvider?.runtimeLabel || "Runtime local";
  const capabilitiesSkills = localStackSummary?.capabilities?.skills || null;
  const capabilitiesCommands = localStackSummary?.capabilities?.commands || null;
  const browserExtensionProfiles = localStackSummary?.capabilities?.browserExtensionProfiles || null;
  const activeBrowserProfile =
    browserExtensionProfiles?.profiles?.[browserExtensionProfiles?.active_profile] || null;
  const ragAlert = buildRagAlert(ragHealth);
  const localInferenceAlert = buildLocalInferenceAlert({ provider, error, localStackSummary });
  const offlineHealthSnapshot = buildOfflineHealthSnapshot({ localStackSummary, ragHealth });
  const localBootstrapPlan = buildLocalBootstrapPlan({ localStackSummary, ragHealth });
  const supabaseBootstrap = buildSupabaseLocalBootstrap({ localStackSummary, ragHealth });
  const isWorkspaceShell = workspaceOpen;
  const railCollapsed = compactRail ? true : isCollapsed;
  const effectiveWorkspaceLayout =
    isCompactViewport
      ? "immersive"
      : workspaceLayoutMode;
  const workspaceShellWidthClass =
    embeddedInInternoShell
      ? "w-full max-w-none"
      : effectiveWorkspaceLayout === "immersive"
      ? "w-full"
      : effectiveWorkspaceLayout === "balanced"
        ? "w-full max-w-[1520px]"
        : "w-full max-w-[1320px]";
  const workspaceShellGridClass =
    isRailConversationShell
      ? "grid-cols-1"
      : effectiveWorkspaceLayout === "immersive"
      ? isFocusedCopilotShell
        ? "grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_320px]"
        : "lg:grid-cols-[320px_minmax(0,1.6fr)_320px] xl:grid-cols-[360px_minmax(0,2.05fr)_360px] 2xl:grid-cols-[420px_minmax(0,2.45fr)_420px]"
      : effectiveWorkspaceLayout === "balanced"
        ? "lg:grid-cols-[220px_minmax(0,1.25fr)_240px] xl:grid-cols-[240px_minmax(0,1.5fr)_260px] 2xl:grid-cols-[260px_minmax(0,1.65fr)_280px]"
        : "lg:grid-cols-[180px_minmax(0,1fr)_220px] xl:grid-cols-[190px_minmax(0,1.12fr)_240px] 2xl:grid-cols-[210px_minmax(0,1.2fr)_260px]";
  const focusedShellContentClass = isFocusedCopilotShell ? "px-0 pt-0 pb-0" : suppressInnerChrome ? "px-0 pt-0 pb-0" : "p-3 md:p-5";
  const workspaceGridGapClass = isConversationCentricShell ? "gap-px" : "gap-4";
  const leftRailShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "h-full min-h-full overflow-hidden border-r border-y-0 border-l-0 border-[#E1E6EB] bg-[#F4F6F8] rounded-none shadow-none"
      : "h-full min-h-full overflow-hidden border-r border-y-0 border-l-0 border-[#1C2623] bg-[#0C1110] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[22px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,251,0.98))]"
      : "rounded-[22px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#1C2623] bg-[rgba(255,255,255,0.018)]";
  const centerShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "min-h-full border-x border-y-0 border-[#E1E6EB] bg-[#F7F8FA] rounded-none shadow-none"
      : "min-h-full border-x border-y-0 border-[#1C2623] bg-[#0E1211] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[24px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.98))]"
      : "rounded-[24px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#1C2623] bg-[rgba(255,255,255,0.015)]";
  const rightRailShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "h-full min-h-full overflow-hidden border-l border-y-0 border-r-0 border-[#E1E6EB] bg-[#F4F6F8] rounded-none shadow-none"
      : "h-full min-h-full overflow-hidden border-l border-y-0 border-r-0 border-[#1C2623] bg-[#0C1110] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[24px] border border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,247,250,0.98))]"
      : "rounded-[24px] border border-[#1C2623] bg-[rgba(255,255,255,0.015)]";
  const {
    activeConversation,
    activeProjectLabel,
    conversationEntities,
    conversationProjectGroups,
    filteredConversations,
    moduleWorkspaceCards,
    projectInsights,
    visibleConversationsByProject,
  } = useDotobotConversationViewModel({
    activeConversationId,
    activeTask,
    conversations,
    conversationSort,
    deferredConversationSearch,
    routePath,
    selectedProjectFilter,
    showArchived,
  });
  const composerActions = useDotobotComposerActions({
    activeConversation,
    activeConversationId,
    activeTask,
    attachments,
    composerRef,
    contextEnabled,
    loading,
    logDotobotUi,
    maxAttachments: MAX_ATTACHMENTS,
    mergeConversationAttachments,
    messages,
    mode,
    normalizeAttachment,
    profile,
    provider,
    providerCatalog,
    routePath,
    scrollConversationToBottom,
    selectedSkillId,
    setAttachments,
    setConversations,
    setError,
    setLoading,
    setMessages,
    setShowSlashCommands,
    setTaskHistory,
    setUiState,
    setWorkspaceOpen,
  });
  const { handleComposerKeyDown, handleFileDrop, submitQuery } = composerActions;
  const focusedConversationColumnClass = isFocusedCopilotShell ? "mx-auto flex h-full w-full max-w-[880px] flex-col" : isRailConversationShell ? "w-full" : "";
  const useCondensedRightRail = isFocusedCopilotShell;
  const visibleLegalActions = isFocusedCopilotShell || isRailConversationShell ? [] : LEGAL_ACTIONS.slice(0, isCompactViewport ? 1 : 3);
  const visibleQuickPrompts = isFocusedCopilotShell ? [] : QUICK_PROMPTS.slice(0, isCompactViewport ? 1 : isConversationCentricShell ? 1 : 2);
  const cockpitCommandActions = useMemo(() => [
    {
      id: "focus-composer",
      label: "Focar composer",
      hint: "Ctrl/Cmd+K",
      onClick: () => {
        setWorkspaceOpen(true);
        composerRef.current?.focus();
        pushUiToast({
          tone: "neutral",
          title: "Composer em foco",
          body: "A conversa central está pronta para receber a próxima instrução.",
        });
      },
    },
    {
      id: "open-fullscreen",
      label: routePath === "/interno/copilot" ? "Fullscreen ativo" : "Abrir fullscreen",
      hint: "Ctrl/Cmd+Shift+O",
      onClick: () => router.push("/interno/copilot"),
    },
    {
      id: "open-ai-task",
      label: "Abrir AI Task",
      hint: "Ctrl/Cmd+Shift+A",
      onClick: () => router.push("/interno/ai-task"),
    },
    {
      id: "open-agentlab",
      label: "Abrir AgentLabs",
      hint: "Ctrl/Cmd+Shift+G",
      onClick: () => router.push("/interno/agentlab"),
    },
  ], [routePath, router]);
  const {
    activeRightPanelMeta,
    agentLabConversationSummary,
    agentLabData,
    agentLabEnvironment,
    agentLabHealthSignals,
    agentLabIncidentPreview,
    agentLabIncidentsSummary,
    agentLabOverview,
    agentLabQueuePreview,
    agentLabSubagents,
    agentLabSyncPreview,
    agentLabTrainingPreview,
    agentLabTrainingSummary,
    featuredTrainingScenario,
    linkedAgentLabTaskRuns,
  } = useDotobotRightRailViewModel({
    activeConversation,
    activeTask,
    agentLabSnapshot,
    availableRightPanelTabs,
    rightPanelTab,
    routePath,
  });
  const compactRecentConversations = useMemo(() => filteredConversations.slice(0, 4), [filteredConversations]);
  const workspaceNavigatorItems = useMemo(() => [
    {
      id: "new",
      label: "Nova conversa",
      helper: "Abrir thread limpa",
      onClick: () => createConversationFromCurrentState("Nova conversa"),
    },
    {
      id: "search",
      label: "Buscar conversa",
      helper: "Focar busca",
      onClick: () => {
        setWorkspaceOpen(true);
        requestAnimationFrame(() => {
          conversationSearchInputRef.current?.focus();
        });
      },
    },
    {
      id: "repository",
      label: "Repositório",
      helper: "Integration Kit",
      onClick: () => router.push("/interno/integration-kit"),
    },
    {
      id: "agents",
      label: "Agentes IA",
      helper: "Abrir AgentLab",
      onClick: () => {
        setWorkspaceOpen(true);
        setRightPanelTab("agentlabs");
        pushUiToast({
          tone: "neutral",
          title: "AgentLab em foco",
          body: "Os subagentes e a governança do ai-core foram priorizados na navegação lateral.",
        });
      },
    },
    {
      id: "projects",
      label: "Projetos",
      helper: activeProjectLabel,
      onClick: () => {
        setWorkspaceOpen(true);
        requestAnimationFrame(() => {
          projectFilterRef.current?.focus();
        });
      },
    },
    {
      id: "recent",
      label: "Recentes",
      helper: `${compactRecentConversations.length} threads`,
      onClick: () => {
        setConversationSort("recent");
        setShowArchived(false);
        setSelectedProjectFilter("all");
        setConversationSearch("");
      },
    },
  ], [activeProjectLabel, compactRecentConversations.length, router]);
  const compactTranscript = useMemo(() => messages.slice(-4), [messages]);
  const activeConversationPreview =
    activeConversation?.preview ||
    activeConversation?.messages?.[activeConversation.messages.length - 1]?.text ||
    "Nova conversa pronta para receber contexto, tarefas e handoff.";
  const activeConversationTimestamp = activeConversation?.updatedAt || activeConversation?.createdAt || null;
  const compactTaskHistory = useMemo(() => taskHistory.slice(0, 3), [taskHistory]);
  const activeTaskLabel = activeTask?.query || activeTask?.label || activeTask?.title || "Nenhuma missão em andamento";
  const activeTaskStepCount = Array.isArray(activeTask?.steps) ? activeTask.steps.length : 0;
  const activeTaskProviderLabel = activeTask?.provider ? parseProviderPresentation(activeTask.provider).name : activeProviderPresentation.name;
  const composerBlockedReason = !localStackReady && !localInferenceAlert && isBrowserLocalProvider(provider)
      ? "Envio pausado até o runtime local responder."
      : "";
  const isComposerBlocked = Boolean(composerBlockedReason);
  const showConversationCockpitCards = !isConversationCentricShell && !compactRail;
  const showRuntimeOpsHeader = !isFocusedCopilotShell && !compactRail;
  const showRuntimeOpsFullscreen = false;
  const showCompactRuntimeDiagnostics = compactRail && (localRuntimeConfigOpen || provider === "local");
  const fullscreenConversationSubtitle = "Histórico à esquerda, conversa ao centro e apoio inteligente na lateral.";

  useEffect(() => {
    if (!localStackSummary?.offlineMode) return;
    if (!hasExplicitBrowserLocalRuntimeOptIn()) return;
    setProvider((current) => {
      const currentOption = providerCatalog.find((item) => item.value === current);
      if (localStackSummary?.offlineMode && current !== "local") return "local";
      if (currentOption?.disabled) return "local";
      return current;
    });
  }, [localStackSummary?.offlineMode, providerCatalog]);

  useEffect(() => {
    if (provider !== "local") return;
    if (shouldAutoProbeBrowserLocalRuntime()) return;
    const fallbackProvider = providerCatalog.find(
      (item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true
    )?.value;
    if (fallbackProvider) {
      setProvider(fallbackProvider);
    }
  }, [provider, providerCatalog]);

  useEffect(() => {
    if (provider !== "local") return;
    if (!localStackSummary) return;
    if (localStackSummary?.offlineMode) return;
    if (localStackSummary?.localProvider?.available) return;
    const fallbackProvider = providerCatalog.find(
      (item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true
    )?.value;
    if (fallbackProvider && fallbackProvider !== provider) {
      setProvider(fallbackProvider);
    }
  }, [provider, providerCatalog, localStackSummary]);

  async function handleLogin() {
    router.push("/interno/login");
  }

  if (!authChecked || supaLoading || !isAdmin) {
    return <DotobotAccessGate authChecked={authChecked} loading={supaLoading} isAdmin={isAdmin} onLogin={handleLogin} />;
  }

  return (
    <>
      <DotobotModal
        open={Boolean(confirmModal)}
        title={confirmModal?.title || "Confirmar ação"}
        body={confirmModal?.body || ""}
        confirmLabel={confirmModal?.confirmLabel || "Confirmar"}
        cancelLabel="Voltar"
        onCancel={() => setConfirmModal(null)}
        onConfirm={() => confirmModal?.onConfirm?.()}
      />
      <DotobotModal
        open={renameModal.open}
        title="Renomear conversa"
        body="Defina um título claro para identificar esta conversa no histórico."
        inputLabel="Título da conversa"
        inputValue={renameModal.value}
        onInputChange={(value) => setRenameModal((current) => ({ ...current, value }))}
        confirmLabel="Salvar"
        cancelLabel="Voltar"
        onCancel={() => setRenameModal({ open: false, conversationId: null, value: "" })}
        onConfirm={() => {
          const nextTitle = renameModal.value?.trim();
          if (!nextTitle || !renameModal.conversationId) {
            setRenameModal({ open: false, conversationId: null, value: "" });
            return;
          }
          updateConversationRecord(renameModal.conversationId, {
            title: nextTitle,
          });
          setRenameModal({ open: false, conversationId: null, value: "" });
        }}
      />
      {showCollapsedTrigger ? <DotobotCollapsedTrigger isCollapsed={isCollapsed} isCompactViewport={isCompactViewport} onOpen={() => setIsCollapsed(false)} /> : null}
      {!isCollapsed && !embeddedInInternoShell ? (
        <section className={`min-h-0 overflow-hidden rounded-[26px] border shadow-[0_18px_44px_rgba(0,0,0,0.22)] backdrop-blur-sm ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FCFDFE,#F3F7FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(10,12,11,0.98),rgba(8,10,9,0.98))]"} ${compactRail ? "" : "mr-10 md:mr-0"}`}>
        <DotobotWorkspaceHeader
          activeBrowserProfile={activeBrowserProfile}
          activeConversation={activeConversation}
          activeConversationPreview={activeConversationPreview}
          activeConversationTimestamp={activeConversationTimestamp}
          activeProviderPresentation={activeProviderPresentation}
          activeStatus={activeStatus}
          activeTaskLabel={activeTaskLabel}
          activeTaskProviderLabel={activeTaskProviderLabel}
          activeTaskStepCount={activeTaskStepCount}
          capabilitiesCommands={capabilitiesCommands}
          capabilitiesSkills={capabilitiesSkills}
          createConversation={() => createConversationFromCurrentState("Nova conversa")}
          fullscreenConversationSubtitle={fullscreenConversationSubtitle}
          handleApprove={handleApprove}
          handleContinueLastRun={handleContinueLastRun}
          handleCopilotDebug={handleCopilotDebug}
          handleOpenLlmTest={handleOpenLlmTest}
          handlePauseFlow={handlePauseFlow}
          isCompactViewport={isCompactViewport}
          isFocusedCopilotShell={isFocusedCopilotShell}
          isLightTheme={isLightTheme}
          localInferenceAlert={localInferenceAlert}
          localRuntimeConfigOpen={localRuntimeConfigOpen}
          localRuntimeLabel={localRuntimeLabel}
          localStackLabel={localStackLabel}
          localStackSummary={localStackSummary}
          localStackTone={localStackTone}
          localTaskCount={taskHistory.length}
          messageCount={messages.length}
          onRefreshLocalStack={refreshLocalStackStatus}
          onToggleCollapse={() => setIsCollapsed((current) => !current)}
          onToggleLocalRuntimeConfig={() => setLocalRuntimeConfigOpen((current) => !current)}
          paused={paused}
          ragAlert={ragAlert}
          refreshingLocalStack={refreshingLocalStack}
          showConversationCockpitCards={showConversationCockpitCards}
          showRuntimeOpsHeader={showRuntimeOpsHeader}
          uiStateLabel={uiStateLabel}
          visibleConversationCount={filteredConversations.length}
        />

        {compactRail ? (
          <div className="flex h-full min-h-0 flex-col px-4 py-4">
            <DotobotCompactConversationCard activeConversation={activeConversation} activeConversationPreview={activeConversationPreview} activeConversationTimestamp={activeConversationTimestamp} activeProviderPresentation={activeProviderPresentation} contextEnabled={contextEnabled} createConversation={() => createConversationFromCurrentState("Nova conversa")} isLightTheme={isLightTheme} selectedSkillId={selectedSkillId} setContextEnabled={setContextEnabled} />
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversas recentes</p>
                    <p className={`mt-1 text-[12px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Leitura rápida no estilo sidebar de conversa.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkspaceOpen(true)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    Ver tudo
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {compactRecentConversations.length ? (
                    compactRecentConversations.map((conversation) => {
                      const isActive = conversation.id === activeConversationId;
                      return (
                        <article
                          key={conversation.id}
                          className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                            isActive
                              ? isLightTheme
                                ? "border-[#D2B06A] bg-[#FFF8EA]"
                                : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                              : isLightTheme
                                ? "border-[#D7DEE8] bg-[#F7F9FC] hover:border-[#BAC8D6]"
                                : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => selectConversation(conversation)} className="min-w-0 flex-1 text-left">
                              <p className={`truncate text-[12px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{conversation.title}</p>
                              <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{conversation.preview}</p>
                            </button>
                            <div className="flex items-start gap-2">
                              <span className={`shrink-0 pt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>
                                {conversation.messages?.length || 0}
                              </span>
                                      <DotobotConversationMenu compact={true} conversation={conversation} conversationMenuId={conversationMenuId} conversationMenuRef={conversationMenuRef} isLightTheme={isLightTheme} onArchive={archiveConversation} onDelete={deleteConversation} onRename={renameConversation} onShare={shareConversation} setConversationMenuId={setConversationMenuId} />
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className={`rounded-[18px] border border-dashed px-3 py-4 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                      Nenhuma conversa salva ainda.
                    </div>
                  )}
                </div>
              </div>

              <div className={`min-h-0 flex-1 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Chat rápido</p>
                    <p className={`mt-1 text-[12px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Uma visão leve para conversar, revisar contexto e seguir em frente.</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                    {messages.length} mensagens
                  </span>
                </div>
                <div className="mt-3 flex max-h-[34vh] min-h-[22vh] flex-col overflow-y-auto pr-1">
                  <div className="flex min-h-full flex-col justify-end space-y-2">
                    {compactTranscript.length ? (
                      compactTranscript.map((message, index) => (
                        <div
                          key={message.id || `${message.role}-${message.createdAt || index}`}
                          className={`rounded-[18px] border px-3 py-3 ${
                            message.role === "user"
                              ? isLightTheme
                                ? "border-[#E6D29A] bg-[#FFF8EA]"
                                : "border-[#3B3523] bg-[rgba(197,160,89,0.08)]"
                              : isLightTheme
                                ? "border-[#D7DEE8] bg-[#F7F9FC]"
                                : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                              {message.role === "user" ? "Você" : "Dotobot"}
                            </span>
                            {message.createdAt ? (
                              <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>
                                {new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : null}
                          </div>
                          <p className={`mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-6 ${isLightTheme ? "text-[#2B3A42]" : "text-[#D8DEDA]"}`}>
                            {message.text || (message.role === "assistant" && loading ? "Processando resposta..." : "Sem texto")}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className={`rounded-[18px] border border-dashed px-3 py-4 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                        A conversa começa aqui. Use um prompt curto e siga para o modo full quando precisar de trilha completa.
                      </div>
                    )}
                    {loading ? (
                      <div className={`rounded-[18px] border px-3 py-3 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                        Dotobot está preparando a próxima resposta...
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {showCompactRuntimeDiagnostics ? (
              <DotobotCompactRuntimeDiagnostics
                formatInlinePanelValue={formatInlinePanelValue}
                handleLocalStackAction={handleLocalStackAction}
                isLightTheme={isLightTheme}
                localInferenceAlert={localInferenceAlert}
                offlineHealthSnapshot={offlineHealthSnapshot}
                ragAlert={ragAlert}
                supabaseBootstrap={supabaseBootstrap}
              />
            ) : null}

            <DotobotCompactComposer
              composerRef={composerRef}
              handleComposerKeyDown={handleComposerKeyDown}
              handleDrop={handleDrop}
              handlePaste={handlePaste}
              handleSubmit={handleSubmit}
              input={input}
              isLightTheme={isLightTheme}
              loading={loading}
              onChangeInput={(value) => {
                setInput(value);
                setShowSlashCommands(value.trimStart().startsWith("/"));
              }}
              onOpenFullscreen={() => setWorkspaceOpen(true)}
            />
          </div>
        ) : !railCollapsed ? (
          <>
            <div className={`border-b px-4 py-3 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {visibleLegalActions.slice(0, 2).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action.prompt)}
                    className={`rounded-full border px-3 py-1.5 text-[10px] transition sm:text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D9E0DB] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={scrollRef} className="max-h-[42vh] overflow-y-auto space-y-3 px-4 py-4 pr-3 sm:max-h-[50vh] sm:pr-4">
              {messages.length ? (
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <DotobotMessageBubble
                      key={message.id || `${message.role}-${message.createdAt || index}-${index}`}
                      message={message}
                      onCopy={handleCopyMessage}
                      onReuse={handleReuseMessage}
                      onOpenAiTask={handleOpenMessageInAiTask}
                      onAction={handleMessageAction}
                    />
                  ))}
                </div>
              ) : (
                <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                  <p className={`font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Pronto para operar.</p>
                  <p className="mt-2 leading-7">
                    Envie uma ordem, analise de caso, pedido de fluxo ou instrucao de treinamento. O Dotobot responde em PT-BR, com foco interno, seguranca juridica e proximos passos.
                  </p>
                </div>
              )}
              {loading ? (
                <DotobotMessageBubble
                  message={{ role: "assistant", text: "", createdAt: null }}
                  isTyping={true}
                />
              ) : null}
              {localInferenceAlert && !messages.length ? (
                <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8E8] text-[#8A6217]" : "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]"}`}>
                  <p className={`font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{localInferenceAlert.title}</p>
                  <p className="mt-2 leading-7">{localInferenceAlert.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleLocalStackAction("open_runtime_config")}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                    >
                      Editar runtime local
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLocalStackAction("open_ai_task")}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                    >
                      Continuar via AI Task
                    </button>
                  </div>
                </div>
              ) : null}
              {error ? <p className={`text-sm ${isLightTheme ? "text-[#B94A48]" : "text-[#f2b2b2]"}`}>{error}</p> : null}
            </div>

            <div className={`border-t px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
              <div className="mb-3 flex flex-wrap gap-1.5 sm:gap-2">
                {visibleQuickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-[10px] transition sm:text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#C6D1CC] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                    onClick={() => setInput(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  ref={composerRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setShowSlashCommands(event.target.value.trimStart().startsWith("/"));
                  }}
                  onKeyDown={handleComposerKeyDown}
                  onPaste={handlePaste}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  rows={isCompactViewport ? 3 : 4}
                  disabled={isComposerBlocked}
                  placeholder="Descreva a tarefa, caso, ordem do administrador ou instrucao de treinamento..."
                  className={`w-full resize-y rounded-[22px] border px-4 py-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#152421] placeholder:text-[#94A3B8] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] focus:border-[#C5A059]"}`}
                />
                {composerBlockedReason ? (
                  <p className={`text-[11px] leading-5 ${isLightTheme ? "text-[#8A6217]" : "text-[#f1dfb5]"}`}>{composerBlockedReason}</p>
                ) : null}

                {attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className={`flex items-center gap-3 rounded-full border px-3 py-2 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#C6D1CC]"}`}>
                        {attachment.previewUrl ? (
                          <img src={attachment.previewUrl} alt={attachment.name} className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] uppercase ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                            {attachment.kind}
                          </span>
                        )}
                        <div>
                          <p className="max-w-[12rem] truncate">{attachment.name}</p>
                          <p className="text-[10px] opacity-60">{formatBytes(attachment.size)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {showSlashCommands && input.trim().startsWith("/") ? (
                  <div className={`rounded-[22px] border p-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)]"}`}>
                    {SLASH_COMMANDS.map((command) => (
                      <button
                        key={command.value}
                        type="button"
                        onClick={() => handleSlashCommand(command)}
                        className={`flex w-full items-start justify-between gap-4 rounded-2xl px-3 py-2 text-left text-xs transition ${isLightTheme ? "text-[#51606B] hover:bg-white" : "text-[#C6D1CC] hover:bg-[rgba(255,255,255,0.03)]"}`}
                      >
                        <span>
                          <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{command.label}</span>
                          <span className={`ml-2 ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{command.value}</span>
                        </span>
                        <span className={`max-w-[16rem] text-right text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{command.hint}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleResetChat} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                      Limpar conversas
                    </button>
                    <button type="button" onClick={handleOpenFiles} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                      Anexar arquivos
                    </button>
                    <button type="button" onClick={toggleVoiceInput} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                      {isRecording ? "Parar voz" : "Ditado"}
                    </button>
                    <button type="button" onClick={() => composerRef.current?.focus()} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                      Cmd+K
                    </button>
                  </div>
                  <button type="submit" disabled={loading || !input.trim()} className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition disabled:opacity-40">
                    Executar
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </section>
      ) : null}

        {isWorkspaceShell ? (
          <DotobotWorkspaceShell
            activeConversationTitle={activeConversation?.title}
            activeProjectLabel={activeProjectLabel}
            activeStatus={activeStatus}
            centerNode={isConversationCentricShell ? (
              <FocusedConversationCenter
                activeConversation={activeConversation}
                activeMode={activeMode}
                activeProjectLabel={activeProjectLabel}
                attachments={attachments}
                centerShellClass={centerShellClass}
                composerBlockedReason={composerBlockedReason}
                composerRef={composerRef}
                error={error}
                focusedConversationColumnClass={focusedConversationColumnClass}
                formatBytes={formatBytes}
                handleComposerKeyDown={handleComposerKeyDown}
                handleCopyMessage={handleCopyMessage}
                handleDrop={handleDrop}
                handleLocalStackAction={handleLocalStackAction}
                handleMessageAction={handleMessageAction}
                handleOpenFiles={handleOpenFiles}
                handleOpenMessageInAiTask={handleOpenMessageInAiTask}
                handlePaste={handlePaste}
                handleQuickAction={handleQuickAction}
                handleReuseMessage={handleReuseMessage}
                handleSlashCommand={handleSlashCommand}
                handleSubmit={handleSubmit}
                input={input}
                isComposerBlocked={isComposerBlocked}
                isLightTheme={isLightTheme}
                isRecording={isRecording}
                loading={loading}
                localInferenceAlert={localInferenceAlert}
                messages={messages}
                onOpenAiTask={() => router.push("/interno/ai-task")}
                scrollRef={scrollRef}
                setInput={setInput}
                setShowSlashCommands={setShowSlashCommands}
                showSlashCommands={showSlashCommands}
                slashCommands={SLASH_COMMANDS}
                toggleVoiceInput={toggleVoiceInput}
                visibleLegalActions={visibleLegalActions}
              />
            ) : (
              <DotobotStandardConversationCenter
                activeConversation={activeConversation}
                activeMode={activeMode}
                activeProjectLabel={activeProjectLabel}
                attachments={attachments}
                centerShellClass={centerShellClass}
                composerBlockedReason={composerBlockedReason}
                composerRef={composerRef}
                error={error}
                focusedConversationColumnClass={focusedConversationColumnClass}
                formatBytes={formatBytes}
                handleComposerKeyDown={handleComposerKeyDown}
                handleCopyMessage={handleCopyMessage}
                handleDrop={handleDrop}
                handleLocalStackAction={handleLocalStackAction}
                handleMessageAction={handleMessageAction}
                handleOpenFiles={handleOpenFiles}
                handleOpenMessageInAiTask={handleOpenMessageInAiTask}
                handlePaste={handlePaste}
                handleQuickAction={handleQuickAction}
                handleResetChat={handleResetChat}
                handleReuseMessage={handleReuseMessage}
                handleSlashCommand={handleSlashCommand}
                handleSubmit={handleSubmit}
                input={input}
                isComposerBlocked={isComposerBlocked}
                isConversationCentricShell={isConversationCentricShell}
                isLightTheme={isLightTheme}
                isRecording={isRecording}
                loading={loading}
                localInferenceAlert={localInferenceAlert}
                messages={messages}
                onChangeInput={(value) => {
                  setInput(value);
                  setShowSlashCommands(value.trimStart().startsWith("/"));
                }}
                onOpenAiTask={() => router.push("/interno/ai-task")}
                onOpenLlmTest={openLlmTest}
                openPrompt={input}
                provider={provider}
                scrollRef={scrollRef}
                showSlashCommands={showSlashCommands}
                slashCommands={SLASH_COMMANDS}
                toggleVoiceInput={toggleVoiceInput}
                visibleLegalActions={visibleLegalActions}
                visibleQuickPrompts={visibleQuickPrompts}
              />
            )}
            dismissUiToast={dismissUiToast}
            embeddedInInternoShell={embeddedInInternoShell}
            focusedShellContentClass={focusedShellContentClass}
            gridGapClass={workspaceGridGapClass}
            gridTemplateClass={workspaceShellGridClass}
            headerNode={isFocusedCopilotShell ? (
              <FocusedWorkspaceTopbar
                isLightTheme={isLightTheme}
                messageCount={messages.length}
                onExportConversation={exportActiveConversation}
                onOpenHelp={() => router.push("/interno/agentlab/environment")}
                onOpenSettings={() => router.push("/interno/setup-integracao")}
              />
            ) : (
              <DotobotWorkspaceHeader
                MODE_OPTIONS={MODE_OPTIONS}
                activeConversation={activeConversation}
                activeConversationPreview={activeConversationPreview}
                activeProjectLabel={activeProjectLabel}
                activeProviderPresentation={activeProviderPresentation}
                activeStatus={activeStatus}
                activeTaskLabel={activeTaskLabel}
                activeTaskProviderLabel={activeTaskProviderLabel}
                activeTaskStepCount={activeTaskStepCount}
                cockpitCommandActions={cockpitCommandActions}
                contextEnabled={contextEnabled}
                filteredConversationCount={filteredConversations.length}
                handleEnableNotifications={handleEnableNotifications}
                handleLocalStackAction={handleLocalStackAction}
                input={input}
                isConversationCentricShell={isConversationCentricShell}
                isLightTheme={isLightTheme}
                localRuntimeLabel={localRuntimeLabel}
                localStackLabel={localStackLabel}
                localStackReady={localStackReady}
                localStackSummary={localStackSummary}
                localStackTone={localStackTone}
                messageCount={messages.length}
                mode={mode}
                notificationsEnabled={notificationsEnabled}
                onChangeContextEnabled={setContextEnabled}
                onChangeMode={setMode}
                onChangeProvider={(value) => setProvider(normalizeWorkspaceProvider(value, providerCatalog))}
                onChangeSkill={setSelectedSkillId}
                onChangeWorkspaceLayoutMode={setWorkspaceLayoutMode}
                onOpenAgentLab={() => router.push("/interno/agentlab/conversations")}
                onOpenAiTask={() => router.push("/interno/ai-task")}
                onOpenEnvironmentDiagnostic={() => router.push("/interno/agentlab/environment")}
                onOpenLlmTest={openLlmTest}
                onPushLayoutToast={(id, label) => {
                  pushUiToast({
                    tone: "neutral",
                    title: `Layout ${label.toLowerCase()}`,
                    body:
                      id === "snap"
                        ? "O Copilot voltou ao encaixe lateral com densidade próxima de painel residente."
                        : id === "balanced"
                          ? "O Copilot abriu um pouco mais a área de trabalho sem perder a leitura lateral."
                          : "O Copilot expandiu a malha para priorizar a conversa e os módulos simultaneamente.",
                  });
                }}
                onToggleWorkspaceOpen={() => setWorkspaceOpen(false)}
                provider={provider}
                providerCatalog={providerCatalog}
                ragAlert={ragAlert}
                routePath={routePath}
                runningCount={runningCount}
                selectedSkillId={selectedSkillId}
                skillCatalog={skillCatalog}
                taskCount={taskHistory.length}
                workspaceLayoutMode={workspaceLayoutMode}
              />
            )}
            historyNode={!isRailConversationShell ? (
              isFocusedCopilotShell ? (
                <FocusedHistoryRail
                  activeConversationId={activeConversationId}
                  activeProjectLabel={activeProjectLabel}
                  conversationProjectGroups={conversationProjectGroups}
                  conversationSearch={conversationSearch}
                  conversationSearchInputRef={conversationSearchInputRef}
                  conversationSort={conversationSort}
                  filteredConversations={filteredConversations}
                  handleConcatConversation={handleConcatConversation}
                  handleDrop={handleDrop}
                  isLightTheme={isLightTheme}
                  leftRailShellClass={leftRailShellClass}
                  onCreateConversation={() => createConversationFromCurrentState("Nova conversa")}
                  profile={profile}
                  projectInsights={projectInsights}
                  renderConversationMenu={renderConversationMenu}
                  selectConversation={selectConversation}
                  selectedProjectFilter={selectedProjectFilter}
                  setConversationSearch={setConversationSearch}
                  setConversationSort={setConversationSort}
                  setSelectedProjectFilter={setSelectedProjectFilter}
                  setShowArchived={setShowArchived}
                  showArchived={showArchived}
                />
              ) : (
                <DotobotStandardHistoryRail
                  activeConversationId={activeConversationId}
                  activeProjectLabel={activeProjectLabel}
                  archiveConversation={archiveConversation}
                  conversationMenuId={conversationMenuId}
                  conversationMenuRef={conversationMenuRef}
                  conversationProjectGroups={conversationProjectGroups}
                  conversationSearch={conversationSearch}
                  conversationSearchInputRef={conversationSearchInputRef}
                  conversationSort={conversationSort}
                  createConversation={() => createConversationFromCurrentState("Nova conversa")}
                  deleteConversation={deleteConversation}
                  handleConcatConversation={handleConcatConversation}
                  handleDrop={handleDrop}
                  handleResetChat={handleResetChat}
                  isConversationCentricShell={isConversationCentricShell}
                  isFocusedCopilotShell={isFocusedCopilotShell}
                  isLightTheme={isLightTheme}
                  leftRailShellClass={leftRailShellClass}
                  profile={profile}
                  projectFilterRef={projectFilterRef}
                  projectInsights={projectInsights}
                  renameConversation={renameConversation}
                  router={router}
                  selectedProjectFilter={selectedProjectFilter}
                  selectConversation={selectConversation}
                  setConversationMenuId={setConversationMenuId}
                  setConversationSearch={setConversationSearch}
                  setConversationSort={setConversationSort}
                  setSelectedProjectFilter={setSelectedProjectFilter}
                  setShowArchived={setShowArchived}
                  shareConversation={shareConversation}
                  showArchived={showArchived}
                  workspaceNavigatorItems={workspaceNavigatorItems}
                />
              )
            ) : null}
            isFocusedCopilotShell={isFocusedCopilotShell}
            isLightTheme={isLightTheme}
            onResetChat={handleResetChat}
            outerClassName={embeddedInInternoShell
              ? isFocusedCopilotShell
                ? isLightTheme
                  ? "relative min-h-0 h-full overflow-hidden border border-[#E1E6EB] bg-[#F3F5F7]"
                  : "relative min-h-0 h-full overflow-hidden border border-[#1C2623] bg-[#0A0E0C]"
                : suppressInnerChrome
                  ? "relative min-h-0 h-full overflow-hidden"
                : isLightTheme
                  ? "relative min-h-0 h-full overflow-hidden rounded-[28px] border border-[#D7DEE8] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.98))]"
                  : "relative min-h-0 h-full overflow-hidden rounded-[28px] border border-[#1C2623] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.1),transparent_24%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.97))]"
              : isLightTheme
                ? "fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_26%),linear-gradient(180deg,rgba(239,243,248,0.98),rgba(228,234,241,0.96))] backdrop-blur-xl"
                : "fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.14),transparent_26%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.96))] backdrop-blur-xl"}
            rightNode={!isRailConversationShell ? (
              isFocusedCopilotShell ? (
                <FocusedCopilotAside
                  activeRightPanelMeta={activeRightPanelMeta}
                  activeTaskLabel={activeTaskLabel}
                  activeTaskProviderLabel={activeTaskProviderLabel}
                  activeTaskStepCount={activeTaskStepCount}
                  attachments={attachments}
                  contextEnabled={contextEnabled}
                  isLightTheme={isLightTheme}
                  onOpenAiTask={() => router.push("/interno/ai-task")}
                  ragSummary={ragSummary}
                  rightPanelTab={rightPanelTab}
                  rightRailShellClass={rightRailShellClass}
                  routePath={routePath}
                  runningCount={runningCount}
                  setRightPanelTab={setRightPanelTab}
                  taskHistory={taskHistory}
                />
              ) : (
                <GenericCopilotRightRail
                  activeConversation={activeConversation}
                  activeConversationPreview={activeConversationPreview}
                  activeProjectLabel={activeProjectLabel}
                  activeRightPanelMeta={activeRightPanelMeta}
                  activeTask={activeTask}
                  activeTaskLabel={activeTaskLabel}
                  activeTaskProviderLabel={activeTaskProviderLabel}
                  activeTaskStepCount={activeTaskStepCount}
                  agentLabActionState={agentLabActionState}
                  agentLabConversationSummary={agentLabConversationSummary}
                  agentLabEnvironment={agentLabEnvironment}
                  agentLabHealthSignals={agentLabHealthSignals}
                  agentLabIncidentPreview={agentLabIncidentPreview}
                  agentLabIncidentsSummary={agentLabIncidentsSummary}
                  agentLabOverview={agentLabOverview}
                  agentLabQueuePreview={agentLabQueuePreview}
                  agentLabSnapshot={agentLabSnapshot}
                  agentLabSubagents={agentLabSubagents}
                  agentLabSyncPreview={agentLabSyncPreview}
                  agentLabTrainingPreview={agentLabTrainingPreview}
                  attachments={attachments}
                  availableRightPanelTabs={availableRightPanelTabs}
                  contextEnabled={contextEnabled}
                  conversationEntities={conversationEntities}
                  featuredTrainingScenario={featuredTrainingScenario}
                  formatInlinePanelValue={formatInlinePanelValue}
                  formatRuntimeTimeLabel={formatRuntimeTimeLabel}
                  handleEnableNotifications={handleEnableNotifications}
                  handlePause={handlePause}
                  handleResetTasks={handleResetTasks}
                  handleRetry={handleRetry}
                  handleReuseTaskMission={handleReuseTaskMission}
                  isLightTheme={isLightTheme}
                  linkedAgentLabTaskRuns={linkedAgentLabTaskRuns}
                  loadAgentLabSnapshot={loadAgentLabSnapshot}
                  moduleWorkspaceCards={moduleWorkspaceCards}
                  notificationsEnabled={notificationsEnabled}
                  onOpenAiTask={() => router.push('/interno/ai-task')}
                  parseProviderPresentation={parseProviderPresentation}
                  ragSummary={ragSummary}
                  rightPanelTab={rightPanelTab}
                  routePath={routePath}
                  router={router}
                  runningCount={runningCount}
                  runAgentLabSync={runAgentLabSync}
                  runAgentLabTrainingScenario={runAgentLabTrainingScenario}
                  setRightPanelTab={setRightPanelTab}
                  setSelectedProjectFilter={setSelectedProjectFilter}
                  taskHistory={taskHistory}
                  TaskStatusChip={TaskStatusChip}
                  updateAgentLabIncidentItemStatus={updateAgentLabIncidentItemStatus}
                  updateAgentLabQueueItemStatus={updateAgentLabQueueItemStatus}
                  useCondensedRightRail={useCondensedRightRail}
                />
              )
            ) : null}
            shellClassName={`ml-auto flex h-full ${workspaceShellWidthClass} flex-col ${isLightTheme ? "border-l border-[#D7DEE8] bg-[rgba(255,255,255,0.72)]" : "border-l border-[#1C2623]/70 bg-[rgba(4,7,6,0.68)]"} shadow-[-24px_0_54px_rgba(0,0,0,0.24)]`}
            suppressInnerChrome={suppressInnerChrome}
            uiToasts={uiToasts}
          />
        ) : null}

      <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,application/pdf,text/plain,image/*,audio/*" onChange={handleFilesSelected} />
    </>
  );
}
