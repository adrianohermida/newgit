import { ActionButton, Field, Panel, SelectField, TextAreaField } from "./shared";

export default function AdFormPanel({ adForm, setAdForm, campaigns, adState, editingAdId, saveAdItem, resetAdForm }) {
  return (
    <Panel eyebrow="CRUD de anuncios" title="Peca e mensagem" helper="Controle headline, descricao, CTA, campanha associada e pistas de criativo em um unico formulario.">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Campanha" value={adForm.campaignId} onChange={(event) => setAdForm({ ...adForm, campaignId: event.target.value })} className="md:col-span-2">
          <option value="">Selecionar campanha</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </SelectField>
        <Field label="Nome do anuncio" value={adForm.name} onChange={(event) => setAdForm({ ...adForm, name: event.target.value })} className="md:col-span-2" />
        <SelectField label="Plataforma" value={adForm.platform} onChange={(event) => setAdForm({ ...adForm, platform: event.target.value })}>
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </SelectField>
        <SelectField label="Status" value={adForm.status} onChange={(event) => setAdForm({ ...adForm, status: event.target.value })}>
          <option value="draft">draft</option>
          <option value="ativa">ativa</option>
          <option value="teste">teste</option>
          <option value="pausada">pausada</option>
        </SelectField>
        <Field label="Headline" value={adForm.headline} onChange={(event) => setAdForm({ ...adForm, headline: event.target.value })} className="md:col-span-2" />
        <TextAreaField label="Descricao" value={adForm.description} onChange={(event) => setAdForm({ ...adForm, description: event.target.value })} rows={4} className="md:col-span-2" />
        <Field label="CTA" value={adForm.cta} onChange={(event) => setAdForm({ ...adForm, cta: event.target.value })} />
        <Field label="Publico" value={adForm.audience} onChange={(event) => setAdForm({ ...adForm, audience: event.target.value })} />
        <TextAreaField label="Sugestao de criativo" value={adForm.creativeHint} onChange={(event) => setAdForm({ ...adForm, creativeHint: event.target.value })} rows={3} className="md:col-span-2" />
        <Field label="Keywords" value={adForm.keywordSuggestions} onChange={(event) => setAdForm({ ...adForm, keywordSuggestions: event.target.value })} helper="Separe por virgula para facilitar derivacoes." className="md:col-span-2" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionButton tone="primary" onClick={saveAdItem} disabled={adState.loading}>
          {adState.loading ? "Salvando..." : editingAdId ? "Atualizar anuncio" : "Criar anuncio"}
        </ActionButton>
        <ActionButton tone="subtle" onClick={resetAdForm}>Limpar anuncio</ActionButton>
      </div>

      {adState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{adState.error}</p> : null}
      {adState.result?.adItem?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Anuncio preparado: {adState.result.adItem.name}.</p> : null}
      {adState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{adState.result.warning}</p> : null}
    </Panel>
  );
}
