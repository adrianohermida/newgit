import { BRIDGE_URL, state } from "./state.js";
import { escHtml, formatDate } from "./utils.js";
import { fetchJson } from "./bridge.js";
import { updateWorkspaceStrip } from "./dom.js";

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
      metadata: {
        tabUrl: tab?.url,
        tabTitle: tab?.title,
        savedAt: new Date().toISOString(),
        browserTabs: Array.isArray(state.workspaceTabs) ? state.workspaceTabs : [],
        activeTabId: state.activeWorkspaceTabId || (tab?.id ? String(tab.id) : ""),
        activeAssetGroup: state.activeAssetGroup ? {
          id: state.activeAssetGroup.id,
          title: state.activeAssetGroup.title || "",
          sessionId: state.activeAssetGroup.sessionId || state.sessionId,
          assetRefs: Array.isArray(state.activeAssetGroup.assetRefs) ? state.activeAssetGroup.assetRefs : [],
          assets: Array.isArray(state.activeAssetGroup.assets) ? state.activeAssetGroup.assets : [],
        } : null,
      },
    }),
  }, 10000);
}

export async function renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup) {
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
          <div class="view-subtitle">Historico salvo do chat, tasks e workspace multi-abas por sessao.</div>
        </div>
      </div>
      ${sessions.map(renderSessionCard).join("")}
    `;
    bindSessionActions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  } catch (error) {
    el.paneSessions.innerHTML = renderEmpty("Sessoes", `Falha ao carregar sessoes: ${escHtml(error.message)}`);
  }
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
          <div class="view-subtitle">Execucao viva do agente com passos, aprovacoes e resultado auditavel.</div>
        </div>
      </div>
      ${renderWorkspaceSummary(state.workspaceTabs, state.activeWorkspaceTabId)}
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
          <div class="view-subtitle">Gravacoes reutilizaveis para replay supervisionado.</div>
        </div>
      </div>
      ${automations.map(renderAutomationCard).join("")}
    `;
    bindAutomationActions(el, addSystemMessage, switchTab);
  } catch (error) {
    el.paneAutomations.innerHTML = renderEmpty("Automacoes", `Falha ao carregar automacoes: ${escHtml(error.message)}`);
  }
}

