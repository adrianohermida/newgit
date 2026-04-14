import { useMemo } from "react";
import {
  extractConversationEntities,
  getConversationTimestamp,
  buildContextualModuleHref,
} from "./dotobotPanelContext";
import { filterVisibleConversations, groupConversationsByProject } from "./dotobotPanelState";
import { buildProjectInsights, MODULE_WORKSPACES } from "./dotobotPanelConfig";

export default function useDotobotConversationViewModel({
  activeConversationId,
  activeTask,
  conversations,
  conversationSort,
  deferredConversationSearch,
  routePath,
  selectedProjectFilter,
  showArchived,
}) {
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0] || null;
  const filteredConversations = useMemo(() => {
    let nextConversations = filterVisibleConversations(conversations, deferredConversationSearch);
    if (!showArchived) nextConversations = nextConversations.filter((conversation) => !conversation.archived);
    if (selectedProjectFilter !== "all") nextConversations = nextConversations.filter((conversation) => conversation.projectKey === selectedProjectFilter);
    if (conversationSort === "recent") return nextConversations.slice().sort((a, b) => getConversationTimestamp(b.updatedAt || b.createdAt) - getConversationTimestamp(a.updatedAt || a.createdAt));
    if (conversationSort === "oldest") return nextConversations.slice().sort((a, b) => getConversationTimestamp(a.updatedAt || a.createdAt) - getConversationTimestamp(b.updatedAt || b.createdAt));
    if (conversationSort === "title") return nextConversations.slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return nextConversations;
  }, [conversationSort, conversations, deferredConversationSearch, selectedProjectFilter, showArchived]);
  const conversationProjectGroups = useMemo(() => groupConversationsByProject(filteredConversations), [filteredConversations]);
  const visibleConversationsByProject = useMemo(() => groupConversationsByProject(conversations.filter((conversation) => showArchived || !conversation.archived)), [conversations, showArchived]);
  const conversationBucketsByProjectKey = useMemo(() => {
    const buckets = new Map();
    for (const conversation of conversations) {
      const key = conversation?.projectKey || "geral";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(conversation);
    }
    return buckets;
  }, [conversations]);
  const projectInsights = useMemo(() => buildProjectInsights(visibleConversationsByProject), [visibleConversationsByProject]);
  const activeProjectLabel = activeConversation?.projectLabel || "Geral";
  const conversationEntities = useMemo(() => extractConversationEntities(activeConversation, activeTask), [activeConversation, activeTask]);
  const moduleWorkspaceCards = useMemo(() => MODULE_WORKSPACES.map((module) => {
    const matchedConversations = conversationBucketsByProjectKey.get(module.key) || [];
    return {
      ...module,
      count: matchedConversations.length,
      active: activeConversation?.projectKey === module.key || String(routePath || "").includes(module.key.replace("_", "-")),
      latestConversation: matchedConversations[0]?.title || null,
      contextualHref: buildContextualModuleHref(module, {
        activeConversation,
        activeTask,
        routePath,
        projectLabel: activeProjectLabel,
        entities: conversationEntities,
      }),
    };
  }), [activeConversation, activeProjectLabel, activeTask, conversationBucketsByProjectKey, conversationEntities, routePath]);

  return {
    activeConversation,
    activeProjectLabel,
    conversationEntities,
    conversationProjectGroups,
    filteredConversations,
    moduleWorkspaceCards,
    projectInsights,
    visibleConversationsByProject,
  };
}
