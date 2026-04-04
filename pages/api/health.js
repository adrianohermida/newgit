// Endpoint público de healthcheck simples
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
  try {
    return res.status(200).json({
      ok: true,
      status: "healthy",
      now: new Date().toISOString(),
      version: process.env.npm_package_version || null,
      env: process.env.NODE_ENV || null,
    });
  } catch (error) {
    // Log básico para observabilidade
    console.error("[HEALTHCHECK] Erro:", error);
    return res.status(500).json({ ok: false, error: error?.message || "Erro desconhecido" });
  }
}
