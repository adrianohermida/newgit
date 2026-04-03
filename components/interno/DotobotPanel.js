import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../lib/admin/api";

const STORAGE_PREFIX = "dotobot_internal_chat_v1";
const MAX_HISTORY = 80;

function buildStorageKey(profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${STORAGE_PREFIX}:${profileId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeParseHistory(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && typeof item.role === "string" && typeof item.text === "string")
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export default function DotobotPanel({ profile, routePath }) {
  const storageKey = useMemo(() => buildStorageKey(profile), [profile]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    setMessages(safeParseHistory(saved));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_HISTORY)));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, storageKey]);

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

    try {
      const payload = await adminFetch("/api/admin-dotobot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: question,
          context: {
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
    } catch (submitError) {
      setError(submitError?.message || "Falha ao consultar o Dotobot.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setMessages([]);
    setError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
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
      if (form) {
        form.requestSubmit();
      }
    }
  }

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
            <button
              type="button"
              className="border border-[#2D2E2E] px-3 py-1.5 text-xs hover:border-[#C5A059]"
              onClick={handleReset}
            >
              Novo chat
            </button>
          </div>
        </div>
      </header>

      {!collapsed ? (
        <>
          <div ref={scrollRef} className="max-h-[56vh] overflow-y-auto px-4 py-4 space-y-3">
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
                <p className="text-xs opacity-55">Enter envia. Shift+Enter quebra linha.</p>
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
      ) : null}
    </section>
  );
}

