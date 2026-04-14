import { state } from "./state.js";
import { callChat, runTask } from "./bridge.js";
import { pushErrorLog } from "./error-log.js";
import { syncSession } from "./lists.js";
import { updateChatRuntime, updateMemoryStrip } from "./dom.js";
import { maybeSpeakAssistantReply } from "./media.js";

const TASK_TOKENS = [
  "analisar", "extrair", "preencher", "abrir", "navegar",
  "buscar", "executar", "planejar", "automatizar", "/tarefa", "/tarefas",
];

export function bindChat(el, addMessage, addSystemMessage, renderTasks) {
  el.btnSend.addEventListener("click", () => sendMessage(el, addMessage, addSystemMessage, renderTasks));
  el.msgInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendMessage(el, addMessage, addSystemMessage, renderTasks);
  });
  el.msgInput.addEventListener("input", () => {
    el.msgInput.style.height = "auto";
    el.msgInput.style.height = `${Math.min(el.msgInput.scrollHeight, 100)}px`;
  });
}

export async function sendMessage(el, addMessage, addSystemMessage, renderTasks) {
  const text = String(el.msgInput.value || "").trim();
  if (!text) return;
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";
  enqueueOutgoingMessage(el, { text, visibleText: text }, addMessage, addSystemMessage, renderTasks);
}

export function enqueueOutgoingMessage(el, payload, addMessage, addSystemMessage, renderTasks) {
  const text = String(payload?.text || "").trim();
  if (!text) return;
  const finalText = payload?.skipAssetGroup ? text : appendActiveAssetGroupContext(text);
  const visibleText = String(payload?.visibleText || text).trim();
  if (visibleText) addMessage(el, "user", visibleText);
  state.messages.push({ role: "user", content: finalText });
  state.pendingMessages.push({ text: finalText, kind: payload?.kind || "chat" });
  syncRuntimeStrip(el, "queued", "Sua mensagem entrou na fila do assistente.");
  pumpQueue(el, addMessage, addSystemMessage, renderTasks).catch(() => {});
}

async function pumpQueue(el, addMessage, addSystemMessage, renderTasks) {
  if (state.isLoading || !state.pendingMessages.length) return;
  const current = state.pendingMessages.shift();
  state.isLoading = true;
  setLoading(el, true, current?.text || "");
  beginRuntimeLifecycle(el, current?.text || "");

  try {
    const reply = isTaskIntent(current.text)
      ? await sendTaskMessage(el, current.text, addSystemMessage, renderTasks)
      : await sendChatMessage(current.text, (phase, text) => syncRuntimeStrip(el, phase, text));
    state.messages.push({ role: "assistant", content: reply.content });
    addMessage(el, "assistant", reply.content);
    maybeSpeakAssistantReply(reply.content);
    state.localMemoryMeta = reply.metadata || null;
    updateMemoryStrip(el, state.localMemoryMeta);
    const memoryHint = buildMemoryHint(reply.metadata);
    if (memoryHint) addSystemMessage(el, memoryHint);
    syncRuntimeStrip(el, state.pendingMessages.length ? "queued" : "ready", reply.metadata?.degraded ? "Modo seguro ativo para esta resposta." : "Resposta entregue.");
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
    clearRuntimeLifecycle();
    setLoading(el, false, "");
    if (state.pendingMessages.length) {
      setTimeout(() => {
        pumpQueue(el, addMessage, addSystemMessage, renderTasks).catch(() => {});
      }, 120);
    }
  }
}

async function sendChatMessage(text, onPhase) {
  const result = await callChat(state.provider, state.messages, { onPhase });
  return {
    content: result.content || "(sem resposta)",
    metadata: result.metadata || null,
  };
}

async function sendTaskMessage(el, text, addSystemMessage, renderTasks) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
  const result = await runTask(state.sessionId, text, tab?.id ? String(tab.id) : "");
  state.sessionId = result.sessionId || state.sessionId;
  if (Array.isArray(result.tasks) && result.tasks.length) await renderTasks(el);
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
  const primary = tasks[0];
  const title = primary?.title || primary?.goal || text;
  const status = primary?.status || "pending";
  const progress = Number(primary?.progressPct || 0);
  const summary = result.result?.message || result.result?.content || "";
  const suffix = summary ? `\n\n${summary}` : "";
  return {
    content: `Plano iniciado: ${title}\nStatus: ${status}\nProgresso: ${progress}%\nTasks criadas: ${tasks.length || 1}${suffix}`,
    metadata: null,
  };
}

function setLoading(el, value, userText = "") {
  el.btnSend.disabled = false;
  const queueCount = state.pendingMessages.length + (value ? 1 : 0);
  el.btnSend.textContent = queueCount > 1 ? `Fila ${queueCount}` : "Enviar";
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
  if (!metadata.degraded && Array.isArray(metadata.rag_sources) && metadata.rag_sources.length) {
    parts.push(metadata.rag_sources.join(" + "));
  }
  return parts.length ? `Memoria local ativa: ${parts.join(" | ")}` : "";
}

function appendActiveAssetGroupContext(text) {
  const group = state.activeAssetGroup;
  if (!group) return text;
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
  return `${packageHeader}\n\n[Pedido do usuario]\n${text}`;
}