function bindSessionActions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup) {
  el.paneSessions.querySelectorAll("[data-load]").forEach((btn) => btn.addEventListener("click", async () => {
    const sessionData = await fetchJson(`/sessions/${btn.dataset.load}`);
    state.sessionId = sessionData.session.id;
    state.messages = Array.isArray(sessionData.session.messages) ? sessionData.session.messages : [];
    state.provider = sessionData.session.provider || state.provider;
    state.activeAssetGroup = sessionData.session.metadata?.activeAssetGroup || null;
    state.workspaceTabs = Array.isArray(sessionData.session.metadata?.browserTabs) ? sessionData.session.metadata.browserTabs : [];
    state.activeWorkspaceTabId = String(sessionData.session.metadata?.activeTabId || "");
    el.chatArea.innerHTML = "";
    state.messages.forEach((msg) => addMessage(el, msg.role, msg.content));
    updateProviderBadge(el);
    updateActiveAssetGroup?.(el, state.activeAssetGroup);
    updateWorkspaceStrip(el, state.workspaceTabs, state.activeWorkspaceTabId);
    switchTab(el, "chat");
    addSystemMessage(el, `Sessao "${sessionData.session.metadata?.tabTitle || sessionData.session.id}" retomada.`);
  }));

  el.paneSessions.querySelectorAll("[data-delete-session]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/sessions/${btn.dataset.deleteSession}`, { method: "DELETE" });
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  el.paneSessions.querySelectorAll("[data-rename-session]").forEach((btn) => btn.addEventListener("click", async () => {
    const nextTitle = window.prompt("Novo nome da sessao:", btn.dataset.currentTitle || "");
    if (nextTitle === null) return;
    await fetchJson(`/sessions/${btn.dataset.renameSession}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  el.paneSessions.querySelectorAll("[data-export-session]").forEach((btn) => btn.addEventListener("click", () => {
    window.open(`${BRIDGE_URL}/sessions/${encodeURIComponent(btn.dataset.exportSession)}/export.md`, "_blank");
  }));

  el.paneSessions.querySelectorAll("[data-assets-session]").forEach((btn) => btn.addEventListener("click", async () => {
    const sessionId = btn.dataset.assetsSession;
    const host = el.paneSessions.querySelector(`[data-assets-host="${sessionId}"]`);
    if (!host) return;
    if (host.dataset.loaded === "true") {
      host.innerHTML = "";
      host.dataset.loaded = "false";
      return;
    }
    const data = await fetchJson(`/sessions/${sessionId}/assets`);
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];
    host.innerHTML = assets.length
      ? renderAssetsPanel(sessionId, assets, groups)
      : `<div class="list-item-meta" style="margin-top:8px">Nenhum anexo ou captura nesta sessao.</div>`;
    host.dataset.loaded = "true";
    bindAssetActions(host, sessionId, switchTab, addSystemMessage, addMessage, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));
}

function bindAutomationActions(el, addSystemMessage, switchTab) {
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

  el.paneAutomations.querySelectorAll("[data-inspect-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    const host = el.paneAutomations.querySelector(`[data-automation-host="${btn.dataset.inspectAuto}"]`);
    if (!host) return;
    if (host.dataset.loaded === "true") {
      host.innerHTML = "";
      host.dataset.loaded = "false";
      return;
    }
    const data = await fetchJson(`/automations/${btn.dataset.inspectAuto}`);
    host.innerHTML = renderAutomationDetails(data.automation || {});
    host.dataset.loaded = "true";
    bindAutomationDetailActions(el, host, addSystemMessage, switchTab);
  }));

  el.paneAutomations.querySelectorAll("[data-delete-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/automations/${btn.dataset.deleteAuto}`, { method: "DELETE" });
    await renderAutomations(el, addSystemMessage, switchTab);
  }));

  el.paneAutomations.querySelectorAll("[data-rename-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    const nextTitle = window.prompt("Novo nome da automacao:", btn.dataset.currentTitle || "");
    if (nextTitle === null) return;
    await fetchJson(`/automations/${btn.dataset.renameAuto}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    await renderAutomations(el, addSystemMessage, switchTab);
  }));
}

function renderSessionCard(session) {
  const title = session.metadata?.tabTitle || session.id;
  const url = session.metadata?.tabUrl || "";
  const tabs = Array.isArray(session.metadata?.browserTabs) ? session.metadata.browserTabs : [];
  const activeTab = tabs.find((tab) => String(tab.id) === String(session.metadata?.activeTabId || "")) || tabs.find((tab) => tab.active) || null;
  const origins = tabs.map((tab) => tab.origin).filter(Boolean);
  const uniqueOrigins = origins.filter((origin, index) => origins.indexOf(origin) === index);
  const metaPills = [
    `${session.messageCount} msg`,
    session.taskCount ? `${session.taskCount} tasks` : null,
    tabs.length ? `${tabs.length} abas` : null,
    session.provider || "local",
  ].filter(Boolean);
  return `
    <article class="list-card">
      <div class="list-item-title">${escHtml(title)}</div>
      <div class="meta-pill-row">${metaPills.map((item) => `<span class="meta-pill">${escHtml(item)}</span>`).join("")}</div>
      ${url ? `<div class="list-item-meta">${escHtml(url)}</div>` : ""}
      ${activeTab ? `<div class="list-item-meta">Aba ativa salva: ${escHtml(activeTab.title || activeTab.url || activeTab.id)}</div>` : ""}
      ${uniqueOrigins.length ? `<div class="list-item-meta">Workspace: ${escHtml(uniqueOrigins.slice(0, 3).join(" | "))}${uniqueOrigins.length > 3 ? ` | +${uniqueOrigins.length - 3}` : ""}</div>` : ""}
      <div class="list-item-meta">Atualizada em ${formatDate(session.updatedAt)}</div>
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-load="${escHtml(session.id)}">Retomar</button>
        <button class="btn-list-action" data-assets-session="${escHtml(session.id)}">Arquivos</button>
        <button class="btn-list-action" data-export-session="${escHtml(session.id)}">Exportar MD</button>
        <button class="btn-list-action" data-rename-session="${escHtml(session.id)}" data-current-title="${escHtml(title)}">Renomear</button>
        <button class="btn-list-action danger" data-delete-session="${escHtml(session.id)}">Apagar</button>
      </div>
      <div data-assets-host="${escHtml(session.id)}"></div>
    </article>
  `;
}

function renderAutomationCard(item) {
  const preview = Array.isArray(item.previewSteps) ? item.previewSteps.join(" | ") : "";
  return `
    <article class="list-card">
      <div class="list-item-title">${escHtml(item.title || item.id)}</div>
      <div class="list-item-meta">${item.stepCount || 0} passos gravados</div>
      ${item.startUrl ? `<div class="list-item-meta">${escHtml(item.startUrl)}</div>` : ""}
      ${preview ? `<div class="list-item-meta">Fluxo: ${escHtml(preview)}</div>` : ""}
      <div class="list-item-meta">Atualizada em ${formatDate(item.updatedAt || item.createdAt)}</div>
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-replay="${escHtml(item.id)}">Replay</button>
        <button class="btn-list-action" data-inspect-auto="${escHtml(item.id)}">Inspecionar</button>
        <button class="btn-list-action" data-rename-auto="${escHtml(item.id)}" data-current-title="${escHtml(item.title || item.id)}">Renomear</button>
        <button class="btn-list-action danger" data-delete-auto="${escHtml(item.id)}">Apagar</button>
      </div>
      <div data-automation-host="${escHtml(item.id)}"></div>
    </article>
  `;
}

function renderTaskCard(task) {
  const status = task.status || "pending";
  const pendingStep = (task.steps || []).find((step) => step.status === "awaiting_approval");
  const currentStep = (task.steps || []).find((step) => ["running", "awaiting_approval", "pending"].includes(step.status));
  const logs = Array.isArray(task.logs) ? task.logs.slice(-3) : [];
  const completedSteps = (task.steps || []).filter((step) => step.status === "done").length;
  const pct = Number(task.progressPct || 0);
  const targetTab = describeTargetTab(currentStep);
  const parallelGroup = task.orchestration?.parallelGroup ? `Paralelo: ${task.orchestration.parallelGroup}` : "";
  const dependsOn = Array.isArray(task.orchestration?.dependsOn) && task.orchestration.dependsOn.length
    ? `Depende de: ${task.orchestration.dependsOn.join(", ")}`
    : "";
  const orchestrationMeta = [
    targetTab,
    parallelGroup,
    dependsOn,
  ].filter(Boolean);
  return `
    <article class="list-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div class="list-item-title" style="margin:0">${escHtml(task.title || task.goal || task.id)}</div>
        <span class="task-status ${escHtml(status)}">${escHtml(status)}</span>
      </div>
      ${task.goal && task.title && task.goal !== task.title ? `<div class="list-item-meta">${escHtml(task.goal)}</div>` : ""}
      <div class="list-item-meta">${pct}% concluido | ${completedSteps}/${(task.steps || []).length} passos</div>
      <div class="task-progress"><span class="task-progress-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
      ${currentStep ? `<div class="list-item-meta">Step atual: ${escHtml(currentStep.description || currentStep.action?.type || currentStep.id)}</div>` : ""}
      ${orchestrationMeta.length ? `<div class="meta-pill-row">${orchestrationMeta.map((item) => `<span class="meta-pill subtle">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${pendingStep ? renderApprovalBox(task, pendingStep) : ""}
      ${(task.steps || []).length ? renderStepDetails(task, logs) : ""}
    </article>
  `;
}

function renderApprovalBox(task, step) {
  const actionDesc = step.approval?.actionLabel || [step.action?.type, step.action?.selector || step.action?.url].filter(Boolean).join(": ");
  const target = step.approval?.target || step.action?.selector || step.action?.url || step.action?.command || "";
  const reason = step.approval?.reason || "Esta etapa pode alterar a pagina ou o ambiente local.";
  return `
    <div class="approval-box">
      <div class="list-item-meta">Aprovacao necessaria: <strong>${escHtml(actionDesc || step.description || "acao do navegador")}</strong></div>
      ${target ? `<div class="list-item-meta">Alvo: ${escHtml(target)}</div>` : ""}
      <div class="list-item-meta">${escHtml(reason)}</div>
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
      : "step-pending";
    const title = escHtml(step.description || step.action?.type || step.id);
    const meta = [
      step.action?.type ? `acao ${step.action.type}` : "",
      step.action?.tabTitle || step.action?.tabId ? `aba ${step.action?.tabTitle || step.action?.tabId}` : "",
      describeStepReason(step),
    ].filter(Boolean);
    const output = step.output ? `<div class="task-step-output">${escHtml(formatStepOutput(step.output))}</div>` : "";
    const err = step.error ? `<div class="task-step-error">${escHtml(step.error)}</div>` : "";
    return `
      <li class="task-step-card">
        <div class="task-step-head">
          <span class="task-step-status ${cls}">${escHtml(step.status)}</span>
          <span class="task-step-title">${title}</span>
        </div>
        ${meta.length ? `<div class="task-step-meta">${escHtml(meta.join(" | "))}</div>` : ""}
        ${output}
        ${err}
      </li>
    `;
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

function renderAutomationDetails(automation) {
  const steps = Array.isArray(automation.summarizedSteps) ? automation.summarizedSteps : [];
  if (!steps.length) {
    return `<div class="list-item-meta" style="margin-top:8px">Nenhum passo detalhado disponivel.</div>`;
  }
  return `
    <details class="task-detail" open>
      <summary style="font-size:11px;color:var(--text-soft);cursor:pointer;user-select:none">Passos gravados</summary>
      <ul class="task-step-list">
        ${steps.map((step) => `
          <li class="task-step-card">
            <div class="task-step-head">
              <span class="task-step-status step-pending">#${step.index + 1}</span>
              <span class="task-step-title">${escHtml(step.label || step.type || "passo")}</span>
            </div>
            ${step.pageTitle || step.pageUrl ? `<div class="task-step-meta">${escHtml(step.pageTitle || step.pageUrl)}</div>` : ""}
            ${step.selector ? `<div class="task-step-meta">selector ${escHtml(step.selector)}</div>` : ""}
            <div class="list-item-actions" style="margin-top:8px">
              <button class="btn-list-action" data-replay-from-auto="${escHtml(automation.id)}" data-replay-from-step="${step.index}">Replay daqui</button>
            </div>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function bindAutomationDetailActions(el, host, addSystemMessage, switchTab) {
  host.querySelectorAll("[data-replay-from-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await fetchJson(`/play/${btn.dataset.replayFromAuto}/from/${btn.dataset.replayFromStep}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: String(tab?.id || "default") }),
    });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    switchTab(el, "chat");
    addSystemMessage(el, `Replay iniciado a partir do passo ${Number(btn.dataset.replayFromStep) + 1}.`);
  }));
}

function renderWorkspaceSummary(workspaceTabs = [], activeTabId = "") {
  const tabs = Array.isArray(workspaceTabs) ? workspaceTabs : [];
  if (!tabs.length) return "";
  const activeTab = tabs.find((tab) => String(tab.id) === String(activeTabId)) || tabs.find((tab) => tab.active) || tabs[0] || null;
  const visibleTabs = tabs.slice(0, 4);
  return `
    <section class="workspace-card">
      <div class="workspace-card-head">
        <div class="list-item-title" style="margin:0">Workspace ativo</div>
        <div class="list-item-meta">${tabs.length} abas conectadas</div>
      </div>
      ${activeTab ? `<div class="list-item-meta">Aba principal: ${escHtml(activeTab.title || activeTab.url || activeTab.id)}</div>` : ""}
      <div class="workspace-chip-row">
        ${visibleTabs.map((tab) => `<span class="workspace-chip ${String(tab.id) === String(activeTab?.id || "") ? "active" : ""}">${escHtml(tab.title || tab.origin || tab.url || tab.id)}</span>`).join("")}
        ${tabs.length > visibleTabs.length ? `<span class="workspace-chip">+${tabs.length - visibleTabs.length}</span>` : ""}
      </div>
    </section>
  `;
}

function describeTargetTab(step) {
  const tabId = String(step?.action?.tabId || "").trim();
  if (!tabId) return "";
  const workspaceTabs = Array.isArray(state.workspaceTabs) ? state.workspaceTabs : [];
  const tab = workspaceTabs.find((item) => String(item.id) === tabId);
  if (!tab) return `Aba alvo ${tabId}`;
  const label = tab.title || tab.origin || tab.url || tabId;
  return `Aba alvo ${label}`;
}

function describeStepReason(step) {
  const category = String(step?.errorCategory || step?.statusReason || "").trim();
  if (!category) return "";
  if (category === "user_denied") return "negado pelo usuario";
  if (category === "browser_error") return "erro do navegador";
  if (category === "browser_target_missing") return "alvo nao encontrado";
  if (category === "provider_error") return "erro do provider";
  if (category === "tool_missing") return "ferramenta ausente";
  if (category === "timeout") return "timeout";
  if (category === "completed") return "concluido";
  if (category === "approved") return "aprovado";
  return category.replaceAll("_", " ");
}

function renderAssetLine(item) {
  const label = item.kind === "screenshot" ? "captura" : "arquivo";
  const name = item.fileName || item.id;
  const extra = item.tabTitle || item.mimeType || "";
  return `- [${label}] ${name}${extra ? ` | ${extra}` : ""}${item.createdAt ? ` | ${formatDate(item.createdAt)}` : ""}`;
}

function renderAssetCard(item) {
  const label = item.kind === "screenshot" ? "Captura" : "Arquivo";
  const extra = item.tabTitle || item.mimeType || item.tabUrl || "";
  const previewUrl = isPreviewable(item)
    ? `${BRIDGE_URL}/sessions/${encodeURIComponent(item.sessionId || "")}/assets/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.id)}/file`
    : "";
  return `
    <article class="list-card asset-card" style="margin-bottom:0">
      <input class="asset-select" type="checkbox" data-select-asset="${escHtml(item.id)}" />
      ${previewUrl ? `<img class="asset-preview" src="${escHtml(previewUrl)}" alt="${escHtml(item.fileName || item.id)}" />` : ""}
      <div class="list-item-title">${escHtml(item.fileName || item.id)}</div>
      <div class="list-item-meta">${escHtml(label)}${extra ? ` | ${escHtml(extra)}` : ""}</div>
      <div class="list-item-meta">${item.createdAt ? escHtml(formatDate(item.createdAt)) : ""}</div>
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-open-asset="${escHtml(item.filePath || "")}">Abrir</button>
        <button class="btn-list-action" data-open-folder="${escHtml(item.directoryPath || "")}">Pasta</button>
        <button class="btn-list-action danger" data-delete-asset-kind="${escHtml(item.kind)}" data-delete-asset-id="${escHtml(item.id)}">Excluir</button>
      </div>
    </article>
  `;
}

function bindAssetActions(host, sessionId, switchTab, addSystemMessage, addMessage, enqueueOutgoingMessage, updateActiveAssetGroup) {
  syncAssetSelection(host, sessionId);

  host.querySelectorAll("[data-select-asset]").forEach((input) => input.addEventListener("change", () => {
    const assetId = input.dataset.selectAsset;
    const bucket = new Set(state.sessionAssetSelection[sessionId] || []);
    if (input.checked) bucket.add(assetId);
    else bucket.delete(assetId);
    state.sessionAssetSelection[sessionId] = Array.from(bucket);
    syncAssetSelection(host, sessionId);
  }));

  host.querySelectorAll("[data-create-asset-group]").forEach((btn) => btn.addEventListener("click", async () => {
    const selectedIds = state.sessionAssetSelection[sessionId] || [];
    if (selectedIds.length < 2) return;
    const title = window.prompt("Nome do grupo visual:", `Grupo ${selectedIds.length} arquivos`);
    if (title === null) return;
    const data = await fetchJson(`/sessions/${sessionId}/assets`);
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const refs = assets.filter((item) => selectedIds.includes(item.id)).map((item) => ({ id: item.id, kind: item.kind }));
    await fetchJson(`/sessions/${sessionId}/asset-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, assetRefs: refs }),
    });
    state.sessionAssetSelection[sessionId] = [];
    const refreshed = await fetchJson(`/sessions/${sessionId}/assets`);
    const nextAssets = Array.isArray(refreshed.assets) ? refreshed.assets : [];
    const nextGroups = Array.isArray(refreshed.groups) ? refreshed.groups : [];
    host.innerHTML = nextAssets.length
      ? renderAssetsPanel(sessionId, nextAssets, nextGroups)
      : `<div class="list-item-meta" style="margin-top:8px">Nenhum anexo ou captura nesta sessao.</div>`;
    if (nextAssets.length) bindAssetActions(host, sessionId, switchTab, addSystemMessage, addMessage, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  host.querySelectorAll("[data-delete-asset-group]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/sessions/${sessionId}/asset-groups/${btn.dataset.deleteAssetGroup}`, { method: "DELETE" });
    const refreshed = await fetchJson(`/sessions/${sessionId}/assets`);
    const nextAssets = Array.isArray(refreshed.assets) ? refreshed.assets : [];
    const nextGroups = Array.isArray(refreshed.groups) ? refreshed.groups : [];
    host.innerHTML = nextAssets.length
      ? renderAssetsPanel(sessionId, nextAssets, nextGroups)
      : `<div class="list-item-meta" style="margin-top:8px">Nenhum anexo ou captura nesta sessao.</div>`;
    if (nextAssets.length) bindAssetActions(host, sessionId, switchTab, addSystemMessage, addMessage, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  host.querySelectorAll("[data-use-asset-group]").forEach((btn) => btn.addEventListener("click", async () => {
    const data = await fetchJson(`/sessions/${sessionId}/assets`);
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const group = groups.find((item) => item.id === btn.dataset.useAssetGroup);
    if (!group) return;
    const members = Array.isArray(group.assets) ? group.assets : [];
    const summary = members.map((item, index) => `${index + 1}. ${item.fileName || item.id}${item.mimeType ? ` (${item.mimeType})` : ""}`).join("\n");
    state.activeAssetGroup = { ...group, sessionId, assets: members };
    updateActiveAssetGroup?.(elFromHost(host), state.activeAssetGroup);
    syncSession().catch(() => {});
    switchTab(elFromHost(host), "chat");
    enqueueOutgoingMessage(
      elFromHost(host),
      {
        text: `[Pacote visual ativo: ${group.title || group.id}]\nSessao: ${sessionId}\nQuantidade de arquivos: ${members.length}\n\nArquivos do grupo:\n${summary}\n\nConsidere este grupo como um conjunto unico de documentos. Resuma o conteudo esperado, diga como devemos analisar esse pacote e quais proximos passos voce recomenda.`,
        visibleText: `Use o grupo de arquivos "${group.title || group.id}" como contexto unico.`,
        skipAssetGroup: true,
      },
      addMessage,
      addSystemMessage,
      async () => {},
    );
  }));

  host.querySelectorAll("[data-open-asset]").forEach((btn) => btn.addEventListener("click", async () => {
    const filePath = btn.dataset.openAsset;
    if (!filePath) return;
    await fetchJson("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "open_local_file", payload: { path: filePath } }),
    });
  }));

  host.querySelectorAll("[data-open-folder]").forEach((btn) => btn.addEventListener("click", async () => {
    const directoryPath = btn.dataset.openFolder;
    if (!directoryPath) return;
    await fetchJson("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "open_local_file", payload: { path: directoryPath } }),
    });
  }));

  host.querySelectorAll("[data-delete-asset-id]").forEach((btn) => btn.addEventListener("click", async () => {
    const assetId = btn.dataset.deleteAssetId;
    const kind = btn.dataset.deleteAssetKind;
    if (!assetId || !kind) return;
    await fetchJson(`/sessions/${sessionId}/assets/${kind}/${assetId}`, { method: "DELETE" });
    const data = await fetchJson(`/sessions/${sessionId}/assets`);
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];
    state.sessionAssetSelection[sessionId] = (state.sessionAssetSelection[sessionId] || []).filter((item) => item !== assetId);
    host.innerHTML = assets.length
      ? renderAssetsPanel(sessionId, assets, groups)
      : `<div class="list-item-meta" style="margin-top:8px">Nenhum anexo ou captura nesta sessao.</div>`;
    if (assets.length) bindAssetActions(host, sessionId, switchTab, addSystemMessage, addMessage, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));
}

function renderAssetsPanel(sessionId, assets, groups = []) {
  return `
    <div class="asset-toolbar">
      <div class="asset-selection-count">Selecionados: ${(state.sessionAssetSelection[sessionId] || []).length}</div>
      <div class="list-item-actions">
        <button class="btn-list-action" data-create-asset-group="${escHtml(sessionId)}">Agrupar selecionados</button>
        <button class="btn-list-action" data-clear-asset-selection="${escHtml(sessionId)}">Limpar selecao</button>
      </div>
    </div>
    ${groups.length ? `<div class="asset-groups">${groups.map(renderAssetGroupCard).join("")}</div>` : ""}
    <div class="list-grid">${assets.map((item) => renderAssetCard({ ...item, sessionId })).join("")}</div>
  `;
}

function syncAssetSelection(host, sessionId) {
  const selected = new Set(state.sessionAssetSelection[sessionId] || []);
  host.querySelectorAll("[data-select-asset]").forEach((input) => {
    input.checked = selected.has(input.dataset.selectAsset);
  });
  const counter = host.querySelector(".asset-selection-count");
  if (counter) counter.textContent = `Selecionados: ${selected.size}`;
  host.querySelectorAll("[data-clear-asset-selection]").forEach((btn) => btn.onclick = () => {
    state.sessionAssetSelection[sessionId] = [];
    syncAssetSelection(host, sessionId);
  });
}

function isPreviewable(item) {
  if (item.kind === "screenshot") return true;
  return /^image\//i.test(String(item.mimeType || ""));
}

function renderAssetGroupCard(group) {
  const count = Array.isArray(group.assetRefs) ? group.assetRefs.length : 0;
  const names = Array.isArray(group.assets) ? group.assets.map((item) => item.fileName || item.id).slice(0, 3).join(" | ") : "";
  return `
    <article class="asset-group-card">
      <div class="list-item-title">${escHtml(group.title || group.id)}</div>
      <div class="list-item-meta">Grupo visual | ${count} itens | ${group.createdAt ? escHtml(formatDate(group.createdAt)) : ""}</div>
      ${names ? `<div class="list-item-meta">${escHtml(names)}${count > 3 ? "..." : ""}</div>` : ""}
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn-list-action" data-use-asset-group="${escHtml(group.id)}">Usar no chat</button>
        <button class="btn-list-action danger" data-delete-asset-group="${escHtml(group.id)}">Desfazer grupo</button>
      </div>
    </article>
  `;
}

function elFromHost(host) {
  return {
    paneChat: document.getElementById("pane-chat"),
    tabChat: document.getElementById("tab-chat"),
    tabSessions: document.getElementById("tab-sessions"),
    tabTasks: document.getElementById("tab-tasks"),
    tabAutomations: document.getElementById("tab-automations"),
    paneSessions: document.getElementById("pane-sessions"),
    paneTasks: document.getElementById("pane-tasks"),
    paneAutomations: document.getElementById("pane-automations"),
    chatArea: document.getElementById("chat-area"),
    msgInput: document.getElementById("msg-input"),
    btnSend: document.getElementById("btn-send"),
  };
}

function formatStepOutput(output) {
  if (typeof output === "string") return escHtml(output.slice(0, 120));
  if (!output || typeof output !== "object") return escHtml(String(output || ""));
  const summary = [
    output.action,
    output.selector,
    output.url,
    output.dispatched ? "despachado" : "",
  ].filter(Boolean).join(" | ");
  return escHtml(summary || JSON.stringify(output).slice(0, 120));
}
