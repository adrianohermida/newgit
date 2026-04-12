import { Panel, Tag } from "./shared";

export default function CompetitorInsightsPanel({ data }) {
  return (
    <Panel eyebrow="Mercado" title="Concorrencia e campanhas" helper="Recorte inicial para benchmarking, otimização e distribuicao segura do budget.">
                  <div className="space-y-3">
                    {data.competitorAds.map((item) => (
                      <article key={item.id} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Tag tone="accent">{item.platform}</Tag>
                            <Tag>{item.area}</Tag>
                            <Tag>{item.angle}</Tag>
                          </div>
                          <Tag tone="success">CTR est. {item.estimatedCtr}%</Tag>
                        </div>
                        <h4 className="mt-3 text-lg font-semibold text-[#F7F2E8]">{item.headline}</h4>
                        <p className="mt-2 text-sm leading-6 text-[#90A49D]">{item.description}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-4">
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Keyword: {item.keyword}</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Dor: {item.pain}</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Posicao: {item.placement}</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Escala: {item.repetitionScore}/100</div>
                        </div>
                      </article>
                    ))}
                  </div>
                </Panel>
  );
}
