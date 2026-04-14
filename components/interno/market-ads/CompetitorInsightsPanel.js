import { PageSection, Panel, Tag, Tile } from "./shared";

export default function CompetitorInsightsPanel({ data }) {
  const leadAd = data.competitorAds?.[0];

  return (
    <PageSection
      label="Mercado"
      title="Leituras de concorrencia que ajudam a escrever melhor"
      description="O benchmark nao pode ser apenas uma lista de anuncios. Ele precisa evidenciar angulo, dor e sinais de escala para orientar o proximo criativo."
      aside={<Tag tone="accent">{data.competitorAds?.length || 0} anuncios mapeados</Tag>}
    >
      <div className="space-y-6">
        {leadAd ? (
          <Panel eyebrow="Anuncio lider" title={leadAd.headline} helper={leadAd.description} className="border-[#2A3324] bg-[radial-gradient(circle_at_top_left,rgba(184,137,67,0.1),transparent_42%),linear-gradient(180deg,rgba(10,15,14,0.96),rgba(7,11,10,0.92))]">
            <div className="flex flex-wrap gap-2">
              <Tag tone="accent">{leadAd.platform}</Tag>
              <Tag>{leadAd.area}</Tag>
              <Tag>{leadAd.angle}</Tag>
              <Tag tone="success">CTR est. {leadAd.estimatedCtr}%</Tag>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Tile label="Keyword" value={leadAd.keyword} helper="Busca dominante observada na concorrencia." />
              <Tile label="Dor" value={leadAd.pain} helper="Problema central atacado pela copy." />
              <Tile label="Posicionamento" value={leadAd.placement} helper="Onde a mensagem esta aparecendo." />
              <Tile label="Escala" value={`${leadAd.repetitionScore}/100`} helper="Sinal de repeticao e sustentacao." accent />
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-4">
          {data.competitorAds?.slice(1).map((item) => (
            <article key={item.id} className="rounded-[24px] border border-[#1E302C] bg-[rgba(255,255,255,0.02)] px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Tag tone="accent">{item.platform}</Tag>
                    <Tag>{item.area}</Tag>
                    <Tag>{item.angle}</Tag>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-[#F7F2E8]">{item.headline}</h4>
                </div>
                <Tag tone="success">CTR est. {item.estimatedCtr}%</Tag>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#90A49D]">{item.description}</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <p className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Keyword: {item.keyword}</p>
                <p className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Dor: {item.pain}</p>
                <p className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Posicionamento: {item.placement}</p>
                <p className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Escala: {item.repetitionScore}/100</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
