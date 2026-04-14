import { useMemo } from "react";

function hasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
}

export function usePublicacoesBlockingState({ activeJobId, jobs, partesCandidates, processCandidates }) {
  return useMemo(() => {
    const pendingOrRunningJobs = jobs.filter((item) => ["pending", "running"].includes(String(item.status || "")));
    const blockingJob = pendingOrRunningJobs[0] || null;
    const hasBlockingJob = pendingOrRunningJobs.length > 0;
    const currentDrainJobId = activeJobId || blockingJob?.id || null;

    return {
      blockingJob,
      candidateQueueErrorCount: [processCandidates, partesCandidates].filter((queue) => queue?.error).length,
      candidateQueueMismatchCount: [processCandidates, partesCandidates].filter((queue) => hasReadMismatch(queue)).length,
      canManuallyDrainActiveJob: Boolean(currentDrainJobId),
      currentDrainJobId,
      hasBlockingJob,
      hasMultipleBlockingJobs: pendingOrRunningJobs.length > 1,
    };
  }, [activeJobId, jobs, partesCandidates, processCandidates]);
}
