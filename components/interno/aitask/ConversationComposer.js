export default function ConversationComposer({ mission, missionInputRef, handleMissionChange, handleStart, handleAttachmentChange, handleAttachmentDrop, attachments, error, quickMissions, handleQuickMission }) {
  return (
    <section className="border-t border-[#1B2925] bg-[linear-gradient(180deg,rgba(8,11,10,0.94),rgba(6,8,7,0.98))] p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {quickMissions.map((value) => <button key={value} type="button" onClick={() => handleQuickMission(value)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#F5F1E8]">{value}</button>)}
      </div>
      <div className="rounded-[28px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleAttachmentDrop?.(event.dataTransfer?.files || []); }}>
        <textarea ref={missionInputRef} value={mission} onChange={(event) => handleMissionChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleStart(); } }} rows={4} placeholder="Descreva a tarefa jurídica, o objetivo e os arquivos de apoio..." className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-7 text-[#F5F1E8] outline-none placeholder:text-[#60706A]" />
        {attachments.length ? <div className="mt-2 flex flex-wrap gap-2 px-2">{attachments.map((file) => <span key={`${file.name}_${file.size}`} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">{file.name}</span>)}</div> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#1B2925] px-2 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
              Anexar arquivos
              <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
            </label>
            <span className="text-[11px] text-[#7F928C]">Arraste múltiplos arquivos para esta área ou use Enter para enviar.</span>
          </div>
          <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-2 text-xs font-semibold text-[#07110E] transition hover:bg-[#D7B570]">Enviar</button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-[#f2b2b2]">{error}</p> : null}
    </section>
  );
}
