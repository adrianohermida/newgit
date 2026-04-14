import { useRef, useState } from "react";
import { getBrowserLocalRuntimeConfig } from "../../lib/lawdesk/browser-local-runtime";
import { PROVIDER_OPTIONS, SKILL_OPTIONS } from "./dotobotPanelConfig";

export default function useDotobotShellState({
  defaultCollapsed,
  initialRightPanelTab,
  initialWorkspaceOpen,
  isFullscreenCopilot,
}) {
  const [messages, setMessages] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSort, setConversationSort] = useState("recent");
  const [showArchived, setShowArchived] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiState, setUiState] = useState("idle");
  const [error, setError] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [workspaceOpen, setWorkspaceOpen] = useState(initialWorkspaceOpen);
  const [mode, setMode] = useState(() => (isFullscreenCopilot ? "chat" : "task"));
  const [provider, setProvider] = useState("gpt");
  const [workspaceLayoutMode, setWorkspaceLayoutMode] = useState(() => (isFullscreenCopilot ? "immersive" : "snap"));
  const [providerCatalog, setProviderCatalog] = useState(PROVIDER_OPTIONS);
  const [skillCatalog, setSkillCatalog] = useState(SKILL_OPTIONS);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [ragHealth, setRagHealth] = useState(null);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [localStackSummary, setLocalStackSummary] = useState(null);
  const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
  const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
  const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());
  const [rightPanelTab, setRightPanelTab] = useState(initialRightPanelTab);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("all");
  const [agentLabSnapshot, setAgentLabSnapshot] = useState({ loading: false, error: null, data: null });
  const [agentLabActionState, setAgentLabActionState] = useState({ loading: false, scope: null, message: null, tone: "idle" });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [uiToasts, setUiToasts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingRetrigger, setPendingRetrigger] = useState(null);
  const [lastConsumedAiTaskHandoffId, setLastConsumedAiTaskHandoffId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [renameModal, setRenameModal] = useState({ open: false, conversationId: null, value: "" });
  const [conversationMenuId, setConversationMenuId] = useState(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const taskStatusRef = useRef(new Map());
  const conversationMenuRef = useRef(null);
  const conversationSearchInputRef = useRef(null);
  const projectFilterRef = useRef(null);
  const agentLabSnapshotRequestedRef = useRef(false);
  const providerCatalogRequestedRef = useRef(false);
  const ragHealthRequestedRef = useRef(false);
  const localStackAutoprobeRef = useRef(false);

  return {
    activeConversationId,
    agentLabActionState,
    agentLabSnapshot,
    agentLabSnapshotRequestedRef,
    attachments,
    composerRef,
    confirmModal,
    conversationMenuId,
    conversationMenuRef,
    conversationSearch,
    conversationSearchInputRef,
    conversationSort,
    contextEnabled,
    conversations,
    error,
    fileInputRef,
    input,
    isCollapsed,
    isRecording,
    lastConsumedAiTaskHandoffId,
    loading,
    localRuntimeConfigOpen,
    localRuntimeDraft,
    localStackAutoprobeRef,
    localStackSummary,
    messages,
    mode,
    notificationsEnabled,
    pendingRetrigger,
    projectFilterRef,
    provider,
    providerCatalog,
    providerCatalogRequestedRef,
    ragHealth,
    ragHealthRequestedRef,
    recognitionRef,
    refreshingLocalStack,
    renameModal,
    rightPanelTab,
    scrollRef,
    selectedProjectFilter,
    selectedSkillId,
    showArchived,
    showSlashCommands,
    skillCatalog,
    taskHistory,
    taskStatusRef,
    uiState,
    uiToasts,
    workspaceLayoutMode,
    workspaceOpen,
    setActiveConversationId,
    setAgentLabActionState,
    setAgentLabSnapshot,
    setAttachments,
    setConfirmModal,
    setContextEnabled,
    setConversationMenuId,
    setConversationSearch,
    setConversationSort,
    setConversations,
    setError,
    setInput,
    setIsCollapsed,
    setIsRecording,
    setLastConsumedAiTaskHandoffId,
    setLoading,
    setLocalRuntimeConfigOpen,
    setLocalRuntimeDraft,
    setLocalStackSummary,
    setMessages,
    setMode,
    setNotificationsEnabled,
    setPendingRetrigger,
    setProjectFilter: setSelectedProjectFilter,
    setSelectedProjectFilter,
    setProvider,
    setProviderCatalog,
    setRagHealth,
    setRefreshingLocalStack,
    setRenameModal,
    setRightPanelTab,
    setSelectedSkillId,
    setShowArchived,
    setShowSlashCommands,
    setSkillCatalog,
    setTaskHistory,
    setUiState,
    setUiToasts,
    setWorkspaceLayoutMode,
    setWorkspaceOpen,
  };
}
