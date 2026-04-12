import { Panel, Tag, toneFor } from "./shared";

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
    <Panel eyebrow="Gerador com IA" title="Criar anuncio juridico" helper="Gera headlines, descricoes, CTA, criativo e keywords com revisao automatica inicial.">
      <div className="grid gap-4 md:grid-cols-2">
        <input value={generator.area} onChange={(event) => setGenerator({ ...generator, area: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
        <input value={generator.audience} onChange={(event) => setGenerator({ ...generator, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico-alvo" />
        <select value={generator.objective} onChange={(event) => setGenerator({ ...generator, objective: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Captacao</option>
          <option>Autoridade</option>
          <option>Remarketing</option>
        </select>
        <select value={generator.platform} onChange={(event) => setGenerator({ ...generator, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
          <option>Google Ads</option>
          <option>Meta Ads</option>
          <option>Instagram Ads</option>
        </select>
        <input value={generator.location} onChange={(event) => setGenerator({ ...generator, location: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Localizacao" />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={generatePreview} disabled={previewState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
          {previewState.loading ? "Gerando..." : "Gerar preview"}
        </button>
        <button type="button" onClick={saveDraft} disabled={draftState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {draftState.loading ? "Salvando..." : "Salvar draft"}
        </button>
        <button type="button" onClick={load} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
          Atualizar painel
        </button>
      </div>
      {draftState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{draftState.error}</p> : null}
      {draftState.result?.draft?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Draft salvo com score {draftState.result.draft.complianceScore}.</p> : null}
      {draftState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{draftState.result.warning}</p> : null}
      {preview ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Headlines</p>
            <div className="mt-3 space-y-2">
              {preview.headlines.map((item) => <p key={item} className="rounded-[16px] border border-[#1F302B] px-3 py-3 text-sm text-[#F4EEE0]">{item}</p>)}
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Descricoes</p>
            <div className="mt-3 space-y-2">
              {preview.descriptions.map((item) => <p key={item} className="rounded-[16px] border border-[#1F302B] px-3 py-3 text-sm leading-6 text-[#C9D2CD]">{item}</p>)}
            </div>
          </article>
          <article className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#C7D0CA]">
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
