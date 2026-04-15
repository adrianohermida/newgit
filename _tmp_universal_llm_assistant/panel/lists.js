import { BRIDGE_URL, state } from "./state.js";
import { escHtml, formatDate } from "./utils.js";
import { fetchJson } from "./bridge.js";
import { updateProjectStrip, updateSkillStrip, updateWorkspaceStrip } from "./dom.js";

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
        activeSkillNames: Array.isArray(state.sessionSkillNames) ? state.sessionSkillNames : [],
        project: state.sessionProject && state.sessionProject.name ? state.sessionProject : null,
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
    const filteredSessions = filterSessions(sessions, state.sessionFilters);
    const groups = groupSessionsByProject(filteredSessions);
    el.paneSessions.innerHTML = `
      <div class="view-toolbar">
        <div class="view-title-wrap">
          <div class="view-title">Sessoes</div>
          <div class="view-subtitle">Historico salvo do chat, tasks, skills e workspace multi-abas por sessao.</div>
        </div>
      </div>
      ${renderSessionFilters(sessions)}
      ${groups.length ? groups.map(renderSessionGroup).join("") : `<div class="empty-state"><div class="empty-sub">Nenhuma sessao encontrada com os filtros atuais.</div></div>`}
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
      el.paneTasks.innerHTML = `
        <div class="view-toolbar">
          <div class="view-title-wrap">
            <div class="view-title">Tasks</div>
            <div class="view-subtitle">Execucao viva do agente com passos, aprovacoes e resultado auditavel.</div>
          </div>
          <div class="view-actions">
            <button class="btn-list-action" type="button" data-open-task-lab>Abrir Task Lab</button>
          </div>
        </div>
        <div class="empty-state"><div class="empty-sub">Nenhuma AI-Task nesta sessao.</div></div>
      `;
      bindTaskApproval(el);
      return;
    }
    el.paneTasks.innerHTML = `
      <div class="view-toolbar">
        <div class="view-title-wrap">
          <div class="view-title">Tasks</div>
          <div class="view-subtitle">Execucao viva do agente com passos, aprovacoes e resultado auditavel.</div>
        </div>
        <div class="view-actions">
          <button class="btn-list-action" type="button" data-open-task-lab>Abrir Task Lab</button>
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
    state.sessionSkillNames = Array.isArray(sessionData.session.metadata?.activeSkillNames) ? sessionData.session.metadata.activeSkillNames : [];
    state.sessionProject = normalizeProject(sessionData.session.metadata?.project);
    state.workspaceTabs = Array.isArray(sessionData.session.metadata?.browserTabs) ? sessionData.session.metadata.browserTabs : [];
    state.activeWorkspaceTabId = String(sessionData.session.metadata?.activeTabId || "");
    el.chatArea.innerHTML = "";
    state.messages.forEach((msg) => addMessage(el, msg.role, msg.content));
    updateProviderBadge(el);
    updateSkillStrip(el, state.sessionSkillNames);
    updateProjectStrip(el, state.sessionProject);
    updateActiveAssetGroup?.(el, state.activeAssetGroup);
    updateWorkspaceStrip(el, state.workspaceTabs, state.activeWorkspaceTabId);
    switchTab(el, "chat");
    addSystemMessage(el, `Sessao "${sessionData.session.metadata?.tabTitle || sessionData.session.id}" retomada.`);
  }));

  el.paneSessions.querySelectorAll("[data-session-skills]").forEach((btn) => btn.addEventListener("click", async () => {
    const currentNames = String(btn.dataset.sessionSkills || "").trim();
    const nextValue = window.prompt("Skills ativas nesta sessao (separe por virgula):", currentNames);
    if (nextValue === null) return;
    const activeSkillNames = nextValue.split(",").map((item) => item.trim()).filter(Boolean);
    await fetchJson(`/sessions/${btn.dataset.sessionSkillsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSkillNames }),
    });
    if (String(btn.dataset.sessionSkillsId) === String(state.sessionId)) {
      state.sessionSkillNames = activeSkillNames;
      updateSkillStrip(el, state.sessionSkillNames);
      syncSession().catch(() => {});
    }
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  el.paneSessions.querySelectorAll("[data-session-project-id]").forEach((btn) => btn.addEventListener("click", async () => {
    const currentName = String(btn.dataset.sessionProjectName || "").trim();
    const currentCode = String(btn.dataset.sessionProjectCode || "").trim();
    const nextName = window.prompt("Projeto da sessao:", currentName);
    if (nextName === null) return;
    const cleanName = String(nextName || "").trim();
    const nextCode = cleanName ? window.prompt("Codigo curto do projeto (opcional):", currentCode) : "";
    if (nextCode === null) return;
    const project = cleanName ? normalizeProject({ name: cleanName, code: nextCode || "" }) : null;
    await fetchJson(`/sessions/${btn.dataset.sessionProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    });
    if (String(btn.dataset.sessionProjectId) === String(state.sessionId)) {
      state.sessionProject = project;
      updateProjectStrip(el, state.sessionProject);
      syncSession().catch(() => {});
    }
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  el.paneSessions.querySelectorAll("[data-delete-session]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/sessions/${btn.dataset.deleteSession}`, { method: "DELETE" });
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  }));

  el.paneSessions.querySelector("[data-session-search]")?.addEventListener("input", async (event) => {
    state.sessionFilters.search = String(event.target.value || "");
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  });

  el.paneSessions.querySelector("[data-session-provider-filter]")?.addEventListener("change", async (event) => {
    state.sessionFilters.provider = String(event.target.value || "all");
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  });

  el.paneSessions.querySelector("[data-session-project-filter]")?.addEventListener("change", async (event) => {
    state.sessionFilters.project = String(event.target.value || "all");
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  });

  el.paneSessions.querySelector("[data-clear-session-filters]")?.addEventListener("click", async () => {
    state.sessionFilters = { search: "", provider: "all", project: "all" };
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  });

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
    startAutomationReplayPolling(btn.dataset.replay, String(tab?.id || "default"), null);
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    startAutomationReplayPolling(btn.dataset.inspectAuto, String(tab?.id || "default"), host);
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
  const project = normalizeProject(session.metadata?.project);
  const tabs = Array.isArray(session.metadata?.browserTabs) ? session.metadata.browserTabs : [];
  const activeTab = tabs.find((tab) => String(tab.id) === String(session.metadata?.activeTabId || "")) || tabs.find((tab) => tab.active) || null;
  const origins = tabs.map((tab) => tab.origin).filter(Boolean);
  const uniqueOrigins = origins.filter((origin, index) => origins.indexOf(origin) === index);
  const metaPills = [
    project?.name ? project.name : null,
    `${session.messageCount} msg`,
    session.taskCount ? `${session.taskCount} tasks` : null,
    Array.isArray(session.metadata?.activeSkillNames) && session.metadata.activeSkillNames.length ? `${session.metadata.activeSkillNames.length} skills` : null,
    tabs.length ? `${tabs.length} abas` : null,
    session.provider || "local",
  ].filter(Boolean);
  return `
    <article class="list-card section-card">
      <div class="card-title-row">
        <div class="list-item-title">${escHtml(title)}</div>
        <span class="card-kicker">Sessao</span>
      </div>
      <div class="meta-pill-row">${metaPills.map((item) => `<span class="meta-pill">${escHtml(item)}</span>`).join("")}</div>
      <div class="card-meta-stack">
        ${url ? `<div class="list-item-meta">${escHtml(url)}</div>` : ""}
        ${activeTab ? `<div class="list-item-meta">Aba ativa salva: ${escHtml(activeTab.title || activeTab.url || activeTab.id)}</div>` : ""}
        ${uniqueOrigins.length ? `<div class="list-item-meta">Workspace: ${escHtml(uniqueOrigins.slice(0, 3).join(" | "))}${uniqueOrigins.length > 3 ? ` | +${uniqueOrigins.length - 3}` : ""}</div>` : ""}
        <div class="list-item-meta">Atualizada em ${formatDate(session.updatedAt)}</div>
      </div>
      <div class="list-item-actions section-actions" style="margin-top:8px">
        <button class="btn-list-action" data-load="${escHtml(session.id)}">Retomar</button>
        <button class="btn-list-action" data-session-project-id="${escHtml(session.id)}" data-session-project-name="${escHtml(project?.name || "")}" data-session-project-code="${escHtml(project?.code || "")}">Projeto</button>
        <button class="btn-list-action" data-session-skills="${escHtml(Array.isArray(session.metadata?.activeSkillNames) ? session.metadata.activeSkillNames.join(", ") : "")}" data-session-skills-id="${escHtml(session.id)}">Skills</button>
        <button class="btn-list-action" data-assets-session="${escHtml(session.id)}">Arquivos</button>
        <button class="btn-list-action" data-export-session="${escHtml(session.id)}">Exportar MD</button>
        <button class="btn-list-action" data-rename-session="${escHtml(session.id)}" data-current-title="${escHtml(title)}">Renomear</button>
        <button class="btn-list-action danger" data-delete-session="${escHtml(session.id)}">Apagar</button>
      </div>
      <div data-assets-host="${escHtml(session.id)}"></div>
    </article>
  `;
}

