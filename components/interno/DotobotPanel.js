import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../lib/admin/api";

const CHAT_STORAGE_PREFIX = "dotobot_internal_chat_v2";
const TASK_STORAGE_PREFIX = "dotobot_internal_tasks_v1";
const MAX_HISTORY = 80;
const MAX_TASKS = 80;

function buildStorageKey(prefix, profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${prefix}:${profileId}`;
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

function normalizeMessage(item) {
  return item && typeof item.role === "string" && typeof item.text === "string";
}

export default function DotobotPanel({ profile, routePath }) {
  const chatStorageKey = useMemo(() => buildStorageKey(CHAT_STORAGE_PREFIX, profile), [profile]);
  const taskStorageKey = useMemo(() => buildStorageKey(TASK_STORAGE_PREFIX, profile), [profile]);
  const [messages, setMessages] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedMessages = safeParseArray(window.localStorage.getItem(chatStorageKey), MAX_HISTORY).filter(normalizeMessage);
    const savedTasks = safeParseArray(window.localStorage.getItem(taskStorageKey), MAX_TASKS);
    setMessages(savedMessages);
    setTaskHistory(savedTasks);
  }, [chatStorageKey, taskStorageKey]);

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

  async function handleSubmit(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setError(null);
    setLoading(true);

    const userMessage = { id: `${Date.now()}_u`, role: "user", text: question, createdAt: nowIso() };
    const nextMessages = [...messages, userMessage].slice(-MAX_HISTORY);
    setMessages(nextMessages);
    setInput("");

    const taskId = `${Date.now()}_task`;
    setTaskHistory((current) => [
      {
        id: taskId,
        query: question,
        status: "running",
        startedAt: nowIso(),
        finishedAt: null,
        steps: [],
        logs: [],
        sessionId: null,
        rag: null,
      },
      ...current,
    ].slice(0, MAX_TASKS));

    try {
      const payload = await adminFetch("/api/admin-dotobot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: question,
          context: {
            taskId,
            route: routePath || "/interno",
            profile: {
              id: profile?.id || null,
              email: profile?.email || null,
              role: profile?.role || null,
            },
            history: nextMessages.slice(-20).map((item) => ({
              role: item.role,
              text: item.text,
              createdAt: item.createdAt,
            })),
          },
        }),
      });

      const answerText = payload?.data?.resultText || payload?.data?.result || "Sem resposta do Dotobot.";
      const assistantMessage = {
        id: `${Date.now()}_a`,
        role: "assistant",
        text: typeof answerText === "string" ? answerText : JSON.stringify(answerText),
        createdAt: nowIso(),
      };
      setMessages((current) => [...current, assistantMessage].slice(-MAX_HISTORY));

      setTaskHistory((current) =>
        current.map((task) =>
          task.id !== taskId
            ? task
            : {
                ...task,
                status: payload?.data?.status || "ok",
                finishedAt: nowIso(),
                steps: payload?.data?.steps || [],
                logs: payload?.data?.logs || [],
                sessionId: payload?.data?.sessionId || null,
                rag: payload?.data?.rag || null,
              }
        )
      );
    } catch (submitError) {
      setError(submitError?.message || "Falha ao consultar o Dotobot.");
      setTaskHistory((current) =>
        current.map((task) =>
          task.id !== taskId
            ? task
            : {
                ...task,
                status: "error",
                finishedAt: nowIso(),
                logs: [submitError?.message || "Erro na chamada."],
              }
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleResetChat() {
    setMessages([]);
    setError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(chatStorageKey);
    }
  }

  function handleResetTasks() {
    setTaskHistory([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(taskStorageKey);
    }
  }

  const quickPrompts = [
    "Resuma os dados desta tela em bullets.",
    "Me diga os proximos passos operacionais.",
    "Detecte riscos e inconsistencias relevantes.",
  ];

  function handleTextAreaKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) form.requestSubmit();
    }
  }

  const runningCount = taskHistory.filter((item) => item.status === "running").length;

  return (
    <section className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.98)] backdrop-blur-sm">
      <header className="border-b border-[#2D2E2E] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">Lawdesk AI</p>
            <h3 className="font-serif text-xl">Dotobot</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="border border-[#2D2E2E] px-3 py-1.5 text-xs hover:border-[#C5A059]"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "Expandir" : "Compactar"}
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-[#2D2E2E] px-3 py-2">
            Conversas: <strong>{messages.length}</strong>
          </div>
          <div className="border border-[#2D2E2E] px-3 py-2">
            Tarefas ativas: <strong>{runningCount}</strong>
          </div>
        </div>
      </header>

      {!collapsed ? (
        <>
          <div className="border-b border-[#2D2E2E] px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("chat")}
                className={`border px-3 py-1.5 text-xs ${activeTab === "chat" ? "border-[#C5A059] text-[#C5A059]" : "border-[#2D2E2E]"}`}
              >
                Conversa
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className={`border px-3 py-1.5 text-xs ${activeTab === "tasks" ? "border-[#C5A059] text-[#C5A059]" : "border-[#2D2E2E]"}`}
              >
                Tarefas
              </button>
            </div>
          </div>

          {activeTab === "chat" ? (
            <>
              <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto px-4 py-4 space-y-3">
                {messages.length ? (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`border px-3 py-2 text-sm ${
                        message.role === "assistant"
                          ? "border-[#2D2E2E] bg-[rgba(14,16,15,0.95)]"
                          : "border-[#3C3320] bg-[rgba(40,32,19,0.25)]"
                      }`}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] opacity-60">
                        {message.role === "assistant" ? "Dotobot" : "Voce"}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm opacity-65">
                    Inicie a conversa. O historico do Dotobot fica salvo no navegador para este perfil administrativo.
                  </p>
                )}
                {loading ? <p className="text-sm opacity-65">Dotobot esta pensando...</p> : null}
                {error ? <p className="text-sm text-[#f2b2b2]">{error}</p> : null}
              </div>

              <div className="border-t border-[#2D2E2E] px-4 py-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="border border-[#2D2E2E] px-2 py-1 text-xs opacity-75 hover:opacity-100 hover:border-[#C5A059]"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleSubmit} className="space-y-2">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleTextAreaKeyDown}
                    rows={4}
                    placeholder="Pergunte para o Dotobot..."
                    className="w-full resize-y border border-[#2D2E2E] bg-[rgba(7,9,8,0.98)] px-3 py-2 text-sm outline-none focus:border-[#C5A059]"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleResetChat}
                      className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059]"
                    >
                      Limpar conversas
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="border border-[#C5A059] px-4 py-2 text-sm disabled:opacity-40"
                      style={{ color: "#C5A059" }}
                    >
                      Enviar
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="max-h-[62vh] overflow-y-auto px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.15em] opacity-60">Historico de tarefas</p>
                <button
                  type="button"
                  onClick={handleResetTasks}
                  className="border border-[#2D2E2E] px-3 py-1.5 text-xs hover:border-[#C5A059]"
                >
                  Limpar tarefas
                </button>
              </div>
              {!taskHistory.length ? <p className="text-sm opacity-65">Nenhuma tarefa registrada ainda.</p> : null}
              {taskHistory.map((task) => (
                <article key={task.id} className="border border-[#2D2E2E] bg-[rgba(14,16,15,0.95)] p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.14em] opacity-60">{task.status}</p>
                    <p className="text-[10px] opacity-50">{new Date(task.startedAt).toLocaleString("pt-BR")}</p>
                  </div>
                  <p className="font-semibold">{task.query}</p>
                  {task.steps?.length ? <p className="mt-2 text-xs opacity-70">Etapas: {task.steps.length}</p> : null}
                  {task.sessionId ? <p className="mt-1 text-xs opacity-70">Sessao: {task.sessionId}</p> : null}
                  {task.rag?.retrieval?.enabled ? (
                    <p className="mt-1 text-xs opacity-70">
                      RAG: {task.rag.retrieval.matches?.length || 0} memorias recuperadas
                    </p>
                  ) : null}
                  {task.logs?.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs opacity-70">Logs</summary>
                      <pre className="mt-2 whitespace-pre-wrap text-[11px] opacity-70">
                        {task.logs.slice(0, 8).join("\n")}
                      </pre>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

