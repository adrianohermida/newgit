export default function OperationalHealthPanel({
  isLightTheme = false,
  operationalMessage = "",
  backendMessage = "",
  suggestedActionLabel = "",
  suggestedReason = "",
  badges = [],
  actions = [],
  renderBadge,
  renderAction,
}) {
  const toneClass = isLightTheme
    ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]"
    : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]";

  return (
    <div className={`rounded-[22px] border p-4 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
            Barra de saude operacional
          </p>
          <p className="mt-2">{operationalMessage || "Operacao normal"} • {backendMessage || "Sem historico recente."}</p>
          <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>
            Acao sugerida: {suggestedActionLabel || "Ir para operacao"}
          </p>
          {suggestedReason ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>{suggestedReason}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => renderBadge ? renderBadge(badge) : null)}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => renderAction ? renderAction(action) : null)}
      </div>
    </div>
  );
}
