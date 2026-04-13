import { ActionButton, PageSection, Panel, StatLine, Tag, Tile, toneFor } from "./shared";

export default function SummarySection({ state, data, load, generateOptimizations }) {
  if (state.loading) {
    return <Panel eyebrow="HMADV Market Ads" title="Carregando cockpit" helper="Buscando benchmarks, campanhas, templates e compliance." />;
  }

  if (state.error) {
    return (
      <Panel eyebrow="HMADV Market Ads" title="Falha ao carregar modulo" helper={state.error}>
        <div className="mt-6">
          <ActionButton tone="primary" onClick={load}>Recarregar modulo</ActionButton>
        </div>
      </Panel>
    );
  }

  if (!data) return null;

  const highlights = [
    { label: "Campanhas ativas", value: data.overview?.activeCampaigns || 0, helper: "Google Ads e Meta operando no mesmo cockpit." },
    { label: "Verba mensal", value: data.overview?.monthlyBudget || "R$ 0,00", helper: "Investimento consolidado das campanhas visiveis.", accent: true },
    { label: "ROI real", value: data.overview?.realRoi || "0.00", helper: "Receita atribuida dividida pela verba consolidada." },
    { label: "CPA medio", value: data.overview?.averageCpa || "R$ 0,00", helper: "Custo medio de aquisicao no recorte atual." },
  ];

  return (
    <div className="space-y-6">
      {state.meta?.localMode ? (
        <Panel
          eyebrow="Modo local"
          title="Backend administrativo indisponivel neste ambiente"
          helper={state.meta.localModeReason}
          className="border-[#6E5630] bg-[linear-gradient(180deg,rgba(67,49,18,0.28),rgba(12,12,10,0.92))]"
          contentClassName="mt-4"
        >
          <div className="flex flex-wrap gap-2">
            <Tag tone="warn">Dados locais</Tag>
            <Tag tone="neutral">Persistencia no navegador</Tag>
            <Tag tone="neutral">Sem sync com Google Ads e Meta Ads</Tag>
          </div>
        </Panel>
      ) : null}

      <Panel
        eyebrow="Publicidade juridica"
        title="HMADV Market Ads"
        helper="Operacao publicitaria juridica com leitura de concorrencia, criacao de anuncios, sincronizacao de campanhas e validacao etica no mesmo fluxo."
        className="overflow-hidden border-[#2A3324] bg-[radial-gradient(circle_at_top_left,rgba(192,149,84,0.14),transparent_36%),linear-gradient(180deg,rgba(11,16,15,0.98),rgba(6,10,9,0.95))]"
      >
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="max-w-3xl">
              <p className="text-4xl font-semibold tracking-[-0.05em] text-[#F5F1E8] md:text-5xl">Cockpit de aquisicao para advocacia com compliance nativo.</p>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#99ACA5]">
                O modulo precisa ajudar quem opera: descobrir o melhor angulo, publicar com seguranca e saber rapido onde o funil esta perdendo margem.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {highlights.map((item) => <Tile key={item.label} {...item} />)}
            </div>
            <div className="flex flex-wrap gap-3">
              <ActionButton tone="primary" onClick={generateOptimizations}>Gerar recomendacoes</ActionButton>
              <ActionButton tone="ghost" onClick={load}>Atualizar leitura</ActionButton>
              <Tag tone="accent">{data.integrations?.summary || "Sem leitura externa ainda"}</Tag>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-[#2A3324] bg-[rgba(255,255,255,0.03)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B88943]">Receita atribuida</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#F6F1E8]">{data.overview?.realRevenue || "R$ 0,00"}</p>
              <div className="mt-4 space-y-1">
                <StatLine label="CTR medio" value={`${data.overview?.averageCtr || "0.0"}%`} />
                <StatLine label="ROI medio" value={data.overview?.averageRoi || "0.0"} />
                <StatLine label="Leituras de risco" value={`${data.alerts?.length || 0} alertas`} />
              </div>
            </div>
            <div className="rounded-[28px] border border-[#2A3324] bg-[rgba(255,255,255,0.03)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B88943]">Alertas ativos</p>
              <div className="mt-4 space-y-3">
                {data.alerts?.slice(0, 3).map((alert, index) => (
                  <article key={`${alert.title}-${index}`} className="rounded-[20px] border border-[#1D2B28] bg-[rgba(7,12,11,0.72)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#F8F4EB]">{alert.title}</p>
                      <Tag tone={toneFor(alert.level)}>{alert.level}</Tag>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#90A39D]">{alert.message}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <PageSection
        label="Estrutura"
        title="Sete pilares em uma leitura unica"
        description="A plataforma precisa ser escaneavel em segundos: o que operar agora, o que investigar depois e onde ha risco etico ou de performance."
        aside={<Tag tone="neutral">{data.pillars?.length || 0} pilares carregados</Tag>}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.pillars.map((pillar) => (
            <article key={pillar.id} className="rounded-[24px] border border-[#1E302C] bg-[rgba(255,255,255,0.02)] px-5 py-5">
              <p className="text-sm font-semibold text-[#F7F3EA]">{pillar.title}</p>
              <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{pillar.helper}</p>
            </article>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
