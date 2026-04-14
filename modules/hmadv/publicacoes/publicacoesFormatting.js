export function isResourceLimitError(error) {
  const text = String(error?.payload || error?.message || error || "").toLowerCase();
  return text.includes("worker exceeded resource limits");
}

export function getPublicacaoSelectionValue(row) {
  return String(row?.numero_cnj || row?.publicacao_id || row?.id || row?.key || "").trim();
}

export function matchesPublicacaoSelection(row, selectedValues = []) {
  const selectionValue = getPublicacaoSelectionValue(row);
  return Boolean(selectionValue) && selectedValues.includes(selectionValue);
}

export function validationTone(status) {
  if (status === "validado") return "success";
  if (status === "bloqueado") return "danger";
  if (status === "revisar") return "warning";
  return "default";
}

export function validationLabel(status) {
  if (status === "validado") return "validado";
  if (status === "bloqueado") return "bloqueado";
  if (status === "revisar") return "revisar";
  return "sem validacao";
}

export function formatValidationMeta(validation) {
  if (!validation?.updatedAt && !validation?.updatedBy) return "";
  const parts = [];
  if (validation.updatedBy) parts.push(String(validation.updatedBy));
  if (validation.updatedAt) {
    const date = new Date(validation.updatedAt);
    parts.push(Number.isNaN(date.getTime()) ? String(validation.updatedAt) : date.toLocaleString("pt-BR"));
  }
  return parts.join(" | ");
}

export function formatDateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}

export function formatSnapshotLabel(snapshot) {
  if (!snapshot?.updatedAt) return "snapshot ausente";
  return `snapshot ${formatDateTimeLabel(snapshot.updatedAt)}`;
}

export function formatFallbackReason(reason) {
  if (reason === "edge_function_unavailable") return "Fallback local apos falha da edge function.";
  if (reason === "local_backlog_path") return "Processamento local orientado pelo backlog.";
  if (reason === "edge_function_unavailable_or_empty") return "Fallback local apos resposta vazia ou indisponivel.";
  return reason ? String(reason) : "";
}

export function candidateQueueHasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
}
