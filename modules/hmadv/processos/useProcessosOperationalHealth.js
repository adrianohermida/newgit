import { useEffect } from "react";
import { countQueueErrors, countQueueReadMismatches, hasJsonTruncationMessage } from "./processos-screen-utils";

export function useProcessosOperationalHealth(args) {
  useEffect(() => {
    if (args.globalError) return args.setOperationalStatus({ mode: "error", message: args.globalError, updatedAt: new Date().toISOString() });
    const queues = [args.withoutMovements, args.movementBacklog, args.publicationBacklog, args.partesBacklog, args.audienciaCandidates, args.monitoringActive, args.monitoringInactive, args.fieldGaps, args.orphans];
    const queueErrorCount = countQueueErrors(queues);
    const mismatchCount = countQueueReadMismatches(queues);
    const limitedCount = queues.filter((queue) => queue?.limited).length;
    if (queueErrorCount > 0) return args.setOperationalStatus({ mode: "error", message: `${queueErrorCount} fila(s) com erro de leitura no painel.`, updatedAt: new Date().toISOString() });
    if (mismatchCount > 0) return args.setOperationalStatus({ mode: "limited", message: `${mismatchCount} fila(s) com contagem maior que a pagina retornada.`, updatedAt: new Date().toISOString() });
    if (limitedCount > 0) return args.setOperationalStatus({ mode: "limited", message: `${limitedCount} fila(s) em modo reduzido para evitar sobrecarga.`, updatedAt: new Date().toISOString() });
    args.setOperationalStatus({ mode: "ok", message: "Operacao normal", updatedAt: new Date().toISOString() });
  }, [args]);

  useEffect(() => {
    const latest = args.remoteHistory[0];
    if (!latest) return args.setBackendHealth({ status: "unknown", message: "Sem historico recente.", updatedAt: null });
    if (latest.status === "error") return args.setBackendHealth({ status: "error", message: "A ultima rodada apresentou falha.", updatedAt: latest.created_at });
    const truncationErrors = (Array.isArray(latest?.result_sample) ? latest.result_sample : []).filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
    if (truncationErrors > 0) return args.setBackendHealth({ status: "warning", message: `Ultimo ciclo remoto devolveu JSON truncado em ${truncationErrors} item(ns).`, updatedAt: latest.created_at });
    if (Number(latest.affected_count || 0) === 0) return args.setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
    args.setBackendHealth({ status: "ok", message: "Ultima rodada concluida com estabilidade.", updatedAt: latest.created_at });
  }, [args]);
}