function renderSessionGroup(group) {
  return `
    <section class="session-group">
      <div class="session-group-head">
        <div class="session-group-title">${escHtml(group.label)}</div>
        <div class="session-group-meta">${group.sessions.length} sessoes</div>
      </div>
      <div class="list-grid">${group.sessions.map(renderSessionCard).join("")}</div>
    </section>
  `;
}

function groupSessionsByProject(sessions = []) {
  const buckets = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const project = normalizeProject(session?.metadata?.project);
    const key = project?.name ? `project:${project.name}` : "project:__none__";
    const current = buckets.get(key) || {
      label: project?.name || "Sem projeto",
      order: project?.name ? 0 : 1,
      sessions: [],
    };
    current.sessions.push(session);
    buckets.set(key, current);
  }
  return Array.from(buckets.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
}

function normalizeProject(project) {
  const name = String(project?.name || "").trim();
  if (!name) return null;
  const code = String(project?.code || "").trim().toUpperCase().slice(0, 12);
  const color = String(project?.color || "").trim();
  return { name, code, color };
}

function filterSessions(sessions = [], filters = {}) {
  const search = String(filters?.search || "").trim().toLowerCase();
  const provider = String(filters?.provider || "all");
  const project = String(filters?.project || "all");
  return (Array.isArray(sessions) ? sessions : []).filter((session) => {
    const sessionProject = normalizeProject(session?.metadata?.project);
    const title = String(session?.metadata?.tabTitle || session?.id || "").toLowerCase();
    const url = String(session?.metadata?.tabUrl || "").toLowerCase();
    const providerOk = provider === "all" || String(session?.provider || "") === provider;
    const projectOk = project === "all" || (project === "__none__" ? !sessionProject?.name : sessionProject?.name === project);
    const searchOk = !search || [title, url, String(sessionProject?.name || "").toLowerCase()].some((item) => item.includes(search));
    return providerOk && projectOk && searchOk;
  });
}

