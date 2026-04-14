export default function DotobotCompactConversationCard({ activeConversation, activeConversationPreview, activeConversationTimestamp, activeProviderPresentation, contextEnabled, createConversation, isLightTheme, selectedSkillId, setContextEnabled }) {
  return (
    <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa ativa</p>
          <p className={`mt-2 truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
          <p className={`mt-2 line-clamp-2 text-[12px] leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{activeConversationPreview || "Sem conversa ativa ainda. Abra uma nova trilha para começar."}</p>
        </div>
        <button type="button" onClick={createConversation} className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Nova</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{activeProviderPresentation.name}</span>
        {selectedSkillId ? <span className="rounded-full border border-[#35554B] px-2.5 py-1 text-[#B7D5CB]">skill {selectedSkillId}</span> : null}
        <button type="button" onClick={() => setContextEnabled((value) => !value)} className={`rounded-full border px-2.5 py-1 font-medium transition ${contextEnabled ? "border-[#3E5B50] bg-[rgba(64,122,97,0.16)] text-[#A9E3C3]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Contexto {contextEnabled ? "ON" : "OFF"}</button>
        {activeConversationTimestamp ? <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#7F928C]"}`}>{new Date(activeConversationTimestamp).toLocaleDateString("pt-BR")}</span> : null}
      </div>
    </div>
  );
}
