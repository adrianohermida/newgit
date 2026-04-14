import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { TransitionGroup, CSSTransition } from "react-transition-group";

import { detectIntent } from "../../lib/ai/intent_router";
import { getCurrentContext } from "../../lib/ai/context_engine";
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
import { useInternalTheme } from "./InternalThemeProvider";
import { FocusedCopilotAside } from "./copilot";
import { cancelTaskRun, createPendingTaskRun, pollTaskRun, startTaskRun } from "./dotobotTaskRun";
import {
  buildCopilotContextPayload,
  buildContextualModuleHref,
  buildConversationRuntimeMetadata,
  extractConversationEntities,
  getConversationTimestamp,
  normalizeRightPanelTabs,
} from "./dotobotPanelContext";
import { buildLocalInferenceAlert, buildRagAlert } from "./dotobotPanelAlerts";
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
import { appendActivityLog, getModuleHistory, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";
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
  buildConversationSelectionState,
  buildDotobotGlobalContext,
  buildStorageKey,
  createConversationSnapshot,
  createEmptyConversation,
  deleteConversationFromCollection,
  extractAssistantResponseText,
  filterVisibleConversations,
  groupConversationsByProject,
  inferConversationTitle,
  isTaskCommand,
  loadPersistedDotobotState,
  mergeConversationAttachments,
  nowIso,
  safeText,
  summarizeConversation,
  syncConversationSnapshots,
  updateConversationCollection,
} from "./dotobotPanelState";
import {
  DOTOBOT_LAYOUT_STORAGE_PREFIX,
  LEGAL_ACTIONS,
  MODE_OPTIONS,
  MODULE_WORKSPACES,
  PROVIDER_OPTIONS,
  QUICK_PROMPTS,
  SKILL_OPTIONS,
  buildLocalStackUnavailableSummary,
  buildProjectInsights,
  inferCopilotModuleFromRoute,
  normalizeWorkspaceProvider,
  resolveWorkspaceProviderSelection,
  shouldHydrateBrowserLocalProvider,
} from "./dotobotPanelConfig";

function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    if (e?.name !== "QuotaExceededError" && e?.code !== 22) return;
    try {
      const parsed = JSON.parse(value);
      const trimmed = Array.isArray(parsed) ? parsed.slice(-Math.ceil(parsed.length / 2)) : parsed;
      window.localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {
      // quota insuficiente — silent fail
    }
  }
}

function safeLocalGet(key, fallback = "") {
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

// Utilitário para sumarizar contexto RAG
function buildRagSummary(rag) {
  if (!rag) return { count: 0, sources: [], documents: [] };
  const retrieval = rag.retrieval || rag.supabase || rag.context || {};
  const matches = retrieval.matches || retrieval.items || retrieval.results || [];
  const documents = rag.documents || retrieval.documents || [];
  const sources = [...new Set(matches.map((item) => item?.source || item?.source_key || item?.provider || "context"))];
  return {
    count: Array.isArray(matches) ? matches.length : 0,
    sources,
    documents,
  };
}


function buildModuleFallbackPlaybook(moduleKey, intentLabel, context = {}) {
  const playbooks = {
    processos: {
      summary:
        intentLabel === "analyze_case"
          ? "Priorize leitura de fatos, CNJ, polos e gaps operacionais antes de qualquer conclusão."
          : "Confirme CNJ, espelho operacional e consistência de vínculo com CRM antes de seguir.",
      steps: [
        "Validar identificadores do processo e se o contexto veio com CNJ ou referência confiável.",
        "Abrir a mesa de Processos para revisar backlog, polos faltantes e reflexos operacionais.",
        "Se houver impacto em atendimento ou CRM, encaminhar o caso com resumo curto para o módulo responsável.",
      ],
    },
    publicacoes: {
      summary: "Trate a fila, o reflexo e a extração de partes antes de reexecutar qualquer rotina pesada.",
      steps: [
        "Conferir se a publicação depende de processo já reconciliado e com partes válidas.",
        "Abrir Publicações para revisar fila, chunks de backfill e sinais de falha no reflexo.",
        "Se o caso for sensível, encaminhar handoff com número do processo e risco operacional observado.",
      ],
    },
    financeiro: {
      summary:
        intentLabel === "query_data"
          ? "Use o contexto para localizar recebível, deal ou referência de processo antes de reconciliar."
          : "Priorize reconciliação, vínculo com deals e bloqueios de publicação financeira.",
      steps: [
        "Confirmar se a missão fala de cobrança, recebível, account, deal ou referência processual.",
        "Abrir Financeiro em contexto para buscar o processo ou contrato relacionado.",
        "Se houver decisão humana pendente, mover o caso para Aprovações ou AI Task com resumo objetivo.",
      ],
    },
    agenda: {
      summary: "Cheque confirmação, preparação e handoff do compromisso antes de acionar qualquer automação.",
      steps: [
        "Validar nome, e-mail e horário do agendamento que motivou a conversa.",
        "Abrir Agenda para revisar status, follow-up e necessidade de preparo adicional.",
        "Se houver dependência processual ou comercial, encaminhar o compromisso com contexto concatenado.",
      ],
    },
    leads: {
      summary: "Qualifique origem, aderência e próximo passo comercial antes de movimentar o CRM.",
      steps: [
        "Conferir e-mail, origem e intenção comercial identificada na conversa.",
        "Abrir Leads em contexto para revisar triagem e possíveis vínculos com Contatos.",
        "Se o lead estiver maduro, preparar handoff para Agenda ou CRM com resumo de triagem.",
      ],
    },
    contatos: {
      summary: "Revise deduplicação, vínculo CRM e consistência cadastral antes de atualizar registros.",
      steps: [
        "Confirmar se a conversa trouxe e-mail, telefone ou identificador confiável do contato.",
        "Abrir Contatos para revisar duplicidade, enriquecimento e relacionamento com contas.",
        "Se houver conflito de dados, registrar a divergência e seguir com validação humana.",
      ],
    },
    jobs: {
      summary: "Olhe a fila e o gargalo antes de reexecutar jobs ou alterar lote em andamento.",
      steps: [
        "Identificar qual execução, fila ou backlog motivou a missão atual.",
        "Abrir Jobs para revisar estado, retries, volume e impacto operacional.",
        "Se a execução depender de módulo específico, fazer handoff com run, contexto e hipótese do gargalo.",
      ],
    },
    aprovacoes: {
      summary: "Avalie impacto, prioridade e dependências antes de decidir a fila de aprovação.",
      steps: [
        "Confirmar qual solicitação ou cadastro depende de decisão humana.",
        "Abrir Aprovações para revisar fila, risco e impacto da decisão pendente.",
        "Se houver dependência financeira ou cadastral, anexar resumo ao handoff correspondente.",
      ],
    },
  };

  return (
    playbooks[moduleKey] || {
      summary: "Defina o módulo responsável, consolide o contexto e avance com o próximo passo mais curto.",
      steps: [
        `Contexto atual: ${context.projectLabel || "Geral"}.`,
        "Abrir o módulo mais próximo da missão e confirmar os identificadores operacionais.",
        "Se a execução exigir acompanhamento, encaminhar a missão ao AI Task com resumo do objetivo.",
      ],
    }
  );
}

function buildLocalFallbackResponse({
  query,
  routePath,
  activeConversation,
  activeTask,
  globalContext,
  selectedSkillId,
  failureMode,
}) {
  const intent = detectIntent(String(query || ""));
  const uiContext = getCurrentContext({
    route: routePath || "/interno/copilot",
    entityId: activeConversation?.id || activeTask?.id,
    entityType: activeConversation?.projectKey || "conversation",
    recentActivity: Array.isArray(activeConversation?.messages) ? activeConversation.messages.slice(-3) : [],
    userRole: "admin",
  });
  const matchedModule = inferCopilotModuleFromRoute(routePath);
  const projectLabel = activeConversation?.projectLabel || matchedModule?.label || "Geral";
  const conversationTitle = activeConversation?.title || "Nova conversa";
  const nextRoute = matchedModule?.href || routePath || "/interno/copilot";
  const modulePlaybook = buildModuleFallbackPlaybook(
    activeConversation?.projectKey || matchedModule?.key || "geral",
    intent.intent,
    { projectLabel }
  );
  const nextAction =
    intent.intent === "generate_document"
      ? "Reunir fatos, base legal e pedido antes de abrir a tarefa de documento."
      : intent.intent === "create_task"
        ? "Quebrar a missão em etapas curtas e encaminhar para execução assistida."
        : modulePlaybook.summary;
  const runtimeIssueLabel =
    failureMode === "memory"
      ? "por memória"
      : failureMode === "inference"
        ? "porque o runtime local falhou ao responder"
        : "temporariamente";

  const checklist = [
    `Contexto ativo: ${projectLabel} (${uiContext.route}).`,
    `Conversa base: ${conversationTitle}.`,
    activeTask?.query ? `Missão atual: ${activeTask.query}.` : null,
    globalContext?.moduleHistory ? "Há histórico operacional disponível para handoff entre módulos." : null,
    selectedSkillId ? `Skill sugerida: ${selectedSkillId}.` : null,
  ].filter(Boolean);

  return [
    "Modo contingência local",
    `O LLM local ficou indisponível ${runtimeIssueLabel}, então gerei um playbook operacional para não interromper o fluxo.`,
    "",
    `Leitura rápida: ${nextAction}`,
    "",
    "Próximos passos",
    ...checklist.map((item, index) => `${index + 1}. ${item}`),
    ...modulePlaybook.steps.map((item, index) => `${checklist.length + index + 1}. ${item}`),
    `${checklist.length + modulePlaybook.steps.length + 1}. Abrir o fluxo em ${nextRoute} se você quiser continuar com contexto já preparado.`,
    `${checklist.length + modulePlaybook.steps.length + 2}. Se precisar de execução assistida, envie esta mesma missão para o AI Task.`,
    "",
    `Intenção detectada: ${intent.intent}.`,
    "Se quiser, eu continuo em modo contingência e estruturo isso como checklist, handoff ou plano por etapas.",
  ].join("\n");
}

function buildLocalFallbackActions({ routePath, activeConversation, activeTask }) {
  const matchedModule =
    inferCopilotModuleFromRoute(routePath) ||
    MODULE_WORKSPACES.find((item) => item.key === activeConversation?.projectKey) ||
    null;
  const projectLabel = activeConversation?.projectLabel || matchedModule?.label || "Geral";
  const entities = extractConversationEntities(activeConversation, activeTask);
  const routeTarget = matchedModule
    ? buildContextualModuleHref(matchedModule, {
        activeConversation,
        activeTask,
        routePath,
        projectLabel,
        entities,
      })
    : routePath || "/interno/copilot";
  const routeActionLabel =
    matchedModule?.label ? `Abrir ${matchedModule.label} em contexto` : "Abrir módulo em contexto";
  const missionText = String(
    activeTask?.query ||
    activeTask?.title ||
    activeTask?.mission ||
    activeConversation?.title ||
    activeConversation?.preview ||
    ""
  ).toLowerCase();
  const copilotContext = encodeURIComponent(
    buildCopilotContextPayload({
      module: matchedModule || { key: "agentlab" },
      activeConversation,
      activeTask,
      routePath,
      projectLabel,
    })
  );
  const agentLabTarget = missionText.match(/trein|score|avali|prompt|fallback|modelo/)
    ? `/interno/agentlab/training?copilotContext=${copilotContext}`
    : missionText.match(/conversa|mensagem|handoff|freshchat|cliente|thread/)
      ? `/interno/agentlab/conversations?copilotContext=${copilotContext}`
      : missionText.match(/workflow|intent|orquestra|playbook|agent/)
        ? `/interno/agentlab/orquestracao?copilotContext=${copilotContext}`
        : `/interno/agentlab/environment?copilotContext=${copilotContext}`;
  return [
    { id: "retry-runtime-local", label: "Tentar novamente", kind: "local_action", target: "retry_runtime_local" },
    { id: "open-context-route", label: routeActionLabel, kind: "route", target: routeTarget },
    { id: "open-ai-task", label: "Enviar ao AI Task", kind: "route", target: "/interno/ai-task" },
    { id: "open-agentlab", label: "Abrir trilha no AgentLab", kind: "route", target: agentLabTarget },
    { id: "open-runtime-config", label: "Editar runtime local", kind: "local_action", target: "open_runtime_config" },
    activeConversation?.id || activeTask?.id
      ? { id: "reuse-mission", label: "Reusar no composer", kind: "composer_seed", target: activeTask?.query || activeConversation?.title || "" }
      : null,
  ].filter(Boolean);
}

function buildConversationConcatBlock(conversation) {
  const transcript = Array.isArray(conversation?.messages)
    ? conversation.messages
        .slice(-12)
        .map((message) => `${message.role === "assistant" ? "Dotobot" : message.role === "system" ? "Sistema" : "Equipe"}: ${message.text}`)
        .join("\n")
    : "";
  return [
    `Projeto: ${conversation?.projectLabel || "Geral"}`,
    `Conversa: ${conversation?.title || "Sem titulo"}`,
    transcript ? `Transcricao:\n${transcript}` : "",
  ].filter(Boolean).join("\n\n");
}

const SLASH_COMMANDS = [
  { value: "/peticao", label: "Gerar peticao", hint: "Estrutura completa com fundamentos e pedidos." },
  { value: "/analise", label: "Analisar processo", hint: "Leitura juridica e riscos." },
  { value: "/plano", label: "Criar plano", hint: "Fluxo operacional com etapas." },
  { value: "/resumo", label: "Resumir documentos", hint: "Sintese tecnica e util." },
  { value: "/tarefas", label: "Ver tarefas", hint: "Abre o modo de acompanhamento operacional." },
];

const COPILOT_QUICK_SHORTCUTS = [
  { id: "command-k", label: "Ctrl/Cmd+K", detail: "foco no compositor" },
  { id: "command-dot", label: "Ctrl+.", detail: "abrir ou recolher" },
  { id: "command-1", label: "Ctrl/Cmd+1", detail: "módulos" },
  { id: "command-2", label: "Ctrl/Cmd+2", detail: "AI Task" },
  { id: "command-3", label: "Ctrl/Cmd+3", detail: "AgentLabs" },
  { id: "command-4", label: "Ctrl/Cmd+4", detail: "contexto" },
  { id: "shift-enter", label: "Shift+Enter", detail: "quebrar linha" },
  { id: "notifications", label: "Notificações", detail: "alerta de task finalizada" },
];

function detectAttachmentKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function normalizeAttachment(file) {
  const kind = detectAttachmentKind(file);
  return {
    kind,
    file,
    name: file.name || "Arquivo",
    size: file.size,
    type: file.type || "application/octet-stream",
    previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}

function getLastTask(taskHistory) {
  return taskHistory.find((task) => task.status === "running") || taskHistory[0] || null;
}

function TaskStatusChip({ status }) {
  const mapping = {
    queued: "Na fila",
    executing: "Executando",
    running: "Executando",
    paused: "Pausado",
    canceled: "Cancelado",
    error: "Erro",
    failed: "Falhou",
    ok: "Concluido",
    completed: "Concluido",
    done: "Concluido",
  };
  return <span>{mapping[status] || String(status || "Indefinido")}</span>;
}

function stringifyDiagnostic(value, limit = 12000) {
  if (value === undefined || value === null) return "";
  let text = "";
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildDiagnosticReport({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? String(summary).trim() : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

const DOTOBOT_CONSOLE_META = {
  consolePane: "dotobot",
  domain: "copilot",
  system: "chat",
};

const DOTOBOT_TASK_CONSOLE_META = {
  consolePane: ["dotobot", "functions", "jobs"],
  domain: "copilot-task",
  system: "task-run",
};

function DotobotModal({
  open,
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  inputLabel = null,
  inputValue = "",
  onInputChange = null,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const internalTheme = useInternalTheme();
  const isLightTheme = internalTheme?.isLightTheme === true;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(3,5,4,0.74)] px-4 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-[28px] border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.4)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F6F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))]"}`}>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#C5A059]"}`}>Hermida Maia Advocacia</p>
        <h3 className={`mt-3 text-xl font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{title}</h3>
        {body ? <p className={`mt-3 text-sm leading-7 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{body}</p> : null}
        {inputLabel ? (
          <label className="mt-4 block">
            <span className={`mb-2 block text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{inputLabel}</span>
            <input
              value={inputValue}
              onChange={(event) => onInputChange?.(event.target.value)}
              className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#152421] placeholder:text-[#94A3B8] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] text-[#F5F1E8] placeholder:text-[#60706A] focus:border-[#C5A059]"}`}
            />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full border px-4 py-2 text-sm transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#35554B]"}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-[#4f2525] bg-[rgba(91,45,45,0.24)] px-4 py-2 text-sm text-[#f2b2b2] transition hover:border-[#f2b2b2]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function getVoiceRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

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
  const suppressInnerChrome = isFocusedCopilotShell;
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
  // Estado de autenticaÃ§Ã£o/admin
  const { supabase, loading: supaLoading, configError } = useSupabaseBrowser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Valida sessÃ£o e perfil admin
  useEffect(() => {
    if (!supaLoading && supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        const session = data?.session;
        if (!session?.access_token) {
          setIsAdmin(false);
          setAuthChecked(true);
          return;
        }
        // Consulta perfil admin
        try {
          const res = await fetch("/api/admin-auth-config", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const payload = await res.json();
          setIsAdmin(!!payload?.ok);
        } catch {
          setIsAdmin(false);
        }
        setAuthChecked(true);
      });
    }
  }, [supabase, supaLoading]);
  // IntegraÃ§Ã£o com extensÃ£o
  const { extensionReady, lastResponse, sendCommand } = useDotobotExtensionBridge();

  // Exemplo: enviar comando para extensÃ£o ao detectar intenÃ§Ã£o especÃ­fica
  async function handleExtensionActionIfNeeded(intent, question) {
    if (!extensionReady) return;
    // Exemplo: se intenÃ§Ã£o for "web_search" ou "local_file_access"
    if (["web_search", "local_file_access"].includes(intent)) {
      await sendCommand(intent, { query: question });
    }
  }
  const router = useRouter();
  const chatStorageKey = useMemo(() => buildStorageKey(CHAT_STORAGE_PREFIX, profile), [profile]);
  const taskStorageKey = useMemo(() => buildStorageKey(TASK_STORAGE_PREFIX, profile), [profile]);
  const prefStorageKey = useMemo(() => buildStorageKey(PREF_STORAGE_PREFIX, profile), [profile]);
  const layoutStorageKey = useMemo(() => buildStorageKey(DOTOBOT_LAYOUT_STORAGE_PREFIX, profile), [profile]);
  const conversationStorageKey = useMemo(() => buildConversationStorageKey(profile), [profile]);
  const [messages, setMessages] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const [conversationSort, setConversationSort] = useState("recent"); // "recent" | "oldest" | "title"
  const [showArchived, setShowArchived] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiState, setUiState] = useState("idle");
  const [error, setError] = useState(null);

  function logDotobotUi(label, action, payload = {}, patch = {}) {
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "dotobot",
      component: patch.component || "DotobotPanel",
      label,
      action,
      method: patch.method || "UI",
      path: routePath || "/interno",
      page: routePath || "/interno",
      consolePane: patch.consolePane || DOTOBOT_CONSOLE_META.consolePane,
      domain: patch.domain || DOTOBOT_CONSOLE_META.domain,
      system: patch.system || DOTOBOT_CONSOLE_META.system,
      status: patch.status || "success",
      expectation: patch.expectation || label,
      request: patch.request || "",
      response: stringifyDiagnostic(payload),
      error: patch.error || "",
    });
  }

  function handleCopilotDebug() {
    appendActivityLog({
      label: "Debug UI (Copilot)",
      status: "success",
      method: "UI",
      action: "debug_copilot",
      path: routePath || "",
      page: routePath || "",
      module: "dotobot",
      component: "DotobotPanel",
      response: `Debug manual do copilot em ${routePath || "rota interna"}`,
      consolePane: "debug-ui",
      domain: "runtime",
      system: "copilot",
    });
  }

  // Estado colapsado
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  // Trigger global (Ctrl+.)
  useEffect(() => {
    function handleGlobalShortcut(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setIsCollapsed(false);
      }
    }
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, []);


