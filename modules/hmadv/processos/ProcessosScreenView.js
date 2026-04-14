import { MetricCard } from "./ui-primitives";
import ProcessosFilasView from "./ProcessosFilasView";
import ProcessosHeaderPanel from "./ProcessosHeaderPanel";
import ProcessosOperacaoView from "./ProcessosOperacaoView";
import ProcessosRelacoesView from "./ProcessosRelacoesView";
import ProcessosResultadoView from "./ProcessosResultadoView";

export default function ProcessosScreenView(props) {
  const isResultView = props.view === "resultado";
  const isDockedProcessView = props.view === "operacao" || props.view === "resultado";

  return (
    <div className={`${isDockedProcessView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
      <ProcessosHeaderPanel copilotContext={props.copilotContext} processNumbers={props.processNumbers} selectedSummary={props.selectedSummary} actionState={props.actionState} latestHistory={props.latestHistory} view={props.view} updateView={props.updateView} operationalStatus={props.operationalStatus} backendHealth={props.backendHealth} healthSuggestedActions={props.healthSuggestedActions} data={props.data} trackedQueueErrorCount={props.trackedQueueErrorCount} trackedQueueMismatchCount={props.trackedQueueMismatchCount} operationalPlan={props.operationalPlan} runOperationalPlanStep={props.runOperationalPlanStep} getOperationalPlanStepState={props.getOperationalPlanStepState} handleAction={props.handleAction} loadSchemaStatus={props.loadSchemaStatus} loadRunnerMetrics={props.loadRunnerMetrics} coverageSchemaExists={props.coverageSchemaExists} coverageSchemaLabel={props.coverageSchemaLabel} runnerData={props.runnerData} runnerCoverage={props.runnerCoverage} runnerTagged={props.runnerTagged} runnerAction={props.runnerAction} latestRemoteRun={props.latestRemoteRun} />
      {!isResultView ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{props.focusStats.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />)}</div> : null}
      {props.view === "operacao" ? <ProcessosOperacaoView {...props} /> : null}
      {props.view === "filas" ? <ProcessosFilasView {...props} /> : null}
      {props.view === "relacoes" ? <ProcessosRelacoesView {...props} /> : null}
      {props.view === "resultado" ? <ProcessosResultadoView actionState={props.actionState} jobs={props.jobs} activeJobId={props.activeJobId} JobCard={props.JobCard} OperationResult={props.OperationResult} executionHistory={props.executionHistory} remoteHistory={props.remoteHistory} buildDrainPreview={props.buildDrainPreview} /> : null}
    </div>
  );
}