function renderSessionFilters(sessions = []) {
  const providerOptions = ["all", ...Array.from(new Set((Array.isArray(sessions) ? sessions : []).map((item) => String(item?.provider || "").trim()).filter(Boolean)))];
  const projectOptions = Array.from(new Set((Array.isArray(sessions) ? sessions : []).map((item) => normalizeProject(item?.metadata?.project)?.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return `
    <section class="session-filter-bar">
      <input class="session-filter-input" data-session-search type="search" placeholder="Buscar sessao, URL ou projeto" value="${escHtml(state.sessionFilters.search || "")}" />
      <select class="session-filter-select" data-session-provider-filter>
        ${providerOptions.map((item) => `<option value="${escHtml(item)}" ${state.sessionFilters.provider === item ? "selected" : ""}>${escHtml(item === "all" ? "Todos providers" : item)}</option>`).join("")}
      </select>
      <select class="session-filter-select" data-session-project-filter>
        <option value="all" ${state.sessionFilters.project === "all" ? "selected" : ""}>Todos projetos</option>
        <option value="__none__" ${state.sessionFilters.project === "__none__" ? "selected" : ""}>Sem projeto</option>
        ${projectOptions.map((item) => `<option value="${escHtml(item)}" ${state.sessionFilters.project === item ? "selected" : ""}>${escHtml(item)}</option>`).join("")}
      </select>
      <button class="btn-list-action" type="button" data-clear-session-filters>Limpar</button>
    </section>
  `;
}

function renderAutomationCard(item) {
  const preview = Array.isArray(item.previewSteps) ? item.previewSteps.join(" | ") : "";
  return `
    <article class="list-card section-card">
      <div class="card-title-row">
        <div class="list-item-title">${escHtml(item.title || item.id)}</div>
        <span class="card-kicker">Automacao</span>
      </div>
      <div class="meta-pill-row">
        <span class="meta-pill">${item.stepCount || 0} passos</span>
      </div>
      <div class="card-meta-stack">
        ${item.startUrl ? `<div class="list-item-meta">${escHtml(item.startUrl)}</div>` : ""}
        ${preview ? `<div class="list-item-meta">Fluxo: ${escHtml(preview)}</div>` : ""}
        <div class="list-item-meta">Atualizada em ${formatDate(item.updatedAt || item.createdAt)}</div>
      </div>
      <div class="list-item-actions section-actions" style="margin-top:8px">
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
  const auditPills = summarizeTaskAudit(task);
  return `
    <article class="list-card section-card">
      <div class="card-title-row" style="margin-bottom:4px">
        <div class="list-item-title" style="margin:0">${escHtml(task.title || task.goal || task.id)}</div>
        <span class="task-status ${escHtml(status)}">${escHtml(status)}</span>
      </div>
      ${task.goal && task.title && task.goal !== task.title ? `<div class="list-item-meta">${escHtml(task.goal)}</div>` : ""}
      <div class="meta-pill-row">
        <span class="meta-pill">${pct}% concluido</span>
        <span class="meta-pill">${completedSteps}/${(task.steps || []).length} passos</span>
      </div>
      ${auditPills.length ? `<div class="meta-pill-row">${auditPills.map((item) => `<span class="meta-pill subtle">${escHtml(item)}</span>`).join("")}</div>` : ""}
      <div class="task-progress"><span class="task-progress-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
      ${currentStep ? `<div class="list-item-meta card-highlight">Step atual: ${escHtml(currentStep.description || currentStep.action?.type || currentStep.id)}</div>` : ""}
      ${orchestrationMeta.length ? `<div class="meta-pill-row">${orchestrationMeta.map((item) => `<span class="meta-pill subtle">${escHtml(item)}</span>`).join("")}</div>` : ""}
      ${renderTaskTimeline(task)}
      ${pendingStep ? renderApprovalBox(task, pendingStep) : ""}
      ${(task.steps || []).length ? renderStepDetails(task, logs) : ""}
    </article>
  `;
}

function renderTaskTimeline(task) {
  const steps = Array.isArray(task?.steps) ? task.steps : [];
  if (!steps.length) return "";
  return `
    <div class="task-timeline">
      ${steps.map((step, index) => `
        <div class="task-timeline-item ${escHtml(step.status || "pending")}">
          <span class="task-timeline-dot"></span>
          <span class="task-timeline-label">${escHtml(`${index + 1}. ${step.description || step.action?.type || step.id}`)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderApprovalBox(task, step) {
  const actionDesc = step.approval?.actionLabel || [step.action?.type, step.action?.selector || step.action?.url].filter(Boolean).join(": ");
  const target = step.approval?.target || step.action?.targetText || step.action?.label || step.action?.selector || step.action?.url || step.action?.command || "";
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
      step.approval?.target ? `alvo ${step.approval.target}` : "",
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
  el.paneTasks.querySelectorAll("[data-open-task-lab]").forEach((btn) => btn.addEventListener("click", () => {
    window.open(`${BRIDGE_URL}/demo/task-lab`, "_blank");
  }));
  el.paneTasks.querySelectorAll("[data-approve-task]").forEach((btn) => btn.addEventListener("click", async () => {
    await updateTaskApproval(btn.dataset.approveTask, true);
    await renderTasks(el);
  }));
  el.paneTasks.querySelectorAll("[data-deny-task]").forEach((btn) => btn.addEventListener("click", async () => {
    await updateTaskApproval(btn.dataset.denyTask, false);
    await renderTasks(el);
  }));
}

function summarizeTaskAudit(task) {
  const steps = Array.isArray(task?.steps) ? task.steps : [];
  const awaiting = steps.filter((step) => step.status === "awaiting_approval").length;
  const running = steps.filter((step) => step.status === "running").length;
  const failed = steps.filter((step) => step.status === "error").length;
  const browserActions = steps.filter((step) => ["click", "input", "navigate", "extract", "change", "submit", "key"].includes(String(step?.action?.type || ""))).length;
  return [
    browserActions ? `${browserActions} acoes de navegador` : "",
    running ? `${running} em execucao` : "",
    awaiting ? `${awaiting} aguardando aprovacao` : "",
    failed ? `${failed} falhas` : "",
  ].filter(Boolean);
}

async function updateTaskApproval(taskId, approved) {
  const preferredTabId = String(state.activeWorkspaceTabId || "");
  let tab = null;
  if (preferredTabId) {
    try {
      tab = await chrome.tabs.get(Number(preferredTabId));
    } catch {
      tab = null;
    }
  }
  if (!tab) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (approved && tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
  const response = await fetchJson(`/sessions/${state.sessionId}/tasks/${taskId}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved, tabId: tab?.id ? String(tab.id) : "" }),
  });
  await startReplayForTaskDispatches([response.dispatch, ...(Array.isArray(response.additionalDispatches) ? response.additionalDispatches : [])]);
}

async function startReplayForTaskDispatches(dispatches = []) {
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
      <div class="automation-replay-status" data-replay-status="${escHtml(automation.id)}"></div>
      <ul class="task-step-list">
        ${steps.map((step) => `
          <li class="task-step-card automation-step-card" data-automation-step-index="${step.index}">
            <div class="task-step-head">
              <span class="task-step-status step-pending">#${step.index + 1}</span>
              <span class="task-step-title">${escHtml(step.label || step.type || "passo")}</span>
            </div>
            ${step.pageTitle || step.pageUrl ? `<div class="task-step-meta">${escHtml(step.pageTitle || step.pageUrl)}</div>` : ""}
            <div class="automation-step-meta-grid">
              ${step.targetLabel ? `<span class="meta-pill subtle">alvo ${escHtml(step.targetLabel)}</span>` : ""}
              ${step.fieldName ? `<span class="meta-pill subtle">campo ${escHtml(step.fieldName)}</span>` : ""}
              ${step.placeholder ? `<span class="meta-pill subtle">placeholder ${escHtml(step.placeholder)}</span>` : ""}
              ${step.inputType ? `<span class="meta-pill subtle">tipo ${escHtml(step.inputType)}</span>` : ""}
              ${step.selector ? `<span class="meta-pill subtle">selector ${escHtml(step.selector)}</span>` : ""}
            </div>
            ${step.value ? `<div class="task-step-output">valor ${escHtml(String(step.value).slice(0, 180))}</div>` : ""}
            ${step.elementText ? `<div class="task-step-meta">texto ${escHtml(step.elementText)}</div>` : ""}
            ${step.domPath ? `<div class="task-step-meta">dom ${escHtml(step.domPath)}</div>` : ""}
            <div class="list-item-actions" style="margin-top:8px">
              <button class="btn-list-action" data-replay-step-auto="${escHtml(automation.id)}" data-replay-step-index="${step.index}">Executar 1 passo</button>
              <button class="btn-list-action" data-replay-from-auto="${escHtml(automation.id)}" data-replay-from-step="${step.index}">Replay daqui</button>
              <button class="btn-list-action" data-edit-auto-step="${escHtml(automation.id)}" data-step-index="${step.index}" data-step-label="${escHtml(step.label || "")}" data-step-selector="${escHtml(step.selector || "")}" data-step-url="${escHtml(step.pageUrl || "")}" data-step-value="${escHtml(step.value || "")}" data-step-target-label="${escHtml(step.targetLabel || "")}" data-step-placeholder="${escHtml(step.placeholder || "")}" data-step-field-name="${escHtml(step.fieldName || "")}">Editar</button>
              <button class="btn-list-action" data-move-auto-step="${escHtml(automation.id)}" data-move-direction="up" data-step-index="${step.index}">Subir</button>
              <button class="btn-list-action" data-move-auto-step="${escHtml(automation.id)}" data-move-direction="down" data-step-index="${step.index}">Descer</button>
              <button class="btn-list-action danger" data-delete-auto-step="${escHtml(automation.id)}" data-step-index="${step.index}">Excluir passo</button>
            </div>
          </li>
        `).join("")}
      </ul>
    </details>
  `;
}

function bindAutomationDetailActions(el, host, addSystemMessage, switchTab) {
  host.querySelectorAll("[data-replay-step-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await fetchJson(`/play/${btn.dataset.replayStepAuto}/step/${btn.dataset.replayStepIndex}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: String(tab?.id || "default") }),
    });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    startAutomationReplayPolling(btn.dataset.replayStepAuto, String(tab?.id || "default"), host);
    addSystemMessage(el, `Executando somente o passo ${Number(btn.dataset.replayStepIndex) + 1}.`);
  }));

  host.querySelectorAll("[data-replay-from-auto]").forEach((btn) => btn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await fetchJson(`/play/${btn.dataset.replayFromAuto}/from/${btn.dataset.replayFromStep}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: String(tab?.id || "default") }),
    });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    startAutomationReplayPolling(btn.dataset.replayFromAuto, String(tab?.id || "default"), host);
    addSystemMessage(el, `Replay iniciado a partir do passo ${Number(btn.dataset.replayFromStep) + 1}.`);
  }));

  host.querySelectorAll("[data-move-auto-step]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/automations/${btn.dataset.moveAutoStep}/steps/${btn.dataset.stepIndex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: btn.dataset.moveDirection }),
    });
    const data = await fetchJson(`/automations/${btn.dataset.moveAutoStep}`);
    host.innerHTML = renderAutomationDetails(data.automation || {});
    bindAutomationDetailActions(el, host, addSystemMessage, switchTab);
  }));

  host.querySelectorAll("[data-edit-auto-step]").forEach((btn) => btn.addEventListener("click", async () => {
    const label = window.prompt("Rotulo visual do passo:", btn.dataset.stepLabel || "");
    if (label === null) return;
    const selector = window.prompt("Selector CSS do passo:", btn.dataset.stepSelector || "");
    if (selector === null) return;
    const targetLabel = window.prompt("Alvo humano/rotulo do elemento:", btn.dataset.stepTargetLabel || "");
    if (targetLabel === null) return;
    const fieldName = window.prompt("Nome tecnico do campo:", btn.dataset.stepFieldName || "");
    if (fieldName === null) return;
    const placeholder = window.prompt("Placeholder do campo:", btn.dataset.stepPlaceholder || "");
    if (placeholder === null) return;
    const url = window.prompt("URL do passo (se aplicavel):", btn.dataset.stepUrl || "");
    if (url === null) return;
    const value = window.prompt("Valor/digitacao do passo (se aplicavel):", btn.dataset.stepValue || "");
    if (value === null) return;
    await fetchJson(`/automations/${btn.dataset.editAutoStep}/steps/${btn.dataset.stepIndex}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, selector, url, value, targetLabel, fieldName, placeholder }),
    });
    const data = await fetchJson(`/automations/${btn.dataset.editAutoStep}`);
    host.innerHTML = renderAutomationDetails(data.automation || {});
    bindAutomationDetailActions(el, host, addSystemMessage, switchTab);
  }));

  host.querySelectorAll("[data-delete-auto-step]").forEach((btn) => btn.addEventListener("click", async () => {
    await fetchJson(`/automations/${btn.dataset.deleteAutoStep}/steps/${btn.dataset.stepIndex}`, {
      method: "DELETE",
    });
    const data = await fetchJson(`/automations/${btn.dataset.deleteAutoStep}`);
    host.innerHTML = renderAutomationDetails(data.automation || {});
    bindAutomationDetailActions(el, host, addSystemMessage, switchTab);
  }));
}

