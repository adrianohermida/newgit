import { useCallback } from "react";
import { adminFetch as adminFetchRaw } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { extractActionFromRequest, stringifyLogPayload } from "./action-utils";

export function useProcessosAdminFetch() {
  return useCallback(async function adminFetch(path, init = {}, meta = {}) {
    const startedAt = Date.now();
    const method = String(init?.method || "GET").toUpperCase();
    const action = meta.action || extractActionFromRequest(path, init);
    let requestPayload = "";
    if (init?.body) {
      try {
        requestPayload = stringifyLogPayload(JSON.parse(init.body));
      } catch {
        requestPayload = stringifyLogPayload(init.body);
      }
    }
    const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    appendActivityLog({
      id: entryId,
      module: "processos",
      component: meta.component || "processos",
      label: meta.label || action || "Chamada administrativa",
      action,
      method,
      path,
      expectation: meta.expectation || (action ? `Executar ${action}` : "Consultar backend"),
      request: requestPayload,
      status: "running",
      startedAt,
      durationMs: null,
      response: "",
      error: "",
    });

    try {
      const payload = await adminFetchRaw(path, init, meta);
      updateActivityLog(entryId, { status: "success", durationMs: Date.now() - startedAt, response: stringifyLogPayload(payload) });
      return payload;
    } catch (error) {
      updateActivityLog(entryId, {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: stringifyLogPayload(error?.payload || error?.message || error),
      });
      throw error;
    }
  }, []);
}
