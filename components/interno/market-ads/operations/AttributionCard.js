import { Tag, money } from "../shared";

export default function AttributionCard({
  data,
  attributionState,
  attributionForm,
  setAttributionForm,
  campaigns,
  adItems,
  persistedTemplates,
  saveAttribution,
}) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Atribuicao real de leads</p>
        <Tag tone="accent">{data.attributionAnalytics?.summary || "Sem atribuicoes ainda"}</Tag>
      </div>
      {attributionState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{attributionState.error}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <select value={attributionForm.campaignId} onChange={(event) => setAttributionForm({ ...attributionForm, campaignId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"><option value="">Selecionar campanha</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
        <select value={attributionForm.adItemId} onChange={(event) => setAttributionForm({ ...attributionForm, adItemId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"><option value="">Selecionar anuncio</option>{adItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={attributionForm.templateId} onChange={(event) => setAttributionForm({ ...attributionForm, templateId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"><option value="">Selecionar template</option>{persistedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={attributionForm.stage} onChange={(event) => setAttributionForm({ ...attributionForm, stage: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"><option value="lead">lead</option><option value="qualificado">qualificado</option><option value="atendimento">atendimento</option><option value="cliente">cliente</option></select>
        <input value={attributionForm.leadName} onChange={(event) => setAttributionForm({ ...attributionForm, leadName: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome do lead" />
        <input value={attributionForm.value} onChange={(event) => setAttributionForm({ ...attributionForm, value: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Valor" />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={saveAttribution} disabled={attributionState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
          {attributionState.loading ? "Registrando..." : "Registrar atribuicao"}
        </button>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {(data.attributionAnalytics?.byCampaign || []).slice(0, 4).map((item) => (
          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
            <p>{item.name}</p>
            <p className="mt-1 text-[#8FA29B]">leads {item.leads} · clientes {item.clients} · valor {money(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
