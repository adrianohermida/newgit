import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { TransitionGroup, CSSTransition } from "react-transition-group";

import { detectIntent } from "../../lib/ai/intent_router";
import { getCurrentContext } from "../../lib/ai/context_engine";
import { useRouter } from "next/router";
import { adminFetch } from "../../lib/admin/api";
import {
  applyBrowserLocalOfflinePolicy,
  getBrowserLocalRuntimeConfig,
  hydrateBrowserLocalProviderOptions,
  invokeBrowserLocalMessages,
  isBrowserLocalProvider,
  persistBrowserLocalRuntimeConfig,
  probeBrowserLocalStackSummary,
} from "../../lib/lawdesk/browser-local-runtime";
import { resolvePreferredLawdeskProvider } from "../../lib/lawdesk/providers.js";
import { listSkills } from "../../lib/lawdesk/skill_registry.js";
import { buildOfflineHealthSnapshot } from "../../lib/lawdesk/offline-health.js";
import { buildLocalBootstrapPlan } from "../../lib/lawdesk/local-bootstrap.js";
import { useSupabaseBrowser } from "../../lib/supabase";
import { cancelTaskRun, createPendingTaskRun, pollTaskRun, startTaskRun } from "./dotobotTaskRun";
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

const MODE_OPTIONS = [
  { value: "chat", label: "Chat", hint: "Conversa assistida" },
  { value: "task", label: "Tarefa", hint: "Execução em etapas" },
  { value: "analysis", label: "Análise", hint: "Raciocínio guiado" },
];

const PROVIDER_OPTIONS = [
  { value: "gpt", label: "Nuvem principal", disabled: false },
  { value: "local", label: "LLM local", disabled: false },
  { value: "cloudflare", label: "Cloudflare Workers AI", disabled: false },
  { value: "custom", label: "Endpoint custom", disabled: false },
];

const SKILL_OPTIONS = listSkills().map((skill) => ({
  value: skill.id,
  label: `${skill.name} · ${skill.category}`,
  disabled: false,
}));

const LEGAL_ACTIONS = [
  { label: "Gerar peticao", prompt: "/peticao Estruture a peticao com fatos, fundamentos e pedidos." },
  { label: "Analisar processo", prompt: "/analise Faca uma leitura juridica do processo e destaque riscos." },
  { label: "Criar plano", prompt: "/plano Monte um plano de pagamento ou de negociacao em etapas." },
  { label: "Resumir docs", prompt: "/resumo Resuma os documentos e indique pontos sensiveis." },
];

const QUICK_PROMPTS = [
  "Analise este caso e indique o proximo passo.",
  "Crie um plano operacional em etapas.",
  "Padronize a resposta deste bot em PT-BR.",
  "Resuma riscos, fatos e inferencias deste contexto.",
];

function buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled }) {
  return {
    mode,
    provider,
    selectedSkillId: selectedSkillId || "",
    contextEnabled,
  };
}

