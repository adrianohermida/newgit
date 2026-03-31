import { requireAdminApiAccess } from "../../lib/admin/server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const auth = await requireAdminApiAccess(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  return res.status(501).json({
    ok: false,
    error: "A leitura administrativa de agendamentos ainda nao foi religada neste runtime. A tabela/agregador esperado nao apareceu neste projeto Supabase.",
  });
}
