import { state } from "./state.js";
import { callChat, runTask } from "./bridge.js";
import { pushErrorLog } from "./error-log.js";
import { syncSession } from "./lists.js";
import { updateChatRuntime, updateMemoryStrip } from "./dom.js";
import { maybeSpeakAssistantReply } from "./media.js";
import { collectWorkspaceTabs } from "./browser.js";
import { renderPendingQueue } from "./pending-queue.js";

const TASK_TOKENS = [
  "analisar", "extrair", "preencher", "digitar", "inserir", "clicar", "clique", "abrir", "navegar", "ler",
  "buscar", "executar", "planejar", "automatizar", "/tarefa", "/tarefas",
];

export function bindChat(el, addMessage, addSystemMessage, renderTasks) {
  el.btnSend.addEventListener("click", () => sendMessage(el, addMessage, addSystemMessage, renderTasks));
  el.btnCancelEdit?.addEventListener("click", () => cancelQueueEdit(el));
  el.msgInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage(el, addMessage, addSystemMessage, renderTasks);
  });
  el.msgInput.addEventListener("input", () => {
    el.msgInput.style.height = "auto";
    el.msgInput.style.height = `${Math.min(el.msgInput.scrollHeight, 100)}px`;
  });
  syncComposerState(el);
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
}

export async function sendMessage(el, addMessage, addSystemMessage, renderTasks) {
  const text = String(el.msgInput.value || "").trim();
  if (!text) return;
  if (state.editingQueueId) {
    updateQueuedMessage(el, state.editingQueueId, text, addMessage, addSystemMessage, renderTasks);
    return;
  }
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";
  enqueueOutgoingMessage(el, { text, visibleText: text }, addMessage, addSystemMessage, renderTasks);
}

export function enqueueOutgoingMessage(el, payload, addMessage, addSystemMessage, renderTasks) {
  const text = String(payload?.text || "").trim();
  if (!text) return;
  const visibleText = String(payload?.visibleText || text).trim();
  state.pendingMessages.push({
    id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    visibleText,
    skipAssetGroup: Boolean(payload?.skipAssetGroup),
    kind: payload?.kind || "chat",
    // preserve extra context (e.g. camera image dataUrl) for bridge forwarding
    extraContext: (payload?.context && typeof payload.context === "object") ? payload.context : null,
    createdAt: new Date().toISOString(),
  });
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
  syncRuntimeStrip(el, "queued", "Sua mensagem entrou na fila do assistente.");
  pumpQueue(el, addMessage, addSystemMessage, renderTasks).catch(() => {});
}

async function pumpQueue(el, addMessage, addSystemMessage, renderTasks) {
  if (state.isLoading || !state.pendingMessages.length) return;
  const current = state.pendingMessages.shift();
  state.activeRequest = current || null;
  state.isLoading = true;
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
  const finalText = current?.skipAssetGroup ? current.text : appendActiveAssetGroupContext(current?.text || "");
  if (current?.visibleText) addMessage(el, "user", current.visibleText);
  state.messages.push({ role: "user", content: finalText });
  setLoading(el, true, current?.visibleText || current?.text || "");
  beginRuntimeLifecycle(el, current?.text || "");

  try {
    const reply = isTaskIntent(finalText)
      ? await sendTaskMessage(el, finalText, addSystemMessage, renderTasks)
      : await sendChatMessage(finalText, (phase, text) => syncRuntimeStrip(el, phase, text), current?.extraContext || null);
    state.messages.push({ role: "assistant", content: reply.content });
    addMessage(el, "assistant", reply.content);
    maybeSpeakAssistantReply(reply.content);
    state.localMemoryMeta = reply.metadata || null;
    updateMemoryStrip(el, state.localMemoryMeta);
    const memoryHint = buildMemoryHint(reply.metadata);
    if (memoryHint) addSystemMessage(el, memoryHint);
    syncRuntimeStrip(el, state.pendingMessages.length ? "queued" : "ready", reply.metadata?.degraded ? "Resposta entregue com apoio da memoria local." : "Resposta entregue.");
    if (state.settings.autoSaveSessions) {
      // sync failure nao deve interromper o chat nem mascarar erros LLM
      syncSession().catch(() => {});
    }
  } catch (error) {
    pushErrorLog({
      scope: `chat.${state.provider}`,
      title: "Falha ao conversar com o assistente",
      expected: "Receber resposta do provider ou plano de task executavel.",
      actual: error?.message || "Erro desconhecido no chat.",
      trace: "panel/chat.js -> sendMessage()",
      recommendation: "Abra o teste do provider em Config e compare URL, modelo e autenticacao.",
      details: { provider: state.provider, sessionId: state.sessionId },
    });
    syncRuntimeStrip(el, state.pendingMessages.length ? "queued" : "error", "Nao consegui concluir esta resposta.");
    addMessage(el, "error", `Erro (${state.provider}): ${error.message}`);
    addSystemMessage(el, "Use Testar conexao em Config para ver a causa exata.");
  } finally {
    state.isLoading = false;
    state.activeRequest = null;
    clearRuntimeLifecycle();
    setLoading(el, false, "");
    renderQueueState(el, addMessage, addSystemMessage, renderTasks);
    if (state.pendingMessages.length) {
      setTimeout(() => {
        pumpQueue(el, addMessage, addSystemMessage, renderTasks).catch(() => {});
      }, 120);
    }
  }
}

