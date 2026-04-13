import { ActionButton, Field, Panel, SelectField, Tag, TextAreaField, toneFor } from "./shared";

export default function GeneratorPanel({
  generator,
  setGenerator,
  previewState,
  draftState,
  preview,
  generatePreview,
  saveDraft,
  load,
}) {
  return (
    <Panel eyebrow="Gerador com IA" title="Preview criativo" helper="Monte um rascunho com headlines, descricoes, CTA e pistas de criativo antes de salvar no acervo.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Area juridica" value={generator.area} onChange={(event) => setGenerator({ ...generator, area: event.target.value })} />
        <Field label="Publico-alvo" value={generator.audience} onChange={(event) => setGenerator({ ...generator, audience: event.target.value })} />
        <SelectField label="Objetivo" value={generator.objective} onChange={(event) => setGenerator({ ...generator, objective: event.target.value })}>
          <option>Captacao</option>
          <option>Autoridade</option>
          <option>Remarketing</option>
        </SelectField>
        <SelectField label="Plataforma" value={generator.platform} onChange={(event) => setGenerator({ ...generator, platform: event.target.value })}>
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </SelectField>
        <Field label="Localizacao" value={generator.location} onChange={(event) => setGenerator({ ...generator, location: event.target.value })} className="md:col-span-2" />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionButton tone="primary" onClick={generatePreview} disabled={previewState.loading}>{previewState.loading ? "Gerando..." : "Gerar preview"}</ActionButton>
        <ActionButton tone="ghost" onClick={saveDraft} disabled={draftState.loading}>{draftState.loading ? "Salvando..." : "Salvar draft"}</ActionButton>
        <ActionButton tone="subtle" onClick={load}>Atualizar painel</ActionButton>
      </div>

      {draftState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{draftState.error}</p> : null}
      {draftState.result?.draft?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Draft salvo com score {draftState.result.draft.complianceScore}.</p> : null}
      {draftState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{draftState.result.warning}</p> : null}

      {preview ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Headlines</p>
            <div className="mt-3 space-y-2">
              {preview.headlines.map((item) => <p key={item} className="rounded-[16px] border border-[#1F302B] px-3 py-3 text-sm text-[#F4EEE0]">{item}</p>)}
            </div>
            <TextAreaField label="Descricoes" value={preview.descriptions.join("\n\n")} rows={6} readOnly className="mt-4" />
          </article>
          <article className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap gap-2">
              <Tag tone="accent">{preview.platform}</Tag>
              <Tag tone="neutral">{preview.objective}</Tag>
              <Tag tone={toneFor(preview.compliance?.status)}>{preview.compliance?.status || "pendente"}</Tag>
            </div>
            <p className="mt-4 font-semibold text-[#F7F2E8]">Criativo sugerido</p>
            <p className="mt-2 leading-6 text-[#8EA19B]">{preview.creativeHint}</p>
            <p className="mt-4 font-semibold text-[#F7F2E8]">Publico sugerido</p>
            <p className="mt-2 leading-6 text-[#8EA19B]">{preview.audienceSuggestion}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(preview.keywordSuggestions || []).map((item) => <Tag key={item}>{item}</Tag>)}
            </div>
          </article>
        </div>
      ) : null}
    </Panel>
  );
}
