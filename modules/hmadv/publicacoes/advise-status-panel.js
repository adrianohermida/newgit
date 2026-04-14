import { HealthBadge, Panel, QueueSummaryCard } from "./ui-primitives";

export function PublicacoesAdviseStatusPanel({
  adviseSync,
  adviseTokenOk,
  adviseMode,
  adviseCursor,
  adviseLastRunAt,
  adviseBackfillProgress,
  advisePersistedDelta,
  snapshotMesaIntegrada,
  snapshotPartes,
  snapshotProcessos,
  publicationActivityTypes,
  adviseLastCycleTotal,
  syncWorkerLastPublicacoes,
  data,
  actionState,
  handleAction,
  formatSnapshotLabel,
  isLightTheme,
}) {
  if (!adviseSync) return null;

  return (
    <Panel title="Status do Advise" eyebrow="Observabilidade da ingestao">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <HealthBadge label={adviseTokenOk ? "token advise ok" : "token advise indisponivel"} tone={adviseTokenOk ? "success" : "danger"} />
          <HealthBadge label={`modo ${adviseMode}`} tone="default" />
          <HealthBadge label={`cursor ${String(adviseCursor?.status || "desconhecido")}`} tone={String(adviseCursor?.erro || "") ? "danger" : "default"} />
          <HealthBadge label={adviseLastRunAt ? `ultimo ciclo ${new Date(adviseLastRunAt).toLocaleString("pt-BR")}` : "ultimo ciclo indisponivel"} tone="default" />
          <HealthBadge label={`backfill ${adviseBackfillProgress}`} tone={advisePersistedDelta > 0 ? "warning" : "default"} />
          <HealthBadge label={`mesa ${formatSnapshotLabel(snapshotMesaIntegrada)}`} tone={snapshotMesaIntegrada?.available ? "success" : "warning"} />
          <HealthBadge label={`partes ${formatSnapshotLabel(snapshotPartes)}`} tone={snapshotPartes?.available ? "success" : "warning"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QueueSummaryCard title="Recebidas do Advise" count={Number(adviseSync.publicacoes_total || 0)} helper="Estoque de publicacoes de origem Advise persistido no HMADV." />
          <QueueSummaryCard title="Pendentes de sync" count={Number(adviseSync.publicacoes_pendentes_fs || 0)} helper="Publicacoes Advise ainda sem reflexo no Freshsales." />
          <QueueSummaryCard title="Ultimo ciclo" count={adviseLastCycleTotal} helper="Total reportado pelo cursor do advise-sync no ciclo mais recente." />
          <QueueSummaryCard title="Ultimo lote worker" count={syncWorkerLastPublicacoes} helper="Quantidade de publicacoes no ultimo lote do sync-worker." />
        </div>
        <div className="flex flex-wrap gap-2">
          <HealthBadge label={publicationActivityTypes.ok ? "catalogo freshsales ok" : "catalogo freshsales indisponivel"} tone={publicationActivityTypes.ok ? "success" : "danger"} />
          <HealthBadge label={`tipos ${Number(publicationActivityTypes.total || 0)}`} tone="default" />
          <HealthBadge label={publicationActivityTypes.matched ? `tipo publicacao ${publicationActivityTypes.matchedName}` : "tipo de publicacao nao localizado"} tone={publicationActivityTypes.matched ? "success" : "warning"} />
          {publicationActivityTypes.fallbackOnly ? <HealthBadge label="catalogo em fallback" tone="warning" /> : null}
        </div>
        {publicationActivityTypes.error ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.16)] p-4 text-sm text-[#F8E7B5]"><p className="font-semibold">Diagnostico do Freshsales</p><p className="mt-2 opacity-80">{publicationActivityTypes.error}</p></div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleAction("run_advise_backfill", false)} disabled={actionState.loading} className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50">Importar backlog Advise</button>
          <button type="button" onClick={() => handleAction("run_advise_sync", false)} disabled={actionState.loading} className="border border-[#2D2E2E] px-4 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">Rodar ingestao incremental</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QueueSummaryCard title="Persistidas no banco" count={data.publicacoesTotal || 0} helper="Contagem atual em judiciario.publicacoes." />
          <QueueSummaryCard title="Cursor Advise" count={data.adviseCursorTotal || 0} helper="Total de registros reportado pelo cursor do advise-sync." />
          <QueueSummaryCard title="Delta Advise x banco" count={data.advisePersistedDelta || 0} helper="Se maior que zero, ainda existe backlog estrutural ou de throughput a absorver." accent={(data.advisePersistedDelta || 0) > 0 ? "text-[#FDE68A]" : "text-[#B7F7C6]"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QueueSummaryCard title="Snapshot mesa" count={Number(snapshotMesaIntegrada?.totalRows || 0)} helper="Itens hoje navegaveis pela leitura segura da mesa integrada." accent={snapshotMesaIntegrada?.available ? "text-[#B7F7C6]" : "text-[#FDE68A]"} />
          <QueueSummaryCard title="Snapshot partes" count={Number(snapshotPartes?.totalRows || 0)} helper="Itens atualmente materializados para a fila de partes." accent={snapshotPartes?.available ? "text-[#B7F7C6]" : "text-[#FDE68A]"} />
          <QueueSummaryCard title="Snapshot processos" count={Number(snapshotProcessos?.totalRows || 0)} helper="Itens materializados para criacao segura de processos." accent={snapshotProcessos?.available ? "text-[#B7F7C6]" : "text-[#FDE68A]"} />
        </div>
        {adviseCursor?.erro ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] bg-[rgba(127,29,29,0.12)] text-red-100"}`}><p className="font-semibold">Erro recente do advise-sync</p><p className="mt-2 opacity-80">{String(adviseCursor.erro)}</p></div> : null}
      </div>
    </Panel>
  );
}
