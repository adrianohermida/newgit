import { getActivityLogResponseText } from "../../../lib/admin/activity-log";

export default function InternoConsoleLogEntryCard({
  entry,
  fingerprintStates,
  getFingerprintStatusTone,
  getSeverityTone,
  handleFingerprintNote,
  handleFingerprintStateChange,
  isLightTheme,
  logExpanded,
  setLogExpanded,
}) {
  return <div className={`rounded-xl border px-3 py-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F9FBFD)]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.76),rgba(7,9,8,0.92))]"}`}>
    {entry.fingerprint ? <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getFingerprintStatusTone(fingerprintStates?.[entry.fingerprint]?.status || "aberto")}`}>
          {fingerprintStates?.[entry.fingerprint]?.status || "aberto"}
        </span>
        {fingerprintStates?.[entry.fingerprint]?.updatedAt ? <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
          {new Date(fingerprintStates[entry.fingerprint].updatedAt).toLocaleString("pt-BR")}
        </span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => handleFingerprintStateChange(entry, "acompanhando", fingerprintStates?.[entry.fingerprint]?.note || "")} className="rounded-full border border-[#6E5630] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A]">
          Acompanhar
        </button>
        <button type="button" onClick={() => handleFingerprintStateChange(entry, "resolvido", fingerprintStates?.[entry.fingerprint]?.note || "")} className="rounded-full border border-[#30543A] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#B7F7C6]">
          Resolver
        </button>
        <button type="button" onClick={() => handleFingerprintNote(entry)} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
          Nota
        </button>
      </div>
    </div> : null}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action}</span>
          {entry.createdAt ? <span className={`font-mono text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F7E78]"}`}>{new Date(entry.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
        </div>
        <div className={`mt-1 font-mono text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F7E78]"}`}>
          {[(entry.method || "").toUpperCase() || null, entry.action || entry.path || entry.page || null, entry.module ? `mod:${entry.module}` : null, entry.durationMs !== undefined ? `${entry.durationMs}ms` : null].filter(Boolean).join("  ·  ")}
        </div>
      </div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(entry.severity || (entry.status === "error" ? "error" : entry.status === "running" ? "warn" : "info"))}`}>
        {entry.severity || entry.status}
      </span>
    </div>
    <div className={`mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F7E78]"}`}>
      {entry.page ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>{entry.page}</span> : null}
      {entry.component ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>{entry.component}</span> : null}
      {entry.fingerprint ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>{entry.fingerprint}</span> : null}
      {(entry.tags || []).length ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>{(entry.tags || []).join(" · ")}</span> : null}
    </div>
    {entry.recommendedAction ? <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#FFF8EA] text-[#5B6670]" : "border-[#22342F] bg-[rgba(10,12,11,0.45)] text-[#C7D0CA]"}`}>
      <span className="text-[#D9B46A]">Proxima acao:</span> {entry.recommendedAction}
    </div> : null}
    {entry.fingerprint && fingerprintStates?.[entry.fingerprint]?.note ? <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#5B6670]" : "border-[#22342F] bg-[rgba(10,12,11,0.45)] text-[#C7D0CA]"}`}>
      <span className="text-[#D9B46A]">Observacao:</span> {fingerprintStates[entry.fingerprint].note}
    </div> : null}
    <div className="mt-2">
      <button type="button" onClick={() => setLogExpanded((current) => current === entry.id ? null : entry.id)} className="text-[10px] uppercase tracking-[0.14em] text-[#C5A059]">
        {logExpanded === entry.id ? "Ocultar detalhes" : "Ver detalhes"}
      </button>
    </div>
    {logExpanded === entry.id ? <div className={`mt-2 space-y-2 text-[11px] ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>
      {entry.request ? <div>
        <p className={`text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Request</p>
        <pre className={`mt-1 max-h-[160px] overflow-auto rounded-lg border p-2 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#1E2E29] bg-[rgba(9,12,11,0.6)] text-[#DADFD8]"}`}>{entry.request}</pre>
      </div> : null}
      {getActivityLogResponseText(entry) ? <div>
        <p className={`text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Response</p>
        <pre className={`mt-1 max-h-[160px] overflow-auto rounded-lg border p-2 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#1E2E29] bg-[rgba(9,12,11,0.6)] text-[#DADFD8]"}`}>{getActivityLogResponseText(entry)}</pre>
      </div> : null}
      {entry.error ? <div>
        <p className={`text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "text-[#C05C5C]" : "text-[#D18585]"}`}>Erro</p>
        <pre className={`mt-1 max-h-[160px] overflow-auto rounded-lg border p-2 text-[10px] ${isLightTheme ? "border-[#F0CACA] bg-[#FFF4F4] text-[#8C4545]" : "border-[#3A1F22] bg-[rgba(34,12,14,0.6)] text-[#F2C7C7]"}`}>{entry.error}</pre>
      </div> : null}
      {entry.schemaIssue ? <div>
        <p className={`text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "text-[#A46A14]" : "text-[#D9B46A]"}`}>Schema/SQL</p>
        <pre className={`mt-1 max-h-[160px] overflow-auto rounded-lg border p-2 text-[10px] ${isLightTheme ? "border-[#F3DEB0] bg-[#FFF8E8] text-[#7A5A12]" : "border-[#2B2616] bg-[rgba(20,16,8,0.7)] text-[#EAD9B2]"}`}>{JSON.stringify(entry.schemaIssue, null, 2)}</pre>
      </div> : null}
    </div> : null}
  </div>;
}
