import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ActionButton, Panel, StatusBadge } from "./ui-primitives";

export default function ProcessosOperacaoView({
  latestJob,
  activeJobId,
  JobCard,
  processNumbers,
  setProcessNumbers,
  limit,
  setLimit,
  selectionSuggestedAction,
  handleAction,
  actionState,
  isSuggestedAction,
  resolveActionProcessNumbers,
  getSelectedNumbers,
  orphans,
  selectedOrphans,
  combinedSelectedNumbers,
  movementBacklog,
  selectedMovementBacklog,
  publicationBacklog,
  selectedPublicationBacklog,
  partesBacklog,
  selectedPartesBacklog,
  runPendingJobsNow,
  drainInFlight,
  jobs,
  snapshotAt,
  isLightTheme,
  selectionActionHint,
  fieldGaps,
  selectedFieldGaps,
  withoutMovements,
  selectedWithoutMovements,
  audienciaCandidates,
  selectedAudienciaCandidates,
  monitoringActive,
  selectedMonitoringActive,
}) {
  return <div id="operacao" className="grid flex-1 auto-rows-fr gap-6 lg:grid-cols-2">
    <Panel title="Fila operacional" eyebrow="Sincronismo Freshsales + Supabase" className="h-full">
      <div className="space-y-4">
        {latestJob ? <JobCard job={latestJob} active={latestJob.id === activeJobId} /> : null}
        <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>CNJs para foco manual</span><textarea value={processNumbers} onChange={(e) => setProcessNumbers(e.target.value)} rows={4} placeholder="Opcional: cole CNJs manualmente, um por linha." className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /></label>
        <label className="block max-w-[220px]"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Lote</span><input type="number" min="1" max="30" value={limit} onChange={(e) => setLimit(Number(e.target.value || 2))} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /><span className={`mt-2 block text-xs leading-5 ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Lotes maiores ficam disponiveis na operacao, com reducao automatica so quando a acao tiver um teto tecnico mais baixo.</span></label>
        <div className="grid gap-3 md:grid-cols-2">
          {selectionSuggestedAction ? <ActionButton tone={selectionSuggestedAction.tone || "primary"} onClick={() => handleAction(selectionSuggestedAction.key, selectionSuggestedAction.payload || {})} disabled={actionState.loading || selectionSuggestedAction.disabled} className="md:col-span-2">{selectionSuggestedAction.label}</ActionButton> : null}
          <ActionButton onClick={() => handleAction("run_sync_worker")} disabled={actionState.loading} tone={isSuggestedAction("run_sync_worker") ? "primary" : "subtle"}>Rodar sync-worker</ActionButton>
          <ActionButton tone={isSuggestedAction("push_orfaos") ? "primary" : "subtle"} onClick={() => handleAction("push_orfaos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans.items, selectedOrphans).join("\n")), limit })} disabled={actionState.loading}>Criar accounts no Freshsales</ActionButton>
          <ActionButton tone={isSuggestedAction("sync_supabase_crm") ? "primary" : "subtle"} onClick={() => handleAction("sync_supabase_crm", { processNumbers: resolveActionProcessNumbers(combinedSelectedNumbers.join("\n")), limit })} disabled={actionState.loading}>Sincronizar Supabase + Freshsales</ActionButton>
          <ActionButton tone={isSuggestedAction("sincronizar_movimentacoes_activity") ? "primary" : "subtle"} onClick={() => handleAction("sincronizar_movimentacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar movimentacoes</ActionButton>
          <ActionButton tone={isSuggestedAction("sincronizar_publicacoes_activity") ? "primary" : "subtle"} onClick={() => handleAction("sincronizar_publicacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar publicacoes</ActionButton>
          <ActionButton tone={isSuggestedAction("reconciliar_partes_contatos") ? "primary" : "subtle"} onClick={() => handleAction("reconciliar_partes_contatos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")), limit })} disabled={actionState.loading}>Reconciliar partes</ActionButton>
          <ActionButton onClick={() => handleAction("auditoria_sync")} disabled={actionState.loading} className="md:col-span-2" tone={isSuggestedAction("auditoria_sync") ? "primary" : "subtle"}>Rodar auditoria</ActionButton>
          <ActionButton onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight || !jobs.some((item) => ["pending", "running"].includes(String(item.status || "")))} className="md:col-span-2">{drainInFlight ? "Drenando fila..." : "Drenar fila HMADV"}</ActionButton>
        </div>
        <div className={`rounded-[22px] border p-4 text-xs leading-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] opacity-70"}`}>
          <p><strong className={isLightTheme ? "text-[#1f2937]" : "text-[#F4F1EA]"}>Selecao atual:</strong> {combinedSelectedNumbers.length ? combinedSelectedNumbers.slice(0, 8).join(", ") : "nenhum processo selecionado nas filas"}</p>
          <p className="mt-2">As acoes principais agora podem virar job persistido no HMADV. O painel acompanha progresso, continua em lote curto e avisa ao concluir sem depender de cliques repetidos.</p>
          {snapshotAt ? <p className={`mt-2 ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Memoria local restauravel atualizada em {new Date(snapshotAt).toLocaleString("pt-BR")}.</p> : null}
        </div>
        <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Proximo passo sugerido</p>
          <p className="mt-2 font-semibold">{selectionActionHint.title}</p>
          <p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{selectionActionHint.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectionActionHint.badges.map((badge) => <StatusBadge key={badge} tone="warning">{badge}</StatusBadge>)}
          </div>
        </div>
      </div>
    </Panel>
    <Panel title="Reenriquecimento DataJud" eyebrow="Consulta e persistencia" className="h-full">
      <div className="space-y-4">
        <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>Aqui ficam os passos granulares. Eles usam primeiro a selecao da fila atual e, se ela estiver vazia, aproveitam os CNJs digitados manualmente.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <ActionButton tone="primary" onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n")), limit, intent: "buscar_movimentacoes", action: "enriquecer_datajud" })} disabled={actionState.loading}>Buscar movimentacoes no DataJud</ActionButton>
          <ActionButton onClick={() => handleAction("repair_freshsales_accounts", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit })} disabled={actionState.loading}>Corrigir campos no Freshsales</ActionButton>
          <ActionButton onClick={() => handleAction("sincronizar_movimentacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar movimentacoes no Freshsales</ActionButton>
          <ActionButton onClick={() => handleAction("sincronizar_publicacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar publicacoes no Freshsales</ActionButton>
          <ActionButton onClick={() => handleAction("reconciliar_partes_contatos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")), limit })} disabled={actionState.loading}>Reconciliar partes com contatos</ActionButton>
          <ActionButton onClick={() => handleAction("backfill_audiencias", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates.items, selectedAudienciaCandidates).join("\n")), limit, apply: true })} disabled={actionState.loading}>Retroagir audiencias</ActionButton>
          <ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")), limit, intent: "sincronizar_monitorados", action: "enriquecer_datajud" })} disabled={actionState.loading}>Sincronizar monitorados</ActionButton>
          <ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit, intent: "reenriquecer_gaps", action: "enriquecer_datajud" })} disabled={actionState.loading} className="md:col-span-2">Reenriquecer processos com gap</ActionButton>
        </div>
        <div className="grid gap-3 pt-2 md:grid-cols-3">
          <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 1</p><p className="mt-2 font-semibold">Persistir consulta</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Salvar DataJud no Supabase sem depender de reparo imediato no CRM.</p></div>
          <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 2</p><p className="mt-2 font-semibold">Corrigir CRM</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Refletir os campos no Freshsales depois que o processo ja estiver consistente no banco.</p></div>
          <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 3</p><p className="mt-2 font-semibold">Usar pipeline unica</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>O comando combinado executa as duas etapas e devolve o que foi persistido e o que foi reparado.</p></div>
        </div>
      </div>
    </Panel>
  </div>;
}
