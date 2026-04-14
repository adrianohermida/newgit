import { escHtml } from "./utils.js";
import { state } from "./state.js";

const MAX_ERROR_LOGS = 40;

function normalizeValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function pushErrorLog(entry) {
  const next = {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    scope: entry.scope || "extension",
    title: entry.title || "Falha operacional",
    expected: entry.expected || "",
    actual: entry.actual || "",
    trace: entry.trace || "",
    recommendation: entry.recommendation || "",
    details: normalizeValue(entry.details),
  };
  state.errorLog = [next, ...(state.errorLog || [])].slice(0, MAX_ERROR_LOGS);
  renderErrorLog();
}

export function clearErrorLog() {
  state.errorLog = [];
  renderErrorLog();
}

export async function copyErrorLog(entryId = "") {
  const entries = state.errorLog || [];
  const payload = entryId ? entries.find((item) => item.id === entryId) : null;
  const text = payload ? formatErrorEntry(payload) : entries.map(formatErrorEntry).join("\n\n---\n\n");
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

export function renderErrorLog() {
  const pane = document.getElementById("pane-errors");
  if (!pane) return;
  const entries = state.errorLog || [];
  if (!entries.length) {
    pane.innerHTML = '<div class="empty-list">Nenhum erro tecnico registrado nesta sessao.</div>';
    return;
  }
  pane.innerHTML = `
    <div class="view-toolbar">
      <div class="view-title-wrap">
        <div class="view-title">Log de erro</div>
        <div class="view-subtitle">Eventos da extensao com expectativa, retorno real e rastro tecnico.</div>
      </div>
      <div class="view-actions">
        <button id="btn-copy-all-errors" class="btn-list-action">Copiar tudo</button>
        <button id="btn-clear-errors" class="btn-list-action danger">Limpar</button>
      </div>
    </div>
    <div class="error-log-list">
      ${entries.map((entry) => `
        <article class="log-card">
          <div class="log-card-head">
            <div>
              <div class="list-item-title">${escHtml(entry.title)}</div>
              <div class="list-item-meta">${escHtml(entry.scope)} - ${escHtml(entry.at)}</div>
            </div>
            <button class="btn-list-action" data-copy-error="${entry.id}">Copiar</button>
          </div>
          ${entry.expected ? `<div class="log-row"><strong>Esperado:</strong> ${escHtml(entry.expected)}</div>` : ""}
          ${entry.actual ? `<div class="log-row"><strong>Retornou:</strong> ${escHtml(entry.actual)}</div>` : ""}
          ${entry.recommendation ? `<div class="log-row"><strong>Acao sugerida:</strong> ${escHtml(entry.recommendation)}</div>` : ""}
          ${entry.trace ? `<pre class="log-trace">${escHtml(entry.trace)}</pre>` : ""}
          ${entry.details ? `<details class="log-details"><summary>Detalhes tecnicos</summary><pre class="log-trace">${escHtml(entry.details)}</pre></details>` : ""}
        </article>
      `).join("")}
    </div>
  `;
  pane.querySelector("#btn-copy-all-errors")?.addEventListener("click", () => copyErrorLog());
  pane.querySelector("#btn-clear-errors")?.addEventListener("click", () => clearErrorLog());
  pane.querySelectorAll("[data-copy-error]").forEach((button) => {
    button.addEventListener("click", () => copyErrorLog(button.dataset.copyError));
  });
}

function formatErrorEntry(entry) {
  return [
    `[${entry.at}] ${entry.title}`,
    `Escopo: ${entry.scope}`,
    entry.expected ? `Esperado: ${entry.expected}` : "",
    entry.actual ? `Retornou: ${entry.actual}` : "",
    entry.recommendation ? `Acao sugerida: ${entry.recommendation}` : "",
    entry.trace ? `Trace: ${entry.trace}` : "",
    entry.details ? `Detalhes:\n${entry.details}` : "",
  ].filter(Boolean).join("\n");
}
