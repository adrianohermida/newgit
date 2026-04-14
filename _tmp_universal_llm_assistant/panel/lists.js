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
  if (!sessions.length) return void (el.paneSessions.innerHTML = renderEmpty("Sessoes", "Nenhuma sessao salva ainda."));
  el.paneSessions.innerHTML = `
    <div class="view-toolbar"><div class="view-title-wrap"><div class="view-title">Sessoes</div><div class="view-subtitle">Historico de conversas, provider usado e contexto salvo.</div></div></div>
    ${sessions.map((session) => `
      <article class="list-card">
        <div class="list-item-title">${escHtml(session.metadata?.tabTitle || session.id)}</div>
        <div class="list-item-meta">${session.messageCount} mensagens · ${session.taskCount || 0} tasks · ${escHtml(session.provider || "local")}</div>
        <div class="list-item-meta">${escHtml(session.metadata?.tabUrl || "")}</div>
        <div class="list-item-meta">Atualizada em ${formatDate(session.updatedAt)}</div>
        <div class="list-item-actions"><button class="btn-list-action" data-load="${session.id}">Retomar</button><button class="btn-list-action danger" data-delete-session="${session.id}">Apagar</button></div>
      </article>
    `).join("")}
  `;
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
  el.paneSessions.querySelectorAll("[data-delete-session]").forEach((button) => button.addEventListener("click", async () => {
    await fetchJson(`/sessions/${button.dataset.deleteSession}`, { method: "DELETE" });
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge);
  }));
}

export async function renderTasks(el) {
  const data = await fetchJson(`/sessions/${state.sessionId}/tasks`);
  const tasks = data.tasks || [];
  if (!tasks.length) return void (el.paneTasks.innerHTML = renderEmpty("Tasks", "Nenhuma AI-Task nesta sessao."));
  el.paneTasks.innerHTML = `
    <div class="view-toolbar"><div class="view-title-wrap"><div class="view-title">Tasks</div><div class="view-subtitle">Execucao viva do agente com passos, aprovacoes e logs recentes.</div></div></div>
    <div class="list-grid">${tasks.map(renderTaskCard).join("")}</div>
  `;
  bindTaskApproval(el);
}

export async function renderAutomations(el, addSystemMessage, switchTab) {
  const data = await fetchJson("/automations");
  const automations = data.automations || [];
  if (!automations.length) return void (el.paneAutomations.innerHTML = renderEmpty("Automacoes", "Nenhuma automacao gravada."));
  el.paneAutomations.innerHTML = `
    <div class="view-toolbar"><div class="view-title-wrap"><div class="view-title">Automacoes</div><div class="view-subtitle">Gravacoes reutilizaveis do operador para replay controlado.</div></div></div>
    ${automations.map((item) => `
      <article class="list-card">
        <div class="list-item-title">${escHtml(item.title || item.id)}</div>
        <div class="list-item-meta">${item.stepCount} passos gravados</div>
        <div class="list-item-meta">Ultima atualizacao: ${formatDate(item.updatedAt || item.createdAt)}</div>
        <div class="list-item-actions"><button class="btn-list-action" data-replay="${item.id}">Replay</button><button class="btn-list-action danger" data-delete-auto="${item.id}">Apagar</button></div>
      </article>
    `).join("")}
  `;
  el.paneAutomations.querySelectorAll("[data-replay]").forEach((button) => button.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await fetchJson(`/play/${button.dataset.replay}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabId: String(tab?.id || "default") }) });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    switchTab(el, "chat");
    addSystemMessage(el, `Replay iniciado para ${button.dataset.replay}.`);
  }));
  el.paneAutomations.querySelectorAll("[data-delete-auto]").forEach((button) => button.addEventListener("click", async () => {
    await fetchJson(`/automations/${button.dataset.deleteAuto}`, { method: "DELETE" });
    await renderAutomations(el, addSystemMessage, switchTab);
  }));
}

function renderTaskCard(task) {
  const pendingStep = (task.steps || []).find((step) => step.status === "awaiting_approval");
  const logs = Array.isArray(task.logs) ? task.logs.slice(-4) : [];
  return `
    <article class="list-card">
      <div class="list-item-title">${escHtml(task.title || task.goal || task.id)}</div>
      <div class="list-item-meta">${escHtml(task.status || "pending")} · ${task.progressPct || 0}%</div>
      <div class="list-item-meta">${escHtml(task.goal || "")}</div>
      ${pendingStep ? `<div class="approval-box"><div class="list-item-meta">Aprovacao pendente para ${escHtml(pendingStep.action?.type || "acao")} ${escHtml(pendingStep.action?.selector || pendingStep.action?.url || "")}</div><div class="list-item-actions"><button class="btn-list-action" data-approve-task="${task.id}">Permitir</button><button class="btn-list-action danger" data-deny-task="${task.id}">Negar</button></div></div>` : ""}
      <details class="task-detail"><summary>Passos e logs</summary><ul class="task-step-list">${(task.steps || []).map((step) => `<li><strong>${escHtml(step.status)}</strong> · ${escHtml(step.description)}${step.error ? ` · ${escHtml(step.error)}` : ""}</li>`).join("")}</ul>${logs.length ? `<pre class="task-log">${escHtml(logs.join("\n"))}</pre>` : ""}</details>
    </article>
  `;
}

function bindTaskApproval(el) {
  el.paneTasks.querySelectorAll("[data-approve-task]").forEach((button) => button.addEventListener("click", async () => {
    await updateTaskApproval(button.dataset.approveTask, true);
    await renderTasks(el);
  }));
  el.paneTasks.querySelectorAll("[data-deny-task]").forEach((button) => button.addEventListener("click", async () => {
    await updateTaskApproval(button.dataset.denyTask, false);
    await renderTasks(el);
  }));
}

async function updateTaskApproval(taskId, approved) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (approved && tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
  await fetchJson(`/sessions/${state.sessionId}/tasks/${taskId}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved, tabId: tab?.id ? String(tab.id) : "" }),
  });
}

function renderEmpty(title, text) {
  return `<div class="view-toolbar"><div class="view-title-wrap"><div class="view-title">${title}</div></div></div><p class="empty-list">${text}</p>`;
}
