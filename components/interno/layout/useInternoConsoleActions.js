import {
  appendActivityLog,
  appendFrontendIssue,
  appendOperationalNote,
  appendSchemaIssue,
  archiveActivityLog,
  formatActivityLogMarkdown,
  formatActivityLogText,
  formatFrontendIssuesMarkdown,
  formatSchemaIssuesMarkdown,
  setActivityLogFilters,
  setFingerprintState,
} from "../../../lib/admin/activity-log";
import { getModulePlaybook } from "./consolePlaybooks";
import { normalizeConsoleFilters } from "../../../lib/admin/console-log-utils";

function inferFrontendModule(pageValue) {
  const value = String(pageValue || "").toLowerCase();
  if (value.includes("contacts")) return "contacts";
  if (value.includes("processos")) return "processos";
  if (value.includes("publicacoes")) return "publicacoes";
  if (value.includes("financeiro")) return "financeiro";
  if (value.includes("ai-task")) return "ai-task";
  return "";
}

async function writeClipboard(text) {
  if (text && navigator?.clipboard) await navigator.clipboard.writeText(text);
}

export function useInternoConsoleActions(props) {
  const { activityLog, fingerprintStates, frontendForm, frontendIssues, logPane, moduleHistory, noteInput, operationalNotes, paneFingerprintSummary, router, schemaForm, schemaIssues, setConsoleOpen, setConsoleTab, setFrontendForm, setLogFilters, setLogPane, setLogSearch, setNoteInput, setSchemaForm, title } = props;
  const processosSnapshot = moduleHistory?.processos || {};
  const publicacoesSnapshot = moduleHistory?.publicacoes || {};

  function updateFilters(next) {
    const normalized = normalizeConsoleFilters(next);
    setLogFilters(normalized);
    setActivityLogFilters(normalized);
  }

  function handleFingerprintStateChange(entryOrFingerprint, status, note = "") {
    const fingerprint = typeof entryOrFingerprint === "string" ? entryOrFingerprint : entryOrFingerprint?.fingerprint;
    if (!fingerprint) return;
    const entry = typeof entryOrFingerprint === "string" ? activityLog.find((item) => item.fingerprint === fingerprint) : entryOrFingerprint;
    setFingerprintState(fingerprint, { status, note, lastEntryId: entry?.id || null, lastLabel: entry?.label || entry?.action || "Evento", source: "console" });
  }

  return {
    handleAddFrontendIssue() {
      if (!frontendForm.detail.trim()) return;
      appendFrontendIssue({ page: frontendForm.page, component: frontendForm.component, detail: frontendForm.detail, status: frontendForm.status || "aberto" });
      appendActivityLog({ label: "Registro Frontend UX", action: "frontend_issue", method: "UI", status: "success", module: inferFrontendModule(frontendForm.page), page: frontendForm.page || router.pathname, component: frontendForm.component || "Frontend UX", response: frontendForm.detail, consolePane: "frontend", domain: "ux", channel: "manual", tags: ["frontend", "ux", "manual"] });
      setFrontendForm({ page: "", component: "", detail: "", status: "aberto" });
    },
    handleAddNote() {
      const text = noteInput.trim();
      if (!text) return;
      appendOperationalNote({ text, type: "observacao" });
      setNoteInput("");
    },
    handleAddSchemaIssue() {
      const hasPayload = schemaForm.type || schemaForm.table || schemaForm.column || schemaForm.code || schemaForm.detail;
      if (!hasPayload) return;
      const issuePayload = { type: schemaForm.type || "schema_issue", table: schemaForm.table || null, column: schemaForm.column || null, code: schemaForm.code || null, detail: schemaForm.detail || null };
      appendSchemaIssue(issuePayload);
      appendActivityLog({ label: "Registro de schema", action: "schema_issue", method: "UI", status: "success", page: router.pathname, component: "Schema", response: JSON.stringify(issuePayload, null, 2), schemaIssue: issuePayload, consolePane: "schema", domain: "database", channel: "manual", tags: ["schema", "manual"] });
      setSchemaForm({ type: "", table: "", column: "", code: "", detail: "" });
    },
    handleArchive(reason) {
      archiveActivityLog(reason);
    },
    handleBulkFingerprintReset() {
      const targets = paneFingerprintSummary.filter((item) => item.status !== "aberto");
      if (!targets.length) return;
      targets.forEach((item) => handleFingerprintStateChange(item.fingerprint, "aberto", item.note || ""));
      appendOperationalNote({ type: "bulk_triage", text: `Trilha ${logPane}: ${targets.length} fingerprint(s) reabertos.`, meta: { logPane, status: "aberto", total: targets.length } });
    },
    handleBulkFingerprintStateChange(status) {
      const targets = paneFingerprintSummary.filter((item) => item.status !== status);
      if (!targets.length) return;
      targets.forEach((item) => handleFingerprintStateChange(item.fingerprint, status, item.note || ""));
      appendOperationalNote({ type: "bulk_triage", text: `Trilha ${logPane}: ${targets.length} fingerprint(s) marcados como ${status}.`, meta: { logPane, status, total: targets.length } });
    },
    async handleCopyAiTaskHistory() {
      await writeClipboard(JSON.stringify(moduleHistory?.["ai-task"] || {}, null, 2));
    },
    async handleCopyContactsHistory() {
      await writeClipboard(JSON.stringify(moduleHistory?.contacts || {}, null, 2));
    },
    async handleCopyDotobotHistory() {
      await writeClipboard(JSON.stringify(moduleHistory?.dotobot || {}, null, 2));
    },
    async handleCopyFrontendIssues() {
      await writeClipboard(formatFrontendIssuesMarkdown(frontendIssues));
    },
    async handleCopyLog() {
      await writeClipboard(formatActivityLogText(activityLog));
    },
    async handleCopyProcessHistory() {
      await writeClipboard(JSON.stringify({ local: processosSnapshot.executionHistory || [], remote: processosSnapshot.remoteHistory || [] }, null, 2));
    },
    async handleCopyPublicacoesHistory() {
      await writeClipboard(JSON.stringify(publicacoesSnapshot || { local: [], remote: [] }, null, 2));
    },
    async handleCopySchemaIssues() {
      await writeClipboard(formatSchemaIssuesMarkdown(schemaIssues));
    },
    async handleExportLog() {
      const text = formatActivityLogMarkdown(activityLog, operationalNotes);
      if (!text) return;
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hmadv-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    handleFingerprintNote(entryOrFingerprint) {
      const fingerprint = typeof entryOrFingerprint === "string" ? entryOrFingerprint : entryOrFingerprint?.fingerprint;
      if (!fingerprint) return;
      const current = fingerprintStates?.[fingerprint] || {};
      const entry = typeof entryOrFingerprint === "string" ? activityLog.find((item) => item.fingerprint === fingerprint) : entryOrFingerprint;
      const note = window.prompt("Registrar observacao para este fingerprint:", current.note || "");
      if (note === null) return;
      handleFingerprintStateChange(entry || fingerprint, current.status || "acompanhando", note);
      if (String(note || "").trim()) appendOperationalNote({ type: "fingerprint", text: `${entry?.label || entry?.action || fingerprint}: ${String(note).trim()}`, meta: { fingerprint, status: current.status || "acompanhando" } });
    },
    handleFingerprintStateChange,
    handleOpenModuleAlert(moduleKey) {
      const playbook = getModulePlaybook(moduleKey);
      setConsoleOpen(true);
      setConsoleTab("log");
      if (playbook?.pane) setLogPane(playbook.pane);
      updateFilters({ module: moduleKey, tag: playbook?.tag || "" });
      setLogSearch("");
      appendOperationalNote({ type: "alerta_modulo", text: `Console direcionado para o modulo ${moduleKey}.`, meta: { moduleKey, pane: playbook?.pane || "activity", tag: playbook?.tag || "" } });
    },
    handlePageDebug() {
      appendActivityLog({ label: "Debug UI (pagina)", status: "success", method: "UI", action: "debug_ui", path: router.pathname, page: router.pathname, component: title || "Pagina interna", response: `Debug manual iniciado em ${router.pathname}`, consolePane: "debug-ui", domain: "runtime", channel: "manual", tags: ["debug-ui", "manual"] });
    },
    updateFilters,
  };
}
