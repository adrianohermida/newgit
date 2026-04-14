export function QueueList({
  title,
  helper,
  rows,
  selected,
  onToggle,
  onTogglePage,
  page,
  setPage,
  loading,
  totalRows = 0,
  pageSize = 20,
  totalEstimated = false,
  lastUpdated = null,
  limited = false,
  errorMessage = "",
  getSelectionValue,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(getSelectionValue(row)));
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  const freshsalesUrl = (accountId) => (accountId ? `https://hmadv-org.myfreshworks.com/crm/sales/accounts/${accountId}` : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {helper ? <p className="text-xs opacity-60">{helper}</p> : null}
          {totalRows ? <p className="mt-1 text-xs opacity-50">Pagina {page} de {totalPages} - {totalRows} no total</p> : null}
          {lastUpdated !== undefined ? <p className="mt-1 text-xs opacity-50">Atualizado em {lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "nao atualizado"}</p> : null}
          {limited ? <p className="mt-1 text-xs text-[#FDE68A]">Fila em modo reduzido para evitar sobrecarga.</p> : null}
          {totalEstimated ? <p className="mt-1 text-xs opacity-60">Total estimado nesta leitura consolidada.</p> : null}
          {errorMessage ? <p className="mt-1 text-xs text-[#FECACA]">{errorMessage}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onTogglePage(!allSelected)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
            {allSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </button>
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
            Anterior
          </button>
          <button type="button" onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
            Proxima
          </button>
        </div>
      </div>
      {loading ? <p className="text-sm opacity-60">Carregando fila...</p> : null}
      {!loading && !rows.length ? <p className="text-sm opacity-60">Nenhum item encontrado nesta pagina.</p> : null}
      <div className="space-y-3">
        {rows.map((row) => {
          const selectionValue = getSelectionValue(row);
          return (
            <label key={selectionValue || row.key} className="block cursor-pointer border border-[#2D2E2E] p-4">
              <div className="flex gap-3">
                <input type="checkbox" checked={selected.includes(selectionValue)} onChange={() => onToggle(selectionValue)} className="mt-1" />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="font-semibold break-all">{row.numero_cnj || row.key}</p>
                  {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
                  {row.snippet ? <p className="line-clamp-3 opacity-60">{row.snippet}</p> : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
                    {row.publicacoes ? <span>Publicacoes: {row.publicacoes}</span> : null}
                    {row.ultima_publicacao ? <span>Ultima publicacao: {row.ultima_publicacao}</span> : null}
                    {row.partes_novas ? <span>Partes novas: {row.partes_novas}</span> : null}
                    {row.partes_existentes !== undefined ? <span>Partes existentes: {row.partes_existentes}</span> : null}
                    {row.account_id_freshsales ? <a href={freshsalesUrl(row.account_id_freshsales)} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]" onClick={(event) => event.stopPropagation()}>Processo relacionado: {row.numero_cnj || row.account_id_freshsales}</a> : null}
                  </div>
                  {row.sample_partes_novas?.length ? <p className="text-xs opacity-60">Novas: {row.sample_partes_novas.map((item) => `${item.nome} (${item.polo})`).join(" | ")}</p> : null}
                  {row.sample_partes_existentes?.length ? <p className="text-xs opacity-50">Ja existentes: {row.sample_partes_existentes.map((item) => `${item.nome} (${item.polo})`).join(" | ")}</p> : null}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
