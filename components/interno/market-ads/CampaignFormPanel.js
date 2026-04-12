import { Panel, Tag } from "./shared";

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
    <Panel eyebrow="Gestao de campanhas" title="Cadastrar ou editar campanha" helper="Use este bloco para montar a campanha operacional que vai alimentar verba, status, landing page e performance.">
      <div className="grid gap-4 md:grid-cols-2">
        <input value={campaignForm.name} onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome da campanha" />
        <select value={campaignForm.platform} onChange={(event) => setCampaignForm({ ...campaignForm, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </select>
        <select value={campaignForm.objective} onChange={(event) => setCampaignForm({ ...campaignForm, objective: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Captacao</option>
          <option>Autoridade</option>
          <option>Remarketing</option>
        </select>
        <select value={campaignForm.status} onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Draft</option>
          <option>Ativa</option>
          <option>Em otimizacao</option>
          <option>Alerta</option>
          <option>Pausada</option>
        </select>
        <input value={campaignForm.legalArea} onChange={(event) => setCampaignForm({ ...campaignForm, legalArea: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
        <input value={campaignForm.audience} onChange={(event) => setCampaignForm({ ...campaignForm, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico" />
        <input value={campaignForm.location} onChange={(event) => setCampaignForm({ ...campaignForm, location: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Localizacao" />
        <input value={campaignForm.landingPage} onChange={(event) => setCampaignForm({ ...campaignForm, landingPage: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Landing page" />
        <input value={campaignForm.budget} onChange={(event) => setCampaignForm({ ...campaignForm, budget: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Budget" />
        <input value={campaignForm.roi} onChange={(event) => setCampaignForm({ ...campaignForm, roi: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="ROI" />
        <input value={campaignForm.ctr} onChange={(event) => setCampaignForm({ ...campaignForm, ctr: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTR" />
        <input value={campaignForm.cpc} onChange={(event) => setCampaignForm({ ...campaignForm, cpc: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CPC" />
        <input value={campaignForm.cpa} onChange={(event) => setCampaignForm({ ...campaignForm, cpa: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CPA" />
        <input value={campaignForm.conversionRate} onChange={(event) => setCampaignForm({ ...campaignForm, conversionRate: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Taxa de conversao" />
        <select value={campaignForm.complianceStatus} onChange={(event) => setCampaignForm({ ...campaignForm, complianceStatus: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option value="aprovada">aprovada</option>
          <option value="revisao">revisao</option>
          <option value="bloqueada">bloqueada</option>
        </select>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={saveCampaign} disabled={campaignState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
          {campaignState.loading ? "Salvando..." : editingCampaignId ? "Atualizar campanha" : "Criar campanha"}
        </button>
        <button type="button" onClick={recommendLanding} disabled={landingState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {landingState.loading ? "Analisando destino..." : "Recomendar landing"}
        </button>
        <button type="button" onClick={resetCampaignForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
          Limpar formulario
        </button>
      </div>
      {campaignState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{campaignState.error}</p> : null}
      {campaignState.result?.campaign?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Campanha preparada: {campaignState.result.campaign.name}.</p> : null}
      {campaignState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{campaignState.result.warning}</p> : null}
      {landingState.error ? <p className="mt-2 text-sm text-[#F8C5C5]">{landingState.error}</p> : null}
      {landingState.result?.best ? (
        <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#F7F2E8]">Destino recomendado: {landingState.result.best.title}</p>
              <p className="mt-1 text-sm text-[#8FA29B]">{landingState.result.best.slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag tone="accent">fit {landingState.result.best.recommendedScore}</Tag>
              <button type="button" onClick={applyRecommendedLanding} className="rounded-full border border-[#C5A059] px-4 py-2 text-xs text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]">
                Aplicar no formulario
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#8FA29B]">{landingState.result.rationale}</p>
        </div>
      ) : null}
    </Panel>
  );
}
