import { Tag, toneFor } from "../shared";

export default function OptimizationCard({
  data,
  optimizationState,
  applyOptimizationState,
  generateOptimizations,
  applyOptimizations,
  strategyQueue,
  optimizationRecommendations,
}) {
  const plan = optimizationState.result || data.optimizationPlan;

  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Assistente de estrategia</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generateOptimizations}
          disabled={optimizationState.loading}
          className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50"
        >
          {optimizationState.loading ? "Rodando otimizacao..." : "Gerar rodada de otimizacao"}
        </button>
        <button
          type="button"
          onClick={applyOptimizations}
          disabled={applyOptimizationState.loading}
          className="rounded-full border border-[#22342F] px-4 py-2 text-xs font-semibold text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
        >
          {applyOptimizationState.loading ? "Aplicando status..." : "Aplicar status sugeridos"}
        </button>
        <Tag tone="accent">{plan?.narrative || "Sem rodada executada ainda"}</Tag>
      </div>
      {optimizationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{optimizationState.error}</p> : null}
      {applyOptimizationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{applyOptimizationState.error}</p> : null}
      {applyOptimizationState.result ? (
        <div className="mt-3 rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#F5F1E8]">Aplicacao segura concluida</p>
            <Tag tone="accent">{applyOptimizationState.result.narrative}</Tag>
          </div>
          <p className="mt-2 text-[#8FA29B]">O lote atualiza apenas o status sugerido e registra a decisao em metadata, sem alterar orcamento automaticamente.</p>
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {strategyQueue.map((item) => (
          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
              <div className="flex flex-wrap gap-2">
                <Tag tone={toneFor(item.priority)}>{item.priority}</Tag>
                <Tag tone="neutral">score {item.healthScore}</Tag>
                {item.attributedLeads ? <Tag tone="accent">leads {item.attributedLeads}</Tag> : null}
                {Number(item.realRoi || 0) > 0 ? <Tag tone={Number(item.realRoi || 0) >= 2 ? "success" : "warn"}>roi real {Number(item.realRoi || 0).toFixed(2)}</Tag> : null}
              </div>
            </div>
            <p className="mt-2 text-[#8FA29B]">{item.action}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">Owner sugerido: {item.owner}{item.clients ? ` · clientes ${item.clients}` : ""}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[16px] border border-[#1D2B27] px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <Tag tone="success">escala {plan?.summary?.scale || 0}</Tag>
          <Tag tone="accent">otimizar {plan?.summary?.optimize || 0}</Tag>
          <Tag tone="danger">revisar {plan?.summary?.review || 0}</Tag>
        </div>
        <div className="mt-4 space-y-3">
          {optimizationRecommendations.map((item) => (
            <div key={`${item.campaignId}-${item.decision}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                <div className="flex flex-wrap gap-2">
                  <Tag tone={toneFor(item.decision)}>{item.decision}</Tag>
                  <Tag tone="neutral">{item.suggestedStatus}</Tag>
                </div>
              </div>
              <p className="mt-2 text-[#8FA29B]">{item.reason}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{item.impact}{item.clients ? ` · clientes ${item.clients}` : ""}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
