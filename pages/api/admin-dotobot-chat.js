const OFFICIAL_ROUTE = "/api/admin-lawdesk-chat";

export default async function handler(_req, res) {
  res.setHeader("Allow", "POST");
  return res.status(410).json({
    ok: false,
    error: "Rota descontinuada.",
    code: "deprecated_route",
    replacement: OFFICIAL_ROUTE,
    message: "Use o endpoint oficial de chat administrativo do Dotobot/Lawdesk.",
  });
}
