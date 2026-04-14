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
      model: state.provider === "local" ? state.settings.runtimeModel
        : state.provider === "cloud" ? state.settings.cloudModel
        : state.settings.cfModel,
      metadata: { tabUrl: tab?.url, tabTitle: tab?.title, savedAt: new Date().toISOString() },
    }),
  }, 10000);
}

export async function renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge) {
  try {
    const data = await fetchJson("/sessions");
    const sessions = data.sessions || [];
    if (!sessions.length) {
      el.paneSessions.innerHTML = renderEmpty("Sessoes", "Nenhuma sessao salva ainda.");
      return;
    }
    el.paneSessions.innerHTML = `
      <div class="view-toolbar">
        <div class="view-title-wrap">
          <div class="view-title">Sessoes</div>
          <div class="view-subtitle">Historico de conversas salvas por sessao de navegador.</div>
        </div>
      </div>
      ${sessions.map(renderSessionCard).join("")}
    `;
    el.paneSessions.querySelectorAll("[data-load]").forEach((btn) => btn.addEventListener("click", async () => {
      const sessionData = await fetchJson(`/sessions/${btn.dataset.load}`);
      state.sessionId = sessionData.session.id;
      state.messages = Array.isArray(sessionData.session.messages) ? sessionData.session.messages : [];
      state.provider = sessionData.session.provider || state.provider;
      el.chatArea.innerHTML = "";
      state.messages.forEach((msg) => addMessage(el, msg.role, msg.content));
      updateProviderBadge(el);
      switchTab(el, "chat");
      addSystemMessage(el, `Sessao "${sessionData.session.id}" retomada.`);
    }));
    el.paneSessions.querySelectorAll("[data-delete-session]").forEach((btn) => btn.addEventListener("click", async () => {
      await fetchJson(`/sessions/${btn.dataset.deleteSession}`, { method: "DELETE" });
      await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge);
    }));
  } catch (error) {
    el.paneSessions.innerHTML = renderEmpty("Sessoes", `Falha ao carregar sessoes: ${escHtml(error.message)}`);
  }
}

function renderSessionCard(session) {
  const title = session.metadata?.tabTitle || session.id;
  const url = session.metadata?.tabUrl || "";
  const counts = [
    `${session.messageCount} msg`,
    session.taskCount ? `${session.taskCount} tasks` : null,
    escHtml(session.provider || "local"),
  ].filter(Boolean).join(" · ");
  return `
    <article class="list-card">
      <div class="list-item-title">${escHtml(title)}</div>
      <div class="list-item-meta">${counts}</div>
      ${url ? `<div class="list-item-meta">${escHtml(url)}</div>` : ""}
      <div class="list-item-meta">Atualizada em ${formatDate(session.updatedAt)}</div>
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-load="${escHtml(session.id)}">Retomar</button>
        <button class="btn-list-action danger" data-delete-session="${escHtml(session.id)}">Apagar</button>
      </div>
    </article>
  `;
}

export async function renderTasks(el) {
  try {
    const data = await fetchJson(`/sessions/${state.sessionId}/tasks`);
    const tasks = data.tasks || [];
    if (!tasks.length) {
      el.paneTasks.innerHTML = renderEmpty("Tasks", "Nenhuma AI-Task nesta sessao.");
      return;
    }
    el.paneTasks.innerHTML = `
      <div class="view-toolbar">
        <div class="view-title-wrap">
          <div class="view-title">Tasks</div>
          <div class="view-subtitle">Execucao viva do agente — passos, aprovacoes e logs.</div>
        </div>
      </div>
      <div class="list-grid">${tasks.map(renderTaskCard).join("")}</div>
    `;
    bindTaskApproval(el);
  } catch (error) {
    el.paneTasks.innerHTML = renderEmpty("Tasks", `Falha ao carregar tasks: ${escHtml(error.message)}`);
  }
}

