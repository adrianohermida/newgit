export function hasJsonTruncationMessage(value) {
  return /unexpected end of json input/i.test(String(value || ""));
}

export function coverageMismatchMessage(state) {
  const totalRows = Number(state?.totalRows || 0);
  const items = Array.isArray(state?.items) ? state.items : [];
  return totalRows > 0 && !items.length
    ? "A cobertura encontrou processos na contagem, mas esta pagina voltou sem linhas. A leitura pode ter entrado em modo degradado ou sofrido timeout parcial."
    : "";
}

export function queueMismatchMessage(state) {
  const totalRows = Number(state?.totalRows || 0);
  const items = Array.isArray(state?.items) ? state.items : [];
  return totalRows > 0 && !items.length
    ? "A fila encontrou itens na contagem, mas esta pagina voltou sem linhas. Isso costuma indicar leitura parcial, timeout ou modo auxiliar."
    : "";
}

export function queueHasReadMismatch(state) {
  return Boolean(queueMismatchMessage(state));
}

export function countQueueReadMismatches(queues = []) {
  return queues.filter((queue) => queueHasReadMismatch(queue)).length;
}

export function countQueueErrors(queues = []) {
  return queues.filter((queue) => queue?.error).length;
}

export function getProcessSelectionValue(row) {
  return String(row?.numero_cnj || row?.key || "").trim();
}

export function parseProcessNumbers(rawValue) {
  return [...new Set(
    String(rawValue || "")
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function uniqueProcessNumbers(values = []) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

export function getRelationSelectionValue(row) {
  return String(row?.selection_key || row?.id || "").trim();
}

export function getSuggestionSelectionValue(row) {
  return String(row?.suggestion_key || "").trim();
}

export function parseCopilotContext(rawValue) {
  const serialized = String(rawValue || "").trim();
  if (!serialized) return null;
  try {
    const decoded = decodeURIComponent(serialized);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function countFrontendProcessGaps(row) {
  const fields = ["classe", "assunto_principal", "area", "data_ajuizamento", "sistema", "polo_ativo", "polo_passivo", "status_atual_processo"];
  return fields.reduce((acc, field) => {
    const value = row?.[field];
    return value === null || value === undefined || value === "" ? acc + 1 : acc;
  }, 0);
}

export function renderQueueRowStatuses(row, queueKey, { monitoringUnsupported = false } = {}) {
  const statuses = [];
  if (queueKey === "sem_movimentacoes" && Number(row?.movimentacoesTotal || row?.quantidade_movimentacoes || 0) === 0) {
    statuses.push({ label: "sem movimentacoes", tone: "warning" });
  }
  if (queueKey === "publicacoes_pendentes") {
    const pending = Number(row?.publicacoesPendentes || row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} publicacoes pendentes`, tone: "warning" });
  }
  if (queueKey === "partes_sem_contato") {
    const pending = Number(row?.total_pendente || row?.partesSemContato || 0);
    if (pending > 0) statuses.push({ label: `${pending} sem contato`, tone: "warning" });
  }
  if (queueKey === "campos_orfaos") {
    const gaps = countFrontendProcessGaps(row);
    if (gaps > 0) {
      statuses.push({ label: `${gaps} ajustes no CRM`, tone: "warning" });
      statuses.push({ label: "pronto para ajuste", tone: "success" });
    }
  }
  if (queueKey === "movimentacoes_pendentes") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} andamentos pendentes`, tone: "warning" });
    statuses.push({ label: row?.account_id_freshsales ? "pronto para atualizar" : "sem conta comercial", tone: row?.account_id_freshsales ? "success" : "danger" });
    if (row?.ultima_data) statuses.push({ label: `ultima ${new Date(row.ultima_data).toLocaleDateString("pt-BR")}`, tone: "default" });
  }
  if (queueKey === "monitoramento_ativo" || queueKey === "monitoramento_inativo") {
    statuses.push({ label: monitoringUnsupported ? "schema pendente" : row?.monitoramento_ativo ? "monitorado" : "nao monitorado", tone: monitoringUnsupported ? "warning" : row?.monitoramento_ativo ? "success" : "default" });
  }
  if (row?.status_atual_processo && !statuses.some((item) => item.label === row.status_atual_processo)) {
    statuses.push({ label: row.status_atual_processo, tone: "default" });
  }
  return statuses;
}

export function renderProcessSyncStatuses(row) {
  const statuses = [];
  if (row?.datajud?.ok) statuses.push({ label: "datajud ok", tone: "success" });
  if (row?.result?.ok) statuses.push({ label: "persistido", tone: "success" });
  if (row?.freshsales_repair?.ok) statuses.push({ label: "crm ajustado", tone: "success" });
  if (row?.freshsales_repair?.skipped) statuses.push({ label: "crm pendente", tone: "warning" });
  if (row?.datajud?.reason === "crm_only") statuses.push({ label: "crm direto", tone: "default" });
  if (row?.result?.ok === false || row?.datajud?.ok === false || row?.freshsales_repair?.ok === false) {
    statuses.push({ label: "falha", tone: "danger" });
  }
  return statuses;
}

export function shouldShowProcessPayloadDetails(row) {
  return Boolean(row?.freshsales_repair || row?.result || row?.datajud);
}

export function buildProcessResultHeadline(row) {
  if (row?.result?.message) return row.result.message;
  if (row?.datajud?.message) return row.datajud.message;
  if (row?.freshsales_repair?.message) return row.freshsales_repair.message;
  if (row?.titulo) return row.titulo;
  return "Resultado consolidado do processo.";
}
