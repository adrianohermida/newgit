export default function FocusedContextPanel({
  attachments,
  contextEnabled,
  isLightTheme,
  ragSummary,
  routePath,
}) {
  const panelTone = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]";
  const mutedTone = isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]";

  return (
    <div className={`space-y-4 text-sm ${mutedTone}`}>
      <div className={`rounded-[18px] border p-4 ${panelTone}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] ${mutedTone}`}>Módulo</p>
        <p className={`mt-2 font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>{routePath || "/interno/copilot"}</p>
      </div>

      <div className={`rounded-[18px] border p-4 ${panelTone}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[10px] uppercase tracking-[0.2em] ${mutedTone}`}>Memória</p>
          <span className={`text-[10px] ${isLightTheme ? "text-[#8A5A16]" : "text-[#C5A059]"}`}>{contextEnabled ? "ON" : "OFF"}</span>
        </div>
        <p className={`mt-2 font-medium ${isLightTheme ? "text-[#1F2A37]" : "text-[#F5F1E8]"}`}>
          {ragSummary.count ? `${ragSummary.count} itens relevantes` : "Sem memória carregada"}
        </p>
        {ragSummary.sources.length ? <p className={`mt-2 text-xs ${mutedTone}`}>Fontes: {ragSummary.sources.join(", ")}</p> : null}
      </div>

      <div className={`rounded-[18px] border p-4 ${panelTone}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] ${mutedTone}`}>Documentos</p>
        {attachments.length ? (
          <div className="mt-3 space-y-2">
            {attachments.slice(0, 4).map((attachment) => (
              <div
                key={attachment.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}
              >
                <span className="truncate">{attachment.name}</span>
                <span className={mutedTone}>{attachment.kind}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={`mt-2 text-xs ${mutedTone}`}>Nenhum anexo nesta conversa.</p>
        )}
      </div>
    </div>
  );
}
