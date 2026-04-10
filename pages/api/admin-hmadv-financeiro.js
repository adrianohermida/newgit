import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  backfillHmadvFinanceAccounts,
  getHmadvFinanceAdminOverview,
  resolveHmadvFinancePendingAccounts,
  searchHmadvFinanceProcessCandidates,
} from "../../functions/lib/hmadv-finance-admin.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "overview") {
        const data = await getHmadvFinanceAdminOverview(process.env);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "search_processes") {
        const data = await searchHmadvFinanceProcessCandidates(
          process.env,
          req.query.query,
          Number(req.query.limit || 20)
        );
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao GET invalida." });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action === "backfill_textual_accounts") {
        const data = await backfillHmadvFinanceAccounts(process.env, {
          limit: Number(req.body?.limit || 50),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "resolve_account_rows") {
        const data = await resolveHmadvFinancePendingAccounts(process.env, req.body || {});
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao POST invalida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar a visao administrativa do financeiro." });
  }
}