async function sendChatMessage(text, onPhase, extraContext = null) {
  const result = await callChat(state.provider, state.messages, { onPhase, extraContext });
  return {
    content: result.content || "(sem resposta)",
    metadata: result.metadata || null,
  };
}

async function sendTaskMessage(el, text, addSystemMessage, renderTasks) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
  const tabs = await collectWorkspaceTabs().catch(() => []);
  const result = await runTask(state.sessionId, text, { tabId: tab?.id ? String(tab.id) : "", tabs });
  await startReplayForDispatches(result.dispatches);
  state.sessionId = result.sessionId || state.sessionId;
  if (Array.isArray(result.tasks) && result.tasks.length) await renderTasks(el);
  const dispatchTabs = [...new Set((Array.isArray(result.dispatches) ? result.dispatches : []).filter((item) => item?.mode === "queued" && item?.tabId).map((item) => String(item.tabId)))];
  if (dispatchTabs.length) {
    addSystemMessage(el, `Task enviada para ${dispatchTabs.length} guia(s): ${dispatchTabs.join(" | ")}`);
  }
  if (result.tasks?.some((task) => task.status === "awaiting_approval")) {
    addSystemMessage(el, "Uma ou mais Tasks ficaram aguardando sua aprovacao.");
  }
  return buildTaskReply(text, result);
}

function isTaskIntent(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return TASK_TOKENS.some((token) => normalized.includes(token));
}

function buildTaskReply(text, result) {
  const tasks = Array.isArray(result.tasks) ? result.tasks : [];
  const dispatches = Array.isArray(result.dispatches) ? result.dispatches : [];
  const primary = tasks[0];
  const title = primary?.title || primary?.goal || text;
  const status = primary?.status || "pending";
  const progress = Number(primary?.progressPct || 0);
  const totalSteps = Array.isArray(primary?.steps) ? primary.steps.length : 0;
  const waiting = tasks.filter((task) => task.status === "awaiting_approval").length;
  const queued = dispatches.filter((item) => item?.mode === "queued").length;
  const immediate = dispatches.filter((item) => item?.mode === "immediate").length;
  const summary = result.result?.message || result.result?.content || "";
  const suffix = summary ? `\n\n${summary}` : "";
  return {
    content: `Plano iniciado: ${title}\nStatus: ${status}\nProgresso: ${progress}%\nTasks criadas: ${tasks.length || 1}\nPassos no fluxo principal: ${totalSteps || 1}${queued ? `\nEtapas enviadas ao navegador: ${queued}` : ""}${immediate ? `\nEtapas concluidas localmente: ${immediate}` : ""}${waiting ? `\nAguardando aprovacao: ${waiting}` : ""}${suffix}`,
    metadata: null,
  };
}

async function startReplayForDispatches(dispatches = []) {
  const queued = (Array.isArray(dispatches) ? dispatches : [])
    .filter((item) => item?.mode === "queued" && item?.tabId)
    .map((item) => String(item.tabId));
  const uniqueTabIds = [...new Set(queued)];
  await Promise.all(uniqueTabIds.map(async (tabId) => {
    try {
      await chrome.tabs.sendMessage(Number(tabId), { type: "START_REPLAY", tabId });
    } catch {}
  }));
}

