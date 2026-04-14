import { useCallback } from "react";
import { adminFetch as adminFetchRaw } from "../../../lib/admin/api";
import { appendActivityLog, appendFrontendIssue, updateActivityLog } from "../../../lib/admin/activity-log";
import { extractActionFromRequest, stringifyLogPayload } from "./action-utils";

function buildAdminErrorDetail(path, meta, error) {
  const status = error?.status ? `HTTP ${error.status}` : "sem status";
  const payloadType = error?.payload?.errorType ? `payload ${error.payload.errorType}` : "payload n/d";
  const expectation = meta.expectation || meta.label || meta.action || "consultar backend";
  return `[layout/publicacoes] ${meta.component || "publicacoes"} falhou em ${path} (${status}; ${payloadType}). Impacto esperado na UI: ${expectation}. Mensagem: ${error?.message || "falha administrativa"}`;
}

export function usePublicacoesAdminFetch() {
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
      module: "publicacoes",
      component: meta.component || "publicacoes",
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
      updateActivityLog(entryId, {
        status: "success",
        durationMs: Date.now() - startedAt,
        response: stringifyLogPayload(payload),
      });
      return payload;
    } catch (error) {
      const errorDetail = buildAdminErrorDetail(path, meta, error);
      updateActivityLog(entryId, {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: stringifyLogPayload({
          message: error?.message || "Falha administrativa",
          status: error?.status || null,
          payload: error?.payload || null,
          path,
          component: meta.component || "publicacoes",
          action,
          expectation: meta.expectation || null,
          detail: errorDetail,
        }),
      });
      appendFrontendIssue({
        page: "/interno/publicacoes",
        component: meta.component || "publicacoes",
        detail: errorDetail,
        status: "aberto",
      });
      throw error;
    }
  }, []);
}
