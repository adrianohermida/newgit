import { Panel, QueueSummaryCard } from "./ui-primitives";

export function PublicacoesOperationView({
  data,
  processCandidates,
  selectedProcessKeys,
  processNumbers,
  setProcessNumbers,
  limit,
  setLimit,
  actionState,
  hasBlockingJob,
  canManuallyDrainActiveJob,
  blockingJob,
  drainInFlight,
  selectedProcessNumbers,
  selectedUnifiedNumbers,
  noPublicationActivityTypeConfigured,
  publicationActivityTypeHint,
  partesBacklogCount,
  handleAction,
  updateView,
  runPendingJobsNow,
  loadOverview,
  loadProcessCandidates,
  loadPartesCandidates,
  processPage,
  partesPage,
}) {
  return (
    <div id="operacao" className="grid flex-1 auto-rows-fr gap-6 lg:grid-cols-2">
      <Panel title="Triagem principal" eyebrow="Criar processos e destravar a fila" className="h-full">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <QueueSummaryCard title="Processos criaveis" count={processCandidates.totalRows || processCandidates.items.length || 0} helper={`${selectedProcessKeys.length} selecionado(s) nesta sessao.`} />
            <QueueSummaryCard title="Sem processo vinculado" count={data.publicacoesSemProcesso || 0} helper="Publicacoes prontas para gerar processo no HMADV." />
          </div>
          <p className="text-sm opacity-70">A trilha principal precisa ser curta: selecionar CNJs, criar os processos ausentes e seguir para a mesa quando houver lote para drenagem ou sincronizacao.</p>
          <div className={`rounded-[20px] border p-4 text-sm ${canManuallyDrainActiveJob ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : hasBlockingJob ? "border-[#4A3321] bg-[rgba(44,25,18,0.22)] text-[#F7C9A8]" : "border-[#244034] bg-[rgba(20,45,36,0.24)] text-[#D7F5E6]"}`}>
            <p className="font-semibold">{canManuallyDrainActiveJob ? "Existe job pronto para drenagem manual." : hasBlockingJob ? "Existe job em andamento bloqueando parte das acoes." : "A fila operacional esta livre para nova rodada."}</p>
            <p className="mt-2 opacity-80">{canManuallyDrainActiveJob ? "Use o botao de drenagem para continuar o processamento sem sair da tela." : hasBlockingJob ? `Acompanhe o job ${blockingJob?.acao || "ativo"} antes de abrir outro lote grande.` : "Comece pela triagem, monte o lote e avance para a mesa."}</p>
          </div>
          <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] opacity-50">CNJs para foco manual</span><textarea value={processNumbers} onChange={(event) => setProcessNumbers(event.target.value)} rows={4} placeholder="Opcional: cole CNJs manualmente, um por linha." className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] opacity-50">Lote</span><input type="number" min="1" max="50" value={limit} onChange={(event) => setLimit(Number(event.target.value || 10))} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" /></label>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => updateView("filas")} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]">Abrir mesa</button>
            <button type="button" onClick={() => handleAction("criar_processos_publicacoes", false, selectedProcessNumbers)} disabled={actionState.loading || hasBlockingJob} className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50">Criar processos ausentes</button>
            <button type="button" onClick={() => handleAction("orquestrar_drenagem_publicacoes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob} className="border border-[#30543A] bg-[rgba(24,69,53,0.2)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#B7F7C6] hover:border-[#3E7B63] disabled:opacity-50">Orquestrar drenagem</button>
            <button type="button" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight || !canManuallyDrainActiveJob} className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50">{drainInFlight ? "Drenando fila..." : "Drenar fila HMADV"}</button>
          </div>
        </div>
      </Panel>

      <Panel title="Publicacoes ja vinculadas" eyebrow="Sincronizar CRM com o que ja existe" className="h-full">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <QueueSummaryCard title="Pendentes com account" count={data.publicacoesPendentesComAccount || 0} helper="Publicacoes de processos vinculados ainda sem activity." />
            <QueueSummaryCard title="Com activity" count={data.publicacoesComActivity || 0} helper="Publicacoes ja refletidas no Freshsales." />
          </div>
          <p className="text-sm opacity-70">A operacao secundaria deve ser simples: simular ou aplicar a sincronizacao das publicacoes que ja tem processo, sem misturar isso com enriquecimento de partes.</p>
          {partesBacklogCount > 0 ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]"><p className="font-semibold">Backlog de partes fica no modulo de processos</p><p className="mt-2">Existem {partesBacklogCount} processo(s) em candidatos_partes. Mantemos a leitura para diagnostico, mas a acao operacional de partes deve acontecer em Processos.</p></div> : null}
          {noPublicationActivityTypeConfigured ? <div className="rounded-[20px] border border-[#4B2222] bg-[rgba(127,29,29,0.12)] p-4 text-sm text-red-100"><p className="font-semibold">Sincronizacao no Freshsales bloqueada</p><p className="mt-2 opacity-80">{publicationActivityTypeHint}</p></div> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => updateView("filas")} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]">Abrir mesa</button>
            <button type="button" onClick={() => handleAction("sincronizar_publicacoes_activity", false, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || noPublicationActivityTypeConfigured} title={publicationActivityTypeHint || undefined} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Simular sincronizacao</button>
            <button type="button" onClick={() => handleAction("sincronizar_publicacoes_activity", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || noPublicationActivityTypeConfigured} title={publicationActivityTypeHint || undefined} className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50">Aplicar sincronizacao</button>
            <button type="button" onClick={() => handleAction("run_advise_sync", false)} disabled={actionState.loading} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Rodar ingestao incremental</button>
            <button type="button" onClick={() => handleAction("run_sync_worker", false)} disabled={actionState.loading} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Rodar sync-worker</button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => handleAction("run_advise_backfill", false)} disabled={actionState.loading} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Importar backlog Advise</button>
            <button type="button" onClick={async () => { await Promise.all([loadOverview(), loadProcessCandidates(processPage, { force: true }), loadPartesCandidates(partesPage, { force: true })]); }} disabled={actionState.loading} className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Atualizar leitura</button>
            <a href="/interno/processos" className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059]">Abrir processos para partes</a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
