import { Panel } from "./ui-primitives";

export default function ProcessosQueueSection({
  queueKey,
  title,
  eyebrow,
  queueTitle,
  queueHelper,
  rows,
  selected,
  onToggle,
  onTogglePage,
  page,
  setPage,
  loading,
  totalRows,
  pageSize,
  renderStatuses,
  lastUpdated,
  limited,
  errorMessage,
  selectionDisabled = false,
  selectionDisabledMessage = "",
  notice = null,
  QueueList,
  QueueActionBlock,
  queueConfig,
  updateQueueBatchSize,
  actionState,
}) {
  return (
    <Panel title={title} eyebrow={eyebrow}>
      <div className="space-y-4">
        {notice}
        <QueueList
          title={queueTitle}
          helper={queueHelper}
          rows={rows}
          selected={selected}
          onToggle={onToggle}
          onTogglePage={onTogglePage}
          page={page}
          setPage={setPage}
          loading={loading}
          totalRows={totalRows}
          pageSize={pageSize}
          renderStatuses={renderStatuses}
          lastUpdated={lastUpdated}
          limited={limited}
          errorMessage={errorMessage}
          selectionDisabled={selectionDisabled}
          selectionDisabledMessage={selectionDisabledMessage}
        />
        <QueueActionBlock
          selectionCount={queueConfig.selectionCount}
          batchSize={queueConfig.batchSize}
          onBatchChange={(value) => updateQueueBatchSize(queueKey, value)}
          helper={queueConfig.helper}
          disabled={actionState.loading || selectionDisabled}
          actions={queueConfig.actions}
        />
      </div>
    </Panel>
  );
}
