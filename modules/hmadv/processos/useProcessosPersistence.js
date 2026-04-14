import { useEffect } from "react";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { loadHistoryEntries, loadOperationalSnapshot, persistOperationalSnapshot } from "./storage";

export function useProcessosPersistence(args) {
  useEffect(() => { args.setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => {
    setModuleHistory("processos", { executionHistory: args.executionHistory, remoteHistory: args.remoteHistory, jobs: args.jobs, activeJobId: args.activeJobId, drainInFlight: args.drainInFlight, operationalStatus: args.operationalStatus, backendHealth: args.backendHealth, schemaStatus: args.schemaStatus, runnerMetrics: args.runnerMetrics, queueRefreshLog: args.queueRefreshLog, queueBatchSizes: args.queueBatchSizes, actionState: { loading: Boolean(args.actionState?.loading), error: args.actionState?.error || null, result: args.actionState?.result || null }, ui: { view: args.view, limit: args.limit, processNumbers: args.processNumbers, selectedWithoutMovements: args.selectedWithoutMovements.length, selectedMovementBacklog: args.selectedMovementBacklog.length, selectedPublicationBacklog: args.selectedPublicationBacklog.length, selectedPartesBacklog: args.selectedPartesBacklog.length, selectedAudienciaCandidates: args.selectedAudienciaCandidates.length, selectedMonitoringActive: args.selectedMonitoringActive.length, selectedMonitoringInactive: args.selectedMonitoringInactive.length, selectedFieldGaps: args.selectedFieldGaps.length, selectedOrphans: args.selectedOrphans.length }, queues: { semMovimentacoes: { totalRows: Number(args.withoutMovements?.totalRows || args.withoutMovements?.items?.length || 0), pageSize: Number(args.withoutMovements?.pageSize || 20), updatedAt: args.withoutMovements?.updatedAt || null, limited: Boolean(args.withoutMovements?.limited), error: args.withoutMovements?.error || null }, movimentacoesPendentes: { totalRows: Number(args.movementBacklog?.totalRows || args.movementBacklog?.items?.length || 0), pageSize: Number(args.movementBacklog?.pageSize || 20), updatedAt: args.movementBacklog?.updatedAt || null, limited: Boolean(args.movementBacklog?.limited), error: args.movementBacklog?.error || null }, publicacoesPendentes: { totalRows: Number(args.publicationBacklog?.totalRows || args.publicationBacklog?.items?.length || 0), pageSize: Number(args.publicationBacklog?.pageSize || 20), updatedAt: args.publicationBacklog?.updatedAt || null, limited: Boolean(args.publicationBacklog?.limited), error: args.publicationBacklog?.error || null }, partesSemContato: { totalRows: Number(args.partesBacklog?.totalRows || args.partesBacklog?.items?.length || 0), pageSize: Number(args.partesBacklog?.pageSize || 20), updatedAt: args.partesBacklog?.updatedAt || null, limited: Boolean(args.partesBacklog?.limited), error: args.partesBacklog?.error || null }, audienciasPendentes: { totalRows: Number(args.audienciaCandidates?.totalRows || args.audienciaCandidates?.items?.length || 0), pageSize: Number(args.audienciaCandidates?.pageSize || 20), updatedAt: args.audienciaCandidates?.updatedAt || null, limited: Boolean(args.audienciaCandidates?.limited), error: args.audienciaCandidates?.error || null }, camposOrfaos: { totalRows: Number(args.fieldGaps?.totalRows || args.fieldGaps?.items?.length || 0), pageSize: Number(args.fieldGaps?.pageSize || 20), updatedAt: args.fieldGaps?.updatedAt || null, limited: Boolean(args.fieldGaps?.limited), error: args.fieldGaps?.error || null }, orfaos: { totalRows: Number(args.orphans?.totalRows || args.orphans?.items?.length || 0), pageSize: Number(args.orphans?.pageSize || 20), updatedAt: args.orphans?.updatedAt || null, limited: Boolean(args.orphans?.limited), error: args.orphans?.error || null } } });
  }, [args]);
  useEffect(() => {
    const snapshot = loadOperationalSnapshot();
    if (!snapshot) return;
    if (snapshot.overview) args.setOverview(snapshot.overview);
    if (snapshot.processCoverage) args.setProcessCoverage(snapshot.processCoverage);
    if (snapshot.withoutMovements) args.setWithoutMovements(snapshot.withoutMovements);
    if (snapshot.movementBacklog) args.setMovementBacklog(snapshot.movementBacklog);
    if (snapshot.publicationBacklog) args.setPublicationBacklog(snapshot.publicationBacklog);
    if (snapshot.partesBacklog) args.setPartesBacklog(snapshot.partesBacklog);
    if (snapshot.audienciaCandidates) args.setAudienciaCandidates(snapshot.audienciaCandidates);
    if (snapshot.monitoringActive) args.setMonitoringActive(snapshot.monitoringActive);
    if (snapshot.monitoringInactive) args.setMonitoringInactive(snapshot.monitoringInactive);
    if (snapshot.fieldGaps) args.setFieldGaps(snapshot.fieldGaps);
    if (snapshot.orphans) args.setOrphans(snapshot.orphans);
    if (Array.isArray(snapshot.remoteHistory)) args.setRemoteHistory(snapshot.remoteHistory);
    if (Array.isArray(snapshot.jobs)) args.setJobs(snapshot.jobs);
    if (snapshot.schemaStatus) args.setSchemaStatus(snapshot.schemaStatus);
    if (snapshot.runnerMetrics) args.setRunnerMetrics(snapshot.runnerMetrics);
    if (snapshot.actionState && typeof snapshot.actionState === "object") args.setActionState({ loading: false, error: snapshot.actionState.error || null, result: snapshot.actionState.result || null });
    if (snapshot.cachedAt) args.setSnapshotAt(snapshot.cachedAt);
  }, []);
  useEffect(() => {
    const snapshotPayload = { overview: args.overview, processCoverage: args.processCoverage, withoutMovements: args.withoutMovements, movementBacklog: args.movementBacklog, publicationBacklog: args.publicationBacklog, partesBacklog: args.partesBacklog, audienciaCandidates: args.audienciaCandidates, monitoringActive: args.monitoringActive, monitoringInactive: args.monitoringInactive, fieldGaps: args.fieldGaps, orphans: args.orphans, schemaStatus: args.schemaStatus, runnerMetrics: args.runnerMetrics, remoteHistory: args.remoteHistory, jobs: args.jobs, actionState: { error: args.actionState.error || null, result: args.actionState.result || null } };
    const normalizedPayload = JSON.stringify(snapshotPayload);
    if (normalizedPayload === args.snapshotPayloadRef.current) return;
    args.snapshotPayloadRef.current = normalizedPayload;
    const cachedAt = new Date().toISOString();
    args.setSnapshotAt(cachedAt);
    persistOperationalSnapshot({ cachedAt, ...snapshotPayload });
  }, [args]);
}
