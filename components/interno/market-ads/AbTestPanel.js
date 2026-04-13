import { ActionButton, Field, Panel, SelectField, TextAreaField } from "./shared";

export default function AbTestPanel({ abForm, setAbForm, campaigns, abState, editingAbId, saveAbTest, resetAbForm }) {
  return (
    <Panel eyebrow="Testes A/B" title="Hipotese e vencedor" helper="Registre o teste que merece memoria operacional para futuras iteracoes de copy, criativo e destino.">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Campanha" value={abForm.campaignId} onChange={(event) => setAbForm({ ...abForm, campaignId: event.target.value })} className="md:col-span-2">
          <option value="">Selecionar campanha</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </SelectField>
        <Field label="Area juridica" value={abForm.area} onChange={(event) => setAbForm({ ...abForm, area: event.target.value })} />
        <SelectField label="Metrica principal" value={abForm.metric} onChange={(event) => setAbForm({ ...abForm, metric: event.target.value })}>
          <option>CTR</option>
          <option>Conversao</option>
          <option>CPA</option>
          <option>ROI</option>
        </SelectField>
        <TextAreaField label="Hipotese" value={abForm.hypothesis} onChange={(event) => setAbForm({ ...abForm, hypothesis: event.target.value })} rows={4} className="md:col-span-2" />
        <Field label="Variante A" value={abForm.variantALabel} onChange={(event) => setAbForm({ ...abForm, variantALabel: event.target.value })} />
        <Field label="Variante B" value={abForm.variantBLabel} onChange={(event) => setAbForm({ ...abForm, variantBLabel: event.target.value })} />
        <Field label="Vencedor" value={abForm.winner} onChange={(event) => setAbForm({ ...abForm, winner: event.target.value })} />
        <Field label="Uplift %" value={abForm.uplift} onChange={(event) => setAbForm({ ...abForm, uplift: event.target.value })} />
        <SelectField label="Status" value={abForm.status} onChange={(event) => setAbForm({ ...abForm, status: event.target.value })} className="md:col-span-2">
          <option value="draft">draft</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
        </SelectField>
        <TextAreaField label="Recomendacao" value={abForm.recommendation} onChange={(event) => setAbForm({ ...abForm, recommendation: event.target.value })} rows={3} className="md:col-span-2" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionButton tone="primary" onClick={saveAbTest} disabled={abState.loading}>
          {abState.loading ? "Salvando..." : editingAbId ? "Atualizar teste" : "Criar teste"}
        </ActionButton>
        <ActionButton tone="subtle" onClick={resetAbForm}>Limpar teste</ActionButton>
      </div>

      {abState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{abState.error}</p> : null}
      {abState.result?.abTest?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Teste A/B preparado: {abState.result.abTest.metric}.</p> : null}
      {abState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{abState.result.warning}</p> : null}
    </Panel>
  );
}
