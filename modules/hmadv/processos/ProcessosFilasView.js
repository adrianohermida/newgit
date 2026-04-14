import { QueueSummaryCard } from "./ui-primitives";
import ProcessosCoveragePanel from "./ProcessosCoveragePanel";
import ProcessosDataQueuePanels from "./ProcessosDataQueuePanels";
import ProcessosMaintenanceQueuePanels from "./ProcessosMaintenanceQueuePanels";
import ProcessosRecurringPanel from "./ProcessosRecurringPanel";

export default function ProcessosFilasView(props) {
  return (
    <div id="filas" className="space-y-6">
      <ProcessosRecurringPanel {...props} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QueueSummaryCard title="Sem movimentacoes" count={props.withoutMovements.totalRows || 0} helper="Processos prontos para reconsulta no DataJud." />
        <QueueSummaryCard title="Movimentacoes pendentes" count={props.movementBacklog.totalRows || 0} helper="Andamentos ainda sem activity no Freshsales." />
        <QueueSummaryCard title="Publicacoes pendentes" count={props.publicationBacklog.totalRows || 0} helper="Publicacoes ainda sem activity no Freshsales." />
        <QueueSummaryCard title="Partes sem contato" count={props.partesBacklog.totalRows || 0} helper="Partes ainda sem contato vinculado." />
        <QueueSummaryCard title="Cobertura auditada" count={props.processCoverage.totalRows || 0} helper="Processos visiveis na leitura consolidada de cobertura." />
        <QueueSummaryCard title="Monitorados" count={props.monitoringActive.totalRows || 0} helper="Carteira ativa em acompanhamento." />
        <QueueSummaryCard title="Campos orfaos" count={props.fieldGaps.totalRows || 0} helper="Diferencas entre a base e o CRM." />
        <QueueSummaryCard title="Sem conta comercial" count={props.orphans.totalRows || 0} helper="Processos ainda sem conta vinculada." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div id="processos-cobertura">
          <ProcessosCoveragePanel {...props} />
        </div>
        <ProcessosDataQueuePanels {...props} />
        <ProcessosMaintenanceQueuePanels {...props} />
      </div>
    </div>
  );
}
