import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  applyMarketAdsOptimizations,
  generateLegalAdVariant,
  generateMarketAdsOptimizations,
  generateVariantFromTemplate,
  generateVariantFromCreativeWinner,
  getMarketAdsDashboardData,
  inspectAdsIntegrations,
  importRemoteAdsCampaigns,
  importRemoteAdsItems,
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
  trackMarketAdsTemplateUsage,
  toggleMarketAdsTemplateFavorite,
  updateMarketAdsTemplateEditScope,
  updateMarketAdsTemplateVisibility,
  updateMarketAdsAttribution,
  updateMarketAdsAbTest,
  updateMarketAdsCampaign,
  updateMarketAdsItem,
} from "../../lib/admin/market-ads.js";

export default async function handler(req, res) {
  try {
    const auth = await requireAdminNode(req);
    if (!auth.ok) {
      return res.status(auth.status).json({
        ok: false,
        error: auth.error,
        errorType: auth.errorType || "authentication",
        details: auth.details || null,
      });
    }

    if (req.method === "GET") {
      return res.status(200).json({ ok: true, data: await getMarketAdsDashboardData() });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "").trim();

      if (action === "generate_preview") {
        return res.status(200).json({
          ok: true,
          data: generateLegalAdVariant(req.body?.input || {}),
        });
      }

      if (action === "generate_from_winner") {
        return res.status(200).json({
          ok: true,
          data: generateVariantFromCreativeWinner(req.body?.input || {}),
        });
      }

      if (action === "generate_from_template") {
        const data = generateVariantFromTemplate(req.body?.input || {});
        if (req.body?.input?.template?.id && !String(req.body.input.template.id).startsWith("tpl-")) {
          await trackMarketAdsTemplateUsage({
            templateId: req.body.input.template.id,
            campaignId: req.body?.input?.campaignId || null,
            usageType: "generator",
            context: {
              platform: req.body?.input?.platform || null,
              objective: req.body?.input?.objective || null,
              area: req.body?.input?.area || null,
            },
          }, auth.user?.id || null);
        }
        return res.status(200).json({
          ok: true,
          data,
        });
      }

      if (action === "save_draft") {
        const data = await saveMarketAdsDraft(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "save_template") {
        const data = await saveMarketAdsTemplate(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "save_attribution") {
        const data = await saveMarketAdsAttribution(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_attribution") {
        const data = await updateMarketAdsAttribution(req.body?.attributionId || null, req.body?.input || {});
        return res.status(200).json({ ok: true, data });
      }

      if (action === "toggle_template_favorite") {
        const data = await toggleMarketAdsTemplateFavorite(req.body?.templateId || null, req.body?.isFavorite !== false, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_template_visibility") {
        const data = await updateMarketAdsTemplateVisibility(req.body?.templateId || null, req.body?.visibility || "privado", auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_template_edit_scope") {
        const data = await updateMarketAdsTemplateEditScope(req.body?.templateId || null, req.body?.editScope || "admins", auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "track_template_usage") {
        const data = await trackMarketAdsTemplateUsage(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "recommend_landing") {
        const data = recommendLandingPage(req.body?.input || {});
        return res.status(200).json({ ok: true, data });
      }

      if (action === "inspect_integrations") {
        const data = await inspectAdsIntegrations();
        return res.status(200).json({ ok: true, data });
      }

      if (action === "sync_remote_campaigns") {
        const data = await syncRemoteAdsCampaigns();
        return res.status(200).json({ ok: true, data });
      }

      if (action === "import_remote_campaigns") {
        const data = await importRemoteAdsCampaigns(auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "sync_remote_ads") {
        const data = await syncRemoteAdsItems();
        return res.status(200).json({ ok: true, data });
      }

      if (action === "import_remote_ads") {
        const data = await importRemoteAdsItems(auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "generate_optimizations") {
        const data = await generateMarketAdsOptimizations();
        return res.status(200).json({ ok: true, data });
      }

      if (action === "apply_optimizations") {
        const data = await applyMarketAdsOptimizations();
        return res.status(200).json({ ok: true, data });
      }

      if (action === "save_campaign") {
        const data = await saveMarketAdsCampaign(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_campaign") {
        const data = await updateMarketAdsCampaign(req.body?.campaignId || null, req.body?.input || {});
        return res.status(200).json({ ok: true, data });
      }

      if (action === "save_ad_item") {
        const data = await saveMarketAdsItem(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_ad_item") {
        const data = await updateMarketAdsItem(req.body?.itemId || null, req.body?.input || {});
        return res.status(200).json({ ok: true, data });
      }

      if (action === "save_ab_test") {
        const data = await saveMarketAdsAbTest(req.body?.input || {}, auth.user?.id || null);
        return res.status(200).json({ ok: true, data });
      }

      if (action === "update_ab_test") {
        const data = await updateMarketAdsAbTest(req.body?.testId || null, req.body?.input || {});
        return res.status(200).json({ ok: true, data });
      }

      if (action === "validate_copy") {
        return res.status(200).json({
          ok: true,
          data: await persistComplianceValidation(req.body?.input || {}, auth.user?.id || null, req.body?.draftId || null),
        });
      }

      return res.status(400).json({ ok: false, error: "Acao administrativa invalida para HMADV Market Ads." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha interna no HMADV Market Ads.",
      errorType: "internal",
    });
  }
}