function startAutomationReplayPolling(automationId, tabId, host) {
  if (!automationId) return;
  stopAutomationReplayPolling(automationId);
  const tick = async () => {
    try {
      const data = await fetchJson(`/automations/${automationId}/replay-status?tabId=${encodeURIComponent(tabId || "default")}`);
      updateAutomationReplayStatus(host, automationId, data.replay || {});
      if (["completed", "error", "idle"].includes(String(data.replay?.status || ""))) {
        stopAutomationReplayPolling(automationId);
      }
    } catch {}
  };
  tick();
  state.automationReplayTimers[automationId] = window.setInterval(tick, 1200);
}

function stopAutomationReplayPolling(automationId) {
  const timer = state.automationReplayTimers?.[automationId];
  if (timer) window.clearInterval(timer);
  if (state.automationReplayTimers) delete state.automationReplayTimers[automationId];
}

function updateAutomationReplayStatus(host, automationId, replay) {
  const scope = host || document;
  const node = scope.querySelector?.(`[data-replay-status="${automationId}"]`);
  if (!node) return;
  const status = String(replay?.status || "idle");
  const currentIndex = Number.isFinite(Number(replay?.currentIndex)) ? Number(replay.currentIndex) : -1;
  const completedSteps = Array.isArray(replay?.completedSteps) ? replay.completedSteps.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
  const completed = completedSteps.length;
  const total = Number.isFinite(Number(replay?.totalSteps)) ? Number(replay.totalSteps) : 0;
  const label = String(replay?.lastStepLabel || "").trim();
  const error = String(replay?.lastError || "").trim();
  const summary = [
    status === "running" ? `Executando passo ${currentIndex + 1}` : "",
    total ? `${completed}/${total} concluidos` : "",
    label || "",
  ].filter(Boolean).join(" | ");
  node.className = `automation-replay-status ${escHtml(status)}`;
  node.innerHTML = `
    <div class="list-item-meta">${escHtml(summary || "Replay inativo.")}</div>
    ${error ? `<div class="task-step-error">${escHtml(error)}</div>` : ""}
  `;
  updateAutomationStepCards(scope, completedSteps, currentIndex, status);
}

