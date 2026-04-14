import { OperationalHistoryCompactCard, OperationalResultCard } from "../../../components/interno/OperationalResultPanels";
import { getProcessActionLabel } from "./action-utils";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";

export default function ProcessosResultadoView({ actionState, jobs, activeJobId, JobCard, OperationResult, executionHistory, remoteHistory, buildDrainPreview }) {
  const { isLightTheme } = useInternalTheme();
  return <div id="resultado" className="grid flex-1 auto-rows-fr items-stretch gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
    <OperationalResultCard className="h-full" loading={actionState.loading} error={actionState.error} result={actionState.result ? <>{actionState.result?.drain ? <div className={`mb-4 rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#8dc8a3] bg-[#effaf2] text-[#166534]" : "border-[#30543A] bg-[rgba(48,84,58,0.12)]"}`}><p className="font-semibold">Drenagem de fila</p><p className={`mt-2 ${isLightTheme ? "text-[#166534]" : "opacity-75"}`}>{buildDrainPreview(actionState.result.drain)}</p></div> : null}{jobs.length ? <div className="mb-4 space-y-3"><p className={`text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}<OperationResult result={actionState.result} /></> : null} emptyText="Nenhuma acao executada ainda nesta sessao." footer="Resultado compacto, sem esticar o modulo antes do console." />
    <OperationalHistoryCompactCard className="h-full" primaryText={executionHistory[0] ? `${executionHistory[0].label || executionHistory[0].action} | ${executionHistory[0].status}` : ""} secondaryLabel="Ultima leitura remota" secondaryText={remoteHistory[0] ? `${getProcessActionLabel(remoteHistory[0].acao, remoteHistory[0].payload || {})} | ${remoteHistory[0].status}` : ""} />
  </div>;
}
