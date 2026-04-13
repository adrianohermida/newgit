import DotobotCopilot from "./DotobotPanel";
import { useInternalTheme } from "./InternalThemeProvider";

export default function CopilotWorkspace({ profile }) {
  const { isLightTheme } = useInternalTheme();

  return (
    <div
      className={`min-h-0 flex-1 overflow-hidden rounded-[30px] ${
        isLightTheme
          ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,251,0.94))]"
          : "bg-[linear-gradient(180deg,rgba(6,8,7,0.98),rgba(8,10,9,0.96))]"
      }`}
    >
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        <DotobotCopilot
          profile={profile}
          routePath="/interno/copilot"
          initialWorkspaceOpen={true}
          defaultCollapsed={false}
          compactRail={false}
          showCollapsedTrigger={false}
          embeddedInInternoShell={true}
          focusedWorkspaceMode={true}
        />
      </div>
    </div>
  );
}
