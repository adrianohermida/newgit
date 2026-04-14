export default function DotobotCompactComposer(props) {
  const { composerRef, handleComposerKeyDown, handleDrop, handlePaste, handleSubmit, input, isLightTheme, loading, onChangeInput, onOpenFullscreen } = props;

  return (
    <div className={`mt-4 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.98)]"}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea ref={composerRef} value={input} onChange={(event) => onChangeInput(event.target.value)} onKeyDown={handleComposerKeyDown} onPaste={handlePaste} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} rows={3} placeholder="Converse com o Dotobot..." className={`w-full resize-none rounded-[18px] border px-4 py-3 text-sm outline-none transition ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#152421] placeholder:text-[#94A3B8] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] focus:border-[#C5A059]"}`} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenFullscreen} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Abrir fullscreen</button>
          </div>
          <button type="submit" disabled={loading || !input.trim()} className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition disabled:opacity-40">Enviar</button>
        </div>
      </form>
    </div>
  );
}
