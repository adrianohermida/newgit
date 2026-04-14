import { state } from "./state.js";
import { callChat, runTask } from "./bridge.js";
import { syncSession } from "./lists.js";

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
  if (!text || state.isLoading) return;

  state.isLoading = true;
  setLoading(el, true);
  addMessage(el, "user", text);
  state.messages.push({ role: "user", content: text });
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";

  try {
    const reply = isTaskIntent(text)
      ? await sendTaskMessage(el, text, addSystemMessage, renderTasks)
      : await sendChatMessage(text);
    state.messages.push({ role: "assistant", content: reply });
    addMessage(el, "assistant", reply);
    if (state.settings.autoSaveSessions) await syncSession();
  } catch (error) {
    addMessage(el, "error", `Erro (${state.provider}): ${error.message}`);
    addSystemMessage(el, "Use Testar conexao em Config para ver a causa exata.");
  } finally {
    state.isLoading = false;
    setLoading(el, false);
  }
}

async function sendChatMessage(text) {
  const result = await callChat(state.provider, state.messages);
  return result.content || "(sem resposta)";
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
  return `Plano iniciado: ${title}\nStatus: ${status}\nProgresso: ${progress}%\nTasks criadas: ${tasks.length || 1}${suffix}`;
}

function setLoading(el, value) {
  el.btnSend.disabled = value;
  el.btnSend.textContent = value ? "..." : "Enviar";
  document.getElementById("typing-indicator")?.remove();
  if (!value) return;
  const wrap = document.createElement("div");
  wrap.id = "typing-indicator";
  wrap.className = "message assistant";
  wrap.innerHTML = '<div class="message-bubble typing"><span></span><span></span><span></span></div>';
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}
