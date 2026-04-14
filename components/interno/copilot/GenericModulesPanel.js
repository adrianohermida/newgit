export default function GenericModulesPanel(props) {
  const {
    activeConversation,
    activeProjectLabel,
    conversationEntities,
    isLightTheme,
    moduleWorkspaceCards,
    router,
    setSelectedProjectFilter,
    useCondensedRightRail,
  } = props;

  return (
    <div className="space-y-3">
      <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Área ativa</p>
        <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeProjectLabel}</p>
        <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{useCondensedRightRail ? "Atalhos rápidos para abrir áreas do produto." : "Módulos integrados sem roubar atenção do chat."}</p>
      </div>

      <div className="grid gap-3">
        {moduleWorkspaceCards.slice(0, useCondensedRightRail ? 4 : moduleWorkspaceCards.length).map((module) => (
          <article key={module.key} className={`rounded-[18px] border p-4 ${module.active ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{module.label}</p>
                <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{module.helper}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88]" : "border-[#22342F] text-[#D8DEDA]"}`}>{module.count}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push(module.contextualHref || module.href)} className={`rounded-full border px-2.5 py-1 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>Abrir módulo</button>
              {!useCondensedRightRail ? <button type="button" onClick={() => setSelectedProjectFilter(module.key)} className={`rounded-full border px-2.5 py-1 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Filtrar histórico</button> : null}
            </div>

            {module.contextualHref !== module.href && !useCondensedRightRail ? (
              <p className={`mt-3 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                Contexto detectado: {module.key === "processos" || module.key === "publicacoes" ? `${conversationEntities.processNumbers.length} CNJ(s)` : module.key === "leads" ? conversationEntities.primaryEmail : activeConversation?.title || "conversa ativa"}
              </p>
            ) : null}

            {module.latestConversation && !useCondensedRightRail ? <p className={`mt-3 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Última conversa: {module.latestConversation}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