export async function renderAutomations(el, addSystemMessage, switchTab) {
  try {
    const data = await fetchJson("/automations");
    const automations = data.automations || [];
    if (!automations.length) {
      el.paneAutomations.innerHTML = renderEmpty("Automacoes", "Nenhuma automacao gravada.");
      return;
    }
    el.paneAutomations.innerHTML = `
      <div class="view-toolbar">
        <div class="view-title-wrap">
          <div class="view-title">Automacoes</div>
          <div class="view-subtitle">Gravacoes reutilizaveis para replay controlado pelo agente.</div>
        </div>
      </div>
      ${automations.map(renderAutomationCard).join("")}
    `;
    el.paneAutomations.querySelectorAll("[data-replay]").forEach((btn) => btn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await fetchJson(`/play/${btn.dataset.replay}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: String(tab?.id || "default") }),
      });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
      switchTab(el, "chat");
      addSystemMessage(el, `Replay iniciado: ${btn.dataset.replay}`);
    }));
    el.paneAutomations.querySelectorAll("[data-delete-auto]").forEach((btn) => btn.addEventListener("click", async () => {
      await fetchJson(`/automations/${btn.dataset.deleteAuto}`, { method: "DELETE" });
      await renderAutomations(el, addSystemMessage, switchTab);
    }));
  } catch (error) {
    el.paneAutomations.innerHTML = renderEmpty("Automacoes", `Falha ao carregar automacoes: ${escHtml(error.message)}`);
  }
}

function renderAutomationCard(item) {
  return `
    <article class="list-card">
      <div class="list-item-title">${escHtml(item.title || item.id)}</div>
      <div class="list-item-meta">${item.stepCount || 0} passos gravados</div>
      <div class="list-item-meta">Atualizada em ${formatDate(item.updatedAt || item.createdAt)}</div>
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-replay="${escHtml(item.id)}">Replay</button>
        <button class="btn-list-action danger" data-delete-auto="${escHtml(item.id)}">Apagar</button>
      </div>
    </article>
  `;
}

function renderTaskCard(task) {
  const status = task.status || "pending";
  const pendingStep = (task.steps || []).find((step) => step.status === "awaiting_approval");
  const logs = Array.isArray(task.logs) ? task.logs.slice(-3) : [];
  return `
    <article class="list-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div class="list-item-title" style="margin:0">${escHtml(task.title || task.goal || task.id)}</div>
        <span class="task-status ${escHtml(status)}">${escHtml(status)}</span>
      </div>
      ${task.goal && task.title && task.goal !== task.title ? `<div class="list-item-meta">${escHtml(task.goal)}</div>` : ""}
      <div class="list-item-meta">${task.progressPct || 0}% concluido · ${(task.steps || []).length} passos</div>
      ${pendingStep ? renderApprovalBox(task, pendingStep) : ""}
      ${(task.steps || []).length ? renderStepDetails(task, logs) : ""}
    </article>
  `;
}

function renderApprovalBox(task, step) {
  const actionDesc = [step.action?.type, step.action?.selector || step.action?.url].filter(Boolean).join(": ");
  return `
    <div class="approval-box">
      <div class="list-item-meta">Aprovacao necessaria: <strong>${escHtml(actionDesc || step.description || "acao do navegador")}</strong></div>
      <div class="list-item-actions" style="margin-top:6px">
        <button class="btn-list-action" data-approve-task="${escHtml(task.id)}">Permitir</button>
        <button class="btn-list-action danger" data-deny-task="${escHtml(task.id)}">Negar</button>
      </div>
    </div>
  `;
}

function renderStepDetails(task, logs) {
  const stepItems = (task.steps || []).map((step) => {
    const cls = step.status === "done" ? "step-done"
      : step.status === "error" ? "step-error"
      : step.status === "running" ? "step-running"
      : step.status === "awaiting_approval" ? "step-waiting"
      : "";
    const err = step.error ? ` — ${escHtml(step.error)}` : "";
    return `<li><span class="${cls}">${escHtml(step.status)}</span> ${escHtml(step.description || step.action?.type || step.id)}${err}</li>`;
  }).join("");
  return `
    <details class="task-detail">
      <summary style="font-size:11px;color:var(--text-soft);cursor:pointer;user-select:none">Passos e logs</summary>
      <ul class="task-step-list">${stepItems}</ul>
      ${logs.length ? `<pre class="task-log">${escHtml(logs.join("\n"))}</pre>` : ""}
    </details>
  `;
}

function bindTaskApproval(el) {
  el.paneTasks.querySelectorAll("[data-approve-task]").forEach((btn) => btn.addEventListener("click", async () => {
    await updateTaskApproval(btn.dataset.approveTask, true);
    await renderTasks(el);
  }));
  el.paneTasks.querySelectorAll("[data-deny-task]").forEach((btn) => btn.addEventListener("click", async () => {
    await updateTaskApproval(btn.dataset.denyTask, false);
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
  return `
    <div class="view-toolbar"><div class="view-title-wrap"><div class="view-title">${title}</div></div></div>
    <div class="empty-state"><div class="empty-sub">${text}</div></div>
  `;
}
