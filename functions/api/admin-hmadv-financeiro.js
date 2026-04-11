import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillHmadvFinanceAccounts,
  getHmadvFinanceAdminConfig,
  getHmadvFinanceAdminOverview,
  updateHmadvFinanceAdminConfig,
  resolveHmadvFinancePendingContacts,
  resolveHmadvFinancePendingAccounts,
  searchHmadvFinanceProcessCandidates,
} from "../lib/hmadv-finance-admin.js";

function jsonOk(payload, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(error, status = 500) {
  return new Response(JSON.stringify({
    ok: false,
    error: error?.message || "Falha no modulo administrativo do financeiro.",
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const url = new URL(context.request.url);
    const action = String(url.searchParams.get("action") || "overview");
    if (action === "overview") {
      const data = await getHmadvFinanceAdminOverview(context.env);
      return jsonOk({ data });
    }
    if (action === "config") {
      const data = await getHmadvFinanceAdminConfig(context.env);
      return jsonOk({ data });
    }
    if (action === "search_processes") {
      const data = await searchHmadvFinanceProcessCandidates(
        context.env,
        url.searchParams.get("query"),
        Number(url.searchParams.get("limit") || 20)
      );
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao GET invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    if (action === "backfill_textual_accounts") {
      const config = await getHmadvFinanceAdminConfig(context.env);
      const data = await backfillHmadvFinanceAccounts(context.env, {
        limit: Number(body.limit || config.settings?.value?.backfill_limit || 50),
        ownerId: body.ownerId || config.settings?.value?.freshsales_owner_id || null,
      });
      return jsonOk({ data });
    }
    if (action === "resolve_account_rows") {
      const data = await resolveHmadvFinancePendingAccounts(context.env, body || {});
      return jsonOk({ data });
    }
    if (action === "resolve_contact_rows") {
      const data = await resolveHmadvFinancePendingContacts(context.env, body || {});
      return jsonOk({ data });
    }
    if (action === "run_operation") {
      return new Response(JSON.stringify({
        ok: false,
        error: "Operacao runner disponivel apenas na rota Node /api/admin-hmadv-financeiro neste ambiente.",
        runner_available: false,
        fallback_actions: [
          "backfill_textual_accounts",
          "resolve_account_rows",
          "update_config",
        ],
      }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (action === "update_config") {
      const data = await updateHmadvFinanceAdminConfig(context.env, body || {});
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