function updateAutomationStepCards(scope, completedSteps, currentIndex, status) {
  const cards = scope.querySelectorAll?.("[data-automation-step-index]");
  if (!cards?.length) return;
  const completedSet = new Set(completedSteps);
  cards.forEach((card) => {
    const stepIndex = Number(card.dataset.automationStepIndex);
    card.classList.remove("automation-step-running", "automation-step-completed", "automation-step-error");
    if (completedSet.has(stepIndex)) {
      card.classList.add("automation-step-completed");
      return;
    }
    if (stepIndex === currentIndex && status === "running") {
      card.classList.add("automation-step-running");
      return;
    }
    if (stepIndex === currentIndex && status === "error") {
      card.classList.add("automation-step-error");
    }
  });
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
        <span class="card-kicker">${tabs.length} abas</span>
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
  if (output.page && typeof output.page === "object") {
    const page = output.page;
    const parts = [
      page.title || "",
      page.url || "",
      Array.isArray(page.headings) ? `${page.headings.length} titulos` : "",
      Array.isArray(page.buttons) ? `${page.buttons.length} acoes` : "",
      Array.isArray(page.fields) ? `${page.fields.length} campos` : "",
    ].filter(Boolean);
    return escHtml(parts.join(" | "));
  }
  if (output.filled) {
    return escHtml([
      output.label || output.fieldName || output.fieldPlaceholder || "campo preenchido",
      output.value ? `valor: ${String(output.value).slice(0, 60)}` : "",
      output.pageTitle || "",
    ].filter(Boolean).join(" | "));
  }
  if (output.clicked) {
    return escHtml([
      output.label || output.targetText || output.text || "clique executado",
      output.pageTitle || "",
    ].filter(Boolean).join(" | "));
  }
  if (output.submitted) {
    return escHtml(["formulario enviado", output.pageTitle || ""].filter(Boolean).join(" | "));
  }
  const summary = [
    output.action,
    output.targetText,
    output.label,
    output.selector,
    output.url,
    output.dispatched ? "despachado" : "",
  ].filter(Boolean).join(" | ");
  return escHtml(summary || JSON.stringify(output).slice(0, 120));
}
