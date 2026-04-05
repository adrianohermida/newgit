import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import { FixedSizeList as VirtualList } from "react-window";

import { detectIntent } from "../../lib/ai/intent_router";
import { getCurrentContext } from "../../lib/ai/context_engine";
import { useRouter } from "next/router";
import { adminFetch } from "../../lib/admin/api";
import { useSupabaseBrowser } from "../../lib/supabase";
import { pollTaskRun, startTaskRun } from "./dotobotTaskRun";
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
  return {
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

function MessageBubble({ message, isTyping }) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const alignClass = isAssistant ? "justify-start" : "justify-end";
  const bubbleClass = isAssistant
    ? "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F4F1EA]"
    : isSystem
      ? "border-[#2E3A36] bg-[rgba(255,255,255,0.02)] text-[#9FB1AA]"
      : "border-[#3C3320] bg-[rgba(40,32,19,0.28)] text-[#F7F1E6]";

  // Suporte multimodal: imagens/áudios
  const media = Array.isArray(message.media) ? message.media : [];

  return (
    <div className={`flex ${alignClass}`}>
      <article className={`max-w-[min(48rem,92%)] rounded-[24px] border px-4 py-3 text-sm ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] opacity-60">
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
    ok: "Concluido",
  };
  return <span>{mapping[status] || String(status || "Indefinido")}</span>;
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
}) {
  // Estado de autenticação/admin
  const { supabase, loading: supaLoading, configError } = useSupabaseBrowser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Valida sessão e perfil admin
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

  // Estado colapsado
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    if (typeof persistedState.prefs.contextEnabled === "boolean") setContextEnabled(persistedState.prefs.contextEnabled);
    setWorkspaceOpen(persistedState.prefs.workspaceOpen);
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
    const next = syncConversationSnapshots({
      conversations,
      activeConversationId,
      messages,
      taskHistory,
      attachments,
    });
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

    // Adiciona mensagem do usuário
    setMessages((msgs) => [
      ...msgs,
      { role: "user", text: trimmedQuestion, createdAt: nowIso() },
    ]);
    // PATCH 8: scroll automático ao enviar
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
      contextEnabled: nextContextEnabled,
      activeConversationId,
      messages,
      attachments,
    });

    // Detecta se é comando de skill/task
    if (isTaskCommand(trimmedQuestion)) {
      // Dispara TaskRun
      setUiState("executing");
      setTaskHistory((tasks) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          status: "running",
          query: trimmedQuestion,
          logs: ["Execução iniciada..."],
          startedAt: nowIso(),
        },
        ...tasks,
      ]);
      try {
        const data = await startTaskRun({
          query: trimmedQuestion,
          mode: nextMode,
          provider: nextProvider,
          contextEnabled: nextContextEnabled,
          context: globalContext,
        });
        if (data?.ok && data?.result?.id) {
          const runId = data.result.id;
          await pollTaskRun(runId, {
            onUpdate: (result) => {
              setTaskHistory((tasks) =>
                tasks.map((task) =>
                  task.id === runId
                    ? {
                        ...task,
                        status: result.status,
                        logs: result.events?.map((event) => event.message) || [],
                        result: result.result,
                        finishedAt: result.updated_at,
                      }
                    : task
                )
              );
            },
          });
        } else {
          setError(data?.error || "Falha ao iniciar TaskRun.");
        }
      } catch (err) {
        setError(err.message || "Erro ao executar TaskRun.");
      }
      setLoading(false);
      setUiState("idle");
      return;
    }

    // Chat normal (streaming)
    try {
      // PATCH 2.8/2.9: Streaming
      const response = await fetch("/functions/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuestion,
          mode: nextMode,
          provider: nextProvider,
          contextEnabled: nextContextEnabled,
          context: globalContext,
        }),
      });
      if (!response.body || !window.ReadableStream) {
        // Fallback para resposta normal
        const data = await response.json();
        setMessages((msgs) => [
          ...msgs,
          {
            role: "assistant",
            text: extractAssistantResponseText(data),
            createdAt: nowIso(),
          },
        ]);
        setLoading(false);
        setUiState("idle");
        return;
      }
      // Mensagem inicial de execução
      setMessages((msgs) => [
        ...msgs,
        { role: "assistant", text: "", createdAt: nowIso(), status: "thinking" },
      ]);
      setUiState("thinking");
      const reader = response.body.getReader();
      let fullText = "";
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = new TextDecoder().decode(value);
          fullText += chunk;
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1];
            // Atualiza última mensagem do assistente
            return [
              ...msgs.slice(0, -1),
              { ...last, text: fullText, status: done ? "ok" : "running" },
            ];
          });
          setUiState(done ? "idle" : "running");
        }
      }
      setLoading(false);
      setUiState("idle");
    } catch (err) {
      setError(err.message || "Erro ao conectar ao backend.");
      setLoading(false);
      setUiState("idle");
    }



    // Botão flutuante de reabertura
  }

    const FloatingTrigger = () => (
      isCollapsed && (
        <button
          className="fixed right-2 top-1/2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#C5A059] shadow-lg hover:bg-[#D9B46A] transition-all"
          onClick={() => setIsCollapsed(false)}
          title="Abrir Copilot (Ctrl + .)"
        >
          <span className="text-2xl font-bold text-[#1A1A1A]">💬</span>
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
      waiting: "Aguardando aprovação...",
    }[uiState] || "Pronto";

    // Modal de detalhes da Task
    const [showTaskModal, setShowTaskModal] = useState(false);
    const activeTask = getLastTask(taskHistory);

    const TaskModal = () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div className="w-full max-w-xl rounded-2xl bg-[#181B19] p-6 shadow-2xl border border-[#22342F] relative">
          <button className="absolute right-4 top-4 text-[#C5A059] text-xl" onClick={() => setShowTaskModal(false)} title="Fechar">×</button>
          <h2 className="mb-4 text-lg font-bold text-[#F5F1E8]">Detalhes da Execução</h2>
          {activeTask ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">Status:</span>
                <TaskStatusChip status={activeTask.status} />
              </div>
              <div className="text-xs text-[#C5A059]">{activeTask.query}</div>
              <div className="mt-2">
                <h3 className="font-semibold text-[#D9B46A] mb-1">Logs</h3>
                <div className="max-h-40 overflow-y-auto rounded bg-[#232823] p-2 text-xs text-[#EAE3D6]">
                  {(activeTask.logs || []).map((log, idx) => (
                    <div key={idx} className="mb-1">{log}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[#9BAEA8]">Nenhuma execução ativa.</div>
          )}
        </div>
      </div>
    );

    // Header de contexto
    const ContextHeader = () => (
      <div className="flex items-center justify-between gap-3 border-b border-[#22342F] px-4 py-3 bg-[rgba(12,15,14,0.98)]">
        <div className="flex items-center gap-3">
          {!isCollapsed && <span className="rounded-full bg-[#D9B46A] px-3 py-1 text-xs font-bold text-[#1A1A1A]">Dotobot Copilot</span>}
          {!isCollapsed && <span className="text-xs text-[#9BAEA8]">{stateLabel}</span>}
          {!isCollapsed && <span className="ml-2 text-xs text-[#C5A059]">📍 {routePath || "Módulo atual"}</span>}
        </div>
        <button
          className="rounded-xl border border-[#22342F] bg-[#181B19] px-2 py-1 text-[#C5A059] hover:border-[#C5A059] focus:outline-none text-xs"
          onClick={() => setIsCollapsed((v) => !v)}
          title={isCollapsed ? "Expandir Copilot" : "Colapsar Copilot"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
        {!isCollapsed && (
          <button
            className="ml-2 rounded-xl border border-[#22342F] bg-[#181B19] px-3 py-1 text-[#C5A059] hover:border-[#C5A059] focus:outline-none text-xs"
            onClick={() => setShowTaskModal(true)}
            title="Ver detalhes da execução"
          >
            Execução
          </button>
        )}
      </div>
    );

    return (
      <>
        <FloatingTrigger />
        {showTaskModal && <TaskModal />}
        <div
          className={`h-full border-l border-neutral-800 transition-all duration-300 bg-[rgba(12,15,14,0.98)] shadow-2xl flex flex-col fixed right-0 top-0 z-40
            ${isCollapsed ? "w-[48px]" : "w-[92vw] sm:w-[340px] md:w-[380px] lg:w-[420px] xl:w-[480px]"}
            ${isCollapsed ? "min-w-[48px]" : "min-w-[92vw] sm:min-w-[340px] md:min-w-[380px] lg:min-w-[420px] xl:min-w-[480px]"}
          `}
          style={{ minHeight: "100vh", maxWidth: "100vw" }}
        >
          <ContextHeader />
          {!isCollapsed && (
            <>
              {/* MAIN CHAT AREA */}
              <main
                className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3 lg:px-6 lg:py-4"
                ref={scrollRef}
                style={{ maxHeight: 'calc(100vh - 60px - 60px)' }}
              >
                <VirtualList
                  height={typeof window !== "undefined" ? Math.max(window.innerHeight * 0.6, 220) : 400}
                  itemCount={messages.length + (uiState === "typing" || loading ? 1 : 0)}
                  itemSize={110}
                  width={"100%"}
                  overscanCount={6}
                >
                  {({ index, style }) => {
                    // Estado visual: digitando
                    if (index === messages.length && (uiState === "typing" || loading)) {
                      return (
                        <div style={style}>
                          <MessageBubble
                            message={{ role: "assistant", text: "", createdAt: null }}
                            isTyping={true}
                          />
                        </div>
                      );
                    }
                    const msg = messages[index];
                    return (
                      <div style={style}>
                        <MessageBubble message={msg} />
                      </div>
                    );
                  }}
                </VirtualList>
              </main>
              {/* INPUT AREA */}
              <footer className="border-t border-[#22342F] bg-[rgba(12,15,14,0.98)] px-2 py-2 sm:px-3 sm:py-3 lg:px-6 lg:py-4">
                <form className="flex items-end gap-2" onSubmit={handleSubmit}>
                  {/* Botão de anexar */}
                  <button
                    type="button"
                    className="rounded-xl border border-[#22342F] bg-[#181B19] px-3 py-2 text-[#C5A059] hover:border-[#C5A059] focus:outline-none"
                    title="Anexar arquivo"
                    onClick={handleOpenFiles}
                  >
                    <span className="text-lg">📎</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                  />
                  {/* Botão de voz */}
                  <button
                    type="button"
                    className={`rounded-xl border border-[#22342F] bg-[#181B19] px-3 py-2 text-[#C5A059] hover:border-[#C5A059] focus:outline-none ${isRecording ? "animate-pulse border-[#D9B46A]" : ""}`}
                    title="Entrada por voz"
                    onClick={toggleVoiceInput}
                  >
                    <span className="text-lg">🎤</span>
                  </button>
                  {/* Botão de ação rápida */}
                  <button
                    type="button"
                    className="rounded-xl border border-[#22342F] bg-[#181B19] px-3 py-2 text-[#C5A059] hover:border-[#C5A059] focus:outline-none"
                    title="Ações rápidas"
                    onClick={() => setShowSlashCommands(true)}
                  >
                    <span className="text-lg">⚡</span>
                  </button>
                  {/* Campo de texto */}
                  <textarea
                    ref={composerRef}
                    className="flex-1 resize-none rounded-xl border border-[#22342F] bg-transparent px-3 py-2 text-sm text-[#F5F1E8] placeholder-[#7F928C] focus:border-[#C5A059] focus:outline-none"
                    rows={1}
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={loading}
                    style={{ minHeight: 36, maxHeight: 80 }}
                  />
                  {/* Botão enviar */}
                  <button
                    type="submit"
                    className="rounded-xl bg-[#D9B46A] px-4 py-2 text-sm font-bold text-[#1A1A1A] transition hover:bg-[#C5A059]"
                    disabled={loading || !input.trim()}
                  >
                    ⏎
                  </button>
                </form>
              </footer>
            </>
          )}
        </div>
      </>
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

  function createConversationFromCurrentState(title = inferConversationTitle(messages)) {
    const nextConversation = createConversationSnapshot({ title, messages, taskHistory, attachments });
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
    const remaining = deleteConversationFromCollection(conversations, conversation.id);
    if (remaining.length) {
      setConversations(remaining);
      if (conversation.id === activeConversationId) {
        selectConversation(remaining[0]);
      }
      return;
    }
    const replacement = createEmptyConversation("Nova conversa");
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
  // const activeTask = getLastTask(taskHistory); // Removido: duplicado
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
  const filteredConversations = filterVisibleConversations(conversations, conversationSearch);

  // Exemplo de fluxo de login Supabase
  async function handleLogin() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: window.prompt("Email admin:"),
      password: window.prompt("Senha:"),
    });
    if (error) alert("Falha no login: " + error.message);
    else window.location.reload();
  }

  // Alerta visual de login/admin ausente
  if (!authChecked || supaLoading) {
    return <div className="p-8 text-center text-lg text-[#C5A059]">Verificando autenticação...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="mb-6 text-2xl text-[#C5A059]">⚠️ Acesso restrito</div>
        <div className="mb-4 text-[#EAE3D6]">Faça login como administrador para usar o Dotobot.</div>
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
                <VirtualList
                  height={320}
                  itemCount={messages.length}
                  itemSize={110}
                  width={"100%"}
                  overscanCount={6}
                >
                  {({ index, style }) => (
                    <div style={style}>
                      <MessageBubble message={messages[index]} />
                    </div>
                  )}
                </VirtualList>
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
                      messages.map((message, idx) => <MessageBubble key={message.id || idx} message={message} />)
                    ) : (
                      <div className="rounded-[28px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5 text-sm text-[#9BAEA8]">
                        <p className="text-base font-semibold text-[#F5F1E8]">Pronto para operar.</p>
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
