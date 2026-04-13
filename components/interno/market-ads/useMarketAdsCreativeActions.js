import { useState } from "react";
import executeMarketAdsAction from "./executeMarketAdsAction";
import { toNumber } from "./shared";
import useMarketAdsTemplateActions from "./useMarketAdsTemplateActions";

export default function useMarketAdsCreativeActions({
  generator,
  setGenerator,
  attributionForm,
  complianceInput,
  patchDashboardCollection,
  patchTemplateLibraryTemplate,
  refreshDashboardSilently,
}) {
  const [previewState, setPreviewState] = useState({ loading: false, error: null, result: null });
  const [draftState, setDraftState] = useState({ loading: false, error: null, result: null });
  const [attributionState, setAttributionState] = useState({ loading: false, error: null, result: null });
  const [complianceState, setComplianceState] = useState({ loading: false, error: null, result: null });
  const templateActions = useMarketAdsTemplateActions({ patchTemplateLibraryTemplate, refreshDashboardSilently });

  async function generatePreview() {
    setPreviewState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction("generate_preview", { input: generator });
      setPreviewState({ loading: false, error: null, result: payload.data || null });
    } catch (error) {
      setPreviewState({ loading: false, error: error.message || "Falha ao gerar preview.", result: null });
    }
  }

  async function generateFromWinner(item) {
    setPreviewState({ loading: true, error: null, result: null });
    try {
      const nextGenerator = { area: item.area || generator.area, audience: item.audience || generator.audience, objective: item.objective || generator.objective, platform: item.platform || generator.platform, location: generator.location };
      setGenerator(nextGenerator);
      const { payload } = await executeMarketAdsAction("generate_from_winner", { input: { ...nextGenerator, source: item } });
      setPreviewState({ loading: false, error: null, result: payload.data || null });
    } catch (error) {
      setPreviewState({ loading: false, error: error.message || "Falha ao gerar variacoes a partir do criativo vencedor.", result: null });
    }
  }

  async function generateFromTemplate(template) {
    setPreviewState({ loading: true, error: null, result: null });
    try {
      const nextGenerator = { area: template.area || generator.area, audience: template.audience || generator.audience, objective: template.objective || generator.objective, platform: template.platform || generator.platform, location: generator.location };
      setGenerator(nextGenerator);
      const { payload } = await executeMarketAdsAction("generate_from_template", { input: { ...nextGenerator, template } });
      setPreviewState({ loading: false, error: null, result: payload.data || null });
    } catch (error) {
      setPreviewState({ loading: false, error: error.message || "Falha ao gerar variacoes a partir do template.", result: null });
    }
  }

  async function saveAttribution() {
    setAttributionState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction("save_attribution", { input: { ...attributionForm, value: toNumber(attributionForm.value) } });
      setAttributionState({ loading: false, error: null, result: payload.data || null });
      if (payload.data?.attribution) patchDashboardCollection("attributions", payload.data.attribution, { prepend: true, limit: 50 });
      refreshDashboardSilently();
    } catch (error) {
      setAttributionState({ loading: false, error: error.message || "Falha ao registrar atribuicao.", result: null });
    }
  }

  async function validateCompliance() {
    setComplianceState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction("validate_copy", { input: complianceInput });
      setComplianceState({ loading: false, error: null, result: payload.data || null });
    } catch (error) {
      setComplianceState({ loading: false, error: error.message || "Falha ao validar compliance.", result: null });
    }
  }

  async function saveDraft() {
    setDraftState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction("save_draft", { input: generator });
      setDraftState({ loading: false, error: null, result: payload.data || null });
      if (payload.data?.draft) patchDashboardCollection("drafts", payload.data.draft, { prepend: true, limit: 6 });
      refreshDashboardSilently();
    } catch (error) {
      setDraftState({ loading: false, error: error.message || "Falha ao salvar draft.", result: null });
    }
  }

  return {
    previewState,
    draftState,
    templateState: templateActions.templateState,
    attributionState,
    complianceState,
    generatePreview,
    generateFromWinner,
    generateFromTemplate,
    saveTemplate: templateActions.saveTemplate,
    toggleTemplateFavorite: templateActions.toggleTemplateFavorite,
    toggleTemplateVisibility: templateActions.toggleTemplateVisibility,
    toggleTemplateEditScope: templateActions.toggleTemplateEditScope,
    saveAttribution,
    validateCompliance,
    saveDraft,
  };
}
