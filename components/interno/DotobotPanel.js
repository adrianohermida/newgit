import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { useEffect, useMemo, useRef, useState } from "react";
import { detectIntent } from "../../lib/ai/intent_router";
import { getCurrentContext } from "../../lib/ai/context_engine";
import { useRouter } from "next/router";
import { adminFetch } from "../../lib/admin/api";

const CHAT_STORAGE_PREFIX = "dotobot_internal_chat_v3";
const TASK_STORAGE_PREFIX = "dotobot_internal_tasks_v2";
const PREF_STORAGE_PREFIX = "dotobot_internal_prefs_v1";
const CONVERSATIONS_STORAGE_PREFIX = "dotobot_internal_conversations_v2";
const MAX_HISTORY = 80;
const MAX_TASKS = 80;
const MAX_ATTACHMENTS = 8;
const MAX_CONVERSATIONS = 30;

const MODE_OPTIONS = [
  { value: "chat", label: "Chat", hint: "Conversa assistida" },
  { value: "task", label: "Task", hint: "Execucao em etapas" },
  { value: "analysis", label: "Analysis", hint: "Raciocinio guiado" },
];

const PROVIDER_OPTIONS = [
  { value: "gpt", label: "GPT" },
  { value: "local", label: "Modelo local" },
  { value: "custom", label: "Provedor custom" },
];

const LEGAL_ACTIONS = [
  { label: "Gerar peticao", prompt: "/peticao Estruture a peticao com fatos, fundamentos e pedidos." },
  { label: "Analisar processo", prompt: "/analise Faça uma leitura juridica do processo e destaque riscos." },
  { label: "Criar plano", prompt: "/plano Monte um plano de pagamento ou de negociacao em etapas." },
  { label: "Resumir docs", prompt: "/resumo Resuma os documentos e indique pontos sensiveis." },
];

const QUICK_PROMPTS = [
  "Analise este caso e indique o proximo passo.",
  "Crie um plano operacional em etapas.",
  "Padronize a resposta deste bot em PT-BR.",
  "Resuma riscos, fatos e inferencias deste contexto.",
];

const SLASH_COMMANDS = [
  { value: "/peticao", label: "Gerar peticao", hint: "Estrutura completa com fundamentos e pedidos." },
  { value: "/analise", label: "Analisar processo", hint: "Leitura juridica e riscos." },
  { value: "/plano", label: "Criar plano", hint: "Fluxo operacional com etapas." },
  { value: "/resumo", label: "Resumir documentos", hint: "Sintese tecnica e util." },
  { value: "/tarefas", label: "Ver tarefas", hint: "Abre o modo de acompanhamento operacional." },
];

