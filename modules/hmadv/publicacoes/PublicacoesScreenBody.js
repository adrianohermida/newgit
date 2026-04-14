import { PublicacoesAdviseStatusPanel } from "./advise-status-panel";
import { PublicacoesOperationView } from "./operation-view";
import { PublicacoesQueuesView } from "./queues-view";
import { PublicacoesResultView } from "./result-view";
import { PublicacoesWorkspaceHeader } from "./workspace-header";

export function PublicacoesScreenBody(props) {
  const { actionState, activeJobId, adviseBackfillProgress, adviseLastCycleTotal, adviseLastRunAt, adviseMode, advisePersistedDelta, adviseSync, adviseTokenOk, backendHealth, blockingJob, canManuallyDrainActiveJob, candidateQueueErrorCount, candidateQueueMismatchCount, copilotContext, data, drainInFlight, executionHistory, formatFallbackReason, formatSnapshotLabel, getOperationalPlanStepState, handleAction, hasBlockingJob, hasMultipleBlockingJobs, healthSuggestedActions, isDockedPublicacoesView, isLightTheme, isResultView, jobs, latestHistory, latestJob, latestRemoteRun, limit, loadOverview, loadPartesCandidates, loadProcessCandidates, noPublicationActivityTypeConfigured, operationalPlan, operationalStatus, partesBacklogCount, partesPage, pendingJobCount, processNumbers, processPage, processCandidates, publicationActivityTypeHint, publicationActivityTypes, queueRefreshLog, queuesViewModel, remoteHealth, remoteHistory, runOperationalPlanStep, runPendingJobsNow, selectedPartesKeys, selectedProcessKeys, selectedProcessNumbers, selectedUnifiedNumbers, setLimit, setProcessNumbers, snapshotMesaIntegrada, snapshotPartes, snapshotProcessos, syncWorkerLastPublicacoes, updateView, view } = props;

  return (
    <div className={`${isDockedPublicacoesView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
      {copilotContext ? (
        <section className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#bdd8cf] bg-[#f3fbf8] text-[#25403a]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Contexto vindo do Copilot</p>
          <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
          {copilotContext.mission ? <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#4b5563]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p> : null}
          {processNumbers ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#2c7a66]" : "text-[#7F928C]"}`}>CNJs pre-carregados para operacao de publicacoes.</p> : null}
        </section>
      ) : null}
      <PublicacoesWorkspaceHeader
        view={view}
        onChangeView={updateView}
        latestHistory={latestHistory}
        latestJob={latestJob}
        activeJobId={activeJobId}
        selectedCount={selectedProcessKeys.length + selectedPartesKeys.length}
        hasMultipleBlockingJobs={hasMultipleBlockingJobs}
        pendingJobCount={pendingJobCount}
        actionState={actionState}
        operationalStatus={operationalStatus}
        backendHealth={backendHealth}
        healthSuggestedActions={healthSuggestedActions}
        candidateQueueErrorCount={candidateQueueErrorCount}
        candidateQueueMismatchCount={candidateQueueMismatchCount}
        operationalPlan={!isResultView ? operationalPlan : []}
        getOperationalPlanStepState={getOperationalPlanStepState}
        runOperationalPlanStep={runOperationalPlanStep}
        queueRefreshLog={queueRefreshLog}
        latestRemoteRun={latestRemoteRun}
        remoteHealth={remoteHealth}
        metrics={[{ label: "Publicacoes operacionais", value: data.publicacoesOperacionais || 0, helper: "Total operacional no portal, excluindo itens marcados como leilao ignorado." }, { label: "Vinculadas", value: data.publicacoesVinculadas || 0, helper: "Publicacoes que ja possuem processo vinculado no HMADV." }, { label: "Pendentes de sync", value: data.publicacoesPendentesComAccount || 0, helper: "Publicacoes vinculadas ainda sem activity no Freshsales." }, { label: "Sem processo", value: data.publicacoesSemProcesso || 0, helper: "Publicacoes ainda sem processo vinculado no HMADV." }]}
      />
      <PublicacoesAdviseStatusPanel adviseSync={adviseSync} adviseTokenOk={adviseTokenOk} adviseMode={adviseMode} adviseCursor={props.adviseCursor} adviseLastRunAt={adviseLastRunAt} adviseBackfillProgress={adviseBackfillProgress} advisePersistedDelta={advisePersistedDelta} snapshotMesaIntegrada={snapshotMesaIntegrada} snapshotPartes={snapshotPartes} snapshotProcessos={snapshotProcessos} publicationActivityTypes={publicationActivityTypes} adviseLastCycleTotal={adviseLastCycleTotal} syncWorkerLastPublicacoes={syncWorkerLastPublicacoes} data={data} actionState={actionState} handleAction={handleAction} formatSnapshotLabel={formatSnapshotLabel} isLightTheme={isLightTheme} />
      {view === "operacao" ? <PublicacoesOperationView data={data} processCandidates={processCandidates} selectedProcessKeys={selectedProcessKeys} processNumbers={processNumbers} setProcessNumbers={setProcessNumbers} limit={limit} setLimit={setLimit} actionState={actionState} hasBlockingJob={hasBlockingJob} canManuallyDrainActiveJob={canManuallyDrainActiveJob} blockingJob={blockingJob} drainInFlight={drainInFlight} selectedProcessNumbers={selectedProcessNumbers} selectedUnifiedNumbers={selectedUnifiedNumbers} noPublicationActivityTypeConfigured={noPublicationActivityTypeConfigured} publicationActivityTypeHint={publicationActivityTypeHint} partesBacklogCount={partesBacklogCount} handleAction={handleAction} updateView={updateView} runPendingJobsNow={runPendingJobsNow} loadOverview={loadOverview} loadProcessCandidates={loadProcessCandidates} loadPartesCandidates={loadPartesCandidates} processPage={processPage} partesPage={partesPage} /> : null}
      {view === "filas" ? <PublicacoesQueuesView model={queuesViewModel} /> : null}
      {view === "resultado" ? <PublicacoesResultView actionState={actionState} jobs={jobs} activeJobId={activeJobId} executionHistory={executionHistory} remoteHistory={remoteHistory} formatFallbackReason={formatFallbackReason} /> : null}
    </div>
  );
}
