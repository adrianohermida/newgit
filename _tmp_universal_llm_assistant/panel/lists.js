import { state } from "./state.js";
import { escHtml, formatDate } from "./utils.js";
import { fetchJson } from "./bridge.js";

export async function syncSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await fetchJson("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId,
      messages: state.messages,
      provider: state.provider,
      model: state.provider === "local" ? state.settings.runtimeModel : state.provider === "cloud" ? state.settings.cloudModel : state.settings.cfModel,
      metadata: { tabUrl: tab?.url, tabTitle: tab?.title, savedAt: new Date().toISOString() },
    }),
  }, 10000);
}

export async function renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge) {
  const data = await fetchJson("/sessions");
  const sessions = data.sessions || [];
  if (!sessions.length) return void (el.paneSessions.innerHTML = '<p class="empty-list">Nenhuma sessao salva.</p>');
  el.paneSessions.innerHTML = sessions.map((session) => `<div class="list-item"><div class="list-item-title">${escHtml(session.metadata?.tabTitle || session.id)}</div><div class="list-item-meta">${session.messageCount} msgs · ${session.taskCount || 0} tasks · ${escHtml(session.provider || "local")} · ${formatDate(session.updatedAt)}</div><div class="list-item-actions"><button class="btn-list-action" data-load="${session.id}">Retomar</button><button class="btn-list-action danger" data-delete-session="${session.id}">Apagar</button></div></div>`).join("");
  el.paneSessions.querySelectorAll("[data-load]").forEach((button) => button.addEventListener("click", async () => {
    const sessionData = await fetchJson(`/sessions/${button.dataset.load}`);
    state.sessionId = sessionData.session.id;
    state.messages = Array.isArray(sessionData.session.messages) ? sessionData.session.messages : [];
    state.provider = sessionData.session.provider || state.provider;
    el.chatArea.innerHTML = "";
    state.messages.forEach((message) => addMessage(el, message.role, message.content));
    updateProviderBadge(el);
    switchTab(el, "chat");
    addSystemMessage(el, `Sessao "${sessionData.session.id}" retomada.`);
  }));
  el.paneSessions.querySelectorAll("[data-delete-session]").forEach((button) => button.addEventListener("click", async () => { await fetchJson(`/sessions/${button.dataset.deleteSession}`, { method: "DELETE" }); await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge); }));
}

export async function renderTasks(el) {
  const data = await fetchJson(`/sessions/${state.sessionId}/tasks`);
  const tasks = data.tasks || [];
  if (!tasks.length) return void (el.paneTasks.innerHTML = '<p class="empty-list">Nenhuma AI-Task nesta sessao.</p>');
  el.paneTasks.innerHTML = tasks.map((task) => `<details class="list-item"><summary class="list-item-title">${escHtml(task.title || task.goal || task.id)} <span class="list-item-meta">${escHtml(task.status || "pending")} · ${task.progressPct || 0}%</span></summary><div class="list-item-meta">${escHtml(task.goal || "")}</div>${task.status === "awaiting_approval" ? `<div class="list-item-actions"><button class="btn-list-action" data-approve-task="${task.id}">Permitir</button><button class="btn-list-action danger" data-deny-task="${task.id}">Negar</button></div>` : ""}<ul>${(task.steps || []).map((step) => `<li>${escHtml(step.description)} — ${escHtml(step.status)}</li>`).join("")}</ul></details>`).join("");
  el.paneTasks.querySelectorAll("[data-approve-task]").forEach((button) => button.addEventListener("click", async () => { await fetchJson(`/sessions/${state.sessionId}/tasks/${button.dataset.approveTask}/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) }); await renderTasks(el); }));
  el.paneTasks.querySelectorAll("[data-deny-task]").forEach((button) => button.addEventListener("click", async () => { await fetchJson(`/sessions/${state.sessionId}/tasks/${button.dataset.denyTask}/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: false }) }); await renderTasks(el); }));
}

export async function renderAutomations(el, addSystemMessage, switchTab) {
  const data = await fetchJson("/automations");
  const automations = data.automations || [];
  if (!automations.length) return void (el.paneAutomations.innerHTML = '<p class="empty-list">Nenhuma automacao gravada.</p>');
  el.paneAutomations.innerHTML = automations.map((item) => `<div class="list-item"><div class="list-item-title">${escHtml(item.title || item.id)}</div><div class="list-item-meta">${item.stepCount} passos · ${formatDate(item.updatedAt || item.createdAt)}</div><div class="list-item-actions"><button class="btn-list-action" data-replay="${item.id}">▶ Reproduzir</button><button class="btn-list-action danger" data-delete-auto="${item.id}">Apagar</button></div></div>`).join("");
  el.paneAutomations.querySelectorAll("[data-replay]").forEach((button) => button.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await fetchJson(`/play/${button.dataset.replay}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabId: String(tab?.id || "default") }) });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    switchTab(el, "chat");
    addSystemMessage(el, `Replay iniciado para ${button.dataset.replay}.`);
  }));
  el.paneAutomations.querySelectorAll("[data-delete-auto]").forEach((button) => button.addEventListener("click", async () => { await fetchJson(`/automations/${button.dataset.deleteAuto}`, { method: "DELETE" }); await renderAutomations(el, addSystemMessage, switchTab); }));
}
