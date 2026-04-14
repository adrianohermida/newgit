export default function InternoSettingsModal(props) {
  const { isLightTheme, onClose, preference, setThemePreference, settingsModalRef } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]";
  return <div className="absolute inset-0 z-[95] flex items-center justify-center bg-[rgba(4,7,8,0.48)] px-4 backdrop-blur-sm">
    <div ref={settingsModalRef} className={`w-full max-w-lg rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">Configuracoes</p><h3 className={`mt-2 text-xl font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Preferencias do sistema</h3><p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Tema, preferencias visuais e comportamento do shell interno.</p></div>
        <button type="button" onClick={onClose} className={`rounded-full border px-3 py-1 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Fechar</button>
      </div>
      <div className="mt-5 space-y-4">
        <div className={`rounded-[20px] border p-4 ${cardClass}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Tema</p>
          <div className="mt-3 flex flex-wrap gap-2">{[{ key: "light", label: "Claro" }, { key: "system", label: "Sistema" }, { key: "dark", label: "Escuro" }].map((option) => <button key={option.key} type="button" onClick={() => setThemePreference(option.key)} className={`rounded-[12px] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${preference === option.key ? "bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E] shadow-[0_6px_18px_rgba(197,160,89,0.18)]" : isLightTheme ? "border border-[#D7DEE8] bg-white text-[#60706A] hover:border-[#C5A059]" : "border border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#F5E6C5]"}`}>{option.label}</button>)}</div>
        </div>
        <div className={`rounded-[20px] border p-4 ${cardClass}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Persistencia</p>
          <p className={`mt-3 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>O tema e as preferencias do shell sao persistidos localmente e sincronizados com o modo do sistema quando Sistema estiver ativo.</p>
        </div>
      </div>
    </div>
  </div>;
}