function setLoading(el, value, userText = "") {
  const queueCount = state.pendingMessages.length + (value ? 1 : 0);
  el.btnSend.disabled = false;
  if (!state.editingQueueId) {
    el.btnSend.textContent = queueCount > 1 ? `Fila ${queueCount}` : "Enviar";
  }
  clearTimeout(window.__llmTypingTimer);
  document.getElementById("typing-indicator")?.remove();
  if (!value) return;
  const delayMs = computeTypingDelay(userText);
  window.__llmTypingTimer = setTimeout(() => {
    if (!state.isLoading) return;
    const wrap = document.createElement("div");
    wrap.id = "typing-indicator";
    wrap.className = "message assistant typing-row";
    wrap.innerHTML = '<div class="message-bubble typing"><span></span><span></span><span></span></div>';
    el.chatArea.appendChild(wrap);
    el.chatArea.scrollTop = el.chatArea.scrollHeight;
  }, delayMs);
}

function computeTypingDelay(userText) {
  const text = String(userText || "").trim();
  const lengthFactor = Math.min(540, Math.max(240, text.length * 5));
  const historyFactor = Math.min(240, Math.max(0, state.messages.length * 9));
  return Math.min(820, lengthFactor + historyFactor);
}

function beginRuntimeLifecycle(el, userText) {
  clearRuntimeLifecycle();
  syncRuntimeStrip(el, "thinking", "Entendendo sua mensagem e definindo a proxima acao.");
  state.runtimeTimers = [
    setTimeout(() => {
      if (!state.isLoading || state.provider !== "local") return;
      syncRuntimeStrip(el, "memory", "Consultando memoria local e contexto recente.");
    }, Math.min(1200, Math.max(450, String(userText || "").length * 6))),
    setTimeout(() => {
      if (!state.isLoading) return;
      syncRuntimeStrip(el, "responding", state.provider === "local"
        ? "Montando a resposta com memoria local e contexto recente."
        : "Redigindo a resposta.");
    }, 3200),
  ];
}

function clearRuntimeLifecycle() {
  const timers = Array.isArray(state.runtimeTimers) ? state.runtimeTimers : [];
  timers.forEach((timer) => clearTimeout(timer));
  state.runtimeTimers = [];
}

function syncRuntimeStrip(el, phase, text = "") {
  updateChatRuntime(el, {
    phase,
    text,
    queueCount: state.pendingMessages.length + (state.isLoading ? 1 : 0),
  });
}

function buildMemoryHint(metadata) {
  if (!metadata || state.provider !== "local") return "";
  const parts = [];
  if (metadata.performance_profile) parts.push(`perfil ${metadata.performance_profile}`);
  if (Number(metadata.memory_entries_used || 0) > 0) parts.push(`${metadata.memory_entries_used} memorias da sessao`);
  if (Number(metadata.conversation_turns_used || 0) > 0) parts.push(`${metadata.conversation_turns_used} turnos recentes`);
  if (Number(metadata.rag_matches_used || 0) > 0) parts.push(`${metadata.rag_matches_used} referencias locais`);
  if (metadata.degraded) parts.push("modo local seguro");
  if (!metadata.degraded && Array.isArray(metadata.rag_sources) && metadata.rag_sources.length) {
    parts.push(metadata.rag_sources.join(" + "));
  }
  return parts.length ? `Memoria local ativa: ${parts.join(" | ")}` : "";
}

