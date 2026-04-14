export default function InternoConsoleNotesPanel({
  handleAddNote,
  isLightTheme,
  noteInput,
  operationalNotes,
  setNoteInput,
}) {
  return <div className={`mt-4 rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Memoria operacional</p>
        <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Registre gargalos, debitos tecnicos e progresso.</p>
      </div>
      <div className="flex items-center gap-2">
        <input value={noteInput} onChange={(event) => setNoteInput(event.target.value)} placeholder="Adicionar nota rapida..." className={`h-8 w-[220px] rounded-full border bg-transparent px-3 text-[11px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#54605B]"}`} />
        <button type="button" onClick={handleAddNote} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
          Salvar
        </button>
      </div>
    </div>
    {operationalNotes.length ? <div className="mt-3 space-y-2">
      {operationalNotes.slice(0, 10).map((note) => <div key={note.id} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
        <div className="flex items-center justify-between">
          <span className="text-[#D9B46A]">{note.type || "nota"}</span>
          <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6E7E78]"}`}>{new Date(note.createdAt || Date.now()).toLocaleString("pt-BR")}</span>
        </div>
        <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{note.text}</div>
      </div>)}
    </div> : <div className={`mt-2 text-[11px] opacity-60 ${isLightTheme ? "text-[#7B8B98]" : ""}`}>Nenhuma nota registrada.</div>}
  </div>;
}
