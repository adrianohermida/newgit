import DotobotCopilot from "../DotobotPanel";
import OperationalRightRail from "./OperationalRightRail";

function SupplementalRail(props) {
  const { currentModuleKey, currentOperationalRail, isLightTheme, onOpenConsole, onOpenJobsLog, resolvedRightRail } = props;
  return <div className={`overflow-auto p-4 ${isLightTheme ? "bg-[rgba(247,249,252,0.92)]" : "bg-[rgba(255,255,255,0.02)]"}`}>
    {currentOperationalRail ? <OperationalRightRail data={currentOperationalRail} onOpenConsole={onOpenConsole} onOpenJobsLog={() => onOpenJobsLog(currentModuleKey)} /> : null}
    {resolvedRightRail ? <div className={currentOperationalRail ? "mt-4" : ""}>{resolvedRightRail}</div> : null}
  </div>;
}

export default function InternoShellRightRail(props) {
  const { copilotOpen, currentModuleKey, currentOperationalRail, isLightTheme, onOpenConsole, onOpenJobsLog, profile, resolvedRightRail, rightCollapsed, rightRailConversationFirst, rightRailFullscreen, routePath, shouldRenderDotobotRail, showSupplementalRightRail } = props;
  if (!shouldRenderDotobotRail || rightCollapsed) return null;
  return <div className={`fixed inset-y-3 right-3 z-40 flex w-[min(100vw-0.75rem,432px)] flex-col overflow-hidden rounded-[30px] border shadow-[-24px_0_56px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] xl:relative xl:inset-y-auto xl:right-auto xl:z-auto xl:h-full xl:min-w-[332px] xl:max-w-[432px] xl:rounded-[30px] xl:shadow-none ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(243,247,251,0.98))]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.96))]"} ${rightRailFullscreen ? "xl:w-[404px]" : "xl:w-[356px]"}`}>
    {!rightRailConversationFirst && showSupplementalRightRail ? <div className={`max-h-[42%] shrink-0 border-b xl:max-h-[48%] ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}><SupplementalRail currentModuleKey={currentModuleKey} currentOperationalRail={currentOperationalRail} isLightTheme={isLightTheme} onOpenConsole={onOpenConsole} onOpenJobsLog={onOpenJobsLog} resolvedRightRail={resolvedRightRail} /></div> : null}
    <div className="min-h-0 flex-1">{copilotOpen ? <DotobotCopilot profile={profile} routePath={routePath} initialWorkspaceOpen={true} defaultCollapsed={false} compactRail={!rightRailFullscreen} showCollapsedTrigger={false} embeddedInInternoShell={true} /> : <div className="flex h-full items-center justify-center text-sm text-[#9BAEA8]">Painel direito fechado.</div>}</div>
    {rightRailConversationFirst && showSupplementalRightRail ? <div className={`max-h-[34%] shrink-0 border-t ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}><SupplementalRail currentModuleKey={currentModuleKey} currentOperationalRail={currentOperationalRail} isLightTheme={isLightTheme} onOpenConsole={onOpenConsole} onOpenJobsLog={onOpenJobsLog} resolvedRightRail={resolvedRightRail} /></div> : null}
  </div>;
}