function appendActiveAssetGroupContext(text) {
  const group = state.activeAssetGroup;
  const workspace = Array.isArray(state.workspaceTabs) ? state.workspaceTabs : [];
  const workspaceHeader = workspace.length
    ? `[Workspace de abas]\n${workspace.slice(0, 8).map((tab, index) => `${index + 1}. ${tab.title || tab.url} | ${tab.origin || tab.url}${String(tab.id) === String(state.activeWorkspaceTabId) ? " | ativa" : ""}`).join("\n")}`
    : "";
  if (!group) {
    return workspaceHeader ? `${workspaceHeader}\n\n[Pedido do usuario]\n${text}` : text;
  }
  const items = Array.isArray(group.assets) ? group.assets : [];
  const summary = items
    .slice(0, 8)
    .map((item, index) => {
      const label = item.fileName || item.id;
      const meta = [item.kind, item.mimeType, item.tabTitle].filter(Boolean).join(" | ");
      return `${index + 1}. ${label}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");
  const packageHeader = [
    `[Pacote visual ativo]`,
    `Titulo: ${group.summaryTitle || group.title || group.id || "Grupo visual"}`,
    group.sourceType ? `Origem principal: ${group.sourceType}` : "",
    `Sessao: ${group.sessionId || state.sessionId}`,
    `Arquivos: ${items.length}`,
    summary ? `Itens:\n${summary}` : "",
  ].filter(Boolean).join("\n");
  return `${packageHeader}${workspaceHeader ? `\n\n${workspaceHeader}` : ""}\n\n[Pedido do usuario]\n${text}`;
}

function renderQueueState(el, addMessage, addSystemMessage, renderTasks) {
  renderPendingQueue(el, {
    onEdit: (id) => startQueueEdit(el, id),
    onPrioritize: (id) => prioritizeQueuedMessage(el, id, addMessage, addSystemMessage, renderTasks),
    onRemove: (id) => removeQueuedMessage(el, id, addMessage, addSystemMessage, renderTasks),
  });
  syncComposerState(el);
}

function startQueueEdit(el, itemId) {
  const item = state.pendingMessages.find((entry) => entry.id === itemId);
  if (!item) return;
  state.editingQueueId = itemId;
  el.msgInput.value = item.visibleText || item.text || "";
  el.msgInput.focus();
  el.msgInput.style.height = "auto";
  el.msgInput.style.height = `${Math.min(el.msgInput.scrollHeight, 100)}px`;
  syncComposerState(el);
}

function cancelQueueEdit(el) {
  state.editingQueueId = "";
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";
  syncComposerState(el);
}

function updateQueuedMessage(el, itemId, text, addMessage, addSystemMessage, renderTasks) {
  const nextText = String(text || "").trim();
  if (!nextText) return;
  state.pendingMessages = state.pendingMessages.map((item) => item.id === itemId ? {
    ...item,
    text: nextText,
    visibleText: nextText,
    updatedAt: new Date().toISOString(),
  } : item);
  state.editingQueueId = "";
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
  syncRuntimeStrip(el, state.pendingMessages.length || state.isLoading ? "queued" : "ready", "Mensagem da fila atualizada.");
}

function prioritizeQueuedMessage(el, itemId, addMessage, addSystemMessage, renderTasks) {
  const index = state.pendingMessages.findIndex((item) => item.id === itemId);
  if (index <= 0) {
    renderQueueState(el, addMessage, addSystemMessage, renderTasks);
    return;
  }
  const [item] = state.pendingMessages.splice(index, 1);
  state.pendingMessages.unshift(item);
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
  syncRuntimeStrip(el, "queued", "Mensagem priorizada para o proximo turno.");
}

function removeQueuedMessage(el, itemId, addMessage, addSystemMessage, renderTasks) {
  state.pendingMessages = state.pendingMessages.filter((item) => item.id !== itemId);
  if (state.editingQueueId === itemId) {
    state.editingQueueId = "";
    el.msgInput.value = "";
    el.msgInput.style.height = "auto";
  }
  renderQueueState(el, addMessage, addSystemMessage, renderTasks);
  syncRuntimeStrip(el, state.pendingMessages.length || state.isLoading ? "queued" : "ready", "Mensagem removida da fila.");
}

function syncComposerState(el) {
  const editing = Boolean(state.editingQueueId);
  el.btnSend.textContent = editing ? "Atualizar" : "Enviar";
  if (el.btnCancelEdit) {
    el.btnCancelEdit.style.display = editing ? "inline-flex" : "none";
  }
  if (el.composerMode) {
    if (editing) el.composerMode.textContent = "Editando item da fila";
    else if (state.isLoading && state.pendingMessages.length) el.composerMode.textContent = `Fila ativa · ${state.pendingMessages.length} aguardando`;
    else if (state.isLoading) el.composerMode.textContent = "Assistente respondendo";
    else if (state.pendingMessages.length) el.composerMode.textContent = `Fila pronta · ${state.pendingMessages.length} aguardando`;
    else el.composerMode.textContent = "Mensagem direta";
  }
  if (el.composerHint) {
    el.composerHint.textContent = editing
      ? "Atualize o texto e confirme para manter a ordem da fila"
      : "Enter envia · Shift+Enter quebra linha";
  }
}
