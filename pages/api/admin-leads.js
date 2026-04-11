import { listFreshdeskTickets, requireAdminApiAccess } from "../../lib/admin/server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const auth = await requireAdminApiAccess(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    const page = Number(req.query.page || "1");
    const perPage = Number(req.query.perPage || "30");
    const email = req.query.email ? String(req.query.email) : undefined;
    const items = await listFreshdeskTickets({ page, perPage, email });

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao carregar tickets.",
    });
  }
}
