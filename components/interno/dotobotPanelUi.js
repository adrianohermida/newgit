import { useInternalTheme } from "./InternalThemeProvider";

export const SLASH_COMMANDS = [
  { value: "/peticao", label: "Gerar peticao", hint: "Estrutura completa com fundamentos e pedidos." },
  { value: "/analise", label: "Analisar processo", hint: "Leitura juridica e riscos." },
  { value: "/plano", label: "Criar plano", hint: "Fluxo operacional com etapas." },
  { value: "/resumo", label: "Resumir documentos", hint: "Sintese tecnica e util." },
  { value: "/tarefas", label: "Ver tarefas", hint: "Abre o modo de acompanhamento operacional." },
];

export const COPILOT_QUICK_SHORTCUTS = [
  { id: "command-k", label: "Ctrl/Cmd+K", detail: "foco no compositor" },
  { id: "command-dot", label: "Ctrl+.", detail: "abrir ou recolher" },
  { id: "command-1", label: "Ctrl/Cmd+1", detail: "módulos" },
  { id: "command-2", label: "Ctrl/Cmd+2", detail: "AI Task" },
  { id: "command-3", label: "Ctrl/Cmd+3", detail: "AgentLabs" },
  { id: "command-4", label: "Ctrl/Cmd+4", detail: "contexto" },
  { id: "shift-enter", label: "Shift+Enter", detail: "quebrar linha" },
  { id: "notifications", label: "Notificações", detail: "alerta de task finalizada" },
];

export function TaskStatusChip({ status }) {
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

export function DotobotModal({
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
  const internalTheme = useInternalTheme();
  const isLightTheme = internalTheme?.isLightTheme === true;
  if (!open) return null;

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

export function getVoiceRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}
