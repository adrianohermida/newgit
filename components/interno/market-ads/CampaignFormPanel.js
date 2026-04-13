import { ActionButton, Field, Panel, SelectField, Tag } from "./shared";

export default function CampaignFormPanel({
  campaignForm,
  setCampaignForm,
  campaignState,
  editingCampaignId,
  landingState,
  saveCampaign,
  recommendLanding,
  resetCampaignForm,
  applyRecommendedLanding,
}) {
  return (
    <Panel eyebrow="Gestao de campanhas" title="Campanha e destino" helper="Monte a estrutura de verba, objetivo, cobertura geografica e pagina de destino antes de publicar.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome da campanha" value={campaignForm.name} onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} className="md:col-span-2" />
        <SelectField label="Plataforma" value={campaignForm.platform} onChange={(event) => setCampaignForm({ ...campaignForm, platform: event.target.value })}>
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </SelectField>
        <SelectField label="Objetivo" value={campaignForm.objective} onChange={(event) => setCampaignForm({ ...campaignForm, objective: event.target.value })}>
          <option>Captacao</option>
          <option>Autoridade</option>
          <option>Remarketing</option>
        </SelectField>
        <SelectField label="Status" value={campaignForm.status} onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })}>
          <option>Draft</option>
          <option>Ativa</option>
          <option>Em otimizacao</option>
          <option>Alerta</option>
          <option>Pausada</option>
        </SelectField>
        <Field label="Area juridica" value={campaignForm.legalArea} onChange={(event) => setCampaignForm({ ...campaignForm, legalArea: event.target.value })} />
        <Field label="Publico" value={campaignForm.audience} onChange={(event) => setCampaignForm({ ...campaignForm, audience: event.target.value })} />
        <Field label="Localizacao" value={campaignForm.location} onChange={(event) => setCampaignForm({ ...campaignForm, location: event.target.value })} />
        <Field label="Landing page" value={campaignForm.landingPage} onChange={(event) => setCampaignForm({ ...campaignForm, landingPage: event.target.value })} />
        <Field label="Budget" value={campaignForm.budget} onChange={(event) => setCampaignForm({ ...campaignForm, budget: event.target.value })} />
        <Field label="ROI" value={campaignForm.roi} onChange={(event) => setCampaignForm({ ...campaignForm, roi: event.target.value })} />
        <Field label="CTR" value={campaignForm.ctr} onChange={(event) => setCampaignForm({ ...campaignForm, ctr: event.target.value })} />
        <Field label="CPC" value={campaignForm.cpc} onChange={(event) => setCampaignForm({ ...campaignForm, cpc: event.target.value })} />
        <Field label="CPA" value={campaignForm.cpa} onChange={(event) => setCampaignForm({ ...campaignForm, cpa: event.target.value })} />
        <Field label="Taxa de conversao" value={campaignForm.conversionRate} onChange={(event) => setCampaignForm({ ...campaignForm, conversionRate: event.target.value })} />
        <SelectField label="Compliance" value={campaignForm.complianceStatus} onChange={(event) => setCampaignForm({ ...campaignForm, complianceStatus: event.target.value })} className="md:col-span-2">
          <option value="aprovada">aprovada</option>
          <option value="revisao">revisao</option>
          <option value="bloqueada">bloqueada</option>
        </SelectField>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionButton tone="primary" onClick={saveCampaign} disabled={campaignState.loading}>
          {campaignState.loading ? "Salvando..." : editingCampaignId ? "Atualizar campanha" : "Criar campanha"}
        </ActionButton>
        <ActionButton tone="ghost" onClick={recommendLanding} disabled={landingState.loading}>
          {landingState.loading ? "Analisando destino..." : "Recomendar landing"}
        </ActionButton>
        <ActionButton tone="subtle" onClick={resetCampaignForm}>Limpar formulario</ActionButton>
      </div>

      {campaignState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{campaignState.error}</p> : null}
      {campaignState.result?.campaign?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Campanha preparada: {campaignState.result.campaign.name}.</p> : null}
      {campaignState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{campaignState.result.warning}</p> : null}
      {landingState.error ? <p className="mt-2 text-sm text-[#F8C5C5]">{landingState.error}</p> : null}

      {landingState.result?.best ? (
        <div className="mt-5 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[#F7F2E8]">Destino recomendado: {landingState.result.best.title}</p>
              <p className="mt-1 text-sm text-[#8FA29B]">{landingState.result.best.slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag tone="accent">fit {landingState.result.best.recommendedScore}</Tag>
              <ActionButton tone="ghost" className="px-4 py-2 text-xs" onClick={applyRecommendedLanding}>Aplicar no formulario</ActionButton>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#8FA29B]">{landingState.result.rationale}</p>
        </div>
      ) : null}
    </Panel>
  );
}
