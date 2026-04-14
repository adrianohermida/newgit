import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ActionButton, StatusBadge } from "./ui-primitives";

function RelationProcessCard({ title, process, fallbackNumber }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[#050706]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{title}</p><p className="mt-3 break-all font-semibold">{process?.numero_cnj || fallbackNumber || "Sem CNJ"}</p><p className={`mt-1 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{process?.titulo || "Processo ainda nao encontrado na base judiciaria."}</p><div className={`mt-2 flex flex-wrap gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{process?.status_atual_processo ? <span>Status: {process.status_atual_processo}</span> : null}{process?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${process.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Account {process.account_id_freshsales}</a> : null}</div></div>;
}

export function RelationSelectionBar({
  title,
  helper,
  page,
  totalRows,
  pageSize = 20,
  selectedCount = 0,
  allMatchingSelected = false,
  loading = false,
  onTogglePage,
  onToggleAllMatching,
  onPrevPage,
  onNextPage,
  disableNext = false,
  disablePrev = false,
}) {
  const { isLightTheme } = useInternalTheme();
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>{totalRows} no total</span>{selectedCount ? <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#FDE68A]"}`}>{selectedCount} selecionado(s)</span> : null}{allMatchingSelected ? <StatusBadge tone="success">todos do filtro</StatusBadge> : null}</div>{helper ? <p className={`mt-1 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p> : null}<p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Pagina {page} de {totalPages}</p></div><div className="flex flex-wrap gap-2"><ActionButton onClick={onTogglePage} disabled={loading} className="px-3 py-2 text-xs">Selecionar pagina</ActionButton><ActionButton onClick={onToggleAllMatching} disabled={loading || !totalRows} className="px-3 py-2 text-xs">{allMatchingSelected ? "Limpar todos do filtro" : "Selecionar todos do filtro"}</ActionButton><ActionButton onClick={onPrevPage} disabled={loading || disablePrev} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={onNextPage} disabled={loading || disableNext} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>;
}

export function RelationSuggestionCard({ item, checked, onToggle, onUseSuggestion }) {
  const { isLightTheme } = useInternalTheme();
  return <label className={`block cursor-pointer rounded-[26px] border p-4 transition ${isLightTheme ? "border-[#d7d4cb] bg-white hover:border-[#c79b2c]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] hover:border-[#3A3E3D]"}`}><div className="flex gap-3"><input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" /><div className="min-w-0 flex-1 space-y-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={item.score >= 0.8 ? "success" : item.score >= 0.6 ? "warning" : "default"}>{item.score_pct || Math.round(Number(item.score || 0) * 100)}% confianca</StatusBadge><StatusBadge tone="default">{item.tipo_relacao}</StatusBadge><StatusBadge tone="success">sugestao</StatusBadge></div><div className="grid gap-3 md:grid-cols-2"><RelationProcessCard title="Pai sugerido" process={item.source_process?.numero_cnj === item.numero_cnj_pai ? item.source_process : item.target_process} fallbackNumber={item.numero_cnj_pai} /><RelationProcessCard title="Filho sugerido" process={item.source_process?.numero_cnj === item.numero_cnj_filho ? item.source_process : item.target_process} fallbackNumber={item.numero_cnj_filho} /></div>{item.reasons?.length ? <div className="flex flex-wrap gap-2">{item.reasons.map((reason) => <StatusBadge key={reason} tone="warning">{reason}</StatusBadge>)}</div> : null}{item.evidence?.trecho ? <div className={`rounded-[20px] border p-3 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] opacity-75"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Trecho da publicacao</p><p className="mt-2 leading-6">{item.evidence.trecho}</p></div> : null}<div className={`flex flex-wrap items-center gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{item.evidence?.data_publicacao ? <span>Publicacao: {new Date(item.evidence.data_publicacao).toLocaleDateString("pt-BR")}</span> : null}{item.evidence?.cnj_mencionado ? <span>CNJ citado: {item.evidence.cnj_mencionado}</span> : null}</div><div className="flex flex-wrap gap-2"><ActionButton onClick={(event) => { event.preventDefault(); onUseSuggestion(item); }} className="px-3 py-2 text-xs">Usar no formulario</ActionButton></div></div></div></label>;
}

export function RegisteredRelationCard({ item, checked, onToggle, onEdit, onDelete, disabled = false }) {
  const { isLightTheme } = useInternalTheme();
  return <label className={`block cursor-pointer rounded-[28px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}><div className="flex gap-3"><input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" /><div className="min-w-0 flex-1 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.15em]"><span className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E]"}`}>{item.tipo_relacao}</span><span className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E]"}`}>{item.status}</span></div><div className="flex gap-2"><ActionButton onClick={(event) => { event.preventDefault(); onEdit(item); }} disabled={disabled} className="px-3 py-2 text-xs">Editar</ActionButton><ActionButton tone="danger" onClick={(event) => { event.preventDefault(); onDelete(item.id); }} disabled={disabled} className="px-3 py-2 text-xs">Remover</ActionButton></div></div><div className="grid gap-4 md:grid-cols-2"><RelationProcessCard title="Processo principal" process={item.processo_pai} fallbackNumber={item.numero_cnj_pai} /><RelationProcessCard title="Processo relacionado" process={item.processo_filho} fallbackNumber={item.numero_cnj_filho} /></div>{item.observacoes ? <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{item.observacoes}</p> : null}</div></div></label>;
}
