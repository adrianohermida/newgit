import { useInternalTheme } from "./InternalThemeProvider";

export function OperationalResultCard({
  title = "Resultado da ultima acao",
  eyebrow = "Retorno operacional",
  loading = false,
  error = "",
  result = null,
  emptyText = "Nenhuma acao executada ainda nesta sessao.",
  footer = "",
  className = "",
}) {
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`flex h-full flex-col rounded-[28px] border p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))]"} ${className}`.trim()}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#A46A14]" : "text-[#C5A059]"}`}>{eyebrow}</p>
      <h3 className={`mt-3 font-serif text-[2rem] leading-tight ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{title}</h3>
      <div className={`mt-5 flex-1 space-y-4 text-sm ${isLightTheme ? "text-[#51606B]" : "text-[#D7DDD8]"}`}>
        {loading ? <p className="opacity-65">Executando acao...</p> : null}
        {error ? <p className={`rounded-2xl border p-4 ${isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] bg-[rgba(127,29,29,0.18)] text-red-200"}`}>{error}</p> : null}
        {!loading && !error && result ? result : null}
        {!loading && !error && !result ? <p className="opacity-65">{emptyText}</p> : null}
      </div>
      {footer ? <div className={`pt-4 text-xs ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{footer}</div> : null}
    </section>
  );
}

export function OperationalHistoryCompactCard({
  title = "Historico (compacto)",
  primaryLabel = "Ultimo local",
  primaryText = "",
  secondaryLabel = "Ultimo remoto",
  secondaryText = "",
  emptyPrimaryText = "Sem registros locais.",
  emptySecondaryText = "Sem registros remotos.",
  footer = "Detalhes completos no Console > Log.",
  className = "",
}) {
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`flex h-full flex-col rounded-[28px] border p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))]"} ${className}`.trim()}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "opacity-50"}`}>{title}</p>
      <div className={`mt-3 flex-1 space-y-3 text-sm ${isLightTheme ? "text-[#51606B]" : "text-[#D7DDD8]"}`}>
        <div>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{primaryLabel}</p>
          <p className="mt-1 opacity-90">{primaryText || emptyPrimaryText}</p>
        </div>
        <div>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{secondaryLabel}</p>
          <p className="mt-1 opacity-90">{secondaryText || emptySecondaryText}</p>
        </div>
        <p className={`text-xs ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{footer}</p>
      </div>
    </section>
  );
}
