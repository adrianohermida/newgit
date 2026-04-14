import { ActionButton, Panel, QueueSummaryCard, StatusBadge } from "./ui-primitives";

export default function ProcessosRecurringPanel({
  isLightTheme,
  recurringProcesses,
  recurringProcessFocus,
  recurringProcessBatch,
  visibleRecurringCount,
  visibleSevereRecurringCount,
  selectedVisibleSevereRecurringCount,
  priorityBatchReady,
  setLimit,
  applySevereRecurringPreset,
  selectVisibleRecurringProcesses,
  selectVisibleSevereRecurringProcesses,
  clearAllQueueSelections,
  recurringProcessActions,
  primaryProcessAction,
  updateView,
  runPendingJobsNow,
  actionState,
  drainInFlight,
  recurringProcessChecklist,
  recurringProcessSummary,
  recurringProcessBands,
  recurringProcessGroups,
  RecurringProcessGroup,
}) {
  if (!recurringProcesses.length) return null;

  const focusTone = isLightTheme
    ? "border-[#e4d2a8] bg-[#fff8e8] text-[#5b4a22]"
    : "border-[#6E5630] bg-[rgba(76,57,26,0.16)]";
  const focusLabelTone = isLightTheme ? "text-[#8a6217]" : "text-[#F8E7B5]";
  const stepTone = isLightTheme ? "text-[#4b5563]" : "opacity-80";
  const stepCircleTone = isLightTheme
    ? "border-[#e4d2a8] text-[#8a6217]"
    : "border-[#6E5630] text-[#F8E7B5]";

  return (
    <Panel title="Pendencias reincidentes" eyebrow="Prioridade operacional">
      <div className="space-y-4">
        <div className={`rounded-[24px] border p-4 ${focusTone}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${focusLabelTone}`}>Foco recomendado</p>
          <p className="mt-2 font-semibold">{recurringProcessFocus.title}</p>
          <p className={`mt-2 text-sm ${isLightTheme ? "text-[#6b7280]" : "opacity-75"}`}>{recurringProcessFocus.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="success">lote sugerido {recurringProcessBatch.size}</StatusBadge>
            <StatusBadge tone="default">{recurringProcessBatch.reason}</StatusBadge>
            <StatusBadge tone="default">{visibleRecurringCount} reincidentes visiveis</StatusBadge>
            <StatusBadge tone="warning">{visibleSevereRecurringCount} graves visiveis</StatusBadge>
            <StatusBadge tone={visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount ? "success" : "default"}>
              selecao cobre {selectedVisibleSevereRecurringCount}/{visibleSevereRecurringCount || 0} graves
            </StatusBadge>
            <StatusBadge tone={priorityBatchReady ? "success" : "warning"}>
              {priorityBatchReady ? "lote prioritario pronto" : "lote prioritario pendente"}
            </StatusBadge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton className="px-3 py-2 text-xs" onClick={() => setLimit(recurringProcessBatch.size)}>Usar lote sugerido</ActionButton>
            <ActionButton tone="primary" className="px-3 py-2 text-xs" onClick={applySevereRecurringPreset}>Montar lote prioritario</ActionButton>
            <ActionButton className="px-3 py-2 text-xs" onClick={selectVisibleRecurringProcesses}>Selecionar reincidentes visiveis</ActionButton>
            <ActionButton className="px-3 py-2 text-xs" onClick={selectVisibleSevereRecurringProcesses}>Selecionar 3x+ visiveis</ActionButton>
            <ActionButton className="px-3 py-2 text-xs" onClick={clearAllQueueSelections}>Limpar selecao</ActionButton>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recurringProcessActions.map((action) => <StatusBadge key={action} tone="warning">{action}</StatusBadge>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone="success">proximo disparo: {primaryProcessAction}</StatusBadge>
            <ActionButton className="px-3 py-2 text-xs" onClick={() => updateView("operacao")}>Ir para operacao</ActionButton>
            <ActionButton className="px-3 py-2 text-xs" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight}>
              {drainInFlight ? "Drenando..." : "Rodar drenagem agora"}
            </ActionButton>
          </div>
          <div className="mt-4 space-y-2">
            {recurringProcessChecklist.map((step, index) => (
              <div key={step} className={`flex items-start gap-3 text-sm ${stepTone}`}>
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${stepCircleTone}`}>
                  {index + 1}
                </span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <QueueSummaryCard title="Supabase" count={recurringProcessSummary.supabase} helper="Itens que pedem correcao ou consolidacao interna." />
          <QueueSummaryCard title="Freshsales" count={recurringProcessSummary.freshsales} helper="Reparos ou criacao de account no CRM." />
          <QueueSummaryCard title="DataJud" count={recurringProcessSummary.datajud} helper="Reconsulta ou falta de progresso no enriquecimento." />
          <QueueSummaryCard title="Manual" count={recurringProcessSummary.manual} helper="Casos que merecem revisao humana." accent="text-[#FECACA]" />
          <QueueSummaryCard title="Sem progresso" count={recurringProcessSummary.stagnant} helper="Reincidencias sem ganho util no lote." accent="text-[#FDE68A]" />
          <QueueSummaryCard title="Recorrentes" count={recurringProcessSummary.total} helper="Itens que voltaram em multiplos ciclos recentes." />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <QueueSummaryCard title="Faixa 2x" count={recurringProcessBands.recurring} helper="Pendencias que reapareceram em dois ciclos." />
          <QueueSummaryCard title="Faixa 3x" count={recurringProcessBands.reincident} helper="Itens reincidentes que merecem atencao prioritaria." accent="text-[#FDE68A]" />
          <QueueSummaryCard title="Faixa 4x+" count={recurringProcessBands.critical} helper="Gargalos cronicos que pedem acao estrutural." accent="text-[#FECACA]" />
        </div>

        <div className="space-y-6">
          <RecurringProcessGroup title="Criticos (4x+)" helper="Gargalos cronicos que repetem em quatro ou mais ciclos." items={recurringProcessGroups.critical} />
          <RecurringProcessGroup title="Reincidentes (3x)" helper="Itens que persistem por tres ciclos e merecem prioridade alta." items={recurringProcessGroups.reincident} />
          <RecurringProcessGroup title="Recorrentes (2x)" helper="Itens que reapareceram duas vezes e ainda cabem em correcao operacional." items={recurringProcessGroups.recurring} />
        </div>
      </div>
    </Panel>
  );
}
