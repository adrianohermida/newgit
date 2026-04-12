import { Panel } from "./shared";

export default function AbTestPanel({ abForm, setAbForm, campaigns, abState, editingAbId, saveAbTest, resetAbForm }) {
  return (
    <Panel eyebrow="Testes A/B" title="Cadastrar ou editar teste" helper="Registre hipotese, campanha, vencedor e uplift para transformar aprendizado em historico operacional.">
      <div className="grid gap-4 md:grid-cols-2">
        <select value={abForm.campaignId} onChange={(event) => setAbForm({ ...abForm, campaignId: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option value="">Selecionar campanha</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
        <input value={abForm.area} onChange={(event) => setAbForm({ ...abForm, area: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
        <select value={abForm.metric} onChange={(event) => setAbForm({ ...abForm, metric: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>CTR</option>
          <option>Conversao</option>
          <option>CPA</option>
          <option>ROI</option>
        </select>
        <textarea value={abForm.hypothesis} onChange={(event) => setAbForm({ ...abForm, hypothesis: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Hipotese do teste" />
        <input value={abForm.variantALabel} onChange={(event) => setAbForm({ ...abForm, variantALabel: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Variante A" />
        <input value={abForm.variantBLabel} onChange={(event) => setAbForm({ ...abForm, variantBLabel: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Variante B" />
        <input value={abForm.winner} onChange={(event) => setAbForm({ ...abForm, winner: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Vencedor" />
        <input value={abForm.uplift} onChange={(event) => setAbForm({ ...abForm, uplift: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Uplift %" />
        <select value={abForm.status} onChange={(event) => setAbForm({ ...abForm, status: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option value="draft">draft</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
        </select>
        <textarea value={abForm.recommendation} onChange={(event) => setAbForm({ ...abForm, recommendation: event.target.value })} rows={3} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Recomendacao" />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={saveAbTest} disabled={abState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
          {abState.loading ? "Salvando..." : editingAbId ? "Atualizar teste" : "Criar teste"}
        </button>
        <button type="button" onClick={resetAbForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
          Limpar teste
        </button>
      </div>
      {abState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{abState.error}</p> : null}
      {abState.result?.abTest?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Teste A/B preparado: {abState.result.abTest.metric}.</p> : null}
      {abState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{abState.result.warning}</p> : null}
    </Panel>
  );
}
