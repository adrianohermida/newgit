import { ActionButton, Panel } from "./ui-primitives";

export default function ProcessosOperationDatajudPanel({
  handleAction,
  resolveActionProcessNumbers,
  getSelectedNumbers,
  withoutMovements,
  selectedWithoutMovements,
  fieldGaps,
  selectedFieldGaps,
  movementBacklog,
  selectedMovementBacklog,
  publicationBacklog,
  selectedPublicationBacklog,
  partesBacklog,
  selectedPartesBacklog,
  audienciaCandidates,
  selectedAudienciaCandidates,
  monitoringActive,
  selectedMonitoringActive,
  limit,
  actionState,
  isLightTheme,
}) {
  return <Panel title="Reenriquecimento DataJud" eyebrow="Consulta e persistencia" className="h-full"><div className="space-y-4"><p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>Aqui ficam os passos granulares. Eles usam primeiro a selecao da fila atual e, se ela estiver vazia, aproveitam os CNJs digitados manualmente.</p><div className="grid gap-3 md:grid-cols-2"><ActionButton tone="primary" onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n")), limit, intent: "buscar_movimentacoes", action: "enriquecer_datajud" })} disabled={actionState.loading}>Buscar movimentacoes no DataJud</ActionButton><ActionButton onClick={() => handleAction("repair_freshsales_accounts", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit })} disabled={actionState.loading}>Corrigir campos no Freshsales</ActionButton><ActionButton onClick={() => handleAction("sincronizar_movimentacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar movimentacoes no Freshsales</ActionButton><ActionButton onClick={() => handleAction("sincronizar_publicacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar publicacoes no Freshsales</ActionButton><ActionButton onClick={() => handleAction("reconciliar_partes_contatos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")), limit })} disabled={actionState.loading}>Reconciliar partes com contatos</ActionButton><ActionButton onClick={() => handleAction("backfill_audiencias", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates.items, selectedAudienciaCandidates).join("\n")), limit, apply: true })} disabled={actionState.loading}>Retroagir audiencias</ActionButton><ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")), limit, intent: "sincronizar_monitorados", action: "enriquecer_datajud" })} disabled={actionState.loading}>Sincronizar monitorados</ActionButton><ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit, intent: "reenriquecer_gaps", action: "enriquecer_datajud" })} disabled={actionState.loading} className="md:col-span-2">Reenriquecer processos com gap</ActionButton></div><div className="grid gap-3 pt-2 md:grid-cols-3"><div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 1</p><p className="mt-2 font-semibold">Persistir consulta</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Salvar DataJud no Supabase sem depender de reparo imediato no CRM.</p></div><div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 2</p><p className="mt-2 font-semibold">Corrigir CRM</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Refletir os campos no Freshsales depois que o processo ja estiver consistente no banco.</p></div><div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 3</p><p className="mt-2 font-semibold">Usar pipeline unica</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>O comando combinado executa as duas etapas e devolve o que foi persistido e o que foi reparado.</p></div></div></div></Panel>;
}
