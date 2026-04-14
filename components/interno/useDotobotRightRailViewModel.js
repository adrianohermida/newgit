import { useMemo } from "react";
import {
  buildAgentLabIncidentPreview,
  buildAgentLabQueuePreview,
  buildAgentLabSyncPreview,
  buildAgentLabTrainingPreview,
  buildLinkedDotobotTaskRuns,
  extractAgentLabSubagents,
} from "./dotobotPanelInsights";
import { RIGHT_PANEL_META } from "./dotobotPanelContext";

export default function useDotobotRightRailViewModel({
  activeConversation,
  activeTask,
  agentLabSnapshot,
  availableRightPanelTabs,
  rightPanelTab,
  routePath,
}) {
  const activeRightPanelMeta = useMemo(
    () => RIGHT_PANEL_META[rightPanelTab] || RIGHT_PANEL_META[availableRightPanelTabs[0]] || RIGHT_PANEL_META.modules,
    [availableRightPanelTabs, rightPanelTab]
  );
  const agentLabData = agentLabSnapshot.data || null;
  const agentLabSubagents = useMemo(() => extractAgentLabSubagents(agentLabSnapshot.data, activeTask), [activeTask, agentLabSnapshot.data]);
  const agentLabOverview = agentLabData?.overview || {};
  const agentLabEnvironment = agentLabData?.environment || {};
  const agentLabConversationSummary = agentLabData?.conversations?.summary || {};
  const agentLabIncidentsSummary = agentLabData?.intelligence?.summary || {};
  const agentLabTrainingSummary = agentLabData?.training?.summary || {};
  const agentLabQueuePreview = useMemo(() => buildAgentLabQueuePreview(agentLabData?.governance?.queue || []), [agentLabData?.governance?.queue]);
  const agentLabSyncPreview = useMemo(() => buildAgentLabSyncPreview(agentLabData?.intelligence?.syncRuns || []), [agentLabData?.intelligence?.syncRuns]);
  const agentLabTrainingPreview = useMemo(() => buildAgentLabTrainingPreview(agentLabData?.training?.runs || []), [agentLabData?.training?.runs]);
  const agentLabIncidentPreview = useMemo(() => buildAgentLabIncidentPreview(agentLabData?.intelligence?.incidents || []), [agentLabData?.intelligence?.incidents]);
  const featuredTrainingScenario = useMemo(
    () => (agentLabData?.training?.scenarios || []).find((item) => item?.agent_ref === "dotobot-ai") || (agentLabData?.training?.scenarios || [])[0] || null,
    [agentLabData?.training?.scenarios]
  );
  const linkedAgentLabTaskRuns = useMemo(
    () => buildLinkedDotobotTaskRuns(agentLabData?.dotobot?.taskRuns || [], { routePath, activeTask, activeConversation }),
    [activeConversation, activeTask, agentLabData?.dotobot?.taskRuns, routePath]
  );
  const agentLabHealthSignals = useMemo(
    () => [
      { label: "Ambiente", value: agentLabEnvironment.mode === "connected" ? "conectado" : agentLabEnvironment.mode === "degraded" ? "contingência" : "parcial" },
      { label: "RAG", value: agentLabEnvironment.dotobotRagHealth?.ok ? "ok" : "atenção" },
      { label: "Providers", value: `${agentLabEnvironment.lawdeskProvidersHealth?.summary?.operational || 0} online` },
      { label: "Threads", value: String(agentLabConversationSummary.total || 0) },
    ],
    [agentLabConversationSummary.total, agentLabEnvironment.dotobotRagHealth?.ok, agentLabEnvironment.lawdeskProvidersHealth?.summary?.operational, agentLabEnvironment.mode]
  );

  return {
    activeRightPanelMeta,
    agentLabConversationSummary,
    agentLabData,
    agentLabEnvironment,
    agentLabHealthSignals,
    agentLabIncidentPreview,
    agentLabIncidentsSummary,
    agentLabOverview,
    agentLabQueuePreview,
    agentLabSubagents,
    agentLabSyncPreview,
    agentLabTrainingPreview,
    agentLabTrainingSummary,
    featuredTrainingScenario,
    linkedAgentLabTaskRuns,
  };
}
