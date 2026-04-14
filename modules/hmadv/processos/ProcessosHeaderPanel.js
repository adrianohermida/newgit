import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ActionButton, StatusBadge, ViewToggle } from "./ui-primitives";
import { RemoteRunSummary } from "./processos-result-components";

function SessionSummary({ actionState, isLightTheme, latestHistory, selectedSummary }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[26px] border p-4 text-sm ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.86)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Selecionados</span>
        <strong className="font-serif text-2xl">{selectedSummary}</strong>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Estado da sessao</span>
        <span className={`text-right text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
          {actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}
        </span>
      </div>
      {latestHistory ? (
        <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
          {latestHistory.label}: {latestHistory.preview}
        </p>
      ) : null}
    </div>
  );
}

function OperationalHealth({
  backendHealth,
  data,
  healthSuggestedActions,
  isLightTheme,
  operationalStatus,
  trackedQueueErrorCount,
  trackedQueueMismatchCount,
}) {
  const toneClass =
    operationalStatus.mode === "error" || backendHealth.status === "error"
      ? "border-[#4B2222] bg-[rgba(127,29,29,0.12)]"
      : operationalStatus.mode === "limited" || backendHealth.status === "warning"
        ? "border-[#6E5630] bg-[rgba(76,57,26,0.16)]"
        : isLightTheme
          ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]";

  return (
    <div className={`mt-4 rounded-[22px] border p-4 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
            Barra de saude operacional
          </p>
          <p className="mt-2">
            {operationalStatus.message || "Operacao normal"} | {backendHealth.message || "Sem historico recente."}
          </p>
          <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>
            Acao sugerida: {healthSuggestedActions[0]?.label || "Ir para operacao"}
          </p>
          {data.syncWorkerScopeNote ? (
            <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>
              {data.syncWorkerScopeNote}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={operationalStatus.mode === "error" ? "danger" : operationalStatus.mode === "limited" ? "warning" : "success"}>
            {operationalStatus.mode === "error" ? "operacao com alerta" : operationalStatus.mode === "limited" ? "operacao degradada" : "operacao estavel"}
          </StatusBadge>
          <StatusBadge tone={backendHealth.status === "error" ? "danger" : backendHealth.status === "warning" ? "warning" : "success"}>
            {backendHealth.status === "error" ? "backend com falha" : backendHealth.status === "warning" ? "backend com ressalva" : "backend saudavel"}
          </StatusBadge>
          {trackedQueueErrorCount ? <StatusBadge tone="danger">{trackedQueueErrorCount} fila(s) com erro</StatusBadge> : null}
          {trackedQueueMismatchCount ? <StatusBadge tone="warning">{trackedQueueMismatchCount} fila(s) com leitura parcial</StatusBadge> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {healthSuggestedActions.map((action) => (
          <ActionButton key={action.key} className="px-3 py-2 text-xs" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

function OperationalPlanPanel({ getOperationalPlanStepState, isLightTheme, operationalPlan, runOperationalPlanStep }) {
  if (!operationalPlan.length) return null;

  return (
    <div
      className={`mt-4 rounded-[22px] border p-4 text-sm ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)]"
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
        Plano operacional enxuto
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {operationalPlan.slice(0, 3).map((step, index) => {
          const state = getOperationalPlanStepState(step, index);
          return (
            <button
              key={`${step.title}-${index}`}
              type="button"
              onClick={() => runOperationalPlanStep(step)}
              className={`rounded-[18px] border p-3 text-left hover:border-[#C5A059] ${
                isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
                  Passo {index + 1}
                </p>
                <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
              </div>
              <p className="mt-2 font-semibold">{step.title}</p>
              <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{step.detail}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IntegratedReadinessPanel({
  actionState,
  coverageSchemaExists,
  coverageSchemaLabel,
  handleAction,
  isLightTheme,
  loadRunnerMetrics,
  loadSchemaStatus,
  runnerAction,
  runnerCoverage,
  runnerData,
  runnerTagged,
}) {
  return (
    <div
      className={`mt-4 rounded-[26px] border p-4 text-sm ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.88)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[rgba(4,6,6,0.55)]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
            Leitura consolidada
          </p>
          <p className={`mt-1 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
            Schema, runner e integracao total em um unico resumo acionavel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="primary" onClick={() => handleAction("executar_integracao_total_hmadv")} disabled={actionState.loading}>
            Rodar integracao completa
          </ActionButton>
          <ActionButton onClick={() => Promise.all([loadSchemaStatus(), loadRunnerMetrics()])} disabled={actionState.loading}>
            Atualizar leitura
          </ActionButton>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusBadge tone={coverageSchemaExists ? "success" : "warning"}>{coverageSchemaLabel}</StatusBadge>
        <StatusBadge tone={runnerData?.latest?.status === "success" ? "success" : "default"}>
          ultimo runner: {runnerData?.latest?.status || "sem leitura"}
        </StatusBadge>
        <StatusBadge tone="default">limite API Freshsales 1000/h</StatusBadge>
      </div>
      <div className={`mt-3 grid gap-2 text-xs md:grid-cols-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
        <p>
          <strong>Cobertura:</strong> {Number(runnerCoverage?.coverage_coveredRows || 0)} cobertos / {Number(runnerCoverage?.coverage_totalRows || 0)} total
        </p>
        <p>
          <strong>Tag datajud:</strong> {Number(runnerTagged?.tagged_fullyCovered || 0)} completos
        </p>
      </div>
      {runnerAction?.datajud_action_manualActionRequired ? (
        <p className={`mt-2 text-xs ${isLightTheme ? "text-red-700" : "text-[#FECACA]"}`}>
          A prioridade atual ainda depende de acao manual no Freshsales.
        </p>
      ) : null}
    </div>
  );
}

function CopilotContextCard({ copilotContext, isLightTheme, processNumbers }) {
  if (!copilotContext) return null;

  return (
    <div
      className={`mb-5 rounded-[22px] border p-4 text-sm ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]"
          : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"
      }`}
    >
      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#7FC4AF]"}`}>
        Contexto vindo do Copilot
      </p>
      <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>
        {copilotContext.conversationTitle || "Conversa ativa"}
      </p>
      {copilotContext.mission ? (
        <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p>
      ) : null}
      {processNumbers ? (
        <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>
          CNJs pre-carregados no campo de foco manual.
        </p>
      ) : null}
    </div>
  );
}

export default function ProcessosHeaderPanel(props) {
  const { isLightTheme } = useInternalTheme();
  const isResultView = props.view === "resultado";

  return (
    <section
      className={`rounded-[30px] border px-4 md:px-6 ${
        isResultView ? "py-4 md:py-5" : "py-5 md:py-6"
      } ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[radial-gradient(circle_at_top_left,rgba(199,155,44,0.12),transparent_35%),linear-gradient(180deg,#fffdf8,#f5f1e8)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))]"
      }`}
    >
      <CopilotContextCard copilotContext={props.copilotContext} isLightTheme={isLightTheme} processNumbers={props.processNumbers} />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
            Centro operacional
          </p>
          <h3 className="mt-3 font-serif text-4xl leading-tight">Processos com menos ruido, mais decisao e execucao.</h3>
          <p className={`mt-3 max-w-2xl text-sm leading-7 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>
            A operacao precisa mostrar o gargalo real, sugerir o melhor lote e reduzir cliques repetidos. O foco agora e decisao clara por etapa, nao um painel monolitico.
          </p>
        </div>
        <SessionSummary
          actionState={props.actionState}
          isLightTheme={isLightTheme}
          latestHistory={props.latestHistory}
          selectedSummary={props.selectedSummary}
        />
      </div>

      <div className={`mt-6 ${isResultView ? "space-y-3" : "space-y-4"}`}>
        <div className="rounded-[22px] border p-4">
          <ViewToggle value={props.view} onChange={props.updateView} />
          <OperationalHealth
            backendHealth={props.backendHealth}
            data={props.data}
            healthSuggestedActions={props.healthSuggestedActions}
            isLightTheme={isLightTheme}
            operationalStatus={props.operationalStatus}
            trackedQueueErrorCount={props.trackedQueueErrorCount}
            trackedQueueMismatchCount={props.trackedQueueMismatchCount}
          />
          {!isResultView ? (
            <OperationalPlanPanel
              getOperationalPlanStepState={props.getOperationalPlanStepState}
              isLightTheme={isLightTheme}
              operationalPlan={props.operationalPlan}
              runOperationalPlanStep={props.runOperationalPlanStep}
            />
          ) : null}
          {!isResultView ? (
            <IntegratedReadinessPanel
              actionState={props.actionState}
              coverageSchemaExists={props.coverageSchemaExists}
              coverageSchemaLabel={props.coverageSchemaLabel}
              handleAction={props.handleAction}
              isLightTheme={isLightTheme}
              loadRunnerMetrics={props.loadRunnerMetrics}
              loadSchemaStatus={props.loadSchemaStatus}
              runnerAction={props.runnerAction}
              runnerCoverage={props.runnerCoverage}
              runnerData={props.runnerData}
              runnerTagged={props.runnerTagged}
            />
          ) : null}
          {!isResultView && props.latestRemoteRun ? (
            <div className="mt-4">
              <RemoteRunSummary entry={props.latestRemoteRun} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
