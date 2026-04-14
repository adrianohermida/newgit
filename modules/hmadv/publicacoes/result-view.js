import { OperationalHistoryCompactCard, OperationalResultCard } from "../../../components/interno/OperationalResultPanels";
import { buildDrainPreview } from "./action-utils";
import { JobCard } from "./ui-primitives";
import { OperationResult as OperationResultSection } from "./result-panel";

export function PublicacoesResultView({ actionState, jobs, activeJobId, executionHistory, remoteHistory, formatFallbackReason }) {
  const latestExecution = executionHistory[0];
  const latestRemote = remoteHistory[0];

  return (
    <div id="resultado" className="grid flex-1 auto-rows-fr items-stretch gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <OperationalResultCard
        className="h-full"
        loading={actionState.loading}
        error={actionState.error}
        result={actionState.result ? <>{actionState.result?.drain ? <div className="mb-4 rounded-[20px] border border-[#30543A] bg-[rgba(48,84,58,0.12)] p-4 text-sm"><p className="font-semibold">Drenagem de fila</p><p className="mt-2 opacity-75">{buildDrainPreview(actionState.result.drain)}</p></div> : null}{jobs.length ? <div className="mb-4 space-y-3"><p className="text-xs uppercase tracking-[0.16em] opacity-55">Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}<OperationResultSection result={actionState.result} formatFallbackReason={formatFallbackReason} /></> : null}
        emptyText="Nenhuma acao executada ainda nesta sessao."
        footer="Resultado compacto para manter a execucao legivel."
      />
      <OperationalHistoryCompactCard className="h-full" primaryText={latestExecution ? `${latestExecution.label || latestExecution.action} • ${latestExecution.status}` : ""} secondaryLabel="Ultima leitura remota" secondaryText={latestRemote ? `${latestRemote.acao} • ${latestRemote.status}` : ""} />
    </div>
  );
}
