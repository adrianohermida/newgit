export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;

  if (!url || !anonKey) {
    return res.status(500).json({
      ok: false,
      error: "Configuracao publica do Supabase ausente no ambiente.",
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
    });
  }

  return res.status(200).json({ ok: true, url, anonKey });
}
