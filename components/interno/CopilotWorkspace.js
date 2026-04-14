import DotobotCopilot from "./DotobotPanel";
import { useInternalTheme } from "./InternalThemeProvider";

export default function CopilotWorkspace({ profile }) {
  const { isLightTheme } = useInternalTheme();

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
        isLightTheme
          ? "bg-transparent"
          : "bg-transparent"
      }`}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <DotobotCopilot
          profile={profile}
          routePath="/interno/copilot"
          initialWorkspaceOpen={true}
          defaultCollapsed={false}
          compactRail={false}
          showCollapsedTrigger={false}
          embeddedInInternoShell={true}
          focusedWorkspaceMode={true}
          allowedRightPanelTabs={["context", "ai-task"]}
          defaultRightPanelTab="context"
        />
      </div>
    </div>
  );
}
