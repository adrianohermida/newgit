import { MODULE_WORKSPACES } from "./dotobotPanelConfig";

export function extractConversationEntities(activeConversation, activeTask) {
  const textPool = [
    activeConversation?.title,
    activeConversation?.preview,
    ...(Array.isArray(activeConversation?.messages) ? activeConversation.messages.map((item) => item?.text) : []),
    activeTask?.query,
    activeTask?.title,
    activeTask?.mission,
    ...(Array.isArray(activeTask?.logs) ? activeTask.logs : []),
  ]
    .filter(Boolean)
    .join("\n");

  const processNumbers = [...new Set((textPool.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || []).slice(0, 6))];
  const emails = [...new Set((textPool.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []).slice(0, 4))];
  return { processNumbers, primaryProcessNumber: processNumbers[0] || "", emails, primaryEmail: emails[0] || "" };
}

export function buildCopilotContextPayload({ module, activeConversation, activeTask, routePath, projectLabel }) {
  return JSON.stringify({
    source: "dotobot-copilot",
    module: module?.key || "geral",
    routePath: routePath || "/interno",
    projectLabel: projectLabel || "Geral",
    conversationTitle: activeConversation?.title || "Nova conversa",
    mission: activeTask?.query || activeTask?.title || activeTask?.mission || "",
    entities: extractConversationEntities(activeConversation, activeTask),
  });
}

export function buildContextualModuleHref(module, context) {
  const params = new URLSearchParams();
  params.set("copilotContext", buildCopilotContextPayload({ module, ...context }));

  if ((module.key === "processos" || module.key === "publicacoes") && context.entities?.processNumbers?.length) {
    params.set("view", "operacao");
    params.set("processNumbers", context.entities.processNumbers.join("\n"));
  }
  if (["leads", "agenda", "contatos"].includes(module.key) && context.entities?.primaryEmail) {
    params.set("email", context.entities.primaryEmail);
  }
  if (module.key === "financeiro" && context.entities?.primaryProcessNumber) {
    params.set("processQuery", context.entities.primaryProcessNumber);
  }
  if (module.key === "jobs") params.set("source", "dotobot-copilot");

  const query = params.toString();
  return query ? `${module.href}?${query}` : module.href;
}

export function buildConversationRuntimeMetadata({ mode, provider, selectedSkillId, contextEnabled, routePath }) {
  const matchedProject = MODULE_WORKSPACES.find((item) => String(routePath || "").startsWith(item.href));
  return {
    mode,
    provider,
    selectedSkillId: selectedSkillId || "",
    contextEnabled,
    routePath: routePath || "/interno",
    projectKey: matchedProject?.key || "geral",
    projectLabel: matchedProject?.label || "Geral",
  };
}

const RIGHT_PANEL_META = {
  modules: true,
  "ai-task": true,
  agentlabs: true,
  context: true,
};

export function normalizeRightPanelTabs(tabs = [], fallbackTab = "modules") {
  const normalized = Array.isArray(tabs) ? tabs.filter((tab) => Object.prototype.hasOwnProperty.call(RIGHT_PANEL_META, tab)) : [];
  return normalized.length ? Array.from(new Set(normalized)) : [fallbackTab];
}

export function getConversationTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
