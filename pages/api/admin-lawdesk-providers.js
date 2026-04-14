import { requireAdminNode } from "../../lib/admin/node-auth";
import { getDefaultLawdeskProvider, isLawdeskOfflineMode, listLawdeskProviders, runLawdeskProvidersHealth } from "../../lib/lawdesk/providers";

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

export default async function handler(req, res) {
  try {
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
      res.status(auth.status || 401).json({
        ok: false,
        error: auth.error || "Nao autorizado.",
        errorType: auth.errorType || "authentication",
        details: auth.details || null,
      });
      return;
    }

    const includeHealth = parseBoolean(req.query?.include_health, false);
    const providers = listLawdeskProviders(process.env);
    const defaultProvider = getDefaultLawdeskProvider(process.env);
    const offlineMode = isLawdeskOfflineMode(process.env);

    let health = null;
    if (includeHealth) {
      try {
        health = await runLawdeskProvidersHealth(process.env);
      } catch (error) {
        health = {
          ok: false,
          loaded: false,
          status: "failed",
          error: error?.message || "Falha ao executar health dos providers.",
          providers,
          summary: {
            total: providers.length,
            operational: 0,
            configured: providers.filter((item) => item?.configured).length,
            failed: providers.length,
            defaultProvider,
          },
        };
      }
    }

    res.status(200).json({
      ok: true,
      data: {
        providers: health?.providers || providers,
        health,
        defaultProvider,
        offlineMode,
      },
    });
  } catch (error) {
    res.status(200).json({
      ok: false,
      data: {
        providers: listLawdeskProviders(process.env),
        health: {
          ok: false,
          status: "failed",
          providers: listLawdeskProviders(process.env),
        },
        defaultProvider: getDefaultLawdeskProvider(process.env),
        offlineMode: isLawdeskOfflineMode(process.env),
      },
      error: error?.message || "Falha ao carregar admin-lawdesk-providers.",
    });
  }
}