const SLASH_COMMANDS = [
  { value: "/peticao", label: "Gerar peticao", hint: "Estrutura completa com fundamentos e pedidos." },
  { value: "/analise", label: "Analisar processo", hint: "Leitura juridica e riscos." },
  { value: "/plano", label: "Criar plano", hint: "Fluxo operacional com etapas." },
  { value: "/resumo", label: "Resumir documentos", hint: "Sintese tecnica e util." },
  { value: "/tarefas", label: "Ver tarefas", hint: "Abre o modo de acompanhamento operacional." },
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getConversationTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseProviderPresentation(value) {
  if (value && typeof value === "object") {
    const meta = [
      value.model,
      value.status,
      value.transport,
      value.runtimeMode,
      value.host ? `host:${value.host}` : null,
    ].filter(Boolean);
    return {
      name: value.displayLabel || value.label || value.value || "Provider",
      meta: meta.slice(0, 5),
      status: value.status || null,
      endpoint: value.endpoint || null,
      reason: value.reason || null,
    };
  }

  const segments = String(value || "").split("·").map((item) => item.trim()).filter(Boolean);
  const name = segments[0] || String(value || "Provider");
  const meta = segments.slice(1);
  const status = meta.find((item) => ["operational", "degraded", "failed"].includes(String(item).toLowerCase())) || null;
  return { name, meta, status, endpoint: null, reason: null };
}

function buildRagAlert(health) {
  if (!health || health.status === "operational") return null;
  const signals = health.signals || {};
  if (signals.supabaseAuthMismatch) {
    return {
      tone: "danger",
      title: "RAG com falha de autenticacao no Supabase",
      body: "O embed do Supabase recusou a autenticacao. Confira o DOTOBOT_SUPABASE_EMBED_SECRET no app e na function dotobot-embed.",
    };
  }
  if (signals.appEmbedSecretMissing) {
    return {
      tone: "warning",
      title: "Segredo do embed ausente",
      body: "O dashboard nao encontrou DOTOBOT_SUPABASE_EMBED_SECRET. Embedding e consulta vetorial podem falhar ou operar de forma superficial.",
    };
  }
  return {
    tone: "warning",
    title: "Memoria RAG degradada",
    body: health.error || "Embedding, consulta vetorial ou persistencia de memoria precisam de revisao.",
  };
}

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

function renderRichText(text) {
  if (typeof text !== "string") return null;
  const blocks = text.split(/```/g);
  return blocks.map((block, index) => {
    const isCode = index % 2 === 1;
    if (isCode) {
      return (
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-2xl border border-[#22342F] bg-[rgba(4,7,6,0.95)] p-4 text-[12px] leading-6 text-[#EAE3D6]"
        >
          <code>{block.trim()}</code>
        </pre>
      );
    }

    const paragraphs = block
      .split(/\n{2,}/g)
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      <div key={`text-${index}`} className="space-y-3">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p key={`${index}-${paragraphIndex}`} className="whitespace-pre-wrap leading-7">
            {paragraph}
          </p>
        ))}
      </div>
    );
  });
}

function MessageBubble({ message, isTyping, onCopy, onReuse, onOpenAiTask }) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const alignClass = isAssistant ? "justify-start" : "justify-end";
  const bubbleClass = isAssistant
    ? "border-[#1C2623] bg-[rgba(17,22,20,0.96)] text-[#F4F1EA] shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
    : isSystem
      ? "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9FB1AA]"
      : "border-[#2F3029] bg-[rgba(196,160,89,0.08)] text-[#F7F1E6]";

  // Suporte multimodal: imagens/Ã¡udios
  const media = Array.isArray(message.media) ? message.media : [];

  return (
    <div className={`flex ${alignClass}`}>
      <article className={`w-full max-w-[min(46rem,100%)] rounded-[20px] border px-4 py-3 text-sm ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.16em] opacity-60">
          <span>{isAssistant ? "Dotobot" : isSystem ? "Sistema" : "Administrador / equipe"}</span>
          {message.createdAt ? <span>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
        </div>
        {isTyping ? (
          <span className="inline-flex items-center gap-1 loading">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="ml-2">Digitando...</span>
          </span>
        ) : (
          <>
            {renderRichText(message.text)}
            {media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {media.map((item, idx) => {
                  if (typeof item === "string" && item.match(/\.(png|jpe?g|webp|gif)$/i)) {
                    return <img key={idx} src={item} alt="imagem" className="max-w-[180px] max-h-[180px] rounded-xl border border-[#22342F]" />;
                  }
                  if (typeof item === "string" && item.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                    return <audio key={idx} src={item} controls className="max-w-[220px]" />;
                  }
                  if (typeof item === "object" && item.type === "image" && item.url) {
                    return <img key={idx} src={item.url} alt={item.alt || "imagem"} className="max-w-[180px] max-h-[180px] rounded-xl border border-[#22342F]" />;
                  }
                  if (typeof item === "object" && item.type === "audio" && item.url) {
                    return <audio key={idx} src={item.url} controls className="max-w-[220px]" />;
                  }
                  return null;
                })}
              </div>
            )}
            {(isAssistant || isSystem) && message.text ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#22342F] pt-3 text-[10px] sm:text-[11px]">
                <button
                  type="button"
                  onClick={() => onCopy?.(message)}
                  className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#F1D39A] sm:px-3"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => onReuse?.(message)}
                  className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#F1D39A] sm:px-3"
                >
                  Usar no composer
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAiTask?.(message)}
                  className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF] sm:px-3"
                >
                  Abrir no AI Task
                </button>
              </div>
            ) : null}
          </>
        )}
      </article>
    </div>
  );
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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(3,5,4,0.74)] px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Hermida Maia Advocacia</p>
        <h3 className="mt-3 text-xl font-semibold text-[#F5F1E8]">{title}</h3>
        {body ? <p className="mt-3 text-sm leading-7 text-[#9BAEA8]">{body}</p> : null}
        {inputLabel ? (
          <label className="mt-4 block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[#7F928C]">{inputLabel}</span>
            <input
              value={inputValue}
              onChange={(event) => onInputChange?.(event.target.value)}
              className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#22342F] px-4 py-2 text-sm text-[#D8DEDA] transition hover:border-[#35554B]"
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
}) {
  const isCompactViewport = useMediaQuery({ maxWidth: 640 });
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
  const conversationStorageKey = useMemo(() => buildConversationStorageKey(profile), [profile]);
  const [messages, setMessages] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState("");
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
const [mode, setMode] = useState("task");
const [provider, setProvider] = useState("gpt");
const [providerCatalog, setProviderCatalog] = useState(PROVIDER_OPTIONS);
const [skillCatalog, setSkillCatalog] = useState(SKILL_OPTIONS);
const [selectedSkillId, setSelectedSkillId] = useState("");
const [ragHealth, setRagHealth] = useState(null);
const [contextEnabled, setContextEnabled] = useState(true);
const [localStackSummary, setLocalStackSummary] = useState(null);
const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());
  const [rightPanelTab, setRightPanelTab] = useState("tasks");
  const [attachments, setAttachments] = useState([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingRetrigger, setPendingRetrigger] = useState(null);
  const [lastConsumedAiTaskHandoffId, setLastConsumedAiTaskHandoffId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [renameModal, setRenameModal] = useState({ open: false, conversationId: null, value: "" });
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

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
    if (persistedState.prefs.mode) setMode(persistedState.prefs.mode);
    if (persistedState.prefs.provider) setProvider(persistedState.prefs.provider);
    if (typeof persistedState.prefs.selectedSkillId === "string") setSelectedSkillId(persistedState.prefs.selectedSkillId);
    if (typeof persistedState.prefs.contextEnabled === "boolean") setContextEnabled(persistedState.prefs.contextEnabled);
    setWorkspaceOpen(persistedState.prefs.workspaceOpen);
  }, [chatStorageKey, taskStorageKey, prefStorageKey, conversationStorageKey, initialWorkspaceOpen]);

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
        const hydratedProviders = await hydrateBrowserLocalProviderOptions(mappedProviders);
        if (!active) return;
        setProviderCatalog(hydratedProviders);
        setProvider((current) =>
          resolvePreferredLawdeskProvider({
            currentProvider: current,
            defaultProvider,
            providers: hydratedProviders,
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

  async function refreshLocalStackStatus() {
    setRefreshingLocalStack(true);
    try {
      const summary = await probeBrowserLocalStackSummary();
      setLocalStackSummary(summary);
      const hydratedCatalog = await hydrateBrowserLocalProviderOptions(providerCatalog);
      const governedCatalog = applyBrowserLocalOfflinePolicy(hydratedCatalog, summary);
      setProviderCatalog(governedCatalog);
      setProvider((current) =>
        resolvePreferredLawdeskProvider({
          currentProvider: current,
          defaultProvider: summary?.offlineMode ? "local" : "gpt",
          providers: governedCatalog,
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

  function handleLocalStackAction(actionId) {
    if (actionId === "open_llm_test") {
      openLlmTest("local", input);
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
    // Scroll automático para o final ao carregar/trocar conversa
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    }
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
      metadata: buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled }),
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

  // Copilot sempre disponÃ­vel, apenas colapsa visualmente
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK) {
        event.preventDefault();
        composerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    const nextProvider = submitOptions.provider || provider;
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
      const message = err.message || "Erro ao conectar ao backend.";
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
          className={`fixed z-[75] border border-[#2D2E2E] bg-[rgba(14,16,15,0.95)] text-[11px] uppercase text-[#C5A059] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:border-[#C5A059] hover:text-[#F5E6C5] ${
            isCompactViewport
              ? "bottom-24 right-3 rounded-full px-4 py-3 tracking-[0.18em]"
              : "right-0 top-1/2 -translate-y-1/2 rounded-l-2xl px-3 py-5 tracking-[0.28em]"
          }`}
          onClick={() => setIsCollapsed(false)}
          style={isCompactViewport ? undefined : { writingMode: "vertical-rl", textOrientation: "mixed" }}
          title="Abrir Copilot (Ctrl + .)"
        >
          Copilot
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
      metadata: buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled }),
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
    if (selectionState.metadata?.provider) setProvider(selectionState.metadata.provider);
    if (typeof selectionState.metadata?.selectedSkillId === "string") setSelectedSkillId(selectionState.metadata.selectedSkillId);
    if (typeof selectionState.metadata?.contextEnabled === "boolean") {
      setContextEnabled(selectionState.metadata.contextEnabled);
    }
    setError(null);
    setWorkspaceOpen(true);
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
          buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled })
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
    setProvider(task.provider || provider);
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
  const offlineHealthSnapshot = buildOfflineHealthSnapshot({ localStackSummary, ragHealth });
  const localBootstrapPlan = buildLocalBootstrapPlan({ localStackSummary, ragHealth });
  const isWorkspaceShell = workspaceOpen;
  const railCollapsed = compactRail ? true : isCollapsed;
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0] || null;
  const visibleLegalActions = LEGAL_ACTIONS.slice(0, isCompactViewport ? 1 : 3);
  const visibleQuickPrompts = QUICK_PROMPTS.slice(0, isCompactViewport ? 1 : 2);
  let filteredConversations = filterVisibleConversations(conversations, conversationSearch);
  if (!showArchived) {
    filteredConversations = filteredConversations.filter(c => !c.archived);
  }
  if (conversationSort === "recent") {
    filteredConversations = filteredConversations
      .slice()
      .sort((a, b) => getConversationTimestamp(b.updatedAt || b.createdAt) - getConversationTimestamp(a.updatedAt || a.createdAt));
  } else if (conversationSort === "oldest") {
    filteredConversations = filteredConversations
      .slice()
      .sort((a, b) => getConversationTimestamp(a.updatedAt || a.createdAt) - getConversationTimestamp(b.updatedAt || b.createdAt));
  } else if (conversationSort === "title") {
    filteredConversations = filteredConversations.slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }
  const compactRecentConversations = filteredConversations.slice(0, 4);
  const compactTranscript = messages.slice(-4);
  const activeConversationPreview =
    activeConversation?.preview ||
    activeConversation?.messages?.[activeConversation.messages.length - 1]?.text ||
    "Nova conversa pronta para receber contexto, tarefas e handoff.";
  const activeConversationTimestamp = activeConversation?.updatedAt || activeConversation?.createdAt || null;

  useEffect(() => {
    if (!localStackReady && !localStackSummary?.offlineMode) return;
    setProvider((current) => {
      const currentOption = providerCatalog.find((item) => item.value === current);
      if (localStackSummary?.offlineMode && current !== "local") return "local";
      if (currentOption?.disabled) return "local";
      if (current === "gpt" || current === "cloudflare") return "local";
      return current;
    });
  }, [localStackReady, localStackSummary?.offlineMode, providerCatalog]);

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
      {!isCollapsed ? (
      <section className={`min-h-0 overflow-hidden rounded-[28px] border border-[#22342F] bg-[rgba(10,12,11,0.98)] backdrop-blur-sm ${compactRail ? "" : "mr-10 md:mr-0"}`}>
        <header className="border-b border-[#22342F] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Copilot operacional</p>
              <div className="mt-2 flex items-center gap-3">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#F5F1E8]">Dotobot</h3>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                  <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                  {activeStatus === "processing" ? uiStateLabel : "Idle"}
                </span>
              </div>
              <p className="mt-2 max-w-md text-xs leading-6 text-[#8FA19B]">
                {isCompactViewport ? "Chat para execucao e handoff com AI Task." : "Chat focado em execucao, contexto e handoff com AI Task."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#D8DEDA]">
                  Provider: {activeProviderPresentation.name}
                </span>
                <span className={`rounded-full border px-3 py-1.5 ${localStackTone}`}>
                  {localStackLabel}
                </span>
                {activeProviderPresentation.meta.map((item) => (
                  <span key={item} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#9BAEA8]">
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
                {capabilitiesSkills?.total ? (
                  <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#9BAEA8]">
                    Skills {capabilitiesSkills.total}
                  </span>
                ) : null}
                {capabilitiesCommands?.executable ? (
                  <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#9BAEA8]">
                    Comandos {capabilitiesCommands.executable}/{capabilitiesCommands.total}
                  </span>
                ) : null}
                {activeBrowserProfile?.label ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    Extensao {activeBrowserProfile.label}
                  </span>
                ) : null}
                {activeProviderPresentation.endpoint ? (
                  <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[#B7D5CB]">
                    {activeProviderPresentation.endpoint}
                  </span>
                ) : null}
              </div>
              {localStackSummary ? (
                <p className="mt-2 max-w-2xl text-[11px] leading-6 text-[#7F928C]">
                  {localStackReady
                    ? `ai-core local ativo${localStackSummary.offlineMode ? " em modo offline" : ""} com modelo ${localStackSummary.localProvider?.model || "local"}.`
                    : "O runtime local ainda nao respondeu; suba o ai-core e a extensao local para habilitar o modo da sua maquina."}
                </p>
              ) : null}
              {offlineHealthSnapshot.items.length ? (
                <div className="mt-3 flex max-w-3xl flex-wrap gap-2">
                  {offlineHealthSnapshot.items.map((item) => (
                    <span
                      key={item.id}
                      title={item.detail || item.value}
                      className={`rounded-full border px-3 py-1.5 text-[11px] ${
                        item.tone === "success"
                          ? "border-[#234034] text-[#8FCFA9]"
                          : item.tone === "danger"
                            ? "border-[#5b2d2d] text-[#f2b2b2]"
                            : "border-[#3B3523] text-[#D9C38A]"
                      }`}
                    >
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              ) : null}
              {localBootstrapPlan.steps.length ? (
                <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Bootstrap local</p>
                      <p className="mt-1 text-sm text-[#F5F1E8]">
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
                      <div key={step.id} className="rounded-[18px] border border-[#22342F] bg-[rgba(7,9,8,0.65)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold text-[#F5F1E8]">{step.title}</p>
                            <p className="mt-1 text-[11px] leading-6 text-[#9BAEA8]">{step.detail}</p>
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
                            className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                          >
                            {step.action === "testar_llm_local" ? "Testar runtime" : "Abrir diagnóstico"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {localRuntimeConfigOpen ? (
                <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.7)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Configuração persistente do runtime local</p>
                  <div className="mt-3 grid gap-3 xl:grid-cols-3">
                    <label className="text-[11px] text-[#D8DEDA]">
                      <span className="mb-2 block text-[#7F928C]">Runtime base URL</span>
                      <input
                        value={localRuntimeDraft.runtimeBaseUrl || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, runtimeBaseUrl: event.target.value }))}
                        className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                      />
                    </label>
                    <label className="text-[11px] text-[#D8DEDA]">
                      <span className="mb-2 block text-[#7F928C]">Modelo local</span>
                      <input
                        value={localRuntimeDraft.localModel || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, localModel: event.target.value }))}
                        className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                      />
                    </label>
                    <label className="text-[11px] text-[#D8DEDA]">
                      <span className="mb-2 block text-[#7F928C]">Extensão local URL</span>
                      <input
                        value={localRuntimeDraft.extensionBaseUrl || ""}
                        onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, extensionBaseUrl: event.target.value }))}
                        className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveLocalRuntimeConfig}
                      className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                    >
                      Salvar e recarregar
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalRuntimeDraft(getBrowserLocalRuntimeConfig())}
                      className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                    >
                      Restaurar valores atuais
                    </button>
                  </div>
                </div>
              ) : null}
              {capabilitiesSkills?.total || capabilitiesCommands?.total ? (
                <p className="mt-2 max-w-3xl text-[11px] leading-6 text-[#7F928C]">
                  {[
                    capabilitiesSkills?.total ? `${capabilitiesSkills.total} skills catalogadas` : null,
                    capabilitiesSkills?.offline_ready ? `${capabilitiesSkills.offline_ready} prontas para offline` : null,
                    capabilitiesCommands?.total ? `${capabilitiesCommands.total} comandos no catalogo local` : null,
                    activeBrowserProfile?.web_search_enabled === false ? "extensao em perfil offline sem web search" : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {localStackSummary?.recommendations?.length ? (
                <div className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px]">
                  {localStackSummary.recommendations.slice(0, 3).map((item) => (
                    <span key={item} className="rounded-full border border-[#3B3523] bg-[rgba(197,160,89,0.08)] px-3 py-1.5 text-[#D9C38A]">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {localStackSummary?.actions?.length ? (
                <div className="mt-2 flex max-w-3xl flex-wrap gap-2">
                  {localStackSummary.actions.slice(0, 3).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleLocalStackAction(action.id)}
                      className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeProviderPresentation.reason ? (
                <p className="mt-2 max-w-2xl text-[11px] leading-6 text-[#7F928C]">{activeProviderPresentation.reason}</p>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap items-start gap-2 lg:w-auto lg:justify-end">
              <button
                type="button"
                onClick={handleCopilotDebug}
                className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Debug
              </button>
              <button
                type="button"
                onClick={refreshLocalStackStatus}
                disabled={refreshingLocalStack}
                className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-wait disabled:opacity-60"
              >
                {refreshingLocalStack ? "Atualizando stack..." : "Atualizar stack local"}
              </button>
              <button
                type="button"
                onClick={() => setLocalRuntimeConfigOpen((current) => !current)}
                className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                {localRuntimeConfigOpen ? "Fechar runtime local" : "Editar runtime local"}
              </button>
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
                    onClick={() => router.push("/interno/ai-task")}
                    className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    AI Task
                  </button>
                  <button
                    type="button"
                    onClick={() => openLlmTest(provider, input)}
                    className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    LLM Test
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
            <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Copilot compacto</p>
                  <p className="mt-2 truncate text-sm font-semibold text-[#F5F1E8]">
                    {activeConversation?.title || "Nova conversa"}
                  </p>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-6 text-[#9BAEA8]">
                    {activeConversationPreview}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => createConversationFromCurrentState("Nova conversa")}
                  className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] font-medium text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                >
                  Nova
                </button>
              </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
                <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[#D8DEDA]">
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
                  <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[#7F928C]">
                    {new Date(activeConversationTimestamp).toLocaleDateString("pt-BR")}
                  </span>
                ) : null}
                {localStackSummary?.localProvider?.transport ? (
                  <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[#7F928C]">
                    {localRuntimeLabel}
                  </span>
                ) : null}
              </div>
            </div>
            {offlineHealthSnapshot.items.length ? (
              <div className="mt-4 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Saúde offline</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {offlineHealthSnapshot.items.map((item) => (
                    <span
                      key={item.id}
                      title={item.detail || item.value}
                      className={`rounded-full border px-3 py-1.5 text-[11px] ${
                        item.tone === "success"
                          ? "border-[#234034] text-[#8FCFA9]"
                          : item.tone === "danger"
                            ? "border-[#5b2d2d] text-[#f2b2b2]"
                            : "border-[#3B3523] text-[#D9C38A]"
                      }`}
                    >
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {localBootstrapPlan.steps.length ? (
              <div className="mt-4 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Bootstrap local</p>
                  <span className="text-[11px] text-[#9BAEA8]">
                    {localBootstrapPlan.requiredCompleted}/{localBootstrapPlan.requiredTotal}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {localBootstrapPlan.steps.slice(0, 3).map((step) => (
                    <div key={step.id} className="rounded-[18px] border border-[#22342F] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold text-[#F5F1E8]">{step.title}</p>
                          <p className="mt-1 text-[11px] leading-5 text-[#9BAEA8]">{step.detail}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] ${
                          step.done
                            ? "border-[#234034] text-[#8FCFA9]"
                            : step.optional
                              ? "border-[#3B3523] text-[#D9C38A]"
                              : "border-[#5b2d2d] text-[#f2b2b2]"
                        }`}>
                          {step.done ? "OK" : "Pend."}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {localRuntimeConfigOpen ? (
              <div className="mt-4 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Runtime local</p>
                <div className="mt-3 space-y-2">
                  <input
                    value={localRuntimeDraft.runtimeBaseUrl || ""}
                    onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, runtimeBaseUrl: event.target.value }))}
                    placeholder="http://127.0.0.1:8000"
                    className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                  />
                  <input
                    value={localRuntimeDraft.localModel || ""}
                    onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, localModel: event.target.value }))}
                    placeholder="aetherlab-legal-local-v1"
                    className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                  />
                  <input
                    value={localRuntimeDraft.extensionBaseUrl || ""}
                    onChange={(event) => setLocalRuntimeDraft((current) => ({ ...current, extensionBaseUrl: event.target.value }))}
                    placeholder="http://127.0.0.1:32123"
                    className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveLocalRuntimeConfig}
                    className="w-full rounded-2xl border border-[#35554B] px-4 py-2 text-sm font-semibold text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                  >
                    Salvar e recarregar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Histórico</p>
                    <p className="mt-1 text-[12px] text-[#9BAEA8]">Mesmo estado do nodo full e handoff para AI Task.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkspaceOpen(true)}
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Ver tudo
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {compactRecentConversations.length ? (
                    compactRecentConversations.map((conversation) => {
                      const isActive = conversation.id === activeConversationId;
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => selectConversation(conversation)}
                          className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                            isActive
                              ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                              : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-[#F5F1E8]">{conversation.title}</p>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#9BAEA8]">{conversation.preview}</p>
                            </div>
                            <span className="shrink-0 text-[10px] text-[#60706A]">
                              {conversation.messages?.length || 0}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#22342F] px-3 py-4 text-[12px] text-[#9BAEA8]">
                      Nenhuma conversa salva ainda.
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Conversa ativa</p>
                    <p className="mt-1 text-[12px] text-[#9BAEA8]">Leitura rápida da thread atual.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/interno/ai-task")}
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    AI Task
                  </button>
                </div>
                <div className="mt-3 max-h-[28vh] space-y-2 overflow-y-auto pr-1">
                  {compactTranscript.length ? (
                    compactTranscript.map((message, index) => (
                      <div
                        key={message.id || `${message.role}-${message.createdAt || index}`}
                        className={`rounded-[18px] border px-3 py-3 ${
                          message.role === "user"
                            ? "border-[#3B3523] bg-[rgba(197,160,89,0.08)]"
                            : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">
                            {message.role === "user" ? "Você" : "Dotobot"}
                          </span>
                          {message.createdAt ? (
                            <span className="text-[10px] text-[#60706A]">
                              {new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-6 text-[#D8DEDA]">
                          {message.text || (message.role === "assistant" && loading ? "Processando resposta..." : "Sem texto")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#22342F] px-3 py-4 text-[12px] text-[#9BAEA8]">
                      A conversa começa aqui. Use um prompt curto e siga para o modo full quando precisar de trilha completa.
                    </div>
                  )}
                  {loading ? (
                    <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-[12px] text-[#9BAEA8]">
                      Dotobot está preparando a próxima resposta...
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {ragAlert ? (
              <div className={`mt-4 rounded-[18px] border px-3 py-3 text-sm ${
                ragAlert.tone === "danger"
                  ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                  : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
              }`}>
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Diagnóstico RAG</p>
                <p className="mt-2 font-medium text-[#F5F1E8]">{ragAlert.title}</p>
                <p className="mt-1 text-[12px] leading-6">{ragAlert.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/interno/agentlab/environment")}
                    className="rounded-full border border-current px-3 py-1.5 text-[11px] font-semibold transition hover:bg-[rgba(255,255,255,0.06)]"
                  >
                    Abrir diagnóstico
                  </button>
                  <button
                    type="button"
                    onClick={() => openLlmTest(provider, input)}
                    className="rounded-full border border-current px-3 py-1.5 text-[11px] font-semibold transition hover:bg-[rgba(255,255,255,0.06)]"
                  >
                    LLM Test
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-[24px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {visibleQuickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#C5A059]"
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
                  rows={3}
                  placeholder="Converse com o Dotobot, delegue uma tarefa ou faça um handoff..."
                  className="w-full resize-none rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm outline-none transition focus:border-[#C5A059]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => router.push("/interno/ai-task")}
                      className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                    >
                      AI Task
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceOpen(true)}
                      className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                    >
                      Nodo full
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
            <div className="border-b border-[#22342F] px-4 py-3">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {visibleLegalActions.slice(0, 2).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action.prompt)}
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#D9E0DB] transition hover:border-[#C5A059] hover:text-[#C5A059] sm:text-[11px]"
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
                    <MessageBubble
                      key={message.id || `${message.role}-${message.createdAt || index}-${index}`}
                      message={message}
                      onCopy={handleCopyMessage}
                      onReuse={handleReuseMessage}
                      onOpenAiTask={handleOpenMessageInAiTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                  <p className="font-medium text-[#F5F1E8]">Pronto para operar.</p>
                  <p className="mt-2 leading-7">
                    Envie uma ordem, analise de caso, pedido de fluxo ou instrucao de treinamento. O Dotobot responde em PT-BR, com foco interno, seguranca juridica e proximos passos.
                  </p>
                </div>
              )}
              {loading ? (
                <MessageBubble
                  message={{ role: "assistant", text: "", createdAt: null }}
                  isTyping={true}
                />
              ) : null}
              {error ? <p className="text-sm text-[#f2b2b2]">{error}</p> : null}
            </div>

            <div className="border-t border-[#22342F] px-4 py-4">
              <div className="mb-3 flex flex-wrap gap-1.5 sm:gap-2">
                {visibleQuickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#C5A059] sm:text-[11px]"
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
                  placeholder="Descreva a tarefa, caso, ordem do administrador ou instrucao de treinamento..."
                  className="w-full resize-y rounded-[22px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-4 py-3 text-sm outline-none transition focus:border-[#C5A059]"
                />

                {attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs text-[#C6D1CC]">
                        {attachment.previewUrl ? (
                          <img src={attachment.previewUrl} alt={attachment.name} className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#22342F] text-[10px] uppercase text-[#9BAEA8]">
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
                  <div className="rounded-[22px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] p-2">
                    {SLASH_COMMANDS.map((command) => (
                      <button
                        key={command.value}
                        type="button"
                        onClick={() => handleSlashCommand(command)}
                        className="flex w-full items-start justify-between gap-4 rounded-2xl px-3 py-2 text-left text-xs text-[#C6D1CC] transition hover:bg-[rgba(255,255,255,0.03)]"
                      >
                        <span>
                          <span className="font-semibold text-[#F5F1E8]">{command.label}</span>
                          <span className="ml-2 text-[#9BAEA8]">{command.value}</span>
                        </span>
                        <span className="max-w-[16rem] text-right text-[11px] text-[#9BAEA8]">{command.hint}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleResetChat} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                      Limpar conversas
                    </button>
                    <button type="button" onClick={handleOpenFiles} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                      Anexar arquivos
                    </button>
                    <button type="button" onClick={toggleVoiceInput} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                      {isRecording ? "Parar voz" : "Ditado"}
                    </button>
                    <button type="button" onClick={() => composerRef.current?.focus()} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
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
          <div className="fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.16),transparent_28%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.96))] text-[#F4F1EA] backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <header className="border-b border-[#22342F]/80 bg-[rgba(7,10,9,0.78)] px-4 py-4 backdrop-blur-xl md:px-5">
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#F5F1E8] md:text-[28px]">Dotobot</h2>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                      <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                      {activeStatus === "processing" ? "Processando" : "Online"}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9BAEA8]">
                    {activeConversation?.title || "Nova conversa"} · conversa principal ao centro, historico e contexto como apoio.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#D8DEDA]">
                      Provider: {activeProviderPresentation.name}
                    </span>
                    <span className={`rounded-full border px-3 py-1.5 ${localStackTone}`}>
                      {localStackLabel}
                    </span>
                    {activeProviderPresentation.meta.map((item) => (
                      <span key={item} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#9BAEA8]">
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
                  {localStackSummary ? (
                    <p className="mt-2 max-w-3xl text-[11px] leading-6 text-[#7F928C]">
                      {localStackReady
                        ? `Runtime local pronto${localStackSummary.offlineMode ? " em offline" : ""}, servido por ${localStackSummary.localProvider?.model || "modelo local"}.`
                        : "Runtime local ainda nao confirmado nesta sessao. Use o bootstrap offline local ou suba manualmente o ai-core."}
                    </p>
                  ) : null}
                  {localStackSummary?.recommendations?.length ? (
                    <div className="mt-2 flex max-w-3xl flex-wrap gap-2 text-[11px]">
                      {localStackSummary.recommendations.slice(0, 3).map((item) => (
                        <span key={item} className="rounded-full border border-[#3B3523] bg-[rgba(197,160,89,0.08)] px-3 py-1.5 text-[#D9C38A]">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {localStackSummary?.actions?.length ? (
                    <div className="mt-2 flex max-w-3xl flex-wrap gap-2">
                      {localStackSummary.actions.slice(0, 3).map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleLocalStackAction(action.id)}
                          className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activeProviderPresentation.reason ? (
                    <p className="mt-2 max-w-3xl text-[11px] leading-6 text-[#7F928C]">{activeProviderPresentation.reason}</p>
                  ) : null}
                  {ragAlert ? (
                    <div className={`mt-4 max-w-3xl rounded-[20px] border px-4 py-3 text-sm ${
                      ragAlert.tone === "danger"
                        ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
                        : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
                    }`}>
                      <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Diagnóstico RAG</p>
                      <p className="mt-2 font-medium text-[#F5F1E8]">{ragAlert.title}</p>
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
                  {MODE_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setMode(item.value)}
                      className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                        mode === item.value
                          ? "border-[#C5A059] bg-[#C5A059] text-[#07110E]"
                          : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    aria-label="Selecionar LLM do Copilot"
                    className="h-10 w-full rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-xs text-[#D8DEDA] outline-none transition focus:border-[#C5A059] lg:w-auto"
                  >
                    {providerCatalog.map((item) => (
                      <option key={item.value} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedSkillId}
                    onChange={(event) => setSelectedSkillId(event.target.value)}
                    aria-label="Selecionar skill do Copilot"
                    className="h-10 w-full rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-xs text-[#D8DEDA] outline-none transition focus:border-[#C5A059] lg:w-auto"
                  >
                    <option value="">Skill automática</option>
                    {skillCatalog.map((item) => (
                      <option key={item.value} value={item.value} disabled={item.disabled}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setContextEnabled((value) => !value)}
                    className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                      contextEnabled
                        ? "border-[#3E5B50] bg-[rgba(64,122,97,0.16)] text-[#A9E3C3]"
                        : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                    }`}
                  >
                    Contexto {contextEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/interno/ai-task")}
                    className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Abrir no AI Task
                  </button>
                  <button
                    type="button"
                    onClick={() => openLlmTest(provider, input)}
                    className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Testar provider
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceOpen(false)}
                    className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-hidden p-3 md:p-5">
              <div className="grid h-full min-h-0 gap-4 2xl:grid-cols-[260px_minmax(0,1.35fr)_300px]">
                <aside className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-[#1C2623] bg-[rgba(255,255,255,0.015)] shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
                  <div className="border-b border-[#22342F] px-4 py-4 md:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Historico</p>
                        <p className="mt-1 text-sm text-[#9BAEA8]">Conversa estilo Copilot com busca contextual.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => createConversationFromCurrentState("Nova conversa")}
                        className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Nova
                      </button>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <input
                        value={conversationSearch}
                        onChange={(event) => setConversationSearch(event.target.value)}
                        placeholder="Buscar conversas"
                        className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
                      />
                      <div className="flex gap-2 mt-2">
                        <select
                          value={conversationSort}
                          onChange={e => setConversationSort(e.target.value)}
                          className="rounded-xl border border-[#22342F] bg-[#181B19] px-2 py-1 text-xs text-[#C5A059] focus:border-[#C5A059]"
                        >
                          <option value="recent">Mais recentes</option>
                          <option value="oldest">Mais antigas</option>
                      <option value="title">Título (A-Z)</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-[#C5A059] cursor-pointer">
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
                    className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(event);
                    }}
                  >
                    {filteredConversations.length ? (
                      filteredConversations.map((conversation) => {
                        const active = conversation.id === activeConversationId;
                        return (
                          <article
                            key={conversation.id}
                            className={`rounded-[18px] border p-3 transition ${
                              active
                                ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
                                : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
                            }`}
                          >
                            <button type="button" onClick={() => selectConversation(conversation)} className="w-full text-left">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#F5F1E8]">{conversation.title}</p>
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#9BAEA8]">{conversation.preview}</p>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">
                                    {conversation.messages?.length || 0}
                                  </span>
                                  <p className="mt-1 text-[10px] text-[#60706A]">
                                    {conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString("pt-BR") : ""}
                                  </p>
                                </div>
                              </div>
                            </button>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => renameConversation(conversation)}
                                className="rounded-full border border-[#22342F] px-2.5 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                              >
                                Renomear
                              </button>
                              <button
                                type="button"
                                onClick={() => archiveConversation(conversation)}
                                className="rounded-full border border-[#22342F] px-2.5 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                              >
                                {conversation.archived ? "Desarquivar" : "Arquivar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteConversation(conversation)}
                                className="rounded-full border border-[#4f2525] px-2.5 py-1 text-[11px] text-[#f2b2b2] transition hover:border-[#f2b2b2]"
                              >
                                Excluir
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                        Nenhuma conversa encontrada.
                      </div>
                    )}
                  </div>

                  <footer className="border-t border-[#22342F] bg-[rgba(12,15,14,0.95)] px-4 py-4 md:px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.03)] text-sm font-semibold text-[#F5F1E8]">
                        {(profile?.full_name || profile?.email || "HM").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F5F1E8]">{profile?.full_name || profile?.email || "Hermida Maia"}</p>
                        <p className="text-xs text-[#9BAEA8]">{profile?.role || "Equipe interna"}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <a href="/interno" className="rounded-2xl border border-[#22342F] px-3 py-2 text-center text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                        Dashboard
                      </a>
                      <button
                        type="button"
                        onClick={() => router.push("/interno/agentlab")}
                        className="rounded-2xl border border-[#22342F] px-3 py-2 text-center text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        AgentLab
                      </button>
                      <button
                        type="button"
                        onClick={handleResetChat}
                        className="rounded-2xl border border-[#22342F] px-3 py-2 text-center text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
                      <a href="#" className="underline-offset-4 hover:underline">
                        Privacidade
                      </a>
                      <a href="#" className="underline-offset-4 hover:underline">
                        Termos
                      </a>
                      <a href="#" className="underline-offset-4 hover:underline">
                        FAQ
                      </a>
                      <a href="#" className="underline-offset-4 hover:underline">
                        Feedback
                      </a>
                      <a href="#" className="underline-offset-4 hover:underline">
                        Sobre
                      </a>
                    </div>
                  </footer>
                </aside>

                <section className="flex min-h-0 flex-col rounded-[24px] border border-[#1C2623] bg-[rgba(255,255,255,0.015)] shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
                  <div className="border-b border-[#22342F] px-4 py-4 md:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Conversa</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {visibleLegalActions.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => handleQuickAction(action.prompt)}
                            className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 py-4 md:px-5">
                    {messages.length ? (
                      messages.map((message, idx) => (
                        <MessageBubble
                          key={message.id || idx}
                          message={message}
                          onCopy={handleCopyMessage}
                          onReuse={handleReuseMessage}
                          onOpenAiTask={handleOpenMessageInAiTask}
                        />
                      ))
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5 text-sm text-[#9BAEA8]">
                        <p className="text-base font-semibold text-[#F5F1E8]">Pronto para operar.</p>
                        <p className="mt-2 leading-6">Use uma instrucao curta, um comando com contexto ou envie esta conversa para o AI Task.</p>
                      </div>
                    )}
                    {loading ? (
                      <MessageBubble
                        message={{ role: "assistant", text: "", createdAt: null }}
                        isTyping={true}
                      />
                    ) : null}
                    {error ? (
                      <div className="rounded-[24px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-4 py-3 text-sm text-[#f2b2b2]">
                        {error}
                      </div>
                    ) : null}

                  {/* Fim do bloco de mensagens */}
                </div>

                  <div className="border-t border-[#22342F] px-4 py-4 md:px-5">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {visibleQuickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          onClick={() => setInput(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="rounded-[20px] border border-[#1C2623] bg-[rgba(7,9,8,0.98)] p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7F928C]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#22342F] px-2.5 py-1">/{showSlashCommands ? "comandos ativos" : "digite / para comandos"}</span>
                            <span className="rounded-full border border-[#22342F] px-2.5 py-1">Enter envia</span>
                            <span className="rounded-full border border-[#22342F] px-2.5 py-1">Shift+Enter quebra</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={handleOpenFiles} className="rounded-full border border-[#22342F] px-2.5 py-1 text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                              Anexar
                            </button>
                            <button type="button" onClick={toggleVoiceInput} className="rounded-full border border-[#22342F] px-2.5 py-1 text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
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
                          placeholder="Pergunte, delegue uma tarefa ou cole o contexto que precisa operar..."
                          className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[#60706A]"
                        />

                        {attachments.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attachments.map((attachment) => (
                              <div key={attachment.id} className="flex items-center gap-3 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs text-[#C6D1CC]">
                                {attachment.previewUrl ? (
                                  <img src={attachment.previewUrl} alt={attachment.name} className="h-8 w-8 rounded-lg object-cover" />
                                ) : (
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#22342F] text-[10px] uppercase text-[#9BAEA8]">
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
                          <div className="mt-3 grid gap-2 rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-2 md:grid-cols-2">
                            {SLASH_COMMANDS.map((command) => (
                              <button
                                key={command.value}
                                type="button"
                                onClick={() => handleSlashCommand(command)}
                                className="rounded-[20px] border border-[#22342F] px-4 py-3 text-left text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                              >
                            <p className="font-semibold text-[#F5F1E8]">{command.label}</p>
                            <p className="mt-1 text-[11px] leading-5 text-[#9BAEA8]">{command.hint}</p>
                          </button>
                        ))}
                      </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={handleResetChat} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                          Limpar
                        </button>
                          <button type="button" onClick={() => router.push("/interno/ai-task")} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            AI Task
                          </button>
                          <button type="button" onClick={() => openLlmTest(provider, input)} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            LLM Test
                          </button>
                        </div>
                        <button type="submit" disabled={loading || !input.trim()} className="rounded-2xl border border-[#C5A059] bg-[rgba(197,160,89,0.08)] px-4 py-2 text-sm font-semibold text-[#F1D39A] transition disabled:opacity-40 hover:bg-[rgba(197,160,89,0.14)]">
                          Enviar
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                <aside className="min-h-0 overflow-hidden rounded-[24px] border border-[#1C2623] bg-[rgba(255,255,255,0.015)]">
                  <div className="border-b border-[#22342F] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Painel</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRightPanelTab("tasks")}
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "tasks" ? "border-[#C5A059] text-[#F1D39A]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Tarefas
                        </button>
                        <button
                          type="button"
                          onClick={() => setRightPanelTab("context")}
                          className={`rounded-full border px-3 py-1.5 text-[11px] transition ${rightPanelTab === "context" ? "border-[#C5A059] text-[#F1D39A]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Contexto
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
                    {rightPanelTab === "tasks" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-[#9BAEA8]">Execucoes recentes e estado operacional.</p>
                          <button type="button" onClick={handleResetTasks} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            Limpar
                          </button>
                        </div>
                        {taskHistory.length ? (
                          taskHistory.map((task) => (
                            <article key={task.id} className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]"><TaskStatusChip status={task.status} /></p>
                                  <p className="mt-2 font-semibold text-[#F5F1E8] line-clamp-3">{task.query}</p>
                                </div>
                                <span className="text-[10px] text-[#9BAEA8]">
                                  {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--"}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
                                <span className="rounded-full border border-[#22342F] px-2.5 py-1">{parseProviderPresentation(task.provider || "gpt").name}</span>
                                <span className="rounded-full border border-[#22342F] px-2.5 py-1">{task.steps?.length || 0} etapas</span>
                                {task.rag?.retrieval?.enabled ? <span className="rounded-full border border-[#22342F] px-2.5 py-1">RAG {task.rag.retrieval.matches?.length || 0}</span> : null}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => handlePause(task)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                                  {task.status === "paused" ? "Retomar" : "Pausar"}
                                </button>
                                <button type="button" onClick={() => handleRetry(task)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                                  Replay
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <div className="rounded-[20px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                            Nenhuma tarefa ainda.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4 text-sm text-[#C6D1CC]">
                        <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Modulo</p>
                          <p className="mt-2 font-medium text-[#F5F1E8]">{routePath || "/interno"}</p>
                        </div>
                        <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Memoria</p>
                            <span className="text-[10px] text-[#C5A059]">{contextEnabled ? "ON" : "OFF"}</span>
                          </div>
                          <p className="mt-2 font-medium text-[#F5F1E8]">{ragSummary.count ? `${ragSummary.count} itens relevantes` : "Sem memoria carregada"}</p>
                          {ragSummary.sources.length ? <p className="mt-2 text-xs text-[#9BAEA8]">Fontes: {ragSummary.sources.join(", ")}</p> : null}
                        </div>
                        <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Documentos</p>
                          {attachments.length ? (
                            <div className="mt-3 space-y-2">
                              {attachments.map((attachment) => (
                                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#22342F] px-3 py-2 text-xs">
                                  <span className="truncate">{attachment.name}</span>
                                  <span className="text-[#9BAEA8]">{attachment.kind}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-[#9BAEA8]">Nenhum anexo nesta conversa.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,application/pdf,text/plain,image/*,audio/*" onChange={handleFilesSelected} />
    </>
  );
}
