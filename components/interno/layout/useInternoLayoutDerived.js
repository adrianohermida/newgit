import { useMemo } from "react";
import { getModuleIntegrationGuide as getExternalModuleIntegrationGuide } from "./IntegrationGuideCard";

export function useInternoLayoutDerived(props) {
  const { activityLog, consoleHeight, consoleOpen, currentModuleKey, currentOperationalRail, handleActions, hideShellSidebar, isCopilotWorkspace, isLightTheme, isMobileShell, leftCollapsed, logState, moduleHistory, rightCollapsed, rightRail, rightRailFullscreen, rightRailMode, router, shouldRenderDotobotRail } = props;
  const processosHistory = moduleHistory?.processos || null;
  const publicacoesHistory = moduleHistory?.publicacoes || null;
  const resolvedRightRail = useMemo(() => typeof rightRail === "function" ? rightRail({ moduleKey: currentModuleKey, moduleHistory, activityLog }) : rightRail, [activityLog, currentModuleKey, moduleHistory, rightRail]);
  const desktopRightRailWidth = rightRailMode === "compact" ? 356 : 404;
  return {
    aiTaskHistory: moduleHistory?.["ai-task"] || null,
    contactsHistory: moduleHistory?.contacts || null,
    copilotConsoleInset: 0,
    copilotMainShellClass: isCopilotWorkspace ? isLightTheme ? "border-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,251,0.96))] shadow-none" : "border-0 bg-[linear-gradient(180deg,rgba(6,8,7,0.98),rgba(8,10,9,0.985))] shadow-none" : isLightTheme ? "border-[#CBD5E1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,247,250,0.96))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.95))]",
    copilotShellSidebarClass: isCopilotWorkspace ? isLightTheme ? "rounded-none border-y-0 border-l-0 border-r border-[#C9D5E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))] shadow-none" : "rounded-none border-y-0 border-l-0 border-r border-[#22342F] bg-[linear-gradient(180deg,rgba(11,18,16,0.995),rgba(8,14,13,0.985))] shadow-none" : isLightTheme ? "rounded-[26px] border-[#C9D5E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.98))]" : "rounded-[26px] border-[#22342F] bg-[linear-gradient(180deg,rgba(11,18,16,0.98),rgba(8,14,13,0.95))]",
    dotobotHistory: moduleHistory?.dotobot || null,
    integrationGuide: getExternalModuleIntegrationGuide(router.pathname),
    mobileConsoleHeight: Math.min(Math.max(consoleHeight, 320), 560),
    paneBodyProps: {
      ...logState,
      ...handleActions,
      activityLog,
      aiTaskHistory: moduleHistory?.["ai-task"] || null,
      contactsHistory: moduleHistory?.contacts || null,
      dotobotHistory: moduleHistory?.dotobot || null,
      processosLocalHistory: processosHistory?.executionHistory || [],
      processosRemoteHistory: processosHistory?.remoteHistory || [],
      publicacoesLocalHistory: publicacoesHistory?.executionHistory || [],
      publicacoesRemoteHistory: publicacoesHistory?.remoteHistory || [],
    },
    processosLocalHistory: processosHistory?.executionHistory || [],
    processosRemoteHistory: processosHistory?.remoteHistory || [],
    publicacoesHistory,
    publicacoesLocalHistory: publicacoesHistory?.executionHistory || [],
    publicacoesRemoteHistory: publicacoesHistory?.remoteHistory || [],
    resolvedRightRail,
    rightRailConversationFirst: !(rightRailFullscreen && Boolean(currentOperationalRail || resolvedRightRail)),
    showExtensionManager: router.pathname === "/interno/ai-task" || router.pathname === "/interno/agentlab",
    showSupplementalRightRail: rightRailFullscreen && Boolean(currentOperationalRail || resolvedRightRail),
  };
}
