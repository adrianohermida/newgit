import { useState } from "react";
import executeMarketAdsAction from "./executeMarketAdsAction";

export default function useMarketAdsTemplateActions({ patchTemplateLibraryTemplate, refreshDashboardSilently }) {
  const [templateState, setTemplateState] = useState({ loading: false, error: null, result: null });

  async function saveTemplate(template) {
    return updateTemplateRequest({ action: "save_template", input: template }, "Falha ao salvar template na biblioteca.");
  }

  async function toggleTemplateFavorite(template) {
    if (!template?.id) return;
    return updateTemplateRequest({ action: "toggle_template_favorite", templateId: template.id, isFavorite: !template.isFavorite }, "Falha ao atualizar favorito do template.");
  }

  async function toggleTemplateVisibility(template) {
    if (!template?.id || String(template.id).startsWith("tpl-")) return;
    return updateTemplateRequest({ action: "update_template_visibility", templateId: template.id, visibility: template.visibility === "publico" ? "privado" : "publico" }, "Falha ao atualizar visibilidade do template.");
  }

  async function toggleTemplateEditScope(template) {
    if (!template?.id || String(template.id).startsWith("tpl-")) return;
    return updateTemplateRequest({ action: "update_template_edit_scope", templateId: template.id, editScope: template.editScope === "autor" ? "admins" : "autor" }, "Falha ao atualizar escopo de edicao do template.");
  }

  async function updateTemplateRequest(body, errorMessage) {
    setTemplateState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction(body.action, body);
      setTemplateState({ loading: false, error: null, result: payload.data || null });
      if (payload.data?.template) patchTemplateLibraryTemplate(payload.data.template, { prepend: true, limit: 24 });
      refreshDashboardSilently();
      return payload;
    } catch (error) {
      setTemplateState({ loading: false, error: error.message || errorMessage, result: null });
      return null;
    }
  }

  return { templateState, saveTemplate, toggleTemplateFavorite, toggleTemplateVisibility, toggleTemplateEditScope };
}
