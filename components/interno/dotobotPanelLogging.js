import { appendActivityLog } from "../../lib/admin/activity-log.js";

export function logDotobotUi({ routePath, label, action, payload = {}, stringifyDiagnostic, meta, patch = {} }) {
  appendActivityLog({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    module: "dotobot",
    component: patch.component || "DotobotPanel",
    label,
    action,
    method: patch.method || "UI",
    path: routePath || "/interno",
    page: routePath || "/interno",
    consolePane: patch.consolePane || meta.consolePane,
    domain: patch.domain || meta.domain,
    system: patch.system || meta.system,
    status: patch.status || "success",
    expectation: patch.expectation || label,
    request: patch.request || "",
    response: stringifyDiagnostic(payload),
    error: patch.error || "",
  });
}

export function handleCopilotDebug(routePath) {
  appendActivityLog({
    label: "Debug UI (Copilot)",
    status: "success",
    method: "UI",
    action: "debug_copilot",
    path: routePath || "",
    page: routePath || "",
    module: "dotobot",
    component: "DotobotPanel",
    response: `Debug manual do copilot em ${routePath || "rota interna"}`,
    consolePane: "debug-ui",
    domain: "runtime",
    system: "copilot",
  });
}