const [workspaceOpen, setWorkspaceOpen] = useState(initialWorkspaceOpen);
const [mode, setMode] = useState(() => (isFullscreenCopilot ? "chat" : "task"));
const [provider, setProvider] = useState("gpt");
const [workspaceLayoutMode, setWorkspaceLayoutMode] = useState(() => (isFullscreenCopilot ? "immersive" : "snap"));
const [providerCatalog, setProviderCatalog] = useState(PROVIDER_OPTIONS);
const [skillCatalog, setSkillCatalog] = useState(SKILL_OPTIONS);
const [selectedSkillId, setSelectedSkillId] = useState("");
const [ragHealth, setRagHealth] = useState(null);
const [contextEnabled, setContextEnabled] = useState(true);
const [localStackSummary, setLocalStackSummary] = useState(null);
const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());
  const [rightPanelTab, setRightPanelTab] = useState(initialRightPanelTab);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");
const [agentLabSnapshot, setAgentLabSnapshot] = useState({ loading: false, error: null, data: null });
const [agentLabActionState, setAgentLabActionState] = useState({ loading: false, scope: null, message: null, tone: "idle" });
const [notificationsEnabled, setNotificationsEnabled] = useState(false);
const [uiToasts, setUiToasts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingRetrigger, setPendingRetrigger] = useState(null);
  const [lastConsumedAiTaskHandoffId, setLastConsumedAiTaskHandoffId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [renameModal, setRenameModal] = useState({ open: false, conversationId: null, value: "" });
  const [conversationMenuId, setConversationMenuId] = useState(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const taskStatusRef = useRef(new Map());
  const conversationMenuRef = useRef(null);
  const conversationSearchInputRef = useRef(null);
  const projectFilterRef = useRef(null);
  const agentLabSnapshotRequestedRef = useRef(false);
  const providerCatalogRequestedRef = useRef(false);
  const ragHealthRequestedRef = useRef(false);
  const localStackAutoprobeRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handleFocusComposer() {
      setWorkspaceOpen(true);
      requestAnimationFrame(() => {
        composerRef.current?.focus();
      });
    }
    window.addEventListener("hmadv:copilot-focus-composer", handleFocusComposer);
    return () => {
      window.removeEventListener("hmadv:copilot-focus-composer", handleFocusComposer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !conversationMenuId) return undefined;
    const handlePointerDown = (event) => {
      if (conversationMenuRef.current && !conversationMenuRef.current.contains(event.target)) {
        setConversationMenuId(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setConversationMenuId(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [conversationMenuId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedState = loadPersistedDotobotState({
      chatStorageKey,
      taskStorageKey,
      prefStorageKey,
      conversationStorageKey,
      initialWorkspaceOpen,
    });
    setConversations(persistedState.conversations);
    setActiveConversationId(persistedState.activeConversationId);
    setMessages(persistedState.messages);
    setTaskHistory(persistedState.taskHistory);
    setAttachments(persistedState.attachments);
    if (persistedState.prefs.mode && !isFullscreenCopilot) setMode(persistedState.prefs.mode);
    if (persistedState.prefs.provider && !isFullscreenCopilot) {
      setProvider(normalizeWorkspaceProvider(persistedState.prefs.provider, PROVIDER_OPTIONS));
    }
    if (typeof persistedState.prefs.selectedSkillId === "string") setSelectedSkillId(persistedState.prefs.selectedSkillId);
    if (typeof persistedState.prefs.contextEnabled === "boolean") setContextEnabled(persistedState.prefs.contextEnabled);
    setWorkspaceOpen(persistedState.prefs.workspaceOpen);
    const persistedLayoutMode = safeLocalGet(layoutStorageKey, isFullscreenCopilot ? "immersive" : "snap");
    if (["snap", "balanced", "immersive"].includes(persistedLayoutMode)) {
      setWorkspaceLayoutMode(isFullscreenCopilot ? "immersive" : persistedLayoutMode);
    }
    if (isFullscreenCopilot) {
      setMode("chat");
      setProvider((current) => normalizeWorkspaceProvider(current || "gpt", PROVIDER_OPTIONS));
      setWorkspaceLayoutMode("immersive");
      setRightPanelTab(initialRightPanelTab);
    }
  }, [chatStorageKey, taskStorageKey, prefStorageKey, layoutStorageKey, conversationStorageKey, initialWorkspaceOpen, initialRightPanelTab, isFullscreenCopilot]);

  useEffect(() => {
    if (providerCatalogRequestedRef.current) return undefined;
    providerCatalogRequestedRef.current = true;
    let active = true;
    let timeoutId = null;
    let idleId = null;
    const loadProviderCatalog = () => {
      adminFetch(`/api/admin-lawdesk-providers?include_health=${isFocusedCopilotShell ? 0 : 1}`, { method: "GET" })
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

  // Copilot sempre disponÃ­vel, apenas colapsa visualmente
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

  async function submitQuery(question, submitOptions = {}) {
    const trimmedQuestion = String(question || "").trim();
    if (!trimmedQuestion || loading) return;

    const nextAttachments = submitOptions.attachments || attachments;
    const nextMode = submitOptions.mode || mode;
    const nextProvider = normalizeWorkspaceProvider(submitOptions.provider || provider, providerCatalog);
    const nextContextEnabled = typeof submitOptions.contextEnabled === "boolean" ? submitOptions.contextEnabled : contextEnabled;

    setError(null);
    setLoading(true);
    setUiState("responding");

    // Adiciona mensagem do usuÃ¡rio
    setMessages((msgs) => [
      ...msgs,
      { role: "user", text: trimmedQuestion, createdAt: nowIso() },
    ]);
    // PATCH 8: scroll automÃ¡tico ao enviar
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);

    // Monta contexto global inteligente
    const globalContext = buildDotobotGlobalContext({
      routePath,
      profile,
      mode: nextMode,
      provider: nextProvider,
      selectedSkillId,
      contextEnabled: nextContextEnabled,
      activeConversationId,
      messages,
      attachments: nextAttachments,
    });

    // Detecta se Ã© comando de skill/task
    if (isTaskCommand(trimmedQuestion)) {
      // Dispara TaskRun
      setUiState("executing");
      const dotobotHandoff = {
        id: `${Date.now()}_dotobot_handoff`,
        label: "Tarefa criada no Dotobot",
        mission: trimmedQuestion,
        moduleKey: "dotobot",
        moduleLabel: "Dotobot",
        routePath: routePath || "/interno",
        mode: nextMode,
        provider: nextProvider,
        tags: ["ai-task", "dotobot", "task"],
        createdAt: nowIso(),
        conversationId: activeConversationId || null,
      };
      setModuleHistory("ai-task", {
        routePath: "/interno/ai-task",
        handoffFromDotobot: dotobotHandoff,
        consoleTags: dotobotHandoff.tags,
      });
      appendActivityLog({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        module: "ai-task",
        component: "DotobotTaskRun",
        label: "Dotobot: handoff para AI Task",
        action: "dotobot_to_ai_task_handoff",
        method: "UI",
        path: "/interno/ai-task",
        consolePane: ["dotobot", "ai-task"],
        domain: "handoff",
        system: "copilot",
        status: "success",
        tags: dotobotHandoff.tags,
        response: buildDiagnosticReport({
          title: "Handoff Dotobot -> AI Task",
          summary: trimmedQuestion,
          sections: [
            { label: "handoff", value: dotobotHandoff },
          ],
        }),
      });
      const pendingTask = createPendingTaskRun(trimmedQuestion, {
        mode: nextMode,
        provider: nextProvider,
        contextEnabled: nextContextEnabled,
      });
      setTaskHistory((tasks) => [
        pendingTask,
        ...tasks,
      ]);
      try {
        const data = await startTaskRun({
          query: trimmedQuestion,
          mode: nextMode,
          provider: nextProvider,
          contextEnabled: nextContextEnabled,
          selectedSkillId,
          context: globalContext,
        });
        const runId = data?.run?.id || null;
        if (runId) {
          setTaskHistory((tasks) =>
            tasks.map((task) =>
              task.id === pendingTask.id
                ? {
                    ...task,
                    id: runId,
                    status: data.status || "running",
                    logs: data.events?.map((event) => event?.message).filter(Boolean) || task.logs,
                  }
                : task
            )
          );
          logDotobotUi("Dotobot task run iniciado", "dotobot_task_started", {
            runId,
            query: trimmedQuestion,
            mode: nextMode,
            provider: nextProvider,
          }, { component: "DotobotTaskRun" });
          await pollTaskRun(runId, {
            onUpdate: (result) => {
              setTaskHistory((tasks) =>
                tasks.map((task) =>
                  task.id === runId
                    ? {
                        ...task,
                        status: result.status,
                        logs: result.events?.map((event) => event?.message).filter(Boolean) || [],
                        result: result.run?.result || result.resultText || null,
                        finishedAt: result.run?.updated_at || result.run?.finished_at || null,
                      }
                    : task
                )
              );
            },
          });
        } else {
          const taskError = data?.error || "Falha ao iniciar TaskRun.";
          setTaskHistory((tasks) =>
            tasks.map((task) =>
              task.id === pendingTask.id
                ? {
                    ...task,
                    status: "failed",
                    logs: [...(task.logs || []), taskError],
                  }
                : task
            )
          );
          setError(taskError);
          logDotobotUi("Dotobot task run rejeitado", "dotobot_task_rejected", data || {}, {
            component: "DotobotTaskRun",
            status: "error",
            error: buildDiagnosticReport({
              title: "Falha ao iniciar TaskRun",
              summary: taskError,
              sections: [
                { label: "request", value: { query: trimmedQuestion, mode: nextMode, provider: nextProvider } },
                { label: "response", value: data || null },
              ],
            }),
          });
        }
      } catch (err) {
        const message = err.message || "Erro ao executar TaskRun.";
        setTaskHistory((tasks) =>
          tasks.map((task) =>
            task.id === pendingTask.id
              ? {
                  ...task,
                  status: "failed",
                  logs: [...(task.logs || []), message],
                }
              : task
          )
        );
        setError(message);
        logDotobotUi("Dotobot task run falhou", "dotobot_task_error", null, {
          component: "DotobotTaskRun",
          status: "error",
          error: buildDiagnosticReport({
            title: "Erro ao executar TaskRun",
            summary: message,
            sections: [
              { label: "request", value: { query: trimmedQuestion, mode: nextMode, provider: nextProvider, contextEnabled: nextContextEnabled } },
              { label: "error", value: err?.payload || err?.stack || err },
            ],
          }),
        });
      }
      setLoading(false);
      setUiState("idle");
      return;
    }

    // Chat normal (streaming)
    try {
      const localProvider = isBrowserLocalProvider(nextProvider);
      const requestPath = localProvider ? "browser://local-ai-core/v1/messages" : "/api/admin-lawdesk-chat";
      const chatLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const chatStartedAt = Date.now();
      appendActivityLog({
        id: chatLogId,
        module: "dotobot",
        component: "DotobotChat",
        label: "Dotobot: enviar mensagem",
        action: "dotobot_chat_submit",
        method: "POST",
        path: requestPath,
        ...DOTOBOT_TASK_CONSOLE_META,
        expectation: "Enviar pergunta ao backend conversacional",
        request: buildDiagnosticReport({
          title: "Dotobot chat",
          summary: trimmedQuestion,
          sections: [
            { label: "query", value: trimmedQuestion },
            { label: "mode", value: nextMode },
            { label: "provider", value: nextProvider },
            { label: "contextEnabled", value: nextContextEnabled },
            { label: "selectedSkillId", value: selectedSkillId || null },
            { label: "attachments", value: nextAttachments },
            { label: "context", value: globalContext },
          ],
        }),
        status: "running",
        startedAt: chatStartedAt,
      });
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", text: "", createdAt: nowIso(), status: "thinking" },
      ]);
      setUiState("thinking");

      const data = localProvider
        ? await invokeBrowserLocalMessages({
            query: trimmedQuestion,
            mode: nextMode,
            routePath,
            contextEnabled: nextContextEnabled,
            context: globalContext,
          })
        : await adminFetch("/api/admin-lawdesk-chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: trimmedQuestion,
              mode: nextMode,
              provider: nextProvider,
              contextEnabled: nextContextEnabled,
              selectedSkillId,
              context: globalContext,
            }),
          });

      const assistantText = extractAssistantResponseText(data);
      setMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        return [
          ...msgs.slice(0, -1),
          { ...last, text: assistantText, status: "ok" },
        ];
      });

      updateActivityLog(chatLogId, {
        status: "success",
        durationMs: Date.now() - chatStartedAt,
        response: buildDiagnosticReport({
          title: "Dotobot chat response",
          summary: "Resposta concluida",
          sections: [
            { label: "endpoint", value: requestPath },
            { label: "payload", value: data },
          ],
        }),
        error: "",
      });
      setLoading(false);
      setUiState("idle");
    } catch (err) {
      const isLocalFallbackAvailable =
        isBrowserLocalProvider(nextProvider) &&
        (err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY" || err?.code === "LOCAL_RUNTIME_INFERENCE_FAILED");
      if (isLocalFallbackAvailable) {
        let fallbackText = "";
        let fallbackSummary = "";
        let executeFallbackPayload = null;
        if (err?.code === "LOCAL_RUNTIME_INFERENCE_FAILED") {
          try {
            executeFallbackPayload = await invokeBrowserLocalExecute({
              query: trimmedQuestion,
              context: {
                ...globalContext,
                browserLocalRuntime: {
                  surface: "copilot",
                  mode: String(nextMode || "chat"),
                  routePath: routePath || "/interno/copilot",
                  contextEnabled: Boolean(nextContextEnabled),
                  fallback: "execute_after_inference_failure",
                },
              },
            });
            const executeText =
              executeFallbackPayload?.result?.message ||
              executeFallbackPayload?.resultText ||
              (typeof executeFallbackPayload?.result === "string" ? executeFallbackPayload.result : "") ||
              "";
            if (executeText && !/No tool selected; step processed as reasoning-only action\./i.test(executeText)) {
              fallbackText = executeText;
              fallbackSummary = "Resposta operacional gerada por /execute após falha de inferência no runtime local.";
            }
          } catch {
            // Se /execute também falhar, seguimos para o playbook local estático.
          }
        }
        if (!fallbackText) {
          fallbackText = buildLocalFallbackResponse({
            query: trimmedQuestion,
            routePath,
            activeConversation,
            activeTask,
            globalContext,
            selectedSkillId,
            failureMode: err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY" ? "memory" : "inference",
          });
          fallbackSummary =
            err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY"
              ? "Resposta operacional gerada sem LLM por contingência de memória."
              : "Resposta operacional gerada sem LLM por falha de inferência no runtime local.";
        }
        setMessages((msgs) => {
          const last = msgs[msgs.length - 1];
          return [
            ...msgs.slice(0, -1),
            {
              ...last,
              text: fallbackText,
              status: "ok",
              fallback: true,
              actions: buildLocalFallbackActions({
                routePath,
                activeConversation,
                activeTask,
              }),
            },
          ];
        });
        updateActivityLog(chatLogId, {
          status: "success",
          durationMs: Date.now() - chatStartedAt,
          response: buildDiagnosticReport({
            title: "Dotobot chat fallback local",
            summary: fallbackSummary,
            sections: [
              { label: "endpoint", value: requestPath },
              { label: "error", value: err?.message || err },
              { label: "execute_payload", value: executeFallbackPayload },
              { label: "fallback", value: fallbackText },
            ],
          }),
          error: "",
        });
        setError(
          err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY"
            ? "LLM local sem memória suficiente. O Copilot respondeu com um playbook operacional de contingência."
            : "O runtime local falhou na inferência. O Copilot respondeu com um playbook operacional de contingência."
        );
        setLoading(false);
        setUiState("idle");
        return;
      }
      const authErrorType = String(err?.payload?.errorType || "");
      const message =
        err?.status === 401 || err?.status === 403 || ["authentication", "missing_session", "invalid_session", "inactive_profile", "missing_token"].includes(authErrorType)
          ? "Sua sessão administrativa expirou ou perdeu permissão. Faça login novamente no interno para reativar o chat do Dotobot."
          : err?.payload?.errorType === "admin_runtime_unavailable" || err?.status === 404 || err?.status === 405
            ? "O runtime administrativo do chat não está publicado neste deploy. O frontend está pronto, mas a rota /api/admin-lawdesk-chat precisa estar ativa no ambiente."
            : err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY"
              ? "Inferência local indisponível: a máquina não tem memória suficiente para o modelo atual. O painel segue operando em modo degradado."
              : err?.code === "LOCAL_RUNTIME_INFERENCE_FAILED"
                ? "Inferência local indisponível: o runtime local falhou ao responder. O painel segue operando em modo degradado."
                : err.message || "Erro ao conectar ao backend.";
      setError(message);
      setMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant" && !last?.text && last?.status === "thinking") {
          return msgs.slice(0, -1);
        }
        return msgs;
      });
      logDotobotUi("Dotobot chat falhou", "dotobot_chat_error", null, {
        component: "DotobotChat",
        status: "error",
        error: buildDiagnosticReport({
          title: "Erro ao conectar ao backend do Dotobot",
          summary: message,
          sections: [
            { label: "query", value: trimmedQuestion },
            { label: "mode", value: nextMode },
            { label: "provider", value: nextProvider },
            { label: "error", value: err?.stack || err },
          ],
        }),
      });
      setLoading(false);
      setUiState("idle");
    }



    // BotÃ£o flutuante de reabertura
  }

    const CollapsedTrigger = () => (
      isCollapsed && (
        <button
          type="button"
          className={`fixed z-[75] border border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[11px] font-semibold uppercase text-[#07110E] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:brightness-105 ${
            isCompactViewport
              ? "bottom-24 right-3 rounded-[18px] px-4 py-3 tracking-[0.18em]"
              : "bottom-24 right-4 rounded-[18px] px-4 py-3 tracking-[0.18em]"
          }`}
          onClick={() => setIsCollapsed(false)}
          title="Abrir Copilot (Ctrl + .)"
        >
          Abrir copilot
        </button>
      )
    );

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
      updateConversationById(activeConversationId, {
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
      updateConversationById(activeConversationId, {
        taskHistory: [],
      });
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(taskStorageKey);
    }
  }

  function handleComposerKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setWorkspaceOpen(true);
      composerRef.current?.focus();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }

    setShowSlashCommands(event.currentTarget.value.trimStart().startsWith("/"));
  }

  function handleFileDrop(fileList) {
    const files = Array.from(fileList || []).slice(0, MAX_ATTACHMENTS - attachments.length);
    if (!files.length) return;
    const normalized = files.map((file) => normalizeAttachment(file));
    setAttachments((current) => [...current, ...normalized].slice(0, MAX_ATTACHMENTS));
    if (activeConversationId) {
      setConversations((current) => mergeConversationAttachments(current, activeConversationId, normalized));
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

  function updateConversationById(conversationId, updater) {
    if (!conversationId) return;
    setConversations((current) => updateConversationCollection(current, conversationId, updater));
  }

  // ...existing code...
  function createConversationFromCurrentState(title = inferConversationTitle(messages)) {
    const nextConversation = createConversationSnapshot({
      title,
      messages,
      taskHistory,
      attachments,
      metadata: buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled, routePath }),
    });
    setConversations((current) => [nextConversation, ...current].slice(0, MAX_CONVERSATIONS));
    setActiveConversationId(nextConversation.id);
    return nextConversation;
  }

  function selectConversation(conversation) {
    const selectionState = buildConversationSelectionState(conversation);
    setActiveConversationId(selectionState.activeConversationId);
    setMessages(selectionState.messages);
    setTaskHistory(selectionState.taskHistory);
    setAttachments(selectionState.attachments);
    if (selectionState.metadata?.mode) setMode(selectionState.metadata.mode);
      if (selectionState.metadata?.provider) {
        setProvider(normalizeWorkspaceProvider(selectionState.metadata.provider, providerCatalog));
      }
    if (typeof selectionState.metadata?.selectedSkillId === "string") setSelectedSkillId(selectionState.metadata.selectedSkillId);
    if (typeof selectionState.metadata?.contextEnabled === "boolean") {
      setContextEnabled(selectionState.metadata.contextEnabled);
    }
    setError(null);
    setWorkspaceOpen(true);
    setTimeout(() => {
      scrollConversationToBottom();
    }, 80);
  }

  function handleConcatConversation(conversation) {
    const nextBlock = buildConversationConcatBlock(conversation);
    setInput((current) => [current, nextBlock].filter(Boolean).join("\n\n---\n\n"));
    setWorkspaceOpen(true);
    setTimeout(() => composerRef.current?.focus(), 60);
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

  async function runAgentLabSync(action, scopeLabel) {
    setAgentLabActionState({ loading: true, scope: action, message: null, tone: "idle" });
    try {
      const payload = await adminFetch("/api/admin-agentlab-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const message =
        payload?.result?.message ||
        (payload?.result?.unavailable
          ? payload.result.message
          : `${scopeLabel} executado com sucesso.`);
      setAgentLabActionState({
        loading: false,
        scope: action,
        message,
        tone: payload?.result?.unavailable ? "warning" : "success",
      });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({
        loading: false,
        scope: action,
        message: error?.message || `Falha ao executar ${scopeLabel}.`,
        tone: "error",
      });
    }
  }

  async function runAgentLabTrainingScenario(scenarioId) {
    if (!scenarioId) return;
    setAgentLabActionState({ loading: true, scope: scenarioId, message: null, tone: "idle" });
    try {
      const payload = await adminFetch("/api/admin-agentlab-training", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      const score = payload?.result?.run?.scores?.overall;
      setAgentLabActionState({
        loading: false,
        scope: scenarioId,
        message: `Treino executado. Score geral ${score != null ? `${Math.round(Number(score) * 100)}%` : "indisponível"}.`,
        tone: "success",
      });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({
        loading: false,
        scope: scenarioId,
        message: error?.message || "Falha ao executar treinamento.",
        tone: "error",
      });
    }
  }

  async function updateAgentLabQueueItemStatus(item, status) {
    if (!item?.id) return;
    setAgentLabActionState({ loading: true, scope: item.id, message: null, tone: "idle" });
    try {
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_queue_item",
          id: item.id,
          status,
          priority: item.priority || "media",
        }),
      });
      setAgentLabActionState({
        loading: false,
        scope: item.id,
        message: `Fila atualizada para ${status}.`,
        tone: "success",
      });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({
        loading: false,
        scope: item.id,
        message: error?.message || "Falha ao atualizar fila.",
        tone: "error",
      });
    }
  }

  async function updateAgentLabIncidentItemStatus(item, status) {
    if (!item?.id) return;
    setAgentLabActionState({ loading: true, scope: item.id, message: null, tone: "idle" });
    try {
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_incident_item",
          id: item.id,
          status,
          severity: item.severity || "media",
          description: item.title || null,
        }),
      });
      setAgentLabActionState({
        loading: false,
        scope: item.id,
        message: `Incidente atualizado para ${status}.`,
        tone: "success",
      });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({
        loading: false,
        scope: item.id,
        message: error?.message || "Falha ao atualizar incidente.",
        tone: "error",
      });
    }
  }

  function renameConversation(conversation) {
    const currentTitle = conversation?.title || inferConversationTitle(conversation?.messages || []);
    setRenameModal({
      open: true,
      conversationId: conversation?.id || null,
      value: currentTitle,
    });
  }

  function archiveConversation(conversation) {
    updateConversationById(conversation.id, (current) => ({ archived: !current.archived }));
  }

  async function shareConversation(conversation) {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${routePath || "/interno/copilot"}?conversation=${conversation.id}`;
    const shareText = `${conversation.title || "Conversa"}\n${shareUrl}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
      pushUiToast({
        tone: "success",
        title: "Conversa copiada",
        body: "O link e o título da conversa foram copiados para compartilhamento interno.",
      });
    } catch {
      pushUiToast({
        tone: "warn",
        title: "Compartilhamento manual",
        body: "Não foi possível copiar automaticamente. Use o menu do navegador para copiar a URL atual.",
      });
    }
  }

  function deleteConversation(conversation) {
    setConfirmModal({
      title: "Excluir conversa",
      body: `Deseja excluir a conversa "${conversation.title || "sem título"}"?`,
      confirmLabel: "Excluir",
      onConfirm: () => {
        const remaining = deleteConversationFromCollection(conversations, conversation.id);
        if (remaining.length) {
          setConversations(remaining);
          if (conversation.id === activeConversationId) {
            selectConversation(remaining[0]);
          }
          setConfirmModal(null);
          return;
        }
        const replacement = createEmptyConversation(
          "Nova conversa",
          buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled, routePath })
        );
        setConversations([replacement]);
        setActiveConversationId(replacement.id);
        setMessages([]);
        setTaskHistory([]);
        setAttachments([]);
        if (conversation.id === activeConversationId) {
          selectConversation(replacement);
        }
        setConfirmModal(null);
      },
    });
  }

  function renderConversationMenu(conversation, { compact = false } = {}) {
    const open = conversationMenuId === conversation.id;
    return (
      <div ref={open ? conversationMenuRef : null} className="relative">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setConversationMenuId((current) => (current === conversation.id ? null : conversation.id));
          }}
          className={`rounded-full border px-2 py-1 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
          aria-label="Ações da conversa"
          aria-expanded={open}
        >
          ⋮
        </button>
        {open ? (
          <div
            className={`absolute ${compact ? "right-0 top-[calc(100%+6px)]" : "right-0 top-[calc(100%+8px)]"} z-20 w-44 overflow-hidden rounded-[16px] border shadow-[0_18px_38px_rgba(0,0,0,0.18)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(12,15,14,0.98)]"}`}
          >
            {[
              { key: "share", label: "Compartilhar", action: () => shareConversation(conversation) },
              { key: "archive", label: conversation.archived ? "Desarquivar" : "Arquivar", action: () => archiveConversation(conversation) },
              { key: "rename", label: "Renomear", action: () => renameConversation(conversation) },
              { key: "delete", label: "Excluir", action: () => deleteConversation(conversation) },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConversationMenuId(null);
                  item.action();
                }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] transition ${isLightTheme ? "text-[#22312F] hover:bg-[#F7F9FC]" : "text-[#D8DEDA] hover:bg-[rgba(255,255,255,0.03)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  // ...existing code...

  function attachFilesToConversation(conversationId, files) {
    const attachmentsToAdd = Array.from(files || [])
      .slice(0, MAX_ATTACHMENTS)
      .map((file) => normalizeAttachment(file));
    if (!attachmentsToAdd.length) return;
    if (!conversationId) {
      setAttachments((current) => [...current, ...attachmentsToAdd].slice(0, MAX_ATTACHMENTS));
      return;
    }
    setConversations((current) => mergeConversationAttachments(current, conversationId, attachmentsToAdd));
    if (conversationId === activeConversationId) {
      setAttachments((current) => [...current, ...attachmentsToAdd].slice(0, MAX_ATTACHMENTS));
    }
  }

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
        ? "lg:grid-cols-[280px_minmax(0,1fr)_280px] xl:grid-cols-[300px_minmax(0,1fr)_300px] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]"
        : "lg:grid-cols-[320px_minmax(0,1.6fr)_320px] xl:grid-cols-[360px_minmax(0,2.05fr)_360px] 2xl:grid-cols-[420px_minmax(0,2.45fr)_420px]"
      : effectiveWorkspaceLayout === "balanced"
        ? "lg:grid-cols-[220px_minmax(0,1.25fr)_240px] xl:grid-cols-[240px_minmax(0,1.5fr)_260px] 2xl:grid-cols-[260px_minmax(0,1.65fr)_280px]"
        : "lg:grid-cols-[180px_minmax(0,1fr)_220px] xl:grid-cols-[190px_minmax(0,1.12fr)_240px] 2xl:grid-cols-[210px_minmax(0,1.2fr)_260px]";
  const focusedShellContentClass = suppressInnerChrome ? "px-0 pt-0 pb-0" : "p-3 md:p-5";
  const workspaceGridGapClass = isConversationCentricShell ? "gap-px" : "gap-4";
  const leftRailShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "h-full min-h-full overflow-hidden border-r border-y-0 border-l-0 border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(246,249,252,0.995))] rounded-none shadow-none"
      : "h-full min-h-full overflow-hidden border-r border-y-0 border-l-0 border-[#1C2623] bg-[rgba(9,11,10,0.985)] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[22px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,251,0.98))]"
      : "rounded-[22px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#1C2623] bg-[rgba(255,255,255,0.018)]";
  const centerShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "min-h-full border-x border-y-0 border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,249,252,0.99))] rounded-none shadow-none"
      : "min-h-full border-x border-y-0 border-[#1C2623] bg-[rgba(11,13,12,0.985)] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[24px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.98))]"
      : "rounded-[24px] border shadow-[0_18px_48px_rgba(0,0,0,0.18)] border-[#1C2623] bg-[rgba(255,255,255,0.015)]";
  const rightRailShellClass = isFocusedCopilotShell
    ? isLightTheme
      ? "h-full min-h-full overflow-hidden border-l border-y-0 border-r-0 border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(246,249,252,0.995))] rounded-none shadow-none"
      : "h-full min-h-full overflow-hidden border-l border-y-0 border-r-0 border-[#1C2623] bg-[rgba(9,11,10,0.985)] rounded-none shadow-none"
    : isLightTheme
      ? "rounded-[24px] border border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,247,250,0.98))]"
      : "rounded-[24px] border border-[#1C2623] bg-[rgba(255,255,255,0.015)]";
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0] || null;
  const focusedConversationColumnClass = isFocusedCopilotShell ? "mx-auto flex h-full w-full max-w-[920px] flex-col" : isRailConversationShell ? "w-full" : "";
  const useCondensedRightRail = isFocusedCopilotShell;
  const visibleLegalActions = isFocusedCopilotShell || isRailConversationShell ? [] : LEGAL_ACTIONS.slice(0, isCompactViewport ? 1 : 3);
  const visibleQuickPrompts = isFocusedCopilotShell ? [] : QUICK_PROMPTS.slice(0, isCompactViewport ? 1 : isConversationCentricShell ? 1 : 2);
  const filteredConversations = useMemo(() => {
    let nextConversations = filterVisibleConversations(conversations, deferredConversationSearch);
    if (!showArchived) {
      nextConversations = nextConversations.filter((conversation) => !conversation.archived);
    }
    if (selectedProjectFilter !== "all") {
      nextConversations = nextConversations.filter((conversation) => conversation.projectKey === selectedProjectFilter);
    }
    if (conversationSort === "recent") {
      return nextConversations
        .slice()
        .sort((a, b) => getConversationTimestamp(b.updatedAt || b.createdAt) - getConversationTimestamp(a.updatedAt || a.createdAt));
    }
    if (conversationSort === "oldest") {
      return nextConversations
        .slice()
        .sort((a, b) => getConversationTimestamp(a.updatedAt || a.createdAt) - getConversationTimestamp(b.updatedAt || b.createdAt));
    }
    if (conversationSort === "title") {
      return nextConversations.slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return nextConversations;
  }, [conversationSort, conversations, deferredConversationSearch, selectedProjectFilter, showArchived]);
  const conversationProjectGroups = useMemo(() => groupConversationsByProject(filteredConversations), [filteredConversations]);
  const visibleConversationsByProject = useMemo(
    () => groupConversationsByProject(conversations.filter((conversation) => showArchived || !conversation.archived)),
    [conversations, showArchived]
  );
  const conversationBucketsByProjectKey = useMemo(() => {
    const buckets = new Map();
    for (const conversation of conversations) {
      const key = conversation?.projectKey || "geral";
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push(conversation);
    }
    return buckets;
  }, [conversations]);
  const projectInsights = useMemo(
    () => buildProjectInsights(visibleConversationsByProject),
    [visibleConversationsByProject]
  );
  const activeProjectLabel = activeConversation?.projectLabel || "Geral";
  const conversationEntities = useMemo(() => extractConversationEntities(activeConversation, activeTask), [activeConversation, activeTask]);
  const moduleWorkspaceCards = useMemo(() => MODULE_WORKSPACES.map((module) => {
    const matchedConversations = conversationBucketsByProjectKey.get(module.key) || [];
    return {
      ...module,
      count: matchedConversations.length,
      active: activeConversation?.projectKey === module.key || String(routePath || "").includes(module.key.replace("_", "-")),
      latestConversation: matchedConversations[0]?.title || null,
      contextualHref: buildContextualModuleHref(module, {
        activeConversation,
        activeTask,
        routePath,
        projectLabel: activeProjectLabel,
        entities: conversationEntities,
      }),
    };
  }), [activeConversation, activeProjectLabel, activeTask, conversationBucketsByProjectKey, conversationEntities, routePath]);
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
  const activeRightPanelMeta = useMemo(
    () => RIGHT_PANEL_META[rightPanelTab] || RIGHT_PANEL_META[availableRightPanelTabs[0]] || RIGHT_PANEL_META.modules,
    [availableRightPanelTabs, rightPanelTab]
  );
  const agentLabData = agentLabSnapshot.data || null;
  const agentLabSubagents = useMemo(() => extractAgentLabSubagents(agentLabSnapshot.data, activeTask), [activeTask, agentLabSnapshot.data]);
  const agentLabOverview = agentLabData?.overview || {};
  const agentLabEnvironment = agentLabData?.environment || {};
  const agentLabConversationSummary = agentLabData?.conversations?.summary || {};
  const agentLabIncidentsSummary = agentLabData?.intelligence?.summary || {};
  const agentLabTrainingSummary = agentLabData?.training?.summary || {};
  const agentLabQueuePreview = useMemo(() => buildAgentLabQueuePreview(agentLabData?.governance?.queue || []), [agentLabData?.governance?.queue]);
  const agentLabSyncPreview = useMemo(() => buildAgentLabSyncPreview(agentLabData?.intelligence?.syncRuns || []), [agentLabData?.intelligence?.syncRuns]);
  const agentLabTrainingPreview = useMemo(() => buildAgentLabTrainingPreview(agentLabData?.training?.runs || []), [agentLabData?.training?.runs]);
  const agentLabIncidentPreview = useMemo(() => buildAgentLabIncidentPreview(agentLabData?.intelligence?.incidents || []), [agentLabData?.intelligence?.incidents]);
  const featuredTrainingScenario = useMemo(() =>
    (agentLabData?.training?.scenarios || []).find((item) => item?.agent_ref === "dotobot-ai") ||
    (agentLabData?.training?.scenarios || [])[0] ||
    null, [agentLabData?.training?.scenarios]);
  const linkedAgentLabTaskRuns = useMemo(() => buildLinkedDotobotTaskRuns(agentLabData?.dotobot?.taskRuns || [], {
    routePath,
    activeTask,
    activeConversation,
  }), [activeConversation, activeTask, agentLabData?.dotobot?.taskRuns, routePath]);
  const agentLabHealthSignals = useMemo(() => [
    {
      label: "Ambiente",
      value: agentLabEnvironment.mode === "connected" ? "conectado" : agentLabEnvironment.mode === "degraded" ? "contingência" : "parcial",
    },
    {
      label: "RAG",
      value: agentLabEnvironment.dotobotRagHealth?.ok ? "ok" : "atenção",
    },
    {
      label: "Providers",
      value: `${agentLabEnvironment.lawdeskProvidersHealth?.summary?.operational || 0} online`,
    },
    {
      label: "Threads",
      value: String(agentLabConversationSummary.total || 0),
    },
  ], [agentLabConversationSummary.total, agentLabEnvironment.dotobotRagHealth?.ok, agentLabEnvironment.lawdeskProvidersHealth?.summary?.operational, agentLabEnvironment.mode]);
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

  // Exemplo de fluxo de login Supabase
  async function handleLogin() {
    router.push("/interno/login");
  }

  // Alerta visual de login/admin ausente
  if (!authChecked || supaLoading) {
    return <div className="p-8 text-center text-lg text-[#C5A059]">Verificando autenticaÃ§Ã£o...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="mb-6 text-2xl text-[#C5A059]">âš ï¸ Acesso restrito</div>
        <div className="mb-4 text-[#EAE3D6]">FaÃ§a login como administrador para usar o Dotobot.</div>
        <button
          className="rounded-xl bg-[#D9B46A] px-6 py-3 text-lg font-bold text-[#1A1A1A] transition hover:bg-[#C5A059]"
          onClick={handleLogin}
        >
          Login admin
        </button>
      </div>
    );
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
          updateConversationById(renameModal.conversationId, {
            title: nextTitle,
          });
          setRenameModal({ open: false, conversationId: null, value: "" });
        }}
      />
      {showCollapsedTrigger ? <CollapsedTrigger /> : null}
      {!isCollapsed && !embeddedInInternoShell ? (
        <section className={`min-h-0 overflow-hidden rounded-[26px] border shadow-[0_18px_44px_rgba(0,0,0,0.22)] backdrop-blur-sm ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FCFDFE,#F3F7FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(10,12,11,0.98),rgba(8,10,9,0.98))]"} ${compactRail ? "" : "mr-10 md:mr-0"}`}>
        <header className={`border-b px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Copilot</p>
              <div className="mt-2 flex items-center gap-3">
                <h3 className={`text-lg font-semibold tracking-[-0.02em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Dotobot</h3>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                  <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                  {activeStatus === "processing" ? uiStateLabel : "Idle"}
                </span>
              </div>
              <p className={`mt-2 max-w-md text-xs leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#8FA19B]"}`}>
                {isFocusedCopilotShell
                  ? fullscreenConversationSubtitle
                  : isCompactViewport
                    ? "Chat inteligente para orientar próximas ações."
                    : "Conversa assistida com contexto, histórico e próximos passos em um só lugar."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                  Provider: {activeProviderPresentation.name}
                </span>
                {!isFocusedCopilotShell ? (
                  <span className={`rounded-full border px-3 py-1.5 ${localStackTone}`}>
                    {localStackLabel}
                  </span>
                ) : null}
                {activeProviderPresentation.meta.map((item) => (
                  <span key={item} className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                    {item}
                  </span>
                ))}
                {!isFocusedCopilotShell && localStackSummary?.runtimeBaseUrl ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    runtime {localStackSummary.runtimeBaseUrl}
                  </span>
                ) : null}
                {!isFocusedCopilotShell && localStackSummary?.localProvider?.transport ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    {localRuntimeLabel}
                  </span>
                ) : null}
                {!isFocusedCopilotShell && capabilitiesSkills?.total ? (
                  <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                    Skills {capabilitiesSkills.total}
                  </span>
                ) : null}
                {!isFocusedCopilotShell && capabilitiesCommands?.executable ? (
                  <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                    Comandos {capabilitiesCommands.executable}/{capabilitiesCommands.total}
                  </span>
                ) : null}
                {!isFocusedCopilotShell && activeBrowserProfile?.label ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    Extensao {activeBrowserProfile.label}
                  </span>
                ) : null}
                {!isFocusedCopilotShell && activeProviderPresentation.endpoint ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    {activeProviderPresentation.endpoint}
                  </span>
                ) : null}
              </div>
              {localStackSummary && !isFocusedCopilotShell ? (
                <p className={`mt-2 max-w-2xl text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>
                  {localStackReady
                    ? `Modo local disponível${localStackSummary.offlineMode ? " em operação offline" : ""} com ${localStackSummary.localProvider?.model || "modelo local"}.`
                    : "O modo local ainda não respondeu; siga com a nuvem principal ou ative sua infraestrutura local quando precisar."}
                </p>
              ) : null}
              {showConversationCockpitCards ? <div className="mt-4 grid gap-3">
                <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#E6D29A] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_60%),#FFFDF7]" : "border-[#3C3320] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.14),transparent_60%),rgba(255,255,255,0.02)]"}`}>
                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#D9B46A]"}`}>Resumo</p>
                  <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
                  <p className={`mt-2 line-clamp-3 text-[12px] leading-6 ${isLightTheme ? "text-[#51606B]" : "text-[#C6D1CC]"}`}>{activeConversationPreview}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#E6D29A] bg-[#FFF6DF] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>
                      histórico {filteredConversations.length}
                    </span>
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                      mensagens {messages.length}
                    </span>
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                      tarefas {taskHistory.length}
                    </span>
                  </div>
                </div>

                <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Missão em foco</p>
                      <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskLabel}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                      runningCount ? "border-[#C5A059] text-[#F1D39A]" : "border-[#22342F] text-[#9BAEA8]"
                    }`}>
                      {runningCount ? `${runningCount} ativa(s)` : "sem execução"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                      provider {activeTaskProviderLabel}
                    </span>
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                      etapas {activeTaskStepCount}
                    </span>
                    {activeConversationTimestamp ? (
                      <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                        {new Date(activeConversationTimestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div> : null}
              {showRuntimeOpsFullscreen && offlineHealthSnapshot.items.length ? (
                <div className="mt-3 flex max-w-3xl flex-wrap gap-2">
                  {offlineHealthSnapshot.items.map((item) => (
                    <span
                      key={item.id}
                      title={formatInlinePanelValue(item.detail || item.value)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] ${
                        item.tone === "success"
                          ? "border-[#234034] text-[#8FCFA9]"
                          : item.tone === "danger"
                            ? "border-[#5b2d2d] text-[#f2b2b2]"
                            : "border-[#3B3523] text-[#D9C38A]"
                      }`}
                    >
                      {item.label}: {formatInlinePanelValue(item.value)}
                    </span>
                  ))}
                </div>
              ) : null}
              {showRuntimeOpsFullscreen && localBootstrapPlan.steps.length ? (
                <div className={`mt-4 rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Bootstrap local</p>
                      <p className={`mt-1 text-sm ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                        {localBootstrapPlan.requiredCompleted}/{localBootstrapPlan.requiredTotal} etapas essenciais concluídas
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1.5 text-[11px] ${
                      localBootstrapPlan.readyForOfflineCore
                        ? "border-[#234034] text-[#8FCFA9]"
                        : "border-[#3B3523] text-[#D9C38A]"
                    }`}>
                      {localBootstrapPlan.readyForOfflineCore ? "Offline core pronto" : "Setup em andamento"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {localBootstrapPlan.steps.map((step) => (
                      <div key={step.id} className={`rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.65)]"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={`text-[11px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{step.title}</p>
                            <p className={`mt-1 text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{step.detail}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                            step.done
                              ? "border-[#234034] text-[#8FCFA9]"
                              : step.optional
                                ? "border-[#3B3523] text-[#D9C38A]"
                                : "border-[#5b2d2d] text-[#f2b2b2]"
                          }`}>
                            {step.done ? "OK" : step.optional ? "Opcional" : "Pendente"}
                          </span>
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleLocalStackAction(step.action)}
                            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                          >
                            {step.action === "testar_llm_local" ? "Testar runtime" : "Abrir diagnóstico"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {showRuntimeOpsFullscreen ? <div className={`mt-4 rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.7)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Persistência local</p>
                    <p className={`mt-1 text-sm ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{supabaseBootstrap.label}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-[11px] ${
                    supabaseBootstrap.tone === "success"
                      ? "border-[#234034] text-[#8FCFA9]"
                      : supabaseBootstrap.tone === "danger"
                        ? "border-[#5b2d2d] text-[#f2b2b2]"
                        : "border-[#3B3523] text-[#D9C38A]"
                  }`}>
                    {supabaseBootstrap.baseUrlKind === "local"
                      ? "Local"
                      : supabaseBootstrap.baseUrlKind === "remote"
                        ? "Remoto"
                        : "Não verificado"}
                  </span>
                </div>
                <p className={`mt-2 text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                  {supabaseBootstrap.detail}
                  {supabaseBootstrap.baseUrlPreview ? ` Endpoint atual: ${supabaseBootstrap.baseUrlPreview}.` : ""}
                </p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className={`rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Envs sugeridas</p>
                    <div className="mt-2 space-y-2">
                      {supabaseBootstrap.envs.map((line) => (
                        <p key={line} className={`rounded-2xl border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.75)] text-[#C6D1CC]"}`}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className={`rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Bootstrap Supabase local</p>
                    <div className="mt-2 space-y-2">
                      {supabaseBootstrap.commands.map((line) => (
                        <p key={line} className={`rounded-2xl border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.75)] text-[#C6D1CC]"}`}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={`mt-3 rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                  <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Schema offline</p>
                  <div className="mt-2 grid gap-2 xl:grid-cols-2">
                    {supabaseBootstrap.schema.map((item) => (
                      <div key={item.id} className={`rounded-2xl border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.75)]"}`}>
                        <p className={`text-[11px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.label}</p>
                        <p className={`mt-1 text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{item.detail}</p>
                        <p className={`mt-2 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{item.migration}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {supabaseBootstrap.actions.map((actionId) => (
                    <button
                      key={actionId}
                      type="button"
                      onClick={() => handleLocalStackAction(actionId)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                    >
                      {actionId === "retry_runtime_local"
                        ? "Tentar novamente"
                        : actionId === "open_runtime_config"
                        ? "Editar runtime local"
                        : actionId === "copiar_envs_supabase_local"
                          ? "Copiar envs local"
                        : actionId === "testar_llm_local"
                          ? "Testar runtime"
                          : "Abrir diagnóstico"}
                    </button>
                  ))}
                </div>
              </div> : null}
              {showRuntimeOpsFullscreen && localRuntimeConfigOpen ? (
                <div className={`mt-4 rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.7)]"}`}>
                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Configuração persistente do runtime local</p>
                  <div className="mt-3 grid gap-3 xl:grid-cols-3">
                    <label className={`text-[11px] ${isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>
                      <span className={`mb-2 block ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Runtime base URL</span>
                      <input
                        value={localRuntimeDraft.runtimeBaseUrl || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, runtimeBaseUrl: event.target.value }))}
                        className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#F5F1E8] focus:border-[#C5A059]"}`}
                      />
                    </label>
                    <label className={`text-[11px] ${isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>
                      <span className={`mb-2 block ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Modelo local</span>
                      <input
                        value={localRuntimeDraft.localModel || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, localModel: event.target.value }))}
                        className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#F5F1E8] focus:border-[#C5A059]"}`}
                      />
                    </label>
                    <label className={`text-[11px] ${isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>
                      <span className={`mb-2 block ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Extensão local URL</span>
                      <input
                        value={localRuntimeDraft.extensionBaseUrl || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, extensionBaseUrl: event.target.value }))}
                        className={`h-11 w-full rounded-2xl border px-4 text-sm outline-none ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#F5F1E8] focus:border-[#C5A059]"}`}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveLocalRuntimeConfig}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                    >
                      Salvar e recarregar
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalRuntimeDraft(getBrowserLocalRuntimeConfig())}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                    >
                      Restaurar valores atuais
                    </button>
                  </div>
                </div>
              ) : null}
              {showRuntimeOpsFullscreen && (capabilitiesSkills?.total || capabilitiesCommands?.total) ? (
                <p className={`mt-2 max-w-3xl text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>
                  {[
                    capabilitiesSkills?.total ? `${capabilitiesSkills.total} skills catalogadas` : null,
                    capabilitiesSkills?.offline_ready ? `${capabilitiesSkills.offline_ready} prontas para offline` : null,
                    capabilitiesCommands?.total ? `${capabilitiesCommands.total} comandos no catalogo local` : null,
                    activeBrowserProfile?.web_search_enabled === false ? "extensao em perfil offline sem web search" : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {showRuntimeOpsHeader && localStackSummary?.recommendations?.length ? (
                <div className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px]">
                  {localStackSummary.recommendations.slice(0, 3).map((item) => (
                    <span key={item} className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#8A6217]" : "border-[#3B3523] bg-[rgba(197,160,89,0.08)] text-[#D9C38A]"}`}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {showRuntimeOpsHeader && localStackSummary?.actions?.length ? (
                <div className="mt-2 flex max-w-3xl flex-wrap gap-2">
                  {localStackSummary.actions.slice(0, 3).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleLocalStackAction(action.id)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {showRuntimeOpsHeader && activeProviderPresentation.reason ? (
                <p className={`mt-2 max-w-2xl text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{activeProviderPresentation.reason}</p>
              ) : null}
              {showRuntimeOpsHeader && localInferenceAlert ? (
                <div className={`mt-4 max-w-3xl rounded-[20px] border px-4 py-3 text-sm ${
                  localInferenceAlert.tone === "danger"
                    ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                    : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
                }`}>
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Contingência local</p>
                  <p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{localInferenceAlert.title}</p>
                  <p className="mt-1 leading-6">{localInferenceAlert.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {localInferenceAlert.actions.map((actionId) => (
                      <button
                        key={actionId}
                        type="button"
                        onClick={() => handleLocalStackAction(actionId)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                      >
                        {actionId === "retry_runtime_local"
                          ? "Tentar novamente"
                          : actionId === "open_runtime_config"
                          ? "Editar runtime local"
                          : actionId === "open_llm_test"
                            ? "Testar runtime"
                            : actionId === "open_ai_task"
                              ? "Abrir AI Task"
                              : "Abrir diagnóstico"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap items-start gap-2 lg:w-auto lg:justify-end">
              {showRuntimeOpsHeader ? (
                <>
                  <button
                    type="button"
                    onClick={handleCopilotDebug}
                    className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    Debug
                  </button>
                  <button
                    type="button"
                    onClick={refreshLocalStackStatus}
                    disabled={refreshingLocalStack}
                    className={`rounded-2xl border px-3 py-2 text-xs transition disabled:cursor-wait disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    {refreshingLocalStack ? "Atualizando stack..." : "Atualizar stack local"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalRuntimeConfigOpen((current) => !current)}
                    className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    {localRuntimeConfigOpen ? "Fechar runtime local" : "Editar runtime local"}
                  </button>
                </>
              ) : null}
              {compactRail ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setWorkspaceOpen(true)}
                    className="rounded-2xl border border-[#C5A059] px-3 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
                  >
                    Tela cheia
                  </button>
                  <button
                    type="button"
                    onClick={() => createConversationFromCurrentState("Nova conversa")}
                    className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    Nova conversa
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setWorkspaceOpen(true)}
                    className="rounded-2xl border border-[#C5A059] px-3 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
                  >
                    Tela cheia
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                    onClick={() => setIsCollapsed((value) => !value)}
                  >
                    {isCollapsed ? "Expandir" : "Compactar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {compactRail ? (
          <div className="flex h-full min-h-0 flex-col px-4 py-4">
            <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa ativa</p>
                  <p className={`mt-2 truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                    {activeConversation?.title || "Nova conversa"}
                  </p>
                  <p className={`mt-2 line-clamp-2 text-[12px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                    {activeConversationPreview || "Sem conversa ativa ainda. Abra uma nova trilha para começar."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => createConversationFromCurrentState("Nova conversa")}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                >
                  Nova
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                  {activeProviderPresentation.name}
                </span>
                {selectedSkillId ? (
                  <span className="rounded-full border border-[#35554B] px-2.5 py-1 text-[#B7D5CB]">
                    skill {selectedSkillId}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setContextEnabled((value) => !value)}
                  className={`rounded-full border px-2.5 py-1 font-medium transition ${
                    contextEnabled
                      ? "border-[#3E5B50] bg-[rgba(64,122,97,0.16)] text-[#A9E3C3]"
                      : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                  }`}
                >
                  Contexto {contextEnabled ? "ON" : "OFF"}
                </button>
                {activeConversationTimestamp ? (
                  <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#7F928C]"}`}>
                    {new Date(activeConversationTimestamp).toLocaleDateString("pt-BR")}
                  </span>
                ) : null}
              </div>
            </div>
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
                              {renderConversationMenu(conversation, { compact: true })}
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
            <details className={`mt-4 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <summary className={`cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                Diagnóstico e runtime
              </summary>
              <div className="mt-4 space-y-4">
                {offlineHealthSnapshot.items.length ? (
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Saúde offline</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {offlineHealthSnapshot.items.map((item) => (
                        <span
                          key={item.id}
                          title={formatInlinePanelValue(item.detail || item.value)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] ${
                            item.tone === "success"
                              ? "border-[#234034] text-[#8FCFA9]"
                              : item.tone === "danger"
                                ? "border-[#5b2d2d] text-[#f2b2b2]"
                                : "border-[#3B3523] text-[#D9C38A]"
                          }`}
                        >
                          {item.label}: {formatInlinePanelValue(item.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ragAlert ? (
                  <div className={`rounded-[18px] border px-3 py-3 text-sm ${
                    ragAlert.tone === "danger"
                      ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                      : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
                  }`}>
                    <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Diagnóstico RAG</p>
                    <p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{ragAlert.title}</p>
                    <p className="mt-1 text-[12px] leading-6">{ragAlert.body}</p>
                  </div>
                ) : null}
                {localInferenceAlert ? (
                  <div className={`rounded-[18px] border px-3 py-3 text-sm ${
                    localInferenceAlert.tone === "danger"
                      ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                      : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
                  }`}>
                    <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Contingência local</p>
                    <p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{localInferenceAlert.title}</p>
                    <p className="mt-1 text-[12px] leading-6">{localInferenceAlert.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localInferenceAlert.actions.slice(0, 2).map((actionId) => (
                        <button
                          key={actionId}
                          type="button"
                          onClick={() => handleLocalStackAction(actionId)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                        >
                          {actionId === "retry_runtime_local" ? "Tentar" : actionId === "open_runtime_config" ? "Editar runtime" : actionId === "open_llm_test" ? "Testar" : "Diagnóstico"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className={`rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Persistência</p>
                    <span className={`rounded-full border px-2 py-1 text-[10px] ${
                      supabaseBootstrap.tone === "success"
                        ? "border-[#234034] text-[#8FCFA9]"
                        : supabaseBootstrap.tone === "danger"
                          ? "border-[#5b2d2d] text-[#f2b2b2]"
                          : "border-[#3B3523] text-[#D9C38A]"
                    }`}>
                      {supabaseBootstrap.baseUrlKind === "local"
                        ? "Local"
                        : supabaseBootstrap.baseUrlKind === "remote"
                          ? "Remoto"
                      : "Pendente"}
                    </span>
                  </div>
                  <p className={`mt-2 text-[12px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{supabaseBootstrap.label}</p>
                  <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{supabaseBootstrap.detail}</p>
                </div>
              </div>
            </details>
            ) : null}

            <div className={`mt-4 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.98)]"}`}>
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
                  rows={3}
                  placeholder="Converse com o Dotobot..."
                  className={`w-full resize-none rounded-[18px] border px-4 py-3 text-sm outline-none transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421] placeholder:text-[#94A3B8] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] focus:border-[#C5A059]"}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setWorkspaceOpen(true)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                    >
                      Abrir fullscreen
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition disabled:opacity-40"
                  >
                    Enviar
                  </button>
                </div>
              </form>
            </div>
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
          <div className={`${embeddedInInternoShell
            ? suppressInnerChrome
              ? "relative min-h-0 h-full overflow-hidden"
              : isLightTheme
                ? "relative min-h-0 h-full overflow-hidden rounded-[28px] border border-[#D7DEE8] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.98))]"
                : "relative min-h-0 h-full overflow-hidden rounded-[28px] border border-[#1C2623] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.1),transparent_24%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.97))]"
            : isLightTheme
              ? "fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_26%),linear-gradient(180deg,rgba(239,243,248,0.98),rgba(228,234,241,0.96))] backdrop-blur-xl"
              : "fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.14),transparent_26%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.96))] backdrop-blur-xl"} ${isLightTheme ? "text-[#152421]" : "text-[#F4F1EA]"}`}>
          <div className={`${embeddedInInternoShell ? "flex h-full w-full flex-col" : `ml-auto flex h-full ${workspaceShellWidthClass} flex-col ${isLightTheme ? "border-l border-[#D7DEE8] bg-[rgba(255,255,255,0.72)]" : "border-l border-[#1C2623]/70 bg-[rgba(4,7,6,0.68)]"} shadow-[-24px_0_54px_rgba(0,0,0,0.24)]`} transition-[max-width,width] duration-300 ease-out`}>
            <style jsx>{`
              .dotobot-panel-tab-enter {
                opacity: 0;
                transform: translateY(10px) scale(0.985);
              }
              .dotobot-panel-tab-enter-active {
                opacity: 1;
                transform: translateY(0) scale(1);
                transition: opacity 180ms ease, transform 180ms ease;
              }
              .dotobot-panel-tab-exit {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
              .dotobot-panel-tab-exit-active {
                opacity: 0;
                transform: translateY(-6px) scale(0.99);
                transition: opacity 140ms ease, transform 140ms ease;
              }
            `}</style>
            {uiToasts.length ? (
              <div className="pointer-events-none absolute right-4 top-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
                {uiToasts.map((toast) => (
                  <div
                    key={toast.id}
                    className={`pointer-events-auto rounded-[20px] border px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl ${
                      toast.tone === "success"
                        ? "border-[#2E5A46] bg-[rgba(15,33,25,0.92)] text-[#D9F5E5]"
                        : toast.tone === "danger"
                          ? "border-[#6A3131] bg-[rgba(46,16,16,0.92)] text-[#FFD1D1]"
                          : toast.tone === "warning"
                            ? "border-[#6A5320] bg-[rgba(54,39,12,0.92)] text-[#F7E2AE]"
                            : "border-[#2A3A35] bg-[rgba(13,18,17,0.92)] text-[#E7ECE9]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{toast.title}</p>
                        {toast.body ? <p className="mt-1 text-sm leading-6 opacity-90">{toast.body}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissUiToast(toast.id)}
                        className="rounded-full border border-current/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70 transition hover:opacity-100"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {!suppressInnerChrome && (
            <header className={`border-b backdrop-blur-xl ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.96))]" : "border-[#22342F]/80 bg-[linear-gradient(180deg,rgba(11,14,13,0.82),rgba(7,10,9,0.78))]"} ${isFocusedCopilotShell ? "px-4 py-3 md:px-5" : "px-4 py-4 md:px-5"}`}>
              {isFocusedCopilotShell && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                          {activeProjectLabel}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                          <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                          {activeStatus === "processing" ? "Processando" : "Online"}
                        </span>
                      </div>
                      <p className={`mt-3 truncate text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                        {activeConversation?.title || "Nova conversa"}
                      </p>
                      <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                        Fluxo de conversa contínua com histórico lateral e módulos de apoio no rail direito.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleResetChat}
                        className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                      >
                        Nova conversa
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className={`text-2xl font-semibold tracking-[-0.03em] md:text-[28px] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Dotobot</h2>
                    {!isConversationCentricShell ? (
                      <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                        <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                        {activeStatus === "processing" ? "Processando" : "Online"}
                      </span>
                    ) : null}
                  </div>
                  <p className={`mt-2 max-w-3xl text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                    {isConversationCentricShell
                      ? `${activeConversation?.title || "Nova conversa"} · conversa central, histórico persistente à esquerda e módulos acoplados na lateral direita.`
                      : `${activeConversation?.title || "Nova conversa"} · conversa principal ao centro, histórico e contexto como apoio.`}
                  </p>
                  {!isConversationCentricShell ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                        Provider: {activeProviderPresentation.name}
                      </span>
                      <span className={`rounded-full border px-3 py-1.5 ${localStackTone}`}>
                        {localStackLabel}
                      </span>
                      {activeProviderPresentation.meta.map((item) => (
                        <span key={item} className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                          {item}
                        </span>
                      ))}
                      {localStackSummary?.runtimeBaseUrl ? (
                        <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                          runtime {localStackSummary.runtimeBaseUrl}
                        </span>
                      ) : null}
                      {localStackSummary?.localProvider?.transport ? (
                        <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                          {localRuntimeLabel}
                        </span>
                      ) : null}
                      {activeProviderPresentation.endpoint ? (
                        <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                          {activeProviderPresentation.endpoint}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                        foco {activeProjectLabel}
                      </span>
                      <span className={`rounded-full border px-3 py-1.5 ${localStackTone}`}>
                        {localStackLabel}
                      </span>
                      <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.72)] text-[#D8DEDA]"}`}>
                        mensagens {messages.length}
                      </span>
                    </div>
                  )}
                  {localStackSummary && !isConversationCentricShell ? (
                    <p className={`mt-2 max-w-3xl text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>
                      {localStackReady
                        ? `Runtime local pronto${localStackSummary.offlineMode ? " em offline" : ""}, servido por ${localStackSummary.localProvider?.model || "modelo local"}.`
                        : "Runtime local ainda nao confirmado nesta sessao. Use o bootstrap offline local ou suba manualmente o ai-core."}
                    </p>
                  ) : null}
                  {!isConversationCentricShell ? (
                    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                      <div className={`rounded-[22px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#E6D29A] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_60%),#FFFDF7]" : "border-[#3C3320] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.14),transparent_60%),rgba(255,255,255,0.02)]"}`}>
                        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#D9B46A]"}`}>Conversa operacional</p>
                        <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
                        <p className={`mt-2 max-w-2xl line-clamp-3 text-sm leading-6 ${isLightTheme ? "text-[#51606B]" : "text-[#C6D1CC]"}`}>{activeConversationPreview}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#E6D29A] bg-[#FFF6DF] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>
                            histórico {filteredConversations.length}
                          </span>
                          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                            mensagens {messages.length}
                          </span>
                          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                            tarefas {taskHistory.length}
                          </span>
                        </div>
                      </div>
                      <div className={`rounded-[22px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
                        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Missão em foco</p>
                        <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskLabel}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <span className={`rounded-[16px] border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.72)] text-[#D8DEDA]"}`}>
                            Provider {activeTaskProviderLabel}
                          </span>
                          <span className={`rounded-[16px] border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.72)] text-[#D8DEDA]"}`}>
                            Etapas {activeTaskStepCount}
                          </span>
                          <span className={`rounded-[16px] border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.72)] text-[#D8DEDA]"}`}>
                            Ativas {runningCount}
                          </span>
                        </div>
                      </div>
                      <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Atalhos rápidos</p>
                            <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Conversa pronta para operar no shell interno.</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                            {routePath === "/interno/copilot" ? "fullscreen ativo" : "painel lateral"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {COPILOT_QUICK_SHORTCUTS.map((item) => (
                            <span key={item.id} className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              {item.label} · {item.detail}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {cockpitCommandActions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              onClick={action.onClick}
                              className={`flex items-center justify-between rounded-[16px] border px-3 py-2 text-left transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] hover:border-[#C79B2C] hover:bg-[#FFF8EA]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.06)]"}`}
                            >
                              <span>
                                <span className={`block text-[11px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{action.label}</span>
                                <span className={`mt-1 block text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{action.hint}</span>
                              </span>
                              <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Ir</span>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!notificationsEnabled ? (
                            <button
                              type="button"
                              onClick={handleEnableNotifications}
                              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                            >
                              Ativar notificações
                            </button>
                          ) : (
                            <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
                              Notificações ativas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {localStackSummary?.recommendations?.length && !isConversationCentricShell ? (
                    <div className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px]">
                      {localStackSummary.recommendations.slice(0, 3).map((item) => (
                        <span key={item} className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#8A6217]" : "border-[#3B3523] bg-[rgba(197,160,89,0.08)] text-[#D9C38A]"}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {localStackSummary?.actions?.length && !isConversationCentricShell ? (
                    <div className="mt-2 flex max-w-3xl flex-wrap gap-2">
                      {localStackSummary.actions.slice(0, 3).map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleLocalStackAction(action.id)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activeProviderPresentation.reason && !isConversationCentricShell ? (
                    <p className={`mt-2 max-w-3xl text-[11px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{activeProviderPresentation.reason}</p>
                  ) : null}
                  {ragAlert && !isConversationCentricShell ? (
                    <div className={`mt-4 max-w-3xl rounded-[20px] border px-4 py-3 text-sm ${
                      ragAlert.tone === "danger"
                        ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                        : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
                    }`}>
                      <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Diagnóstico RAG</p>
                      <p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{ragAlert.title}</p>
                      <p className="mt-1 leading-6">{ragAlert.body}</p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => router.push("/interno/agentlab/environment")}
                          className="rounded-full border border-current px-3 py-1.5 text-[11px] font-semibold transition hover:bg-[rgba(255,255,255,0.06)]"
                        >
                          Abrir diagnóstico
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center">
                  {!isConversationCentricShell ? MODE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                        type="button"
                        onClick={() => setMode(item.value)}
                        className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                          mode === item.value
                            ? "border-[#C5A059] bg-[#C5A059] text-[#07110E]"
                          : isLightTheme
                            ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                            : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                        }`}
                    >
                      {item.label}
                    </button>
                  )) : null}
                  {!isConversationCentricShell ? <select
                    value={provider}
                    onChange={(event) => setProvider(normalizeWorkspaceProvider(event.target.value, providerCatalog))}
                    aria-label="Selecionar LLM do Copilot"
                    className={`h-10 w-full rounded-full border px-4 text-xs outline-none transition lg:w-auto ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA] focus:border-[#C5A059]"}`}
                  >
                    {providerCatalog.map((item) => (
                      <option key={item.value} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </option>
                    ))}
                  </select> : null}
                  {!isConversationCentricShell ? <select
                    value={selectedSkillId}
                    onChange={(event) => setSelectedSkillId(event.target.value)}
                    aria-label="Selecionar skill do Copilot"
                    className={`h-10 w-full rounded-full border px-4 text-xs outline-none transition lg:w-auto ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA] focus:border-[#C5A059]"}`}
                  >
                    <option value="">Skill automática</option>
                    {skillCatalog.map((item) => (
                      <option key={item.value} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </option>
                    ))}
                  </select> : null}
                  {isConversationCentricShell ? (
                    <div className={`flex min-w-0 items-center gap-3 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                      <span className={`rounded-full border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.72)] text-[#D8DEDA]"}`}>
                        {activeProjectLabel}
                      </span>
                      <span className="truncate">
                        Conversa contínua com histórico, contexto e módulos laterais.
                      </span>
                    </div>
                  ) : null}
                  {!isConversationCentricShell ? (
                  <button
                    type="button"
                    onClick={() => setContextEnabled((value) => !value)}
                    className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                      contextEnabled
                        ? "border-[#3E5B50] bg-[rgba(64,122,97,0.16)] text-[#A9E3C3]"
                        : isLightTheme
                          ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                          : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                    }`}
                  >
                    Contexto {contextEnabled ? "ON" : "OFF"}
                  </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => router.push("/interno/ai-task")}
                    className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    {isConversationCentricShell ? "AI Task" : "Abrir no AI Task"}
                  </button>
                  {isConversationCentricShell ? (
                    <button
                      type="button"
                      onClick={() => router.push("/interno/agentlab/conversations")}
                      className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                    >
                      AgentLab
                    </button>
                  ) : null}
                  {!isConversationCentricShell ? [
                    { id: "snap", label: "Snap" },
                    { id: "balanced", label: "Balanceado" },
                    { id: "immersive", label: "Imersivo" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceLayoutMode(item.id);
                        pushUiToast({
                          tone: "neutral",
                          title: `Layout ${item.label.toLowerCase()}`,
                          body:
                            item.id === "snap"
                              ? "O Copilot voltou ao encaixe lateral com densidade próxima de painel residente."
                              : item.id === "balanced"
                                ? "O Copilot abriu um pouco mais a área de trabalho sem perder a leitura lateral."
                                : "O Copilot expandiu a malha para priorizar a conversa e os módulos simultaneamente.",
                        });
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                        workspaceLayoutMode === item.id
                          ? isLightTheme
                            ? "border-[#C79B2C] bg-[#FFF6DF] text-[#8A6217]"
                            : "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F1D39A]"
                          : isLightTheme
                            ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                            : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                      }`}
                    >
                      {item.label}
                    </button>
                  )) : null}
                  {!isConversationCentricShell ? (
                  <button
                    type="button"
                    onClick={() => openLlmTest(provider, input)}
                    className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    Testar provider
                  </button>
                  ) : null}
                  {!embeddedInInternoShell ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceOpen(false)}
                      className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                    >
                      Fechar
                    </button>
                  ) : null}
                </div>
              </div>
            </header>
            )}

            <div className={`flex-1 overflow-hidden ${focusedShellContentClass}`}>
              <div className={`grid h-full min-h-0 transition-all duration-300 ease-out ${workspaceGridGapClass} ${workspaceShellGridClass}`}>
                {!isRailConversationShell ? (
                <aside className={`${isFocusedCopilotShell ? "flex" : "hidden lg:flex"} min-h-0 flex-col overflow-hidden ${leftRailShellClass}`}>
                  <div className={`border-b px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                          {isFocusedCopilotShell ? "Histórico" : "Workspace"}
                        </p>
                        <p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                          {isFocusedCopilotShell ? "Conversas e projetos" : "Interno/copilot"}
                        </p>
                        <p className={`mt-1 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                          {isConversationCentricShell
                            ? "Histórico, busca e retomada de contexto."
                            : "Retome contexto sem competir com a conversa central."}
                        </p>
                      </div>
                        <button
                          type="button"
                          onClick={() => createConversationFromCurrentState("Nova conversa")}
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                            isLightTheme
                              ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                              : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                          }`}
                        >
                          Nova
                        </button>
                    </div>
                    {!isFocusedCopilotShell ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {workspaceNavigatorItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={item.onClick}
                            className={`rounded-[18px] border px-3 py-3 text-left transition ${
                              isLightTheme
                                ? "border-[#D7DEE8] bg-white hover:border-[#C5A059] hover:shadow-[0_10px_24px_rgba(197,160,89,0.12)]"
                                : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.08)]"
                            }`}
                          >
                            <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.label}</p>
                            <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{item.helper}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-col gap-2">
                        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Buscar conversa</p>
                        <input
                          ref={conversationSearchInputRef}
                          value={conversationSearch}
                          onChange={(event) => setConversationSearch(event.target.value)}
                          placeholder="Buscar conversa, projeto ou contexto"
                          className={`h-11 w-full rounded-[18px] border px-4 text-sm outline-none transition ${
                            isLightTheme
                              ? "border-[#D7DEE8] bg-white text-[#152421] placeholder:text-[#7B8B98] focus:border-[#9A6E2D]"
                              : "border-[#22342F] bg-[rgba(7,9,8,0.98)] text-[#F5F1E8] placeholder:text-[#60706A] focus:border-[#C5A059]"
                          }`}
                      />
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                          projetos {projectInsights.length}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                          conversas {filteredConversations.length}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>
                          foco {activeProjectLabel}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <p className={`w-full text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Projetos e recentes</p>
                        <select
                          value={conversationSort}
                          onChange={e => setConversationSort(e.target.value)}
                          className={`rounded-xl border px-2 py-1 text-xs outline-none transition ${
                            isLightTheme
                              ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]"
                              : "border-[#22342F] bg-[#181B19] text-[#C5A059] focus:border-[#C5A059]"
                          }`}
                        >
                          <option value="recent">Mais recentes</option>
                          <option value="oldest">Mais antigas</option>
                          <option value="title">Título (A-Z)</option>
                        </select>
                        <select
                          ref={projectFilterRef}
                          value={selectedProjectFilter}
                          onChange={(event) => setSelectedProjectFilter(event.target.value)}
                          className={`rounded-xl border px-2 py-1 text-xs outline-none transition ${
                            isLightTheme
                              ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]"
                              : "border-[#22342F] bg-[#181B19] text-[#C5A059] focus:border-[#C5A059]"
                          }`}
                        >
                          <option value="all">Todos os projetos</option>
                          {projectInsights.map((project) => (
                            <option key={project.key} value={project.key}>
                              {project.label}
                            </option>
                          ))}
                        </select>
                        <label className={`flex cursor-pointer items-center gap-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#C5A059]"}`}>
                          <input
                            type="checkbox"
                            checked={showArchived}
                            onChange={e => setShowArchived(e.target.checked)}
                            className="accent-[#C5A059]"
                          />
                          Arquivadas
                        </label>
                      </div>
                    </div>
                  </div>

                  <div
                    className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 md:px-4"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(event);
                    }}
                  >
                    <div className="px-1 pb-1">
                      <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Histórico</p>
                      <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                        Threads persistidas e agrupadas por projeto.
                      </p>
                    </div>
                    {conversationProjectGroups.length ? (
                      conversationProjectGroups.map((group) => (
                        <section
                          key={group.key}
                          className={
                            isConversationCentricShell
                              ? `border-b px-1 pb-3 pt-1 ${isLightTheme ? "border-[#E3E8EF]" : "border-[#17211E]"}`
                              : `rounded-[20px] border p-2 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.92)]" : "border-[#22342F] bg-[rgba(255,255,255,0.015)]"}`
                          }
                        >
                          <div className="flex items-center justify-between gap-2 px-2 py-2">
                            <div>
                              <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{group.label}</p>
                              <p className={`text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#60706A]"}`}>{group.items.length} conversa(s)</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              {group.updatedAt ? new Date(group.updatedAt).toLocaleDateString("pt-BR") : "sem data"}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {group.items.map((conversation) => {
                              const active = conversation.id === activeConversationId;
                              return (
                                <article
                                  key={conversation.id}
                                  className={
                                    isConversationCentricShell
                                      ? `rounded-[18px] border px-3 py-3 transition ${
                                          active
                                            ? isLightTheme
                                              ? "border-[#D2B06A] bg-[#FFF8EA]"
                                              : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                                            : isLightTheme
                                              ? "border-transparent bg-transparent hover:border-[#D7DEE8] hover:bg-white"
                                              : "border-transparent bg-transparent hover:border-[#22342F] hover:bg-[rgba(255,255,255,0.02)]"
                                        }`
                                      : `rounded-[18px] border p-3 transition ${
                                          active
                                            ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                                            : isLightTheme
                                              ? "border-[#D7DEE8] bg-white hover:border-[#BAC8D6]"
                                              : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
                                        }`
                                  }
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <button type="button" onClick={() => selectConversation(conversation)} className="min-w-0 flex-1 text-left">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{conversation.title}</p>
                                          <p className={`mt-1 line-clamp-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{conversation.preview}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <span className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                                            {conversation.messages?.length || 0}
                                          </span>
                                          <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>
                                            {conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString("pt-BR") : ""}
                                          </p>
                                        </div>
                                      </div>
                                    </button>
                                    <div className="shrink-0">
                                      {renderConversationMenu(conversation)}
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>
                                      {conversation.projectLabel || "Geral"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleConcatConversation(conversation)}
                                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                    >
                                      Concatenar
                                    </button>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className={`rounded-[24px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                        Nenhuma conversa encontrada.
                      </div>
                    )}
                  </div>

                  {!isFocusedCopilotShell ? <footer className={`mt-auto shrink-0 border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.96)]" : "border-[#22342F] bg-[rgba(12,15,14,0.95)]"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421]" : "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F5F1E8]"}`}>
                        {(profile?.full_name || profile?.email || "HM").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{profile?.full_name || profile?.email || "Hermida Maia"}</p>
                        <p className={`text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{profile?.role || "Equipe interna"}</p>
                      </div>
                    </div>
                    <div className={`mt-4 grid gap-2 text-xs ${isConversationCentricShell ? "grid-cols-1" : "grid-cols-2"}`}>
                      {!isConversationCentricShell ? (
                        <a href="/interno" className={`rounded-2xl border px-3 py-2 text-center transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                          Dashboard
                        </a>
                      ) : null}
                      {!isConversationCentricShell ? (
                        <button
                          type="button"
                          onClick={() => router.push("/interno/agentlab")}
                          className={`rounded-2xl border px-3 py-2 text-center transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                        >
                          AgentLab
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleResetChat}
                        className={`rounded-2xl border px-3 py-2 text-center transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                      >
                        {isConversationCentricShell ? "Nova conversa" : "Nova sessão"}
                      </button>
                    </div>
                    <p className={`mt-4 text-[11px] leading-5 ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                      {isConversationCentricShell
                        ? "Coluna esquerda dedicada ao histórico, concatenação de diálogos e retomada rápida de contexto."
                        : "Histórico lateral focado em retomada rápida, sem excesso de ações simultâneas."}
                    </p>
                  </footer> : null}
                </aside>
                ) : null}

                <section className={`flex min-h-0 flex-col ${centerShellClass}`}>
                  <div className={`border-b px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
                    {isConversationCentricShell ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa</p>
                      <p className={`mt-2 truncate text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                        {activeConversation?.title || "Nova conversa"}
                      </p>
                          <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              {activeProjectLabel}
                            </span>
                            <span>{messages.length} mensagem(ns)</span>
                            <span>{activeMode.label}</span>
                          </div>
                          <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            Conduza a conversa principal com contexto e continuidade.
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                          Apoio lateral para contexto e execução
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa</p>
                          <p className={`mt-2 truncate text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                            {activeConversation?.title || "Nova conversa"}
                          </p>
                          <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            Uma conversa central para decidir, executar e seguir com mais clareza.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                            {activeProjectLabel}
                          </span>
                          {visibleLegalActions.slice(0, 3).map((action) => (
                            <button
                              key={action.label}
                              type="button"
                              onClick={() => handleQuickAction(action.prompt)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
                    <div className={`flex min-h-full flex-col justify-end space-y-3 ${focusedConversationColumnClass}`}>
                      {messages.length ? (
                        messages.map((message, idx) => (
                          <DotobotMessageBubble
                            key={message.id || idx}
                            message={message}
                            isLightTheme={isLightTheme}
                            onCopy={handleCopyMessage}
                            onReuse={handleReuseMessage}
                            onOpenAiTask={handleOpenMessageInAiTask}
                            onAction={handleMessageAction}
                          />
                        ))
                      ) : (
                        <div className={`rounded-[20px] border border-dashed p-5 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                          <p className={`text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Pronto para conversar.</p>
                          <p className="mt-2 leading-6">Escreva um pedido, continue um contexto existente ou delegue uma ação para o AI Task.</p>
                        </div>
                      )}
                      {loading ? (
                        <DotobotMessageBubble
                          message={{ role: "assistant", text: "", createdAt: null }}
                          isTyping={true}
                          isLightTheme={isLightTheme}
                        />
                      ) : null}
                      {localInferenceAlert && !messages.length ? (
                        <div className={`rounded-[20px] border p-5 text-sm ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8E8] text-[#8A6217]" : "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]"}`}>
                          <p className={`text-base font-semibold ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{localInferenceAlert.title}</p>
                          <p className="mt-2 leading-6">{localInferenceAlert.body}</p>
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
                      {error ? (
                        <div className={`rounded-[24px] border px-4 py-3 text-sm ${isLightTheme ? "border-[#E9B4B4] bg-[#FFF1F1] text-[#B94A48]" : "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]"}`}>
                          {error}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className={`shrink-0 border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
                    <div className={focusedConversationColumnClass}>
                    {!isConversationCentricShell ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {visibleQuickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                            isConversationCentricShell
                              ? isLightTheme
                                ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                                : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"
                              : isLightTheme
                                ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                                : "border-[#22342F] text-[#C6D1CC] hover:border-[#C5A059] hover:text-[#C5A059]"
                          }`}
                          onClick={() => setInput(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    ) : null}
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className={`rounded-[20px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1C2623] bg-[rgba(7,9,8,0.98)]"}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                        <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>
                              {isConversationCentricShell ? `${activeMode.label} · ${contextEnabled ? "contexto ativo" : "contexto reduzido"}` : `/${showSlashCommands ? "comandos ativos" : "comandos"}`}
                            </span>
                            {!isConversationCentricShell ? (
                              <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Enter envia</span>
                            ) : null}
                            {!isConversationCentricShell ? (
                              <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Shift+Enter quebra</span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={handleOpenFiles} className={`rounded-full border px-2.5 py-1 transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                              Anexar
                            </button>
                            <button type="button" onClick={toggleVoiceInput} className={`rounded-full border px-2.5 py-1 transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                              {isRecording ? "Parar voz" : "Voz"}
                            </button>
                          </div>
                        </div>
                        <textarea
                          ref={composerRef}
                          value={input}
                          onChange={(event) => {
                            setInput(event.target.value);
                            setShowSlashCommands(event.target.value.trimStart().startsWith("/"));
                          }}
                          onKeyDown={handleComposerKeyDown}
                          onPaste={handlePaste}
                          rows={4}
                          disabled={isComposerBlocked}
                          placeholder={isConversationCentricShell ? "Pergunte ao Dotobot, continue a thread ou delegue uma ação..." : "Pergunte, delegue uma tarefa ou cole o contexto que precisa operar..."}
                          className={`w-full resize-none border-0 bg-transparent px-1 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${isLightTheme ? "text-[#152421] placeholder:text-[#94A3B8]" : "placeholder:text-[#60706A]"}`}
                        />
                        {composerBlockedReason ? (
                          <p className={`mt-2 px-1 text-[11px] leading-5 ${isLightTheme ? "text-[#8A6217]" : "text-[#f1dfb5]"}`}>{composerBlockedReason}</p>
                        ) : null}

                        {attachments.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
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
                                  <p className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{formatBytes(attachment.size)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {showSlashCommands && input.trim().startsWith("/") ? (
                          <div className={`mt-3 grid gap-2 rounded-[18px] border p-2 md:grid-cols-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            {SLASH_COMMANDS.map((command) => (
                              <button
                                key={command.value}
                                type="button"
                                onClick={() => handleSlashCommand(command)}
                                className={`rounded-[20px] border px-4 py-3 text-left text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                              >
                            <p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{command.label}</p>
                            <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{command.hint}</p>
                          </button>
                        ))}
                      </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {!isConversationCentricShell ? (
                            <button type="button" onClick={handleResetChat} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                              Limpar
                            </button>
                          ) : null}
                          <button type="button" onClick={() => router.push("/interno/ai-task")} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                            AI Task
                          </button>
                          {!isConversationCentricShell ? (
                          <button type="button" onClick={() => openLlmTest(provider, input)} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                            LLM Test
                          </button>
                          ) : null}
                        </div>
                        <button type="submit" disabled={loading || !input.trim() || isComposerBlocked} className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${isLightTheme ? "border-[#C79B2C] bg-[#FFF8E8] text-[#8A6217] hover:bg-[#FFF2D2]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#F1D39A] hover:bg-[rgba(197,160,89,0.14)]"}`}>
                          Enviar
                        </button>
                      </div>
                    </form>
                    </div>
                  </div>
                </section>

                {!isRailConversationShell ? (
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
                  routePath={routePath}
                  runningCount={runningCount}
                  setRightPanelTab={setRightPanelTab}
                  taskHistory={taskHistory}
                />
                ) : (
                <aside className="hidden min-h-0 overflow-hidden lg:block">
                  <div className={`border-b px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                          {isFocusedCopilotShell ? "Apoio lateral" : "Painel lateral"}
                        </p>
                        <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeRightPanelMeta.title}</p>
                        <p className={`mt-1 max-w-[19rem] text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>
                          {isFocusedCopilotShell
                            ? activeRightPanelMeta.detail
                            : activeRightPanelMeta.detail}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableRightPanelTabs.includes("modules") ? (
                          <button
                            type="button"
                            onClick={() => setRightPanelTab("modules")}
                            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "modules" ? "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#9A6E2D] shadow-[0_8px_24px_rgba(197,160,89,0.10)]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"}`}
                          >
                            Módulos
                          </button>
                        ) : null}
                        {availableRightPanelTabs.includes("ai-task") ? (
                          <button
                            type="button"
                            onClick={() => setRightPanelTab("ai-task")}
                            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "ai-task" ? "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#9A6E2D] shadow-[0_8px_24px_rgba(197,160,89,0.10)]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"}`}
                          >
                            AI Task
                          </button>
                        ) : null}
                        {availableRightPanelTabs.includes("agentlabs") ? (
                          <button
                            type="button"
                            onClick={() => setRightPanelTab("agentlabs")}
                            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "agentlabs" ? "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#9A6E2D] shadow-[0_8px_24px_rgba(197,160,89,0.10)]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"}`}
                          >
                            AgentLabs
                          </button>
                        ) : null}
                        {availableRightPanelTabs.includes("context") ? (
                          <button
                            type="button"
                            onClick={() => setRightPanelTab("context")}
                            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "context" ? "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#9A6E2D] shadow-[0_8px_24px_rgba(197,160,89,0.10)]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"}`}
                          >
                            Contexto
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <TransitionGroup component={null}>
                    <CSSTransition key={rightPanelTab} timeout={180} classNames="dotobot-panel-tab">
                      <div className={`overflow-y-auto ${useCondensedRightRail ? "h-full p-3 md:p-4" : "h-[calc(100vh-14rem)] p-4"}`}>
                    {rightPanelTab === "modules" ? (
                      <div className="space-y-3">
                        <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Área ativa</p>
                          <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeProjectLabel}</p>
                          <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            {useCondensedRightRail
                              ? "Atalhos rápidos para abrir áreas do produto."
                              : "Módulos integrados sem roubar atenção do chat."}
                          </p>
                        </div>
                        <div className="grid gap-3">
                          {moduleWorkspaceCards.slice(0, useCondensedRightRail ? 4 : moduleWorkspaceCards.length).map((module) => (
                            <article
                              key={module.key}
                              className={`rounded-[18px] border p-4 ${
                                module.active
                                  ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                                  : isLightTheme
                                    ? "border-[#D7DEE8] bg-white"
                                    : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{module.label}</p>
                                  <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{module.helper}</p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  {module.count}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => router.push(module.contextualHref || module.href)}
                                  className={`rounded-full border px-2.5 py-1 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                >
                                  Abrir módulo
                                </button>
                                {!useCondensedRightRail ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProjectFilter(module.key)}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                  >
                                    Filtrar histórico
                                  </button>
                                ) : null}
                              </div>
                              {module.contextualHref !== module.href && !useCondensedRightRail ? (
                                <p className={`mt-3 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                                  Contexto detectado: {module.key === "processos" || module.key === "publicacoes"
                                    ? `${conversationEntities.processNumbers.length} CNJ(s)`
                                    : module.key === "leads"
                                      ? conversationEntities.primaryEmail
                                      : activeConversation?.title || "conversa ativa"}
                                </p>
                              ) : null}
                              {module.latestConversation && !useCondensedRightRail ? (
                                <p className={`mt-3 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Última conversa: {module.latestConversation}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : rightPanelTab === "ai-task" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className={`text-sm ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            {isFocusedCopilotShell ? "Subtarefas e missão ativa, sem tirar o foco da conversa." : "Tarefas em andamento e próximos passos sugeridos."}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => router.push("/interno/ai-task")}
                              className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                            >
                              Abrir AI Task
                            </button>
                            {!isFocusedCopilotShell ? (
                              <button type="button" onClick={handleResetTasks} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                                Limpar
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {!isFocusedCopilotShell ? (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Ativas</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{runningCount}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Etapas</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskStepCount}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Provider</p>
                            <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskProviderLabel}</p>
                          </div>
                        </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              ativas {runningCount}
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              etapas {activeTaskStepCount}
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              {activeTaskProviderLabel}
                            </span>
                          </div>
                        )}
                        <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Missão em foco</p>
                          <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskLabel}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!notificationsEnabled ? (
                              <button
                                type="button"
                                onClick={handleEnableNotifications}
                                className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                              >
                                Ativar notificações
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => router.push("/interno/ai-task")}
                              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                            >
                              Abrir workspace
                            </button>
                          </div>
                        </div>
                        {taskHistory.length ? (
                          taskHistory.slice(0, isFocusedCopilotShell ? 2 : taskHistory.length).map((task) => (
                            <article key={task.id} className={`rounded-[18px] border p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]"><TaskStatusChip status={task.status} /></p>
                                  <p className={`mt-2 line-clamp-3 font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.query}</p>
                                </div>
                                <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>
                                  {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--"}
                                </span>
                              </div>
                              <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                                <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{parseProviderPresentation(task.provider || "gpt").name}</span>
                                <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{task.steps?.length || 0} etapas</span>
                                {task.rag?.retrieval?.enabled ? <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>RAG {task.rag.retrieval.matches?.length || 0}</span> : null}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => handlePause(task)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                                  {task.status === "paused" ? "Retomar" : "Pausar"}
                                </button>
                                <button type="button" onClick={() => handleRetry(task)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                                  Replay
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <div className={`rounded-[20px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                            Nenhuma tarefa ainda.
                          </div>
                        )}
                        {isFocusedCopilotShell && taskHistory.length > 2 ? (
                          <button
                            type="button"
                            onClick={() => router.push("/interno/ai-task")}
                            className={`w-full rounded-[16px] border px-3 py-2 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                          >
                            Ver histórico completo no AI Task
                          </button>
                        ) : null}
                      </div>
                    ) : rightPanelTab === "agentlabs" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className={`text-sm ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                            {isFocusedCopilotShell ? "Saúde, handoff e acesso rápido ao AgentLabs." : "Subagentes e governança do ai-core."}
                          </p>
                          <button
                            type="button"
                            onClick={() => router.push("/interno/agentlab")}
                            className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                          >
                            Abrir AgentLabs
                          </button>
                        </div>
                        {!isFocusedCopilotShell ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Subagentes</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabSubagents.length}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Threads</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabConversationSummary.total || 0}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Fila</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabOverview.queueItems || 0}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Incidentes</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabIncidentsSummary.open || agentLabOverview.openIncidents || 0}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Syncs</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabOverview.syncRuns || 0}</p>
                          </div>
                          <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Treino médio</p>
                            <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabTrainingSummary.averageScore || agentLabOverview.trainingAverageScore || 0}%</p>
                          </div>
                        </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              subagentes {agentLabSubagents.length}
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              threads {agentLabConversationSummary.total || 0}
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                              incidentes {agentLabIncidentsSummary.open || agentLabOverview.openIncidents || 0}
                            </span>
                          </div>
                        )}
                        {agentLabSnapshot.loading ? (
                          <div className={`rounded-[20px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                            Carregando AgentLab...
                          </div>
                        ) : agentLabSnapshot.error ? (
                          <div className="rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-4 py-3 text-sm text-[#f2b2b2]">
                            {agentLabSnapshot.error}
                          </div>
                        ) : (
                          <>
                            <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Saúde operacional</p>
                                  <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agentLabEnvironment.message || "Painel AgentLab conectado ao copilot local."}</p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  {agentLabEnvironment.mode || "n/a"}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {agentLabHealthSignals.map((signal) => (
                                  <span key={signal.label} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                    {signal.label} {formatInlinePanelValue(signal.value)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {!isFocusedCopilotShell ? (
                            <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Controles rápidos</p>
                                  <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Operações do AgentLab sem sair do Copilot.</p>
                                  <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                                    Sync e treino focal com atualização rápida do painel.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => loadAgentLabSnapshot()}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                >
                                  Atualizar
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={agentLabActionState.loading}
                                  onClick={() => runAgentLabSync("sync_workspace_conversations", "Sync do workspace")}
                                   className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Sync workspace
                                </button>
                                <button
                                  type="button"
                                  disabled={agentLabActionState.loading}
                                  onClick={() => runAgentLabSync("sync_freshsales_activities", "Sync do Freshsales")}
                                   className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Sync Freshsales
                                </button>
                                <button
                                  type="button"
                                  disabled={agentLabActionState.loading}
                                  onClick={() => runAgentLabSync("sync_freshchat_conversations", "Sync do Freshchat")}
                                   className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Sync Freshchat
                                </button>
                                <button
                                  type="button"
                                  disabled={agentLabActionState.loading || !featuredTrainingScenario?.id}
                                  onClick={() => runAgentLabTrainingScenario(featuredTrainingScenario?.id)}
                                   className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                >
                                  Rodar treino focal
                                </button>
                              </div>
                              {agentLabActionState.message ? (
                                <div
                                  className={`mt-3 rounded-[16px] border px-3 py-3 text-xs ${
                                    agentLabActionState.tone === "error"
                                      ? "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]"
                                      : agentLabActionState.tone === "warning"
                                        ? "border-[#6a5a27] bg-[rgba(197,160,89,0.12)] text-[#F1D39A]"
                                        : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#B7D5CB]"
                                  }`}
                                >
                                  {agentLabActionState.message}
                                </div>
                              ) : null}
                            </div>
                            ) : null}
                            <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Handoff atual</p>
                                  <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
                                  <p className={`mt-2 line-clamp-3 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                                    {activeConversationPreview}
                                  </p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  {activeProjectLabel}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  missão {activeTask ? "ativa" : "livre"}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  route {routePath || "/interno"}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                  runs {linkedAgentLabTaskRuns.length}
                                </span>
                              </div>
                              {linkedAgentLabTaskRuns.length ? (
                                <div className="mt-3 space-y-2">
                                  {linkedAgentLabTaskRuns.slice(0, isFocusedCopilotShell ? 2 : linkedAgentLabTaskRuns.length).map((run) => (
                                    <article key={run.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className={`line-clamp-2 text-[11px] font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{run.mission || "Execução sem missão"}</p>
                                          <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{formatRuntimeTimeLabel(run.updated_at || run.created_at)}</p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                          <TaskStatusChip status={run.status} />
                                        </span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleReuseTaskMission(run)}
                                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                        >
                                          Reusar missão
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setRightPanelTab("ai-task")}
                                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                        >
                                          Ver no AI Task
                                        </button>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className={`mt-3 text-xs ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Nenhuma execução do Dotobot vinculada diretamente a esta rota ou conversa ainda.</p>
                              )}
                            </div>
                            {!useCondensedRightRail ? (
                            <>
                            <div className="grid gap-3 xl:grid-cols-2">
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Fila de melhoria</p>
                                  <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>{agentLabOverview.queueItems || 0}</span>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {agentLabQueuePreview.length ? agentLabQueuePreview.map((item) => (
                                    <article key={item.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <p className={`line-clamp-2 text-[11px] font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.title}</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>{item.priority}</span>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>{item.status}</span>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#7F928C]"}`}>{item.agentRef}</span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          disabled={agentLabActionState.loading}
                                          onClick={() => updateAgentLabQueueItemStatus(item, "in_progress")}
                                          className={`rounded-full border px-2.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                        >
                                          Assumir
                                        </button>
                                        <button
                                          type="button"
                                          disabled={agentLabActionState.loading}
                                          onClick={() => updateAgentLabQueueItemStatus(item, "done")}
                                          className={`rounded-full border px-2.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                        >
                                          Concluir
                                        </button>
                                      </div>
                                    </article>
                                  )) : (
                                    <div className={`rounded-[16px] border border-dashed px-3 py-3 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                                      Nenhum item pendente na fila do AgentLab.
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Últimos syncs</p>
                                  <span className={`text-[10px] ${isLightTheme ? "text-[#7C8B96]" : "text-[#60706A]"}`}>{agentLabOverview.syncRuns || 0}</span>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {agentLabSyncPreview.length ? agentLabSyncPreview.map((run) => (
                                    <article key={run.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className={`text-[11px] font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{run.source}</p>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{run.status}</span>
                                      </div>
                                      <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{run.scope} · {run.records} registros · {formatRuntimeTimeLabel(run.createdAt)}</p>
                                    </article>
                                  )) : (
                                    <div className={`rounded-[16px] border border-dashed px-3 py-3 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                                      Ainda não há syncs recentes registrados.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="grid gap-3 xl:grid-cols-2">
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Treinamento</p>
                                  <span className={`text-[10px] ${isLightTheme ? "text-[#7C8B96]" : "text-[#60706A]"}`}>{agentLabOverview.trainingRuns || 0}</span>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {agentLabTrainingPreview.length ? agentLabTrainingPreview.map((run) => (
                                    <article key={run.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className={`text-[11px] font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{run.agentRef}</p>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{run.status}</span>
                                      </div>
                                      <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>score {Math.round((run.score || 0) * 100)}% · {run.provider} · {formatRuntimeTimeLabel(run.createdAt)}</p>
                                    </article>
                                  )) : (
                                    <div className={`rounded-[16px] border border-dashed px-3 py-3 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                                      Nenhum treino recente disponível.
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Incidentes</p>
                                  <span className={`text-[10px] ${isLightTheme ? "text-[#7C8B96]" : "text-[#60706A]"}`}>{agentLabIncidentsSummary.total || 0}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>abertos {agentLabIncidentsSummary.open || 0}</span>
                                  {(agentLabIncidentsSummary.bySeverity || []).slice(0, 3).map((item) => (
                                    <span key={item.label} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                      {item.label} {formatInlinePanelValue(item.value)}
                                    </span>
                                  ))}
                                </div>
                                <p className={`mt-3 text-xs leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                                  {agentLabConversationSummary.handoffs || 0} handoff(s) detectados e {agentLabConversationSummary.withErrors || 0} thread(s) com erro sinalizado.
                                </p>
                                <div className="mt-3 space-y-2">
                                  {agentLabIncidentPreview.length ? agentLabIncidentPreview.map((item) => (
                                    <article key={item.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className={`text-[11px] font-medium line-clamp-2 ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{item.title}</p>
                                          <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{item.category} · {item.severity} · {formatRuntimeTimeLabel(item.occurredAt)}</p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{item.status}</span>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          disabled={agentLabActionState.loading}
                                          onClick={() => updateAgentLabIncidentItemStatus(item, "investigating")}
                                          className={`rounded-full border px-2.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#8A5A16] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                        >
                                          Investigar
                                        </button>
                                        <button
                                          type="button"
                                          disabled={agentLabActionState.loading}
                                          onClick={() => updateAgentLabIncidentItemStatus(item, "resolved")}
                                          className={`rounded-full border px-2.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62] hover:text-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
                                        >
                                          Resolver
                                        </button>
                                      </div>
                                    </article>
                                  )) : null}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {agentLabSubagents.length ? agentLabSubagents.map((agent) => (
                                <article key={agent.id} className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className={`text-sm font-semibold ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{agent.role}</p>
                                      <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                                        {agent.stageCount} estágio(s) · {agent.moduleCount} módulo(s)
                                      </p>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                                      {agent.status}
                                    </span>
                                  </div>
                                </article>
                              )) : (
                                <div className={`rounded-[20px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                                  Nenhum subagente ativo neste momento.
                                </div>
                              )}
                            </div>
                            <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                              <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Ações rápidas</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => router.push("/interno/agentlab/orquestracao")}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Orquestração
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push("/interno/agentlab/conversations")}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Conversas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push("/interno/agentlab/training")}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Training
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push("/interno/agentlab/workflows")}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Workflows
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push("/interno/agentlab/environment")}
                                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                >
                                  Ambiente
                                </button>
                              </div>
                            </div>
                            </>
                            ) : (
                            <div className="space-y-3">
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Subagentes ativos</p>
                                  <span className={`text-[10px] ${isLightTheme ? "text-[#7C8B96]" : "text-[#60706A]"}`}>{agentLabSubagents.length}</span>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {agentLabSubagents.length ? agentLabSubagents.slice(0, 2).map((agent) => (
                                    <article key={agent.id} className={`rounded-[16px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className={`text-[11px] font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{agent.role}</p>
                                          <p className={`mt-1 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{agent.stageCount} estágio(s) · {agent.moduleCount} módulo(s)</p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{agent.status}</span>
                                      </div>
                                    </article>
                                  )) : (
                                    <div className={`rounded-[16px] border border-dashed px-3 py-3 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
                                      Nenhum subagente ativo neste momento.
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                                <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Ações rápidas</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => router.push("/interno/agentlab/conversations")}
                                    className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                  >
                                    Conversas
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => router.push("/interno/agentlab/orquestracao")}
                                    className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                  >
                                    Orquestração
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => router.push("/interno/agentlab/environment")}
                                    className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059] hover:text-[#8A5A16]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                                  >
                                    Ambiente
                                  </button>
                                </div>
                              </div>
                            </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className={`space-y-4 text-sm ${isLightTheme ? "text-[#51606B]" : "text-[#C6D1CC]"}`}>
                        <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Módulo</p>
                          <p className={`mt-2 font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{routePath || "/interno"}</p>
                        </div>
                        <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Memória</p>
                            <span className={`text-[10px] ${isLightTheme ? "text-[#8A5A16]" : "text-[#C5A059]"}`}>{contextEnabled ? "ON" : "OFF"}</span>
                          </div>
                          <p className={`mt-2 font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{ragSummary.count ? `${ragSummary.count} itens relevantes` : "Sem memória carregada"}</p>
                          {ragSummary.sources.length ? <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Fontes: {ragSummary.sources.join(", ")}</p> : null}
                        </div>
                        <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>Documentos</p>
                          {attachments.length ? (
                            <div className="mt-3 space-y-2">
                              {attachments.map((attachment) => (
                                <div key={attachment.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>
                                  <span className="truncate">{attachment.name}</span>
                                  <span className={isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}>{attachment.kind}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Nenhum anexo nesta conversa.</p>
                          )}
                        </div>
                      </div>
                    )}
                      </div>
                    </CSSTransition>
                  </TransitionGroup>
                </aside>
                )
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,application/pdf,text/plain,image/*,audio/*" onChange={handleFilesSelected} />
    </>
  );
}
