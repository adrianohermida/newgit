export default function DotobotCompactRuntimeDiagnostics(props) {
  const { formatInlinePanelValue, handleLocalStackAction, isLightTheme, localInferenceAlert, offlineHealthSnapshot, ragAlert, supabaseBootstrap } = props;

  return (
    <details className={`mt-4 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <summary className={`cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Diagnóstico e runtime</summary>
      <div className="mt-4 space-y-4">
        {offlineHealthSnapshot.items.length ? <div><p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Saúde offline</p><div className="mt-3 flex flex-wrap gap-2">{offlineHealthSnapshot.items.map((item) => <span key={item.id} title={formatInlinePanelValue(item.detail || item.value)} className={`rounded-full border px-3 py-1.5 text-[11px] ${item.tone === "success" ? "border-[#234034] text-[#8FCFA9]" : item.tone === "danger" ? "border-[#5b2d2d] text-[#f2b2b2]" : "border-[#3B3523] text-[#D9C38A]"}`}>{item.label}: {formatInlinePanelValue(item.value)}</span>)}</div></div> : null}
        {ragAlert ? <div className={`rounded-[18px] border px-3 py-3 text-sm ${ragAlert.tone === "danger" ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]" : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"}`}><p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Diagnóstico RAG</p><p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{ragAlert.title}</p><p className="mt-1 text-[12px] leading-6">{ragAlert.body}</p></div> : null}
        {localInferenceAlert ? <div className={`rounded-[18px] border px-3 py-3 text-sm ${localInferenceAlert.tone === "danger" ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]" : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"}`}><p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Contingência local</p><p className={`mt-2 font-medium ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{localInferenceAlert.title}</p><p className="mt-1 text-[12px] leading-6">{localInferenceAlert.body}</p><div className="mt-3 flex flex-wrap gap-2">{localInferenceAlert.actions.slice(0, 2).map((actionId) => <button key={actionId} type="button" onClick={() => handleLocalStackAction(actionId)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>{actionId === "retry_runtime_local" ? "Tentar" : actionId === "open_runtime_config" ? "Editar runtime" : actionId === "open_llm_test" ? "Testar" : "Diagnóstico"}</button>)}</div></div> : null}
        <div className={`rounded-[18px] border px-3 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Persistência</p>
            <span className={`rounded-full border px-2 py-1 text-[10px] ${supabaseBootstrap.tone === "success" ? "border-[#234034] text-[#8FCFA9]" : supabaseBootstrap.tone === "danger" ? "border-[#5b2d2d] text-[#f2b2b2]" : "border-[#3B3523] text-[#D9C38A]"}`}>{supabaseBootstrap.baseUrlKind === "local" ? "Local" : supabaseBootstrap.baseUrlKind === "remote" ? "Remoto" : "Pendente"}</span>
          </div>
          <p className={`mt-2 text-[12px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{supabaseBootstrap.label}</p>
          <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{supabaseBootstrap.detail}</p>
        </div>
      </div>
    </details>
  );
}
