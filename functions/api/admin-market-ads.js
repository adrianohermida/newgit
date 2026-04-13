import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  applyMarketAdsOptimizations,
  generateLegalAdVariant,
  generateMarketAdsOptimizations,
  generateVariantFromCreativeWinner,
  generateVariantFromTemplate,
  getMarketAdsDashboardData,
  importRemoteAdsCampaigns,
  importRemoteAdsItems,
  inspectAdsIntegrations,
  persistComplianceValidation,
  recommendLandingPage,
  saveMarketAdsAbTest,
  saveMarketAdsAttribution,
  saveMarketAdsCampaign,
  saveMarketAdsDraft,
  saveMarketAdsItem,
  saveMarketAdsTemplate,
  syncRemoteAdsCampaigns,
  syncRemoteAdsItems,
  toggleMarketAdsTemplateFavorite,
  trackMarketAdsTemplateUsage,
  updateMarketAdsAbTest,
  updateMarketAdsAttribution,
  updateMarketAdsCampaign,
  updateMarketAdsItem,
  updateMarketAdsTemplateEditScope,
  updateMarketAdsTemplateVisibility,
} from "../../lib/admin/market-ads.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function jsonError(message, status = 500, extra = {}) {
  return jsonResponse(
    {
      ok: false,
      error: message || "Falha no endpoint administrativo do HMADV Market Ads.",
      ...extra,
    },
    status,
  );
}

function jsonAdminAuthError(auth) {
  return jsonError(auth?.error || "Nao autorizado.", auth?.status || 401, {
    errorType: auth?.errorType || "authentication",
    details: auth?.details || null,
  });
}

async function handleAction(action, body, userId) {
  if (action === "generate_preview") return { ok: true, data: generateLegalAdVariant(body?.input || {}) };
  if (action === "generate_from_winner") return { ok: true, data: generateVariantFromCreativeWinner(body?.input || {}) };

  if (action === "generate_from_template") {
    const data = generateVariantFromTemplate(body?.input || {});
    if (body?.input?.template?.id && !String(body.input.template.id).startsWith("tpl-")) {
      await trackMarketAdsTemplateUsage({
        templateId: body.input.template.id,
        campaignId: body?.input?.campaignId || null,
        usageType: "generator",
        context: {
          platform: body?.input?.platform || null,
          objective: body?.input?.objective || null,
          area: body?.input?.area || null,
        },
      }, userId);
    }
    return { ok: true, data };
  }

  if (action === "save_draft") return { ok: true, data: await saveMarketAdsDraft(body?.input || {}, userId) };
  if (action === "save_template") return { ok: true, data: await saveMarketAdsTemplate(body?.input || {}, userId) };
  if (action === "save_attribution") return { ok: true, data: await saveMarketAdsAttribution(body?.input || {}, userId) };
  if (action === "update_attribution") return { ok: true, data: await updateMarketAdsAttribution(body?.attributionId || null, body?.input || {}) };
  if (action === "toggle_template_favorite") return { ok: true, data: await toggleMarketAdsTemplateFavorite(body?.templateId || null, body?.isFavorite !== false, userId) };
  if (action === "update_template_visibility") return { ok: true, data: await updateMarketAdsTemplateVisibility(body?.templateId || null, body?.visibility || "privado", userId) };
  if (action === "update_template_edit_scope") return { ok: true, data: await updateMarketAdsTemplateEditScope(body?.templateId || null, body?.editScope || "admins", userId) };
  if (action === "track_template_usage") return { ok: true, data: await trackMarketAdsTemplateUsage(body?.input || {}, userId) };
  if (action === "recommend_landing") return { ok: true, data: recommendLandingPage(body?.input || {}) };
  if (action === "inspect_integrations") return { ok: true, data: await inspectAdsIntegrations({ force: true }) };
  if (action === "sync_remote_campaigns") return { ok: true, data: await syncRemoteAdsCampaigns() };
  if (action === "import_remote_campaigns") return { ok: true, data: await importRemoteAdsCampaigns(userId) };
  if (action === "sync_remote_ads") return { ok: true, data: await syncRemoteAdsItems() };
  if (action === "import_remote_ads") return { ok: true, data: await importRemoteAdsItems(userId) };
  if (action === "generate_optimizations") return { ok: true, data: await generateMarketAdsOptimizations() };
  if (action === "apply_optimizations") return { ok: true, data: await applyMarketAdsOptimizations() };
  if (action === "save_campaign") return { ok: true, data: await saveMarketAdsCampaign(body?.input || {}, userId) };
  if (action === "update_campaign") return { ok: true, data: await updateMarketAdsCampaign(body?.campaignId || null, body?.input || {}) };
  if (action === "save_ad_item") return { ok: true, data: await saveMarketAdsItem(body?.input || {}, userId) };
  if (action === "update_ad_item") return { ok: true, data: await updateMarketAdsItem(body?.itemId || null, body?.input || {}) };
  if (action === "save_ab_test") return { ok: true, data: await saveMarketAdsAbTest(body?.input || {}, userId) };
  if (action === "update_ab_test") return { ok: true, data: await updateMarketAdsAbTest(body?.testId || null, body?.input || {}) };
  if (action === "validate_copy") return { ok: true, data: await persistComplianceValidation(body?.input || {}, userId, body?.draftId || null) };

  return null;
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: JSON_HEADERS });
  }

  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonAdminAuthError(auth);
  }

  try {
    if (context.request.method === "GET") {
      return jsonResponse({ ok: true, data: await getMarketAdsDashboardData() });
    }

    if (context.request.method === "POST") {
      const body = await context.request.json().catch(() => ({}));
      const action = String(body?.action || "").trim();
      const result = await handleAction(action, body, auth.user?.id || null);

      if (!result) {
        return jsonError("Acao administrativa invalida para HMADV Market Ads.", 400);
      }

      return jsonResponse(result, 200);
    }

    return jsonError("Metodo nao permitido.", 405);
  } catch (error) {
    return jsonError(error?.message || "Falha interna no HMADV Market Ads.", 500, {
      errorType: "internal",
    });
  }
}
