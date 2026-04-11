import { requireAdminNode } from "../../lib/admin/node-auth";
import { getDefaultLawdeskProvider, listLawdeskProviders, runLawdeskProvidersHealth } from "../../lib/lawdesk/providers";

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ ok: false, error: "Metodo nao permitido." });
    return;
  }

  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    res.status(auth.status || 401).json({ ok: false, error: auth.error || "Nao autorizado." });
    return;
  }

  const includeHealth = parseBoolean(req.query?.include_health, false);
  const providers = listLawdeskProviders(process.env);
  const defaultProvider = getDefaultLawdeskProvider(process.env);
  const health = includeHealth ? await runLawdeskProvidersHealth(process.env).catch(() => null) : null;
  res.status(200).json({
    ok: true,
    data: {
      providers: health?.providers || providers,
      health,
      defaultProvider,
    },
  });
}
