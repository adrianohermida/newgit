import { appendActivityLog } from "../../../lib/admin/activity-log";

import { stringifyLogPayload } from "./action-utils";

export function usePublicacoesActivityLog() {
  function logUiEvent(label, action, response, patch = {}) {
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "publicacoes",
      component: patch.component || "publicacoes-ui",
      label,
      action,
      method: "UI",
      path: "/interno/publicacoes",
      expectation: patch.expectation || label,
      status: patch.status || "success",
      request: patch.request || "",
      response: stringifyLogPayload(response),
      error: patch.error || "",
    });
  }

  return { logUiEvent };
}
