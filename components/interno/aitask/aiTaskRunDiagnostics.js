import {
  isBrowserLocalProvider,
  shouldAutoProbeBrowserLocalRuntime,
} from "../../../lib/lawdesk/browser-local-runtime";

export function isAdminRuntimeUnavailable(error) {
  const status = Number(error?.status || 0);
  const errorType = String(error?.payload?.errorType || "");
  return status === 404 || status === 405 || errorType === "admin_runtime_unavailable";
}

export function isAdminAuthenticationFailure(error) {
  const status = Number(error?.status || 0);
  const errorType = String(error?.payload?.errorType || "");
  return status === 401 || status === 403 || ["authentication", "missing_session", "invalid_session", "inactive_profile", "missing_token"].includes(errorType);
}

export function buildAdminInteractionMessage(error, fallbackMessage) {
  if (isAdminAuthenticationFailure(error)) {
    return "Sua sessao administrativa expirou ou perdeu permissao. Faca login novamente no interno para reativar chat e AI Task.";
  }
  if (isAdminRuntimeUnavailable(error)) {
    return "O runtime administrativo do AI Task nao esta publicado neste deploy.";
  }
  return error?.message || fallbackMessage;
}

export function stringifyDiagnostic(value, limit = 12000) {
  if (value === undefined || value === null) return "";
  let text = "";
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function buildAiTaskDiagnostic({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? String(summary).trim() : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function resolveAiTaskProvider(provider) {
  if (!isBrowserLocalProvider(provider)) return provider;
  return shouldAutoProbeBrowserLocalRuntime() ? provider : "gpt";
}
