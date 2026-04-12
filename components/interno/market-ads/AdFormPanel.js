import { Panel } from "./shared";

export default function AdFormPanel({ adForm, setAdForm, campaigns, adState, editingAdId, saveAdItem, resetAdForm }) {
  return (
    <Panel eyebrow="CRUD de anuncios" title="Cadastrar ou editar anuncio" helper="Controle cada peca com headline, descricao, CTA, campanha vinculada e score de compliance individual.">
      <div className="grid gap-4 md:grid-cols-2">
        <select value={adForm.campaignId} onChange={(event) => setAdForm({ ...adForm, campaignId: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option value="">Selecionar campanha</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
        <input value={adForm.name} onChange={(event) => setAdForm({ ...adForm, name: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome do anuncio" />
        <select value={adForm.platform} onChange={(event) => setAdForm({ ...adForm, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </select>
        <select value={adForm.status} onChange={(event) => setAdForm({ ...adForm, status: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option value="draft">draft</option>
          <option value="ativa">ativa</option>
          <option value="teste">teste</option>
          <option value="pausada">pausada</option>
        </select>
        <input value={adForm.headline} onChange={(event) => setAdForm({ ...adForm, headline: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Headline" />
        <textarea value={adForm.description} onChange={(event) => setAdForm({ ...adForm, description: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Descricao" />
        <input value={adForm.cta} onChange={(event) => setAdForm({ ...adForm, cta: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTA" />
        <input value={adForm.audience} onChange={(event) => setAdForm({ ...adForm, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico" />
        <textarea value={adForm.creativeHint} onChange={(event) => setAdForm({ ...adForm, creativeHint: event.target.value })} rows={3} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Sugestao de criativo" />
        <input value={adForm.keywordSuggestions} onChange={(event) => setAdForm({ ...adForm, keywordSuggestions: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Keywords separadas por virgula" />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={saveAdItem} disabled={adState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
          {adState.loading ? "Salvando..." : editingAdId ? "Atualizar anuncio" : "Criar anuncio"}
        </button>
        <button type="button" onClick={resetAdForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
          Limpar anuncio
        </button>
      </div>
      {adState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{adState.error}</p> : null}
      {adState.result?.adItem?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Anuncio preparado: {adState.result.adItem.name}.</p> : null}
      {adState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{adState.result.warning}</p> : null}
    </Panel>
  );
}
