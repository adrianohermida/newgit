import { ACTION_LABELS } from "./constants";
import {
  HealthBadge,
  JobCard,
  MetricCard,
  RemoteRunSummary,
  StatusBadge,
  ViewToggle,
} from "./ui-primitives";

export function PublicacoesWorkspaceHeader({
  view,
  onChangeView,
  latestHistory,
  latestJob,
  activeJobId,
  selectedCount,
  hasMultipleBlockingJobs,
  pendingJobCount,
  actionState,
  operationalStatus,
  backendHealth,
  healthSuggestedActions,
  candidateQueueErrorCount,
  candidateQueueMismatchCount,
  operationalPlan,
  getOperationalPlanStepState,
  runOperationalPlanStep,
  queueRefreshLog,
  latestRemoteRun,
  remoteHealth,
  metrics,
}) {
  return (
    <>
      <section className="rounded-[30px] border border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))] px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Centro de publicacoes</p>
            <h3 className="mt-3 font-serif text-4xl leading-tight">Triagem enxuta para criar processos, drenar fila e fechar pendencias reais.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 opacity-65">A tela agora prioriza decisao rapida: ver o gargalo, selecionar o lote e agir sem atravessar blocos tecnicos o tempo todo.</p>
          </div>
          <div className="flex flex-col gap-3 rounded-[26px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm">
            <div className="flex items-center justify-between gap-4"><span className="opacity-60">Selecionados no momento</span><strong className="font-serif text-2xl">{selectedCount}</strong></div>
            <div className="flex items-center justify-between gap-4"><span className="opacity-60">Ultima acao</span><span className="text-right text-xs uppercase tracking-[0.16em] text-[#C5A059]">{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
            {latestHistory ? <p className="text-xs opacity-60">{latestHistory.label}: {latestHistory.preview}</p> : null}
            {latestJob ? <JobCard job={latestJob} active={latestJob.id === activeJobId} /> : null}
            {hasMultipleBlockingJobs ? <p className="text-xs text-[#FDE68A]">Ha {pendingJobCount} jobs pesados concorrendo. Evite abrir novos lotes antes da fila estabilizar.</p> : null}
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <ViewToggle value={view} onChange={onChangeView} />
          <div className={`border p-4 text-sm ${operationalStatus.mode === "error" || backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.12)]" : operationalStatus.mode === "limited" || backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.16)]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Barra de saude operacional</p>
                <p className="mt-2">{operationalStatus.message || "Operacao normal"} • {backendHealth.message || "Sem historico recente."}</p>
                <p className="mt-2 text-xs opacity-70">Acao sugerida: {healthSuggestedActions[0]?.label || "Ir para triagem"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={operationalStatus.mode === "error" ? "danger" : operationalStatus.mode === "limited" ? "warning" : "success"}>{operationalStatus.mode === "error" ? "operacao com alerta" : operationalStatus.mode === "limited" ? "operacao degradada" : "operacao estavel"}</StatusBadge>
                <StatusBadge tone={backendHealth.status === "error" ? "danger" : backendHealth.status === "warning" ? "warning" : "success"}>{backendHealth.status === "error" ? "backend com falha" : backendHealth.status === "warning" ? "backend com ressalva" : "backend saudavel"}</StatusBadge>
                {candidateQueueErrorCount ? <StatusBadge tone="danger">{candidateQueueErrorCount} fila(s) com erro</StatusBadge> : null}
                {candidateQueueMismatchCount ? <StatusBadge tone="warning">{candidateQueueMismatchCount} fila(s) com leitura parcial</StatusBadge> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {healthSuggestedActions.map((action) => <button key={action.key} type="button" onClick={action.onClick} disabled={action.disabled} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">{action.label}</button>)}
            </div>
          </div>
          {operationalPlan.length ? (
            <div className="border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Plano operacional</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {operationalPlan.map((step, index) => (
                  <button key={`${step.title}-${index}`} type="button" onClick={() => runOperationalPlanStep(step)} disabled={actionState.loading} className="border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-3 text-left hover:border-[#C5A059] disabled:opacity-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[#C5A059]">Passo {index + 1}</p>
                      <StatusBadge tone={getOperationalPlanStepState(step, index).tone}>{getOperationalPlanStepState(step, index).label}</StatusBadge>
                    </div>
                    <p className="mt-2 font-semibold">{step.title}</p>
                    <p className="mt-2 text-xs opacity-70">{step.detail}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {queueRefreshLog.length ? <div className="border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-xs"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Ultimas filas atualizadas</p><div className="mt-2 flex flex-wrap gap-2">{queueRefreshLog.map((item) => <span key={item.key} className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">{item.label} • {new Date(item.ts).toLocaleTimeString("pt-BR")}</span>)}</div></div> : null}
          {latestRemoteRun ? <RemoteRunSummary entry={latestRemoteRun} actionLabels={ACTION_LABELS} /> : null}
          {remoteHealth.length ? <div className="flex flex-wrap gap-2">{remoteHealth.map((item) => <HealthBadge key={item.label} label={item.label} tone={item.tone} />)}</div> : null}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => <MetricCard key={item.label} label={item.label} value={item.value} helper={item.helper} />)}
      </div>
    </>
  );
}