function buildStorageKey(prefix, profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${prefix}:${profileId}`;
}

function buildConversationStorageKey(profile) {
  return buildStorageKey(CONVERSATIONS_STORAGE_PREFIX, profile);
}

function nowIso() {
  return new Date().toISOString();
}

function safeParseArray(raw, max = MAX_HISTORY) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.slice(-max) : [];
  } catch {
    return [];
  }
}

function safeParseObject(raw, fallback) {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : fallback;
  } catch {
    return fallback;
  }
}

function normalizeMessage(item) {
  return item && typeof item.role === "string" && typeof item.text === "string";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectAttachmentKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function normalizeAttachment(file) {
  const kind = detectAttachmentKind(file);
  // Responsivo: lateral no desktop, desliza de baixo no mobile
  return (
    <div
      className={`fixed lg:static right-0 top-auto bottom-0 z-50 flex h-[60vh] lg:h-full w-full max-w-full lg:max-w-[480px] flex-col border-t lg:border-t-0 lg:border-l border-[#22342F] bg-[rgba(12,15,14,0.98)] shadow-2xl transition-transform duration-300
        ${collapsed ? 'translate-y-full lg:translate-x-full' : 'translate-y-0 lg:translate-x-0'}`}
      style={{ minHeight: 'unset', pointerEvents: 'auto' }}
    >
    type: file.type || "application/octet-stream",
    kind,
    previewUrl: kind === "image" ? URL.createObjectURL(file) : null,
    file,
  };
}

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

function getLastTask(taskHistory) {
  return taskHistory.find((task) => task.status === "running") || taskHistory[0] || null;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function inferConversationTitle(messages = []) {
  const firstUser = messages.find((item) => item.role === "user" && item.text);
  if (!firstUser) return "Nova conversa";
  const text = firstUser.text.replace(/\s+/g, " ").trim();
  return text.length > 48 ? `${text.slice(0, 48).trim()}...` : text;
}

function summarizeConversation(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1];
  const attachments = Array.isArray(conversation?.attachments) ? conversation.attachments : [];
  const taskHistory = Array.isArray(conversation?.taskHistory) ? conversation.taskHistory : [];
  return {
    id: conversation?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: safeText(conversation?.title, inferConversationTitle(messages)),
    archived: Boolean(conversation?.archived),
    createdAt: conversation?.createdAt || nowIso(),
    updatedAt: conversation?.updatedAt || nowIso(),
    tags: Array.isArray(conversation?.tags) ? conversation.tags : [],
    messages,
    taskHistory,
    attachments,
    metadata: conversation?.metadata || {},
    preview: safeText(conversation?.preview, lastMessage?.text || "Sem mensagens ainda"),
  };
}

function createConversationFromState(state) {
  return summarizeConversation({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "Nova conversa",
    messages: state.messages || [],
    taskHistory: state.taskHistory || [],
    attachments: state.attachments || [],
    tags: state.tags || [],
    metadata: state.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
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

function MessageBubble({ message }) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const alignClass = isAssistant ? "justify-start" : "justify-end";
  const bubbleClass = isAssistant
    ? "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F4F1EA]"
    : isSystem
      ? "border-[#2E3A36] bg-[rgba(255,255,255,0.02)] text-[#9FB1AA]"
      : "border-[#3C3320] bg-[rgba(40,32,19,0.28)] text-[#F7F1E6]";

  return (
    <div className={`flex ${alignClass}`}>
      <article className={`max-w-[min(48rem,92%)] rounded-[24px] border px-4 py-3 text-sm ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] opacity-60">
          <span>{isAssistant ? "Dotobot" : isSystem ? "Sistema" : "Administrador / equipe"}</span>
          {message.createdAt ? <span>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
        </div>
        {renderRichText(message.text)}
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
    ok: "Concluido",
  };
  return <span>{mapping[status] || String(status || "Indefinido")}</span>;
}

function getVoiceRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function DotobotCopilot({
    // Integração com extensão
    const { extensionReady, lastResponse, sendCommand } = useDotobotExtensionBridge();

    // Exemplo: enviar comando para extensão ao detectar intenção específica
    async function handleExtensionActionIfNeeded(intent, question) {
      if (!extensionReady) return;
      // Exemplo: se intenção for "web_search" ou "local_file_access"
      if (["web_search", "local_file_access"].includes(intent)) {
        await sendCommand(intent, { query: question });
      }
    }
  profile,
  routePath,
  initialWorkspaceOpen = true,
  defaultCollapsed = false,
  compactRail = false,
}) {
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiState, setUiState] = useState("idle");
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [mode, setMode] = useState("task");
  const [provider, setProvider] = useState("gpt");
  const [contextEnabled, setContextEnabled] = useState(true);
  const [attachments, setAttachments] = useState([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingRetrigger, setPendingRetrigger] = useState(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedMessages = safeParseArray(window.localStorage.getItem(chatStorageKey), MAX_HISTORY).filter(normalizeMessage);
    const savedTasks = safeParseArray(window.localStorage.getItem(taskStorageKey), MAX_TASKS);
    const savedPrefs = safeParseObject(window.localStorage.getItem(prefStorageKey), {});
    const savedConversations = safeParseArray(window.localStorage.getItem(conversationStorageKey), MAX_CONVERSATIONS)
      .map(summarizeConversation)
      .filter(Boolean);
    const fallbackConversation = createConversationFromState({
      messages: savedMessages,
      taskHistory: savedTasks,
      attachments: [],
      metadata: {},
    });
    const nextConversations = savedConversations.length ? savedConversations : [fallbackConversation];
    const nextActiveId = savedPrefs.activeConversationId || nextConversations[0]?.id || fallbackConversation.id;
    const activeConversation = nextConversations.find((item) => item.id === nextActiveId) || nextConversations[0] || fallbackConversation;
    setConversations(nextConversations);
    setActiveConversationId(activeConversation.id);
    setMessages(Array.isArray(activeConversation.messages) && activeConversation.messages.length ? activeConversation.messages : savedMessages);
    setTaskHistory(Array.isArray(activeConversation.taskHistory) && activeConversation.taskHistory.length ? activeConversation.taskHistory : savedTasks);
    setAttachments(Array.isArray(activeConversation.attachments) ? activeConversation.attachments : []);
    if (savedPrefs.mode) setMode(savedPrefs.mode);
    if (savedPrefs.provider) setProvider(savedPrefs.provider);
    if (typeof savedPrefs.contextEnabled === "boolean") setContextEnabled(savedPrefs.contextEnabled);
    setWorkspaceOpen(Boolean(savedPrefs.workspaceOpen || initialWorkspaceOpen));
  }, [chatStorageKey, taskStorageKey, prefStorageKey, conversationStorageKey, initialWorkspaceOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-MAX_HISTORY)));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(taskStorageKey, JSON.stringify(taskHistory.slice(-MAX_TASKS)));
  }, [taskHistory, taskStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!conversations.length) return;
    const next = conversations.map((conversation) => ({
      ...summarizeConversation(conversation),
      messages: conversation.id === activeConversationId ? messages.slice(-MAX_HISTORY) : conversation.messages || [],
      taskHistory: conversation.id === activeConversationId ? taskHistory.slice(-MAX_TASKS) : conversation.taskHistory || [],
      attachments: conversation.id === activeConversationId ? attachments.slice(0, MAX_ATTACHMENTS) : conversation.attachments || [],
      updatedAt: conversation.id === activeConversationId ? nowIso() : conversation.updatedAt || nowIso(),
      title: safeText(conversation.title, inferConversationTitle(conversation.messages || [])),
      preview: conversation.id === activeConversationId ? safeText(messages[messages.length - 1]?.text, conversation.preview) : conversation.preview,
    })).slice(0, MAX_CONVERSATIONS);
    window.localStorage.setItem(conversationStorageKey, JSON.stringify(next));
    setConversations(next);
  }, [messages, taskHistory, attachments, activeConversationId, conversationStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      prefStorageKey,
      JSON.stringify({
        mode,
        provider,
        contextEnabled,
        workspaceOpen,
        activeConversationId,
      })
    );
  }, [mode, provider, contextEnabled, workspaceOpen, activeConversationId, prefStorageKey]);

  // Copilot sempre disponível, apenas colapsa visualmente
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
    let finalUiState = "idle";

    // Integração operacional: detectar intenção e contexto
    const detected = detectIntent(trimmedQuestion);
    const context = getCurrentContext({ route: routePath });

    // Exemplo: mensagem de status no chat
    setMessages((msgs) => [
      ...msgs,
      { role: "user", text: trimmedQuestion, createdAt: nowIso() },
      { role: "assistant", text: `Entendi sua intenção: ${detected.intent}. Estou processando...`, createdAt: nowIso() },
    ]);

    // Se for intenção de extensão, aciona
    await handleExtensionActionIfNeeded(detected.intent, trimmedQuestion);

    setTimeout(() => {
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", text: `Ação '${detected.intent}' concluída (simulação).`, createdAt: nowIso() },
      ]);
      setLoading(false);
      setUiState(finalUiState);
    }, 1200);
  }

    return (
      <div className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col border-l border-[#22342F] bg-[rgba(12,15,14,0.98)] shadow-2xl transition-transform duration-300 ${collapsed ? 'translate-x-full' : 'translate-x-0'}`}
        style={{ minHeight: '100vh' }}
      >
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-[#22342F] px-4 py-3 lg:px-6 lg:py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#D9B46A] px-3 py-1 text-xs font-bold text-[#1A1A1A]">Dotobot Copilot</span>
            <span className="text-xs text-[#9BAEA8]">{uiState === "responding" ? "Pensando..." : uiState === "executing" ? "Executando..." : "Idle"}</span>
          </div>
          <button
            className="rounded-full border border-[#22342F] px-2 py-1 text-xs text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#C5A059]"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "Abrir" : "Colapsar"}
          </button>
        </header>
        {/* MAIN CHAT AREA */}
        <main className="flex-1 overflow-y-auto px-4 py-3 lg:px-6 lg:py-4" ref={scrollRef}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <div className="mt-2 text-xs text-[#D9B46A]">Pensando...</div>
          )}
        </main>
        {/* INPUT AREA */}
        <footer className="border-t border-[#22342F] bg-[rgba(12,15,14,0.98)] px-4 py-3 lg:px-6 lg:py-4">
          <form
            className="flex items-end gap-3"
            onSubmit={handleSubmit}
          >
            <textarea
              ref={composerRef}
              className="flex-1 resize-none rounded-2xl border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] placeholder-[#7F928C] focus:border-[#C5A059] focus:outline-none"
              rows={2}
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="rounded-2xl bg-[#D9B46A] px-6 py-3 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#C5A059]"
              disabled={loading || !input.trim()}
            >
              Enviar
            </button>
          </form>
        </footer>
      </div>
    );


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
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? summarizeConversation({
                ...conversation,
                attachments: [...(conversation.attachments || []), ...normalized].slice(0, MAX_ATTACHMENTS),
                updatedAt: nowIso(),
              })
            : conversation
        )
      );
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
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const next = typeof updater === "function" ? updater(conversation) : updater;
        return summarizeConversation({
          ...conversation,
          ...next,
          updatedAt: nowIso(),
        });
      })
    );
  }

  function createConversationFromCurrentState(title = inferConversationTitle(messages)) {
    const nextConversation = summarizeConversation({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      messages: messages.slice(-MAX_HISTORY),
      taskHistory: taskHistory.slice(-MAX_TASKS),
      attachments: attachments.slice(0, MAX_ATTACHMENTS),
      tags: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    setConversations((current) => [nextConversation, ...current].slice(0, MAX_CONVERSATIONS));
    setActiveConversationId(nextConversation.id);
    return nextConversation;
  }

  function selectConversation(conversation) {
    if (!conversation) return;
    setActiveConversationId(conversation.id);
    setMessages(Array.isArray(conversation.messages) ? conversation.messages : []);
    setTaskHistory(Array.isArray(conversation.taskHistory) ? conversation.taskHistory : []);
    setAttachments(Array.isArray(conversation.attachments) ? conversation.attachments : []);
    setError(null);
    setWorkspaceOpen(true);
  }

  function renameConversation(conversation) {
    const currentTitle = conversation?.title || inferConversationTitle(conversation?.messages || []);
    const nextTitle = typeof window !== "undefined" ? window.prompt("Renomear conversa", currentTitle) : null;
    if (!nextTitle || !nextTitle.trim()) return;
    updateConversationById(conversation.id, {
      title: nextTitle.trim(),
    });
  }

  function archiveConversation(conversation) {
    updateConversationById(conversation.id, (current) => ({ archived: !current.archived }));
  }

  function deleteConversation(conversation) {
    if (typeof window !== "undefined" && !window.confirm(`Excluir a conversa "${conversation.title || "sem titulo"}"?`)) {
      return;
    }
    const remaining = conversations.filter((item) => item.id !== conversation.id);
    if (remaining.length) {
      setConversations(remaining);
      if (conversation.id === activeConversationId) {
        selectConversation(remaining[0]);
      }
      return;
    }
    const replacement = summarizeConversation({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: "Nova conversa",
      messages: [],
      taskHistory: [],
      attachments: [],
      tags: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    setConversations([replacement]);
    setActiveConversationId(replacement.id);
    setMessages([]);
    setTaskHistory([]);
    setAttachments([]);
    if (conversation.id === activeConversationId) {
      selectConversation(replacement);
    }
  }

  function attachFilesToConversation(conversationId, files) {
    const attachmentsToAdd = Array.from(files || [])
      .slice(0, MAX_ATTACHMENTS)
      .map((file) => normalizeAttachment(file));
    if (!attachmentsToAdd.length) return;
    if (!conversationId) {
      setAttachments((current) => [...current, ...attachmentsToAdd].slice(0, MAX_ATTACHMENTS));
      return;
    }
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? summarizeConversation({
              ...conversation,
              attachments: [...(conversation.attachments || []), ...attachmentsToAdd].slice(0, MAX_ATTACHMENTS),
              updatedAt: nowIso(),
            })
          : conversation
      )
    );
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

  function handleSlashCommand(command) {
    setInput(`${command.value} `);
    setShowSlashCommands(false);
    composerRef.current?.focus();
  }

  function toggleVoiceInput() {
    const Recognition = getVoiceRecognition();
    if (!Recognition) {
      setError("Transcricao por voz nao suportada neste navegador.");
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
    if (typeof window !== "undefined" && !window.confirm("Cancelar esta execucao do Dotobot?")) {
      return;
    }
    syncTaskHistory(task.id, (current) => ({
      ...current,
      status: "canceled",
      canceled: true,
      logs: [...(current.logs || []), "Execucao cancelada pelo operador."],
    }));
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
  const activeProviderLabel = PROVIDER_OPTIONS.find((item) => item.value === provider)?.label || "GPT";
  const isWorkspaceShell = workspaceOpen;
  const railCollapsed = compactRail ? true : collapsed;
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0] || null;
  const filteredConversations = conversations.filter((conversation) => {
    if (conversation.archived) return false;
    if (!conversationSearch.trim()) return true;
    const haystack = [
      conversation.title,
      conversation.preview,
      ...(conversation.tags || []),
      ...(Array.isArray(conversation.messages) ? conversation.messages.map((message) => message.text) : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(conversationSearch.toLowerCase());
  });

  return (
    <>
      <section className="border border-[#22342F] bg-[rgba(10,12,11,0.98)] backdrop-blur-sm">
        <header className="border-b border-[#22342F] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Dotobot AI</p>
              <div className="mt-2 flex items-center gap-3">
                <h3 className="font-serif text-xl text-[#F5F1E8]">Copilot</h3>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                  <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                  {activeStatus === "processing" ? uiStateLabel : "Idle"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {compactRail ? (
                <div className="flex flex-col gap-2">
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
                    onClick={() => setCollapsed((value) => !value)}
                  >
                    {collapsed ? "Expandir" : "Compactar"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#9BAEA8]">
            <span className="rounded-full border border-[#22342F] px-3 py-2">Hist: {messages.length}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-2">Tasks: {runningCount}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-2">Modo: {activeMode.label}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-2">Modelo: {activeProviderLabel}</span>
          </div>
        </header>

        {compactRail ? (
          <div className="px-4 py-4">
            <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Copilot compacto</p>
              <p className="mt-2 text-sm leading-6 text-[#9BAEA8]">
                Painel lateral de acesso rapido. A conversa completa, tasks e execucao em tela cheia ficam no modulo central.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/interno/ai-task")}
                  className="rounded-full border border-[#C5A059] px-3 py-1.5 text-[11px] font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
                >
                  Abrir Copilot
                </button>
                <button
                  type="button"
                  onClick={() => setContextEnabled((value) => !value)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                    contextEnabled
                      ? "border-[#3E5B50] bg-[rgba(64,122,97,0.16)] text-[#A9E3C3]"
                      : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                  }`}
                >
                  Contexto {contextEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        ) : !railCollapsed ? (
          <>
            <div className="border-b border-[#22342F] px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {LEGAL_ACTIONS.slice(0, 2).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action.prompt)}
                    className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D9E0DB] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={scrollRef} className="max-h-[46vh] overflow-y-auto px-4 py-4 space-y-3">
              {messages.length ? (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              ) : (
                <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                  <p className="font-medium text-[#F5F1E8]">Pronto para operar.</p>
                  <p className="mt-2 leading-7">
                    Envie uma ordem, analise de caso, pedido de fluxo ou instrucao de treinamento. O Dotobot responde em PT-BR, com foco interno, seguranca juridica e proximos passos.
                  </p>
                </div>
              )}
              {loading ? <p className="text-sm text-[#9BAEA8]">Dotobot esta analisando o contexto e montando a resposta...</p> : null}
              {error ? <p className="text-sm text-[#f2b2b2]">{error}</p> : null}
            </div>

            <div className="border-t border-[#22342F] px-4 py-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
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
                  rows={4}
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

        {isWorkspaceShell ? (
          <div className="fixed inset-0 z-[70] bg-[radial-gradient(circle_at_top_left,rgba(52,46,18,0.16),transparent_28%),linear-gradient(180deg,rgba(3,5,4,0.98),rgba(5,8,7,0.96))] text-[#F4F1EA] backdrop-blur-xl">
          <div className="flex h-full flex-col">
            <header className="border-b border-[#22342F]/80 bg-[rgba(7,10,9,0.78)] px-4 py-4 backdrop-blur-xl md:px-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#F5F1E8] md:text-[30px]">Dotobot Command Center</h2>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
                      <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
                      {activeStatus === "processing" ? "Processando" : "Online"}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9BAEA8]">
                    {activeConversation?.title || "Nova conversa"} · conversa ativa no centro, contexto e documentos na lateral direita.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                    className="h-10 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-xs text-[#D8DEDA] outline-none transition focus:border-[#C5A059]"
                  >
                    {PROVIDER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
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
                    onClick={() => setWorkspaceOpen(false)}
                    className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-hidden p-4 md:p-5">
              <div className="grid h-full gap-4 xl:grid-cols-[280px_minmax(0,1.2fr)_340px]">
                <aside className="flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
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
                    <div className="mt-4">
                      <input
                        value={conversationSearch}
                        onChange={(event) => setConversationSearch(event.target.value)}
                        placeholder="Buscar conversas"
                        className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
                      />
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
                            className={`rounded-[24px] border p-3 transition ${
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
                                <span className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">
                                  {conversation.messages?.length || 0}
                                </span>
                              </div>
                            </button>

                            <details className="mt-3">
                              <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-[#9BAEA8]">
                                Metadados
                              </summary>
                              <div className="mt-3 space-y-2 text-xs text-[#9BAEA8]">
                                <p>Data: {conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleString("pt-BR") : "n/a"}</p>
                                <p>Tags: {(conversation.tags || []).join(", ") || "sem tags"}</p>
                                <p>Anexos: {conversation.attachments?.length || 0}</p>
                              </div>
                            </details>

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

                <section className="flex min-h-0 flex-col rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                  <div className="border-b border-[#22342F] px-4 py-4 md:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Conversa</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {LEGAL_ACTIONS.map((action) => (
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
                      messages.map((message) => <MessageBubble key={message.id} message={message} />)
                    ) : (
                      <div className="rounded-[28px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5 text-sm text-[#9BAEA8]">
                        <p className="text-base font-semibold text-[#F5F1E8]">Pronto para operar.</p>
                      </div>
                    )}
                    {loading ? (
                      <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#9BAEA8]">
                        {uiStateLabel}...
                      </div>
                    ) : null}
                    {error ? (
                      <div className="rounded-[24px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-4 py-3 text-sm text-[#f2b2b2]">
                        {error}
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-[#22342F] px-4 py-4 md:px-5">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
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
                      <div className="rounded-[28px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                        <textarea
                          ref={composerRef}
                          value={input}
                          onChange={(event) => {
                            setInput(event.target.value);
                            setShowSlashCommands(event.target.value.trimStart().startsWith("/"));
                          }}
                          onKeyDown={handleComposerKeyDown}
                          onPaste={handlePaste}
                          rows={5}
                          placeholder="Digite uma instrução jurídica ou operacional..."
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
                          <div className="mt-3 grid gap-2 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-2 md:grid-cols-2">
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
                          <button type="button" onClick={handleOpenFiles} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            Upload
                          </button>
                          <button type="button" onClick={toggleVoiceInput} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            {isRecording ? "Stop" : "Voice"}
                          </button>
                          <button type="button" onClick={() => composerRef.current?.focus()} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                            Cmd+K
                          </button>
                        </div>
                        <button type="submit" disabled={loading || !input.trim()} className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition disabled:opacity-40">
                          Send
                        </button>
                      </div>
                    </form>
                  </div>
                </section>

                <aside className="min-h-0 space-y-4 overflow-y-auto pr-1 xl:pr-0">
                  <section className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Tasks</p>
                      </div>
                      <button type="button" onClick={handleResetTasks} className="rounded-2xl border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                        Limpar
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {taskHistory.length ? (
                        taskHistory.map((task) => (
                          <article key={task.id} className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]"><TaskStatusChip status={task.status} /></p>
                                <p className="mt-2 font-semibold text-[#F5F1E8]">{task.query}</p>
                              </div>
                              <span className="text-[10px] text-[#9BAEA8]">
                                {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--"}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
                              <span className="rounded-full border border-[#22342F] px-2.5 py-1">Modo: {task.mode || "task"}</span>
                              <span className="rounded-full border border-[#22342F] px-2.5 py-1">Modelo: {task.provider || "gpt"}</span>
                              <span className="rounded-full border border-[#22342F] px-2.5 py-1">Etapas: {task.steps?.length || 0}</span>
                            </div>

                            {task.sessionId ? <p className="mt-3 text-xs text-[#9BAEA8]">Sessao: {task.sessionId}</p> : null}
                            {task.contextEnabled === false ? <p className="mt-1 text-xs text-[#9BAEA8]">Contexto estateless.</p> : null}
                            {task.rag?.retrieval?.enabled ? (
                              <p className="mt-1 text-xs text-[#9BAEA8]">RAG: {task.rag.retrieval.matches?.length || 0} contextos recuperados</p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => handlePause(task)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                                {task.status === "paused" ? "Resume" : "Pause"}
                              </button>
                              <button type="button" onClick={() => handleRetry(task)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                                Replay
                              </button>
                              <button type="button" onClick={() => handleCancel(task)} className="rounded-full border border-[#4f2525] px-3 py-1.5 text-[11px] text-[#f2b2b2] transition hover:border-[#f2b2b2]">
                                Stop
                              </button>
                            </div>

                            {task.logs?.length ? (
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-[#9BAEA8]">Logs</summary>
                                <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-[#22342F] bg-[rgba(4,7,6,0.95)] p-3 text-[11px] leading-6 text-[#C6D1CC]">
                                  {task.logs.slice(0, 10).join("\n")}
                                </pre>
                              </details>
                            ) : null}
                          </article>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                          No tasks yet.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4">
                    <details open>
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Context</p>
                          </div>
                          <span className="text-xs text-[#C5A059]">{contextEnabled ? "ON" : "OFF"}</span>
                        </div>
                      </summary>

                      <div className="mt-4 space-y-4 text-sm text-[#C6D1CC]">
                        <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Module</p>
                          <p className="mt-2 font-medium text-[#F5F1E8]">{routePath || "/interno"}</p>
                        </div>

                        <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Memory</p>
                          <p className="mt-2 font-medium text-[#F5F1E8]">{ragSummary.count ? `${ragSummary.count} items` : "No memory yet"}</p>
                          {ragSummary.sources.length ? <p className="mt-2 text-xs text-[#9BAEA8]">Fontes: {ragSummary.sources.join(", ")}</p> : null}
                          {!contextEnabled ? <p className="mt-2 text-xs text-[#9BAEA8]">Context off.</p> : null}
                        </div>

                        <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Documents</p>
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
                            <p className="mt-2 text-xs text-[#9BAEA8]">No attachments.</p>
                          )}
                        </div>
                      </div>
                    </details>
                  </section>
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
