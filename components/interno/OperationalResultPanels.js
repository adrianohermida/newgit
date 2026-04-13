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
  return (
    <section className={`rounded-[28px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${className}`.trim()}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C5A059]">{eyebrow}</p>
      <h3 className="mt-3 font-serif text-[2rem] leading-tight text-[#F8F4EB]">{title}</h3>
      <div className="mt-5 space-y-4 text-sm text-[#D7DDD8]">
        {loading ? <p className="opacity-65">Executando acao...</p> : null}
        {error ? <p className="rounded-2xl border border-[#4B2222] bg-[rgba(127,29,29,0.18)] p-4 text-red-200">{error}</p> : null}
        {!loading && !error && result ? result : null}
        {!loading && !error && !result ? <p className="opacity-65">{emptyText}</p> : null}
      </div>
      {footer ? <div className="pt-4 text-xs text-[#7F928C]">{footer}</div> : null}
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
  return (
    <section className={`rounded-[28px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${className}`.trim()}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{title}</p>
      <div className="mt-3 space-y-3 text-sm text-[#D7DDD8]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">{primaryLabel}</p>
          <p className="mt-1 opacity-90">{primaryText || emptyPrimaryText}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">{secondaryLabel}</p>
          <p className="mt-1 opacity-90">{secondaryText || emptySecondaryText}</p>
        </div>
        <p className="text-xs opacity-60">{footer}</p>
      </div>
    </section>
  );
}
