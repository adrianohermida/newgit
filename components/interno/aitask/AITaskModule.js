import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { useRouter } from "next/router";
import { getModuleHistory, setModuleHistory } from "../../../lib/admin/activity-log";
import {
  Bubble,
  ConfirmModal,
  ConversationComposer,
  ContextRail,
  LogRow,
  MetricPill,
  RunsPane,
  TaskInspector,
  ThinkingBlock,
  WorkspaceHeader,
} from "./AiTaskPanels";
import {
  buildAgentLanes,
  buildTaskColumns,
  filterLogsBySearch,
  filterLogsByType,
  findSelectedTask,
  moveTaskToStatus,
  normalizeAttachmentsFromEvent,
  paginateItems,
  reorderTaskInBoard,
  resolveAutomationLabel,
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
import { extractModuleKeysFromContext, resolveModuleEntries } from "../../../lib/admin/module-registry.js";
import {
  applyBrowserLocalOfflinePolicy,
  getBrowserLocalRuntimeConfig,
  hydrateBrowserLocalProviderOptions,
  persistBrowserLocalRuntimeConfig,
  probeBrowserLocalStackSummary,
} from "../../../lib/lawdesk/browser-local-runtime";
import { resolvePreferredLawdeskProvider } from "../../../lib/lawdesk/providers.js";
import { listSkills } from "../../../lib/lawdesk/skill_registry.js";
import { buildSupabaseLocalBootstrap } from "../../../lib/lawdesk/supabase-local-bootstrap.js";

function formatHistoryStatus(status) {
  const labels = {
    running: "Executando",
    done: "Concluído",
    failed: "Falhou",
    stopped: "Parado",
    idle: "Pronto",
  };
  return labels[status] || String(status || "Indefinido");
}

function nowIso() {
  return new Date().toISOString();
}

function extractFirstEmail(value = "") {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function buildAiTaskUiStorageKey(profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `hmadv_ai_task_ui_v2:${profileId}`;
}

function safeParseUiState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const MAX_THINKING = 20;
const MAX_LOGS = 200;

const QUICK_MISSIONS = [
  "Analise este processo e identifique os próximos passos",
  "Redija contestação com base nas alegações do cliente",
  "Crie plano de execução para audiência agendada",
  "Resuma documentos e identifique riscos",
];

const MODE_OPTIONS = [
  { value: "assisted", label: "Assistido" },
  { value: "auto", label: "Automático" },
  { value: "manual", label: "Manual" },
];

const FALLBACK_PROVIDER_OPTIONS = [
  { value: "gpt", label: "Nuvem principal", disabled: false },
  { value: "local", label: "LLM local", disabled: false },
  { value: "cloudflare", label: "Cloudflare Workers AI", disabled: false },
  { value: "custom", label: "Endpoint custom", disabled: false },
];

const FALLBACK_SKILL_OPTIONS = listSkills().map((skill) => ({
  value: skill.id,
  label: `${skill.name} · ${skill.category}`,
  disabled: false,
}));

function buildRagAlert(health) {
  if (!health || health.status === "operational") return null;
  const signals = health.signals || {};
  if (signals.supabaseAuthMismatch) {
    return {
      tone: "danger",
      title: "Embedding RAG bloqueado por autenticacao",
      body: "O Supabase respondeu com falha de autenticacao. Revise o DOTOBOT_SUPABASE_EMBED_SECRET no app e na function dotobot-embed.",
    };
  }
  if (signals.appEmbedSecretMissing) {
    return {
      tone: "warning",
      title: "Segredo do embed ausente no app",
      body: "O dashboard esta sem DOTOBOT_SUPABASE_EMBED_SECRET, entao embedding e consulta vetorial podem falhar ou ficar superficiais.",
    };
  }
  return {
    tone: "warning",
    title: "RAG degradado no momento",
    body: health.error || "Embedding, consulta vetorial ou persistencia de memoria nao estao integros. Abra o diagnostico para revisar secrets e backends.",
  };
}

function buildBlueprint(normalizedMission, profile, mode, provider) {
  const modules = detectModules(normalizedMission);
  const critical = requiresApproval(normalizedMission);
  const steps = [
    {
      id: "intake",
      title: "Receber missão",
      description: "Interpretar o pedido, identificar urgência e classificar a natureza da tarefa.",
      status: "pending",
      dependsOn: [],
      agent: "Dotobot",
      priority: "high",
    },
    {
      id: "context",
      title: "Recuperar contexto",
      description: "Buscar memória, documentos e sinais do módulo relevante antes de decidir o próximo passo.",
      status: "pending",
      dependsOn: ["intake"],
      agent: "Dotobot",
      priority: critical ? "high" : "medium",
    },
    {
      id: "plan",
      title: "Montar plano",
      description: "Quebrar a missão em tarefas executáveis com ordem, dependência e risco visível.",
      status: "pending",
      dependsOn: ["context"],
      agent: "Planner",
      priority: "high",
    },
    {
      id: "execute",
      title: "Executar tarefa principal",
      description: "Acionar o backend e executar a primeira ação relevante com transparência total.",
      status: "pending",
      dependsOn: ["plan"],
      agent: provider === "local" ? "Modelo local" : "Dotobot",
      priority: "high",
    },
    {
      id: "critic",
      title: "Validar resposta",
      description: "Checar consistência, risco jurídico, lacunas e necessidade de aprovação humana.",
      status: "pending",
      dependsOn: ["execute"],
      agent: "Critic",
      priority: "medium",
    },
  ];

  const thinking = [
    {
      id: "thought-intake",
      title: "Leitura da missão",
      timestamp: nowIso(),
      summary: `Interpretando solicitação como tarefa ${critical ? "crítica" : "operacional"} no modo ${mode}.`,
      details: [
        `Pedido normalizado: ${normalizedMission || "missão vazia"}`,
        `Módulos candidatos: ${modules.join(", ")}`,
        `Responsável visível: ${profile?.full_name || profile?.email || "Hermida Maia Advocacia"}`,
      ],
      expanded: true,
    },
    {
      id: "thought-context",
      title: "Contexto e memória",
      timestamp: nowIso(),
      summary: "Selecionando memória relevante e sinais do módulo atual.",
      details: [
        "Fontes candidatas: Supabase embeddings, Obsidian fallback, contexto de rota e perfil.",
        "Caso o contexto esteja insuficiente, a execução segue em modo conservador.",
      ],
      expanded: false,
    },
    {
      id: "thought-tools",
      title: "Seleção de ferramentas",
      timestamp: nowIso(),
      summary: `Ferramentas prováveis: ${modules.join(" + ")}.`,
      details: [
        "O orquestrador prioriza leitura, classificação, consolidação e validação antes de acionar ação sensível.",
        critical ? "Aprovação manual será exigida para etapas destrutivas ou sensíveis." : "Execução pode seguir sem bloqueio se o modo permitir.",
      ],
      expanded: false,
    },
  ];

  const tasks = steps.map((step, index) => ({
    id: `${Date.now()}_${index}`,
    title: step.title,
    goal: step.description,
    description: step.description,
    step,
    steps: [step.description],
    status: index === 0 ? "running" : "pending",
    priority: step.priority,
    assignedAgent: step.agent,
    created_at: nowIso(),
    updated_at: nowIso(),
    logs: [],
    dependencies: step.dependsOn,
  }));

  return {
    mission: normalizedMission,
    critical,
    modules,
    tasks,
    thinking,
  };
}

export default function AITaskModule({ profile, routePath }) {
  const router = useRouter();
  const missionInputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState(FALLBACK_PROVIDER_OPTIONS);
  const [skillCatalog, setSkillCatalog] = useState(FALLBACK_SKILL_OPTIONS);
  const [localStackSummary, setLocalStackSummary] = useState(null);
  const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
  const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
  const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());
  const [ragHealth, setRagHealth] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [taskViewMode, setTaskViewMode] = useState("kanban");
  const [taskVisibleCount, setTaskVisibleCount] = useState(8);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [taskBoardLayout, setTaskBoardLayout] = useState({});
  const [contact360Query, setContact360Query] = useState("");
  const [contact360Loading, setContact360Loading] = useState(false);
  const [contact360, setContact360] = useState(null);
  const uiStorageKey = useMemo(() => buildAiTaskUiStorageKey(profile), [profile]);
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
        setProviderCatalog(
          providers.map((item) => ({
            value: item.id,
            label: `${item.label}${item.model ? ` · ${item.model}` : ""}${item.status ? ` · ${item.status}` : ""}`,
            disabled: !item.available,
            displayLabel: item.label,
            model: item.model || null,
            status: item.status || null,
            transport: item.transport || null,
            runtimeMode: item.details?.probe?.mode || null,
            host: item.details?.config?.host || null,
            endpoint: item.details?.probe?.endpoint || item.details?.config?.baseUrl || null,
            reason: item.reason || null,
          }))
        );
        setProvider((current) =>
          resolvePreferredLawdeskProvider({
            currentProvider: current,
            defaultProvider,
            providers,
          })
        );
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
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
            resolvePreferredLawdeskProvider({
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
  }, [providerCatalog]);

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
    if (!localStackReady) return;
    setProvider((current) => (current === "gpt" || current === "cloudflare" ? "local" : current));
  }, [localStackReady, setProvider]);

  useEffect(() => {
    if (!localStackSummary?.offlineMode) return;
    setProvider((current) => (current === "local" ? current : "local"));
  }, [localStackSummary?.offlineMode, setProvider]);

  useEffect(() => {
    const currentOption = providerCatalog.find((item) => item.value === provider);
    if (!currentOption?.disabled) return;
    setProvider("local");
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
        resolvePreferredLawdeskProvider({
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = safeParseUiState(window.localStorage.getItem(uiStorageKey));
    if (!persisted) return;
    setHistoryPage(Number.isFinite(Number(persisted.historyPage)) ? Number(persisted.historyPage) : 1);
    setTaskViewMode(typeof persisted.taskViewMode === "string" ? persisted.taskViewMode : "kanban");
    setTaskVisibleCount(Number.isFinite(Number(persisted.taskVisibleCount)) ? Math.max(8, Number(persisted.taskVisibleCount)) : 8);
    setTaskBoardLayout(persisted.taskBoardLayout && typeof persisted.taskBoardLayout === "object" ? persisted.taskBoardLayout : {});
    setContact360Query(typeof persisted.contact360Query === "string" ? persisted.contact360Query : "");
    setContact360(persisted.contact360 && typeof persisted.contact360 === "object" ? persisted.contact360 : null);
  }, [uiStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(uiStorageKey, JSON.stringify({
      historyPage,
      taskViewMode,
      taskVisibleCount,
      taskBoardLayout,
      contact360Query,
      contact360,
    }));
  }, [contact360, contact360Query, historyPage, taskBoardLayout, taskViewMode, taskVisibleCount, uiStorageKey]);

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

  function handleTaskMove(taskId, nextStatus) {
    setTasks((current) => moveTaskToStatus(current, taskId, nextStatus, nowIso));
    setDraggedTaskId(null);
    setTaskBoardLayout((current) => ({
      ...current,
      [taskId]: {
        status: nextStatus,
        updatedAt: nowIso(),
      },
    }));
    pushLog({
      type: "control",
      action: "task_status_moved",
      result: `Tarefa movida para ${nextStatus}.`,
    });
  }

  function handleTaskBoardDrop(taskId, nextStatus, targetTaskId = null) {
    setTasks((current) => reorderTaskInBoard(current, taskId, nextStatus, targetTaskId, nowIso));
    setDraggedTaskId(null);
    setTaskBoardLayout((current) => ({
      ...current,
      [taskId]: {
        status: nextStatus,
        targetTaskId: targetTaskId || null,
        updatedAt: nowIso(),
      },
    }));
    pushLog({
      type: "control",
      action: "task_board_reordered",
      result: targetTaskId
        ? `Tarefa reposicionada em ${nextStatus} antes de ${targetTaskId}.`
        : `Tarefa enviada para a coluna ${nextStatus}.`,
    });
  }

  const taskColumns = useMemo(() => buildTaskColumns(tasks), [tasks]);
  const agentLanes = useMemo(() => buildAgentLanes(tasks), [tasks]);
  const visibleLogs = useMemo(() => filterLogsByType(logs, selectedLogFilter), [logs, selectedLogFilter]);
  const deferredSearch = useDeferredValue(search);
  const compactLogs = useMemo(() => filterLogsBySearch(visibleLogs, deferredSearch), [visibleLogs, deferredSearch]);
  const selectedTask = useMemo(() => findSelectedTask(tasks, selectedTaskId), [tasks, selectedTaskId]);
  const ragAlert = useMemo(() => buildRagAlert(ragHealth), [ragHealth]);
  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[1];
  const stateLabel = resolveAutomationLabel(automation);
  const historyPageSize = 6;
  const pagedHistoryMeta = useMemo(() => paginateItems(recentHistory, historyPage, historyPageSize), [historyPage, recentHistory]);
  const historyTotalPages = pagedHistoryMeta.totalPages;
  const pagedHistory = pagedHistoryMeta.items;
  const visibleTasks = useMemo(() => tasks.slice(0, taskVisibleCount), [taskVisibleCount, tasks]);
  const hasMoreTasks = visibleTasks.length < tasks.length;
  const contextModuleEntries = useMemo(() => {
    const moduleKeys = contextSnapshot?.module
      ? extractModuleKeysFromContext(contextSnapshot.module)
      : detectModules(mission || "");
    return resolveModuleEntries(moduleKeys);
  }, [contextSnapshot?.module, mission]);
  const moduleDrivenQuickMissions = useMemo(() => {
    const suggestions = contextModuleEntries.flatMap((entry) => [
      ...(entry?.quickMissions || []),
      ...((entry?.quickActions || []).map((action) => action.mission)),
    ]);
    return Array.from(new Set([...QUICK_MISSIONS, ...suggestions].filter(Boolean))).slice(0, 10);
  }, [contextModuleEntries]);

  useEffect(() => {
    setHistoryPage(1);
  }, [recentHistory.length]);

  useEffect(() => {
    if (taskViewMode !== "list") return;
    if (taskVisibleCount < 8) setTaskVisibleCount(8);
  }, [taskViewMode, taskVisibleCount]);

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
    setProvider(localStackReady && (nextHandoffProvider === "gpt" || nextHandoffProvider === "cloudflare") ? "local" : nextHandoffProvider);
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

  useEffect(() => {
    setModuleHistory("ai-task", {
      routePath: routePath || "/interno/ai-task",
      mission,
      automation,
      provider,
      mode,
      approved,
      paused,
      error: error || null,
      activeRun,
      latestResult: typeof latestResult === "string" ? latestResult.slice(0, 2000) : latestResult,
      executionSource,
      executionModel,
      eventsTotal,
      contextSnapshot,
      lastQuickAction,
      recentHistory: recentHistory.slice(0, 10),
      tasks: tasks.slice(0, 20),
      thinking: thinking.slice(0, 12),
      logs: logs.slice(-40),
      attachments,
      contact360,
      ui: {
        selectedLogFilter,
        search,
        showContext,
        showTasks,
        selectedTaskId,
        taskViewMode,
        historyPage,
        taskVisibleCount,
        taskBoardLayout,
      },
    });
  }, [
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
    latestResult,
    logs,
    mission,
    mode,
    paused,
    provider,
    recentHistory,
    routePath,
    search,
    selectedLogFilter,
    selectedTaskId,
    showContext,
    showTasks,
    taskBoardLayout,
    historyPage,
    tasks,
    taskViewMode,
    taskVisibleCount,
    thinking,
  ]);

  return (
    <div className="space-y-5">
        <WorkspaceHeader
          stateLabel={stateLabel}
          provider={provider}
          contextSnapshot={contextSnapshot}
          selectedSkillId={selectedSkillId}
          skillOptions={skillCatalog}
          providerOptions={providerCatalog}
          localStackSummary={localStackSummary}
          ragHealth={ragHealth}
          ragAlert={ragAlert}
          onProviderChange={setProvider}
          onSkillChange={setSelectedSkillId}
          activeModeLabel={activeMode.label}
        executionSource={executionSource}
        executionModel={executionModel}
        eventsTotal={eventsTotal}
        paused={paused}
        handlePause={handlePause}
        handleStop={() => setStopModalOpen(true)}
          handleContinueLastRun={handleContinueLastRun}
          handleApprove={handleApprove}
          handleOpenLlmTest={handleOpenLlmTest}
          handleOpenDiagnostics={handleOpenDiagnostics}
          handleOpenDotobot={handleOpenDotobot}
          handleRefreshLocalStack={refreshLocalStackStatus}
          handleLocalStackAction={handleLocalStackAction}
          localRuntimeConfigOpen={localRuntimeConfigOpen}
          onToggleLocalRuntimeConfig={() => setLocalRuntimeConfigOpen((current) => !current)}
          localRuntimeDraft={localRuntimeDraft}
          onLocalRuntimeDraftChange={setLocalRuntimeDraft}
          onSaveLocalRuntimeConfig={handleSaveLocalRuntimeConfig}
          refreshingLocalStack={refreshingLocalStack}
          formatExecutionSourceLabel={formatExecutionSourceLabel}
        />

      <div className="grid gap-5 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <RunsPane
          className="order-2 2xl:order-1"
          recentHistory={recentHistory}
          visibleHistory={pagedHistory}
          activeRunId={activeRun?.id || null}
          formatHistoryStatus={formatHistoryStatus}
          formatExecutionSourceLabel={formatExecutionSourceLabel}
          nowIso={nowIso}
          onSelectRun={handleSelectRun}
          historyPage={historyPage}
          historyTotalPages={historyTotalPages}
          onPrevPage={() => setHistoryPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))}
        />

        <section className="order-1 flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-[30px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[0_16px_48px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.02)] 2xl:order-2">
          <div className="border-b border-[#1B2925] bg-[rgba(255,255,255,0.015)] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Conversa ativa</p>
                <p className="mt-1 text-sm text-[#9BAEA8]">Missão, resposta, raciocínio e telemetria em uma trilha única.</p>
              </div>
              <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filtrar eventos"
                  className="h-10 w-full rounded-[14px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059] lg:w-40"
                />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
                  {["all", "api", "backend", "planner", "reporter", "control", "error", "warning"].map((filterType) => (
                    <button
                      key={filterType}
                      type="button"
                      onClick={() => setSelectedLogFilter(filterType)}
                      className={`shrink-0 rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                        selectedLogFilter === filterType
                          ? "border-[#C5A059] text-[#C5A059]"
                          : "border-[#22342F] text-[#7F928C] hover:border-[#35554B] hover:text-[#9BAEA8]"
                      }`}
                    >
                      {filterType === "all" ? "Todos" : filterType}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetricPill label="Executando" value={taskColumns.running.length} tone="accent" />
              <MetricPill label="Pendentes" value={taskColumns.pending.length} />
              <MetricPill label="Concluídas" value={taskColumns.done.length} tone="success" />
              <MetricPill label="Falhas" value={taskColumns.failed.length} tone="danger" />
            </div>
          </div>

          <div ref={chatViewportRef} className="min-h-[360px] flex-1 space-y-3 overflow-y-auto px-5 py-5">
            {mission ? <Bubble role="user" title="Missão" body={mission} time={activeRun?.startedAt || nowIso()} /> : null}
            {thinking.length ? thinking.map((block) => <ThinkingBlock key={block.id} block={block} />) : null}
            {latestResult ? <Bubble role="assistant" title="Hermida Maia IA" body={typeof latestResult === "string" ? latestResult : "Resultado estruturado entregue."} time={nowIso()} /> : null}
            {activeRun ? <Bubble role="system" title="Execução" body="Run em andamento com auditoria incremental." details={[`Run: ${activeRun.id}`, `Rota: ${routePath || "/interno/ai-task"}`]} time={nowIso()} /> : null}
            <div className="space-y-2">
              {compactLogs.slice(-80).map((log) => <LogRow key={log.id} log={log} />)}
            </div>
          </div>

          <ConversationComposer
            mission={mission}
            missionInputRef={missionInputRef}
            handleMissionChange={handleMissionChange}
            handleStart={handleStart}
            handleAttachmentChange={handleAttachmentChange}
            handleAttachmentDrop={handleAttachmentDrop}
            attachments={attachments}
            error={error}
            quickMissions={moduleDrivenQuickMissions}
            handleQuickMission={handleQuickMission}
          />
        </section>

        <div className="order-3 space-y-4">
          <TaskInspector
            tasks={tasks}
            visibleTasks={visibleTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            selectedTask={selectedTask}
            showTasks={showTasks}
            setShowTasks={setShowTasks}
            taskViewMode={taskViewMode}
            agentLanes={agentLanes}
            onTaskViewModeChange={setTaskViewMode}
            onTaskMove={handleTaskMove}
            onTaskBoardDrop={handleTaskBoardDrop}
            onDragTaskStart={setDraggedTaskId}
            draggedTaskId={draggedTaskId}
            hasMoreTasks={hasMoreTasks}
            onLoadMoreTasks={() => setTaskVisibleCount((current) => Math.min(tasks.length, current + 8))}
          />

          <ContextRail
            showContext={showContext}
            setShowContext={setShowContext}
            contextSnapshot={contextSnapshot}
            contextModuleEntries={contextModuleEntries}
            mission={mission}
            routePath={routePath}
            approved={approved}
            quickMissions={moduleDrivenQuickMissions}
            handleModuleAction={handleModuleAction}
            handleQuickMission={handleQuickMission}
            selectedTask={selectedTask}
            handleSendToDotobot={handleSendToDotobot}
            handleReplay={handleReplay}
            detectModules={detectModules}
            contact360Query={contact360Query}
            onContact360QueryChange={setContact360Query}
            onLoadContact360={handleLoadContact360}
            contact360Loading={contact360Loading}
            contact360={contact360}
          />
        </div>
      </div>

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
