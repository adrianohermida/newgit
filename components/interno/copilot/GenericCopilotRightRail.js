import { CSSTransition, TransitionGroup } from "react-transition-group";

import FocusedContextPanel from "./FocusedContextPanel";
import GenericAgentLabsPanel from "./GenericAgentLabsPanel";
import GenericAiTaskPanel from "./GenericAiTaskPanel";
import GenericModulesPanel from "./GenericModulesPanel";
import RightRailHeader from "./RightRailHeader";

export default function GenericCopilotRightRail(props) {
  const {
    activeRightPanelMeta,
    attachments,
    availableRightPanelTabs,
    contextEnabled,
    isLightTheme,
    ragSummary,
    rightPanelTab,
    routePath,
    setRightPanelTab,
    useCondensedRightRail,
  } = props;

  return (
    <aside className="hidden min-h-0 overflow-hidden lg:block">
      <RightRailHeader
        activeRightPanelMeta={activeRightPanelMeta}
        availableRightPanelTabs={availableRightPanelTabs}
        isLightTheme={isLightTheme}
        rightPanelTab={rightPanelTab}
        setRightPanelTab={setRightPanelTab}
      />
      <TransitionGroup component={null}>
        <CSSTransition key={rightPanelTab} timeout={180} classNames="dotobot-panel-tab">
          <div className={`overflow-y-auto ${useCondensedRightRail ? "h-full p-3 md:p-4" : "h-[calc(100vh-14rem)] p-4"}`}>
            {rightPanelTab === "modules" ? (
              <GenericModulesPanel {...props} />
            ) : rightPanelTab === "ai-task" ? (
              <GenericAiTaskPanel {...props} />
            ) : rightPanelTab === "agentlabs" ? (
              <GenericAgentLabsPanel {...props} />
            ) : (
              <FocusedContextPanel
                attachments={attachments}
                contextEnabled={contextEnabled}
                isLightTheme={isLightTheme}
                ragSummary={ragSummary}
                routePath={routePath}
              />
            )}
          </div>
        </CSSTransition>
      </TransitionGroup>
    </aside>
  );
}
