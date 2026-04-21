import DotobotCopilot from "../DotobotPanel";

function WidgetHeader({ isLightTheme, onClose, routePath }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F5F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(10,12,11,0.98),rgba(7,9,8,0.96))]"}`}>
      <div className="min-w-0">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Dotobot Widget</p>
        <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Conversa residente no interno</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#CFE3DB] bg-[#F5FBF8] text-[#2F7A62]" : "border-[#35554B] text-[#9FE0C7]"}`}>Cloudflare</span>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-full border px-3 py-1.5 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

export default function InternoFloatingCopilotWidget({ copilotOpen, isLightTheme, onClose, profile, routePath, shouldRenderDotobotRail }) {
  if (!shouldRenderDotobotRail || !copilotOpen || routePath === "/interno/copilot") return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-4 z-[85] flex max-h-[min(78vh,760px)] w-[min(100vw-2rem,460px)] flex-col">
      <div className={`pointer-events-auto overflow-hidden rounded-[28px] border shadow-[0_28px_70px_rgba(0,0,0,0.28)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(243,247,251,0.98))]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.96))]"}`}>
        <WidgetHeader isLightTheme={isLightTheme} onClose={onClose} routePath={routePath} />
        <div className="h-[min(68vh,680px)] min-h-[520px] overflow-hidden">
          <DotobotCopilot
            profile={profile}
            routePath={routePath}
            initialWorkspaceOpen={true}
            defaultCollapsed={false}
            compactRail={true}
            showCollapsedTrigger={false}
            embeddedInInternoShell={true}
          />
        </div>
      </div>
    </div>
  );
}
