export default function DotobotToastStack({ dismissUiToast, uiToasts }) {
  if (!uiToasts.length) return null;

  return (
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
  );
}
