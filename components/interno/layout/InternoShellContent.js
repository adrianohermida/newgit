import DotobotExtensionManager from "../DotobotExtensionManager";
import InternoModuleHeader from "./InternoModuleHeader";
import IntegrationGuideCardExternal from "./IntegrationGuideCard";

export default function InternoShellContent({
  children,
  copilotConsoleInset,
  description,
  guide,
  isCopilotWorkspace,
  isLightTheme,
  showExtensionManager,
  title,
}) {
  return <div className={`flex min-h-0 flex-1 flex-col overflow-x-hidden ${isCopilotWorkspace ? "overflow-hidden" : "overflow-y-auto"}`} style={copilotConsoleInset ? { paddingBottom: `${copilotConsoleInset}px` } : undefined}>
    {!isCopilotWorkspace ? <InternoModuleHeader description={description} isLightTheme={isLightTheme} title={title} /> : null}
    <div className={`flex min-h-0 flex-1 flex-col ${isCopilotWorkspace ? "overflow-hidden px-0 pt-0" : "gap-6 px-4 pb-4 md:px-6 md:pb-6"}`} style={isCopilotWorkspace && copilotConsoleInset ? { paddingBottom: `${copilotConsoleInset}px` } : undefined}>
      {!isCopilotWorkspace ? <IntegrationGuideCardExternal guide={guide} /> : null}
      <div className={isCopilotWorkspace ? "min-h-0 flex-1 px-0 pb-0" : ""}>{children}</div>
      {showExtensionManager && !isCopilotWorkspace ? <DotobotExtensionManager /> : null}
    </div>
  </div>;
}
