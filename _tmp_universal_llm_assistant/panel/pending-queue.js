import { state } from "./state.js";
import { escHtml } from "./utils.js";

export function renderPendingQueue(el, handlers = {}) {
  if (!el.queueStrip || !el.queueList || !el.queueSummary) return;
  const active = state.activeRequest;
  const pending = Array.isArray(state.pendingMessages) ? state.pendingMessages : [];
  const total = pending.length + (active ? 1 : 0);
  if (!total) {
    el.queueStrip.classList.add("hidden");
    el.queueList.innerHTML = "";
    el.queueSummary.textContent = "";
    return;
  }

  el.queueStrip.classList.remove("hidden");
  el.queueSummary.textContent = active ? `${pending.length} aguardando` : `${pending.length} na fila`;
  el.queueList.innerHTML = [
    active ? renderQueueCard(active, "Executando", true) : "",
    ...pending.map((item, index) => renderQueueCard(item, index === 0 ? "Proxima" : `Fila ${index + 1}`, false)),
  ].join("");

  el.queueList.querySelectorAll("[data-queue-edit]").forEach((btn) => btn.addEventListener("click", () => {
    handlers.onEdit?.(btn.dataset.queueEdit);
  }));
  el.queueList.querySelectorAll("[data-queue-prioritize]").forEach((btn) => btn.addEventListener("click", () => {
    handlers.onPrioritize?.(btn.dataset.queuePrioritize);
  }));
  el.queueList.querySelectorAll("[data-queue-remove]").forEach((btn) => btn.addEventListener("click", () => {
    handlers.onRemove?.(btn.dataset.queueRemove);
  }));
}

function renderQueueCard(item, badge, active) {
  const preview = String(item?.visibleText || item?.text || "").trim();
  return `
    <article class="queue-card ${active ? "queue-card-active" : ""}">
      <div class="queue-card-head">
        <span class="queue-badge ${active ? "active" : ""}">${escHtml(badge)}</span>
        ${active ? "" : `
          <div class="queue-card-actions">
            <button class="queue-btn" type="button" data-queue-edit="${escHtml(item.id)}">Editar</button>
            <button class="queue-btn" type="button" data-queue-prioritize="${escHtml(item.id)}">Priorizar</button>
            <button class="queue-btn danger" type="button" data-queue-remove="${escHtml(item.id)}">Remover</button>
          </div>
        `}
      </div>
      <div class="queue-card-text">${escHtml(trimPreview(preview))}</div>
    </article>
  `;
}

function trimPreview(text) {
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}
