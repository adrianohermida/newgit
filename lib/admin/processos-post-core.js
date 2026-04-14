export const runtimeEnv = process.env;

export function isJobInfraError(error) {
  const message = String(error?.message || "");
  return message.includes("operacao_jobs") && (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("PGRST205")
  );
}

export function isQueueOverloadError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Too many subrequests") ||
    message.includes("subrequests") ||
    message.includes("Worker exceeded resource limits") ||
    message.includes("exceeded resource limits")
  );
}

export function buildProcessActionLogName(action, payload = {}, suffix = "") {
  const baseAction = String(action || "").trim();
  const intent = String(payload?.intent || "").trim();
  const variant = baseAction === "enriquecer_datajud" && intent ? `${baseAction}_${intent}` : baseAction;
  return suffix ? `${variant}_${suffix}` : variant;
}
