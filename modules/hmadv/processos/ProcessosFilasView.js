import { QueueSummaryCard } from "./ui-primitives";
import ProcessosCoveragePanel from "./ProcessosCoveragePanel";
import ProcessosQueueSection from "./ProcessosQueueSection";
import ProcessosRecurringPanel from "./ProcessosRecurringPanel";

export default function ProcessosFilasView(props) {
  const monitoringUnsupported = props.monitoringUnsupported;
  const monitoringTone = props.isLightTheme
    ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]"
    : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]";
  const monitoringDashTone = props.isLightTheme
    ? "border-[#e4d2a8] text-[#8a6217]"
    : "border-[#6E5630] text-[#F8E7B5]";

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

        <ProcessosQueueSection
          queueKey="sem_movimentacoes"
          title="Processos sem movimentacoes"
          eyebrow="Fila paginada"
          queueTitle="Sem movimentacoes"
          queueHelper="Itens sem andamento local para reconsulta no DataJud."
          rows={props.withoutMovements.items}
          selected={props.selectedWithoutMovements}
          onToggle={(key) => props.toggleSelection(props.setSelectedWithoutMovements, props.selectedWithoutMovements, key)}
          onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedWithoutMovements, props.selectedWithoutMovements, props.withoutMovements.items, nextState)}
          page={props.wmPage}
          setPage={props.setWmPage}
          loading={props.withoutMovements.loading}
          totalRows={props.withoutMovements.totalRows}
          pageSize={props.withoutMovements.pageSize}
          renderStatuses={(row) => props.renderQueueRowStatuses(row, "sem_movimentacoes")}
          lastUpdated={props.withoutMovements.updatedAt}
          limited={props.withoutMovements.limited}
          errorMessage={props.withoutMovements.error}
          QueueList={props.QueueList}
          QueueActionBlock={props.QueueActionBlock}
          queueConfig={props.queueActionConfigs.sem_movimentacoes}
          updateQueueBatchSize={props.updateQueueBatchSize}
          actionState={props.actionState}
        />

        <div id="processos-movimentacoes-pendentes">
          <ProcessosQueueSection
            queueKey="movimentacoes_pendentes"
            title="Movimentacoes pendentes"
            eyebrow="Fila paginada"
            queueTitle="Andamentos sem activity"
            queueHelper="Processos com movimentacoes no HMADV ainda sem reflexo em sales_activities do Freshsales."
            rows={props.movementBacklog.items}
            selected={props.selectedMovementBacklog}
            onToggle={(key) => props.toggleSelection(props.setSelectedMovementBacklog, props.selectedMovementBacklog, key)}
            onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedMovementBacklog, props.selectedMovementBacklog, props.movementBacklog.items, nextState)}
            page={props.movPage}
            setPage={props.setMovPage}
            loading={props.movementBacklog.loading}
            totalRows={props.movementBacklog.totalRows}
            pageSize={props.movementBacklog.pageSize}
            renderStatuses={(row) => props.renderQueueRowStatuses(row, "movimentacoes_pendentes")}
            lastUpdated={props.movementBacklog.updatedAt}
            limited={props.movementBacklog.limited}
            errorMessage={props.movementBacklog.error}
            QueueList={props.QueueList}
            QueueActionBlock={props.QueueActionBlock}
            queueConfig={props.queueActionConfigs.movimentacoes_pendentes}
            updateQueueBatchSize={props.updateQueueBatchSize}
            actionState={props.actionState}
          />
        </div>

        <div id="processos-publicacoes-pendentes">
          <ProcessosQueueSection
            queueKey="publicacoes_pendentes"
            title="Publicacoes pendentes"
            eyebrow="Fila paginada"
            queueTitle="Publicacoes sem activity"
            queueHelper="Processos com publicacoes no HMADV ainda sem reflexo em sales_activities do Freshsales."
            rows={props.publicationBacklog.items}
            selected={props.selectedPublicationBacklog}
            onToggle={(key) => props.toggleSelection(props.setSelectedPublicationBacklog, props.selectedPublicationBacklog, key)}
            onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedPublicationBacklog, props.selectedPublicationBacklog, props.publicationBacklog.items, nextState)}
            page={props.pubPage}
            setPage={props.setPubPage}
            loading={props.publicationBacklog.loading}
            totalRows={props.publicationBacklog.totalRows}
            pageSize={props.publicationBacklog.pageSize}
            renderStatuses={(row) => props.renderQueueRowStatuses(row, "publicacoes_pendentes")}
            lastUpdated={props.publicationBacklog.updatedAt}
            limited={props.publicationBacklog.limited}
            errorMessage={props.publicationBacklog.error}
            QueueList={props.QueueList}
            QueueActionBlock={props.QueueActionBlock}
            queueConfig={props.queueActionConfigs.publicacoes_pendentes}
            updateQueueBatchSize={props.updateQueueBatchSize}
            actionState={props.actionState}
          />
        </div>

        <div id="processos-partes-sem-contato">
          <ProcessosQueueSection
            queueKey="partes_sem_contato"
            title="Partes sem contato"
            eyebrow="Fila paginada"
            queueTitle="Partes a reconciliar"
            queueHelper="Processos com partes ainda sem contato_freshsales_id, prontos para reconciliacao com o modulo de contatos."
            rows={props.partesBacklog.items}
            selected={props.selectedPartesBacklog}
            onToggle={(key) => props.toggleSelection(props.setSelectedPartesBacklog, props.selectedPartesBacklog, key)}
            onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedPartesBacklog, props.selectedPartesBacklog, props.partesBacklog.items, nextState)}
            page={props.partesPage}
            setPage={props.setPartesPage}
            loading={props.partesBacklog.loading}
            totalRows={props.partesBacklog.totalRows}
            pageSize={props.partesBacklog.pageSize}
            renderStatuses={(row) => props.renderQueueRowStatuses(row, "partes_sem_contato")}
            lastUpdated={props.partesBacklog.updatedAt}
            limited={props.partesBacklog.limited}
            errorMessage={props.partesBacklog.error}
            QueueList={props.QueueList}
            QueueActionBlock={props.QueueActionBlock}
            queueConfig={props.queueActionConfigs.partes_sem_contato}
            updateQueueBatchSize={props.updateQueueBatchSize}
            actionState={props.actionState}
          />
        </div>

        <ProcessosQueueSection
          queueKey="audiencias_pendentes"
          title="Audiencias detectaveis"
          eyebrow="Fila paginada"
          queueTitle="Retroativo de audiencias"
          queueHelper="Processos com sinais concretos de audiencia nas publicacoes e ainda sem persistencia equivalente."
          rows={props.audienciaCandidates.items}
          selected={props.selectedAudienciaCandidates}
          onToggle={(key) => props.toggleSelection(props.setSelectedAudienciaCandidates, props.selectedAudienciaCandidates, key)}
          onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedAudienciaCandidates, props.selectedAudienciaCandidates, props.audienciaCandidates.items, nextState)}
          page={props.audPage}
          setPage={props.setAudPage}
          loading={props.audienciaCandidates.loading}
          totalRows={props.audienciaCandidates.totalRows}
          pageSize={props.audienciaCandidates.pageSize}
          renderStatuses={(row) => [
            { label: `${row.audiencias_pendentes || 0} audiencias pendentes`, tone: "warning" },
            row.proxima_data_audiencia ? { label: `proxima ${new Date(row.proxima_data_audiencia).toLocaleDateString("pt-BR")}`, tone: "default" } : null,
          ].filter(Boolean)}
          lastUpdated={props.audienciaCandidates.updatedAt}
          limited={props.audienciaCandidates.limited}
          errorMessage={props.audienciaCandidates.error}
          QueueList={props.QueueList}
          QueueActionBlock={props.QueueActionBlock}
          queueConfig={props.queueActionConfigs.audiencias_pendentes}
          updateQueueBatchSize={props.updateQueueBatchSize}
          actionState={props.actionState}
        />

        <ProcessosQueueSection
          queueKey="monitoramento_ativo"
          title="Monitoramento ativo"
          eyebrow="Fila paginada"
          queueTitle="Monitorados"
          queueHelper="Se a base ainda nao marca monitoramento_ativo, o painel usa fallback pelos processos com account."
          rows={props.monitoringActive.items}
          selected={props.selectedMonitoringActive}
          onToggle={(key) => props.toggleSelection(props.setSelectedMonitoringActive, props.selectedMonitoringActive, key)}
          onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedMonitoringActive, props.selectedMonitoringActive, props.monitoringActive.items, nextState)}
          page={props.maPage}
          setPage={props.setMaPage}
          loading={props.monitoringActive.loading}
          totalRows={props.monitoringActive.totalRows}
          pageSize={props.monitoringActive.pageSize}
          renderStatuses={(row) => props.renderQueueRowStatuses(row, "monitoramento_ativo", { monitoringUnsupported })}
          lastUpdated={props.monitoringActive.updatedAt}
          limited={props.monitoringActive.limited}
          errorMessage={props.monitoringActive.error}
          selectionDisabled={monitoringUnsupported}
          selectionDisabledMessage={monitoringUnsupported ? "Selecao bloqueada: esta fila serve apenas para diagnosticar a adequacao de schema." : ""}
          notice={monitoringUnsupported ? <div className={`rounded-[20px] border p-4 text-sm ${monitoringTone}`}>A coluna <strong>monitoramento_ativo</strong> ainda nao existe no HMADV. Esta fila fica em modo diagnostico, com leitura por fallback e sem gravacao.</div> : null}
          QueueList={props.QueueList}
          QueueActionBlock={props.QueueActionBlock}
          queueConfig={props.queueActionConfigs.monitoramento_ativo}
          updateQueueBatchSize={props.updateQueueBatchSize}
          actionState={props.actionState}
        />

        <ProcessosQueueSection
          queueKey="monitoramento_inativo"
          title="Monitoramento inativo"
          eyebrow="Fila paginada"
          queueTitle="Nao monitorados"
          queueHelper="Use esta fila para reativar o sync dos processos que ficaram fora da rotina."
          rows={props.monitoringInactive.items}
          selected={props.selectedMonitoringInactive}
          onToggle={(key) => props.toggleSelection(props.setSelectedMonitoringInactive, props.selectedMonitoringInactive, key)}
          onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedMonitoringInactive, props.selectedMonitoringInactive, props.monitoringInactive.items, nextState)}
          page={props.miPage}
          setPage={props.setMiPage}
          loading={props.monitoringInactive.loading}
          totalRows={props.monitoringInactive.totalRows}
          pageSize={props.monitoringInactive.pageSize}
          renderStatuses={(row) => props.renderQueueRowStatuses(row, "monitoramento_inativo", { monitoringUnsupported })}
          lastUpdated={props.monitoringInactive.updatedAt}
          limited={props.monitoringInactive.limited}
          errorMessage={props.monitoringInactive.error}
          selectionDisabled={monitoringUnsupported}
          selectionDisabledMessage={monitoringUnsupported ? "Selecao bloqueada: esta fila mostra somente o backlog dependente da migracao de schema." : ""}
          notice={monitoringUnsupported ? <div className={`rounded-[20px] border p-4 text-sm ${monitoringTone}`}>Sem a coluna <strong>monitoramento_ativo</strong>, esta fila nao consegue gravar alteracoes. O painel mostra apenas o que precisa de adequacao de schema.</div> : <div className={`rounded-[18px] border border-dashed px-4 py-3 text-xs leading-6 ${monitoringDashTone}`}>Ativar monitoramento marca o processo para sync recorrente e inclui a tag <strong>Datajud</strong> no Freshsales. Desativar remove a tag.</div>}
          QueueList={props.QueueList}
          QueueActionBlock={props.QueueActionBlock}
          queueConfig={props.queueActionConfigs.monitoramento_inativo}
          updateQueueBatchSize={props.updateQueueBatchSize}
          actionState={props.actionState}
        />

        <ProcessosQueueSection
          queueKey="campos_orfaos"
          title="GAP DataJud -> CRM"
          eyebrow="Campos orfaos"
          queueTitle="Campos pendentes no Freshsales"
          queueHelper="Processos vinculados cujo espelho ainda tem campos importantes em branco."
          rows={props.fieldGaps.items}
          selected={props.selectedFieldGaps}
          onToggle={(key) => props.toggleSelection(props.setSelectedFieldGaps, props.selectedFieldGaps, key)}
          onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedFieldGaps, props.selectedFieldGaps, props.fieldGaps.items, nextState)}
          page={props.fgPage}
          setPage={props.setFgPage}
          loading={props.fieldGaps.loading}
          totalRows={props.fieldGaps.totalRows}
          pageSize={props.fieldGaps.pageSize}
          renderStatuses={(row) => props.renderQueueRowStatuses(row, "campos_orfaos")}
          lastUpdated={props.fieldGaps.updatedAt}
          limited={props.fieldGaps.limited}
          errorMessage={props.fieldGaps.error}
          QueueList={props.QueueList}
          QueueActionBlock={props.QueueActionBlock}
          queueConfig={props.queueActionConfigs.campos_orfaos}
          updateQueueBatchSize={props.updateQueueBatchSize}
          actionState={props.actionState}
        />

        <div id="processos-sem-sales-account">
          <ProcessosQueueSection
            queueKey="orfaos"
            title="Sem Sales Account"
            eyebrow="Processos orfaos"
            queueTitle="Orfaos"
            queueHelper="Itens do HMADV que ainda nao viraram Sales Account."
            rows={props.orphans.items}
            selected={props.selectedOrphans}
            onToggle={(key) => props.toggleSelection(props.setSelectedOrphans, props.selectedOrphans, key)}
            onTogglePage={(nextState) => props.togglePageSelection(props.setSelectedOrphans, props.selectedOrphans, props.orphans.items, nextState)}
            page={props.orphanPage}
            setPage={props.setOrphanPage}
            loading={props.orphans.loading}
            totalRows={props.orphans.totalRows}
            pageSize={props.orphans.pageSize}
            renderStatuses={(row) => props.renderQueueRowStatuses(row, "orfaos")}
            lastUpdated={props.orphans.updatedAt}
            limited={props.orphans.limited}
            errorMessage={props.orphans.error}
            QueueList={props.QueueList}
            QueueActionBlock={props.QueueActionBlock}
            queueConfig={props.queueActionConfigs.orfaos}
            updateQueueBatchSize={props.updateQueueBatchSize}
            actionState={props.actionState}
          />
        </div>
      </div>
    </div>
  );
}
