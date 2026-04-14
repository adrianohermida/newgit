import FocusedConversationGroups from "./FocusedConversationGroups";
import FocusedHistoryRailHeader from "./FocusedHistoryRailHeader";

export default function FocusedHistoryRail(props) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden">
      <FocusedHistoryRailHeader {...props} />
      <FocusedConversationGroups
        activeConversationId={props.activeConversationId}
        conversationProjectGroups={props.conversationProjectGroups}
        handleDrop={props.handleDrop}
        isLightTheme={props.isLightTheme}
        onConcatConversation={props.handleConcatConversation}
        onSelectConversation={props.selectConversation}
        renderConversationMenu={props.renderConversationMenu}
      />
    </aside>
  );
}
