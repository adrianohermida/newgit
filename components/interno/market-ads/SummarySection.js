import { Panel, Tag, Tile, toneFor } from "./shared";

export default function SummarySection({ state, data }) {
  return (
    <>
      <Panel
        eyebrow="Publicidade juridica"
        title="HMADV Market Ads"
        helper="Modulo criado para unir inteligencia de mercado, criacao de anuncios, landing pages, operacao de campanhas e filtro etico obrigatorio."
      >
        <div className="grid gap-4 xl:grid-cols-5">
          <Tile label="Campanhas ativas" value={data?.overview?.activeCampaigns || 0} helper="Google Ads e Meta Ads no mesmo cockpit." />
          <Tile label="Verba mensal" value={data?.overview?.monthlyBudget || "R$ 0,00"} helper="Investimento consolidado das campanhas visiveis." />
          <Tile label="ROI medio" value={data?.overview?.averageRoi || "0.0"} helper="Retorno medio das campanhas ativas." />
          <Tile label="CTR medio" value={`${data?.overview?.averageCtr || "0.0"}%`} helper="Aderencia atual entre mensagem e publico." />
          <Tile label="CPA medio" value={data?.overview?.averageCpa || "R$ 0,00"} helper="Custo medio de aquisicao no recorte atual." />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Tile label="Receita atribuida" value={data?.overview?.realRevenue || "R$ 0,00"} helper="Valor real registrado nas atribuicoes do modulo." />
          <Tile label="ROI real" value={data?.overview?.realRoi || "0.00"} helper="Receita atribuida dividida pela verba consolidada." />
        </div>
      </Panel>

      {state.loading ? <Panel title="Carregando modulo" helper="Buscando benchmarks, campanhas e compliance." /> : null}
      {state.error ? <Panel title="Falha no modulo" helper={state.error} /> : null}

      {!state.loading && !state.error && data ? (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <Panel eyebrow="Arquitetura operacional" title="7 pilares do modulo" helper="Estrutura pronta para descoberta, criacao, sincronizacao, teste e monitoramento.">
            <div className="grid gap-3 md:grid-cols-2">
              {data.pillars.map((pillar) => (
                <article key={pillar.id} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-sm font-semibold text-[#F7F3EA]">{pillar.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{pillar.helper}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel eyebrow="Risco e compliance" title="Alertas ativos" helper="Leituras preventivas para evitar saturacao, CPA alto e violacoes eticas.">
            <div className="space-y-3">
              {data.alerts.map((alert, index) => (
                <article key={`${alert.title}-${index}`} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#F8F4EB]">{alert.title}</p>
                    <Tag tone={toneFor(alert.level)}>{alert.level}</Tag>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{alert.message}</p>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
