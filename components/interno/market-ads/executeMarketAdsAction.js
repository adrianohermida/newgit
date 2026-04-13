import { adminFetch } from "../../../lib/admin/api";
import { isMarketAdsLocalModeError, runMarketAdsLocalAction } from "./marketAdsLocalMode";

export default async function executeMarketAdsAction(action, extra = {}) {
  try {
    const payload = await adminFetch("/api/admin-market-ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    return { payload, localMode: false };
  } catch (error) {
    if (!isMarketAdsLocalModeError(error)) {
      throw error;
    }
    return {
      payload: { ok: true, ...runMarketAdsLocalAction(action, extra) },
      localMode: true,
    };
  }
}
