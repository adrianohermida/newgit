import { Panel, Tag, money, toneFor } from "./shared";

export default function OperationsInsightsPanel({
  data,
  optimizationState,
  applyOptimizationState,
  generateOptimizations,
  applyOptimizations,
  strategyQueue,
  optimizationRecommendations,
  beginEditAbTest,
  beginEditCampaign,
  generateFromWinner,
  templateState,
  saveTemplate,
  toggleTemplateFavorite,
  toggleTemplateVisibility,
  toggleTemplateEditScope,
  generateFromTemplate,
  attributionState,
  attributionForm,
  setAttributionForm,
  campaigns,
  adItems,
  persistedTemplates,
  saveAttribution,
  funnelRecentLeads,
  leadForecastQueue,
  beginEditAd,
}) {
  return (
    <Panel eyebrow="Operacao" title="Testes, landing pages e stack" helper="Base inicial para escalar o modulo com integracoes reais.">
                  <div className="space-y-4">
                    {data.abTests.map((item) => (
                      <article key={item.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#F7F2E8]">{item.area}</p>
                          <div className="flex flex-wrap gap-2">
                            <Tag tone="success">{item.winner}</Tag>
                            {item.status ? <Tag tone={toneFor(item.status)}>{item.status}</Tag> : null}
                          </div>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{item.recommendation}</p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => beginEditAbTest(item)}
                            className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            Editar teste
                          </button>
                        </div>
                      </article>
                    ))}
                    {data.campaigns.map((campaign) => (
                      <article key={campaign.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#F7F2E8]">{campaign.name}</p>
                            <p className="mt-1 text-xs text-[#8FA29B]">{campaign.platform} · {campaign.objective}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Tag tone={toneFor(campaign.status)}>{campaign.status}</Tag>
                            <Tag tone={toneFor(campaign.complianceStatus)}>{campaign.complianceStatus}</Tag>
                            <Tag tone={toneFor(campaign.healthBand)}>saude {campaign.healthBand}</Tag>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Budget {money(campaign.budget)}</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CPA {money(campaign.cpa)}</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CTR {Number(campaign.ctr || 0).toFixed(1)}%</div>
                          <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Score {campaign.healthScore || 0}/100</div>
                        </div>
                        <div className="mt-3 rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="font-semibold text-[#F7F2E8]">Proxima acao</p>
                          <p className="mt-1 text-[#8FA29B]">{campaign.nextActions?.[0] || "Sem recomendacao no momento."}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => beginEditCampaign(campaign)}
                            className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            Editar campanha
                          </button>
                        </div>
                      </article>
                    ))}
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
                        <Tag tone="accent">{(optimizationState.result || data.optimizationPlan)?.narrative || "Sem rodada executada ainda"}</Tag>
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
                          <Tag tone="success">escala {(optimizationState.result || data.optimizationPlan)?.summary?.scale || 0}</Tag>
                          <Tag tone="accent">otimizar {(optimizationState.result || data.optimizationPlan)?.summary?.optimize || 0}</Tag>
                          <Tag tone="danger">revisar {(optimizationState.result || data.optimizationPlan)?.summary?.review || 0}</Tag>
                        </div>
                        <div className="mt-4 space-y-3">
                          {optimizationRecommendations.map((item) => (
                            <div key={`${item.campaignId}-${item.decision}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Tag tone={toneFor(item.decision)}>{item.decision}</Tag>
                                  <Tag tone="neutral">{item.suggestedStatus}</Tag>
                                  {item.attributedLeads ? <Tag tone="accent">leads {item.attributedLeads}</Tag> : null}
                                  {Number(item.realRoi || 0) > 0 ? <Tag tone={Number(item.realRoi || 0) >= 2 ? "success" : "warn"}>roi real {Number(item.realRoi || 0).toFixed(2)}</Tag> : null}
                                </div>
                              </div>
                              <p className="mt-2 text-[#8FA29B]">{item.reason}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{item.impact}{item.clients ? ` · clientes ${item.clients}` : ""}</p>
                            </div>
                          ))}
                        </div>
                        {applyOptimizationState.result?.applied?.length ? (
                          <div className="mt-4 space-y-3">
                            {applyOptimizationState.result.applied.map((item) => (
                              <div key={`${item.campaignId}-${item.action}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <Tag tone={item.action === "updated" ? "success" : item.action === "skipped" ? "warn" : "danger"}>{item.action}</Tag>
                                    {item.status ? <Tag tone="neutral">{item.status}</Tag> : null}
                                  </div>
                                </div>
                                {item.decision ? <p className="mt-2 text-[#8FA29B]">Decisao aplicada: {item.decision}</p> : null}
                                {item.reason ? <p className="mt-2 text-[#8FA29B]">{item.reason}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <p className="font-semibold text-[#F7F2E8]">Landing pages</p>
                      <div className="mt-3 space-y-2">
                        {data.landingPages.map((item) => <p key={item.id} className="text-sm leading-6 text-[#C7D0CA]">{item.title} · {item.slug}</p>)}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Criativos vencedores</p>
                        <Tag tone="accent">{data.creativeRanking?.summary || "Sem ranking ainda"}</Tag>
                      </div>
                      <div className="mt-4 space-y-3">
                        {(data.creativeRanking?.leaders || []).map((item) => (
                          <div key={`${item.source}-${item.id}`} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-[#F5F1E8]">{item.headline}</p>
                              <div className="flex flex-wrap gap-2">
                                <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                                <Tag tone="neutral">score {item.score}</Tag>
                              </div>
                            </div>
                            <p className="mt-1 text-[#8FA29B]">{item.platform}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
                              {item.source === "local" ? <Tag tone="neutral">cliques {item.clicks || 0}</Tag> : null}
                              {item.source === "local" ? <Tag tone="neutral">conv {item.conversions || 0}</Tag> : null}
                            </div>
                            <p className="mt-3 text-[#8FA29B]">{item.recommendation}</p>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => generateFromWinner(item)}
                                className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                              >
                                Gerar variacoes
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Biblioteca de templates</p>
                        <Tag tone="accent">{data.templateLibrary?.summary || "Sem templates ainda"}</Tag>
                      </div>
                      {templateState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{templateState.error}</p> : null}
                      {templateState.result?.template?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Template atualizado na biblioteca persistida.</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Tag tone="neutral">uso total {data.templateLibrary?.usage?.total || 0}</Tag>
                      </div>
                      <div className="mt-4 space-y-4">
                        {(data.templateLibrary?.groups || []).map((group) => (
                          <div key={group.key} className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-[#F5F1E8]">{group.area}</p>
                              <Tag tone="neutral">{group.objective}</Tag>
                            </div>
                            <div className="mt-3 space-y-3">
                              {(group.items || []).slice(0, 3).map((item) => (
                                <div key={item.id} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
                                    <div className="flex flex-wrap gap-2">
                                      <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                                      <Tag tone="neutral">score {item.score}</Tag>
                                      <Tag tone="neutral">uso {item.usageCount || 0}</Tag>
                                      {item.isFavorite ? <Tag tone="success">favorito</Tag> : null}
                                      <Tag tone={item.visibility === "publico" ? "accent" : "neutral"}>{item.visibility || "privado"}</Tag>
                                      <Tag tone="neutral">{item.editScope === "autor" ? "somente autor" : "admins"}</Tag>
                                    </div>
                                  </div>
                                  <p className="mt-2 text-[#8FA29B]">{item.headline}</p>
                                  {item.lastUsedAt ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">Ultimo uso: {new Date(item.lastUsedAt).toLocaleDateString("pt-BR")}</p> : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {(item.tags || []).slice(0, 4).map((tag) => <Tag key={`${item.id}-${tag}`}>{tag}</Tag>)}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-3">
                                    <button
                                      type="button"
                                      onClick={() => generateFromTemplate(item)}
                                      className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                    >
                                      Aplicar template
                                    </button>
                                    {item.id?.startsWith("tpl-") ? (
                                      <button
                                        type="button"
                                        onClick={() => saveTemplate(item)}
                                        className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                      >
                                        Salvar na base
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => toggleTemplateFavorite(item)}
                                          className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                        >
                                          {item.isFavorite ? "Desfavoritar" : "Favoritar"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleTemplateVisibility(item)}
                                          className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                        >
                                          {item.visibility === "publico" ? "Tornar privado" : "Tornar publico"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleTemplateEditScope(item)}
                                          className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                        >
                                          {item.editScope === "autor" ? "Liberar para admins" : "Restringir ao autor"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {(data.templateLibrary?.usage?.recent || []).length ? (
                        <div className="mt-4 rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Atividade recente</p>
                          <div className="mt-3 space-y-2">
                            {(data.templateLibrary.usage.recent || []).slice(0, 5).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>Template {item.templateId || "sem id"} · uso {item.usageType}</p>
                                <p className="mt-1 text-[#8FA29B]">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Analytics da biblioteca</p>
                        <Tag tone="accent">{data.templateAnalytics?.summary || "Sem analytics ainda"}</Tag>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-5">
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Templates</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.templates || 0}</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Favoritos</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.favorites || 0}</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Usos</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.usage || 0}</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Publicos</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.public || 0}</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Privados</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.private || 0}</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Somente autor</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.authorOnly || 0}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Mais usados</p>
                          <div className="mt-3 space-y-2">
                            {(data.templateAnalytics?.topUsed || []).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">uso {item.usageCount || 0} · score {item.score || 0}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Por objetivo</p>
                          <div className="mt-3 space-y-2">
                            {(data.templateAnalytics?.byObjective || []).map((item) => (
                              <div key={item.label} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.label}</p>
                                <p className="mt-1 text-[#8FA29B]">{item.value} template(s)</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Por plataforma</p>
                          <div className="mt-3 space-y-2">
                            {(data.templateAnalytics?.byPlatform || []).map((item) => (
                              <div key={item.label} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.label}</p>
                                <p className="mt-1 text-[#8FA29B]">{item.value} template(s)</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Atribuicao real de leads</p>
                        <Tag tone="accent">{data.attributionAnalytics?.summary || "Sem atribuicoes ainda"}</Tag>
                      </div>
                      {attributionState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{attributionState.error}</p> : null}
                      {attributionState.result?.attribution?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Atribuicao registrada com sucesso.</p> : null}
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <select value={attributionForm.campaignId} onChange={(event) => setAttributionForm({ ...attributionForm, campaignId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                          <option value="">Selecionar campanha</option>
                          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                        </select>
                        <select value={attributionForm.adItemId} onChange={(event) => setAttributionForm({ ...attributionForm, adItemId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                          <option value="">Selecionar anuncio</option>
                          {adItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <select value={attributionForm.templateId} onChange={(event) => setAttributionForm({ ...attributionForm, templateId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                          <option value="">Selecionar template</option>
                          {persistedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <select value={attributionForm.stage} onChange={(event) => setAttributionForm({ ...attributionForm, stage: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                          <option value="lead">lead</option>
                          <option value="qualificado">qualificado</option>
                          <option value="atendimento">atendimento</option>
                          <option value="cliente">cliente</option>
                        </select>
                        <input value={attributionForm.leadName} onChange={(event) => setAttributionForm({ ...attributionForm, leadName: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome do lead" />
                        <input value={attributionForm.leadEmail} onChange={(event) => setAttributionForm({ ...attributionForm, leadEmail: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Email do lead" />
                        <input value={attributionForm.leadPhone} onChange={(event) => setAttributionForm({ ...attributionForm, leadPhone: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Telefone" />
                        <input value={attributionForm.value} onChange={(event) => setAttributionForm({ ...attributionForm, value: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Valor" />
                        <input value={attributionForm.campaignUtm} onChange={(event) => setAttributionForm({ ...attributionForm, campaignUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_campaign" />
                        <input value={attributionForm.contentUtm} onChange={(event) => setAttributionForm({ ...attributionForm, contentUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_content" />
                        <input value={attributionForm.termUtm} onChange={(event) => setAttributionForm({ ...attributionForm, termUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_term" />
                        <textarea value={attributionForm.notes} onChange={(event) => setAttributionForm({ ...attributionForm, notes: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Observacoes da atribuicao" />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={saveAttribution} disabled={attributionState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                          {attributionState.loading ? "Registrando..." : "Registrar atribuicao"}
                        </button>
                      </div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-3">
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Por campanha</p>
                          <div className="mt-3 space-y-2">
                            {(data.attributionAnalytics?.byCampaign || []).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">leads {item.leads} · clientes {item.clients} · valor {money(item.value)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">ROI real por campanha</p>
                          <div className="mt-3 space-y-2">
                            {(data.revenueOverview?.byCampaign || []).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">receita {money(item.revenue)} · verba {money(item.budget)} · roi {Number(item.roiReal || 0).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Por anuncio</p>
                          <div className="mt-3 space-y-2">
                            {(data.attributionAnalytics?.byAdItem || []).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">leads {item.leads}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                          <p className="font-semibold text-[#F5F1E8]">Por template</p>
                          <div className="mt-3 space-y-2">
                            {(data.attributionAnalytics?.byTemplate || []).map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">leads {item.leads}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Funil comercial</p>
                        <Tag tone="accent">fonte {(data.funnel?.source || "estimated").replace("_", " ")}</Tag>
                      </div>
                      {data.funnel?.warning ? <p className="mt-3 text-sm text-[#FDE68A]">{data.funnel.warning}</p> : null}
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {(data.funnel?.stages || []).map((stage) => (
                          <div key={stage.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">{stage.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{stage.value}</p>
                            <p className="mt-2 text-[#8FA29B]">{stage.helper}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        {(data.funnel?.insights || []).map((item) => (
                          <p key={item} className="text-sm leading-6 text-[#8FA29B]">{item}</p>
                        ))}
                      </div>
                      {funnelRecentLeads.length ? (
                        <div className="mt-4 space-y-3">
                          {funnelRecentLeads.map((lead) => (
                            <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-[#F5F1E8]">{lead.name}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Tag tone="neutral">status {lead.status}</Tag>
                                  <Tag tone="accent">prioridade {lead.priority}</Tag>
                                </div>
                              </div>
                              <p className="mt-1 text-[#8FA29B]">{lead.subject}</p>
                              {lead.email ? <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{lead.email}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[#F7F2E8]">Previsao de fechamento</p>
                        <Tag tone="accent">{data.leadForecast?.summary || "Sem previsao ainda"}</Tag>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Quentes</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.hot || 0}</p>
                          <p className="mt-2 text-[#8FA29B]">Precisam de acao humana imediata.</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Mornos</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.warm || 0}</p>
                          <p className="mt-2 text-[#8FA29B]">Pedem follow-up estruturado em ate 24h.</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Frios</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.cold || 0}</p>
                          <p className="mt-2 text-[#8FA29B]">Base para nutricao ou recaptura.</p>
                        </div>
                        <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Clientes</p>
                          <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.clients || 0}</p>
                          <p className="mt-2 text-[#8FA29B]">Conversoes registradas no modulo.</p>
                        </div>
                      </div>
                      {(data.leadForecast?.bottlenecks || []).length ? (
                        <div className="mt-4 space-y-2">
                          {(data.leadForecast?.bottlenecks || []).map((item) => (
                            <p key={item} className="text-sm leading-6 text-[#8FA29B]">{item}</p>
                          ))}
                        </div>
                      ) : null}
                      {leadForecastQueue.length ? (
                        <div className="mt-4 space-y-3">
                          {leadForecastQueue.map((lead) => (
                            <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-[#F5F1E8]">{lead.leadName}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Tag tone={lead.temperature === "quente" ? "success" : lead.temperature === "morno" ? "warn" : "neutral"}>{lead.temperature}</Tag>
                                  <Tag tone="accent">score {lead.score}</Tag>
                                  <Tag tone="neutral">etapa {lead.stage}</Tag>
                                </div>
                              </div>
                              <p className="mt-2 text-[#8FA29B]">{lead.recommendation}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{lead.nextStep}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">
                                <span>{lead.campaignName}</span>
                                {lead.adName ? <span>· {lead.adName}</span> : null}
                                {Number(lead.value || 0) > 0 ? <span>· valor {money(lead.value)}</span> : null}
                                {Number.isFinite(lead.ageInDays) ? <span>· {lead.ageInDays} dia(s)</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <p className="font-semibold text-[#F7F2E8]">Arquitetura tecnica</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-[#C7D0CA]">
                        {data.architecture.backend.concat(data.architecture.integrations).concat(data.architecture.safeguards).map((item) => <p key={item}>{item}</p>)}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <p className="font-semibold text-[#F7F2E8]">Drafts salvos</p>
                      <div className="mt-3 space-y-2">
                        {(data.drafts || []).length ? data.drafts.map((item) => (
                          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p>{item.title}</p>
                              <Tag tone={toneFor(item.complianceStatus)}>{item.complianceStatus}</Tag>
                            </div>
                            <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
                          </div>
                        )) : <p className="text-sm text-[#8FA29B]">Nenhum draft persistido ainda.</p>}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <p className="font-semibold text-[#F7F2E8]">Historico de compliance</p>
                      <div className="mt-3 space-y-2">
                        {(data.complianceLog || []).length ? data.complianceLog.map((item) => (
                          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Tag tone={toneFor(item.status)}>{item.status}</Tag>
                              <Tag tone="accent">score {item.score}</Tag>
                            </div>
                            <p className="mt-1 text-[#8FA29B]">{item.headline || "Validacao sem headline"}</p>
                          </div>
                        )) : <p className="text-sm text-[#8FA29B]">Nenhum log persistido ainda.</p>}
                      </div>
                    </div>
                    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                      <p className="font-semibold text-[#F7F2E8]">Anuncios salvos</p>
                      <div className="mt-3 space-y-2">
                        {(data.adItems || []).length ? data.adItems.map((item) => (
                          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p>{item.name}</p>
                                <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Tag tone={toneFor(item.status)}>{item.status}</Tag>
                                <Tag tone={toneFor(item.complianceStatus)}>{item.complianceStatus}</Tag>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Tag tone="neutral">imp {item.impressions || 0}</Tag>
                              <Tag tone="neutral">cliques {item.clicks || 0}</Tag>
                              <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
                              <Tag tone="neutral">cpc {money(item.cpc || 0)}</Tag>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => beginEditAd(item)}
                                className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                              >
                                Editar anuncio
                              </button>
                            </div>
                          </div>
                        )) : <p className="text-sm text-[#8FA29B]">Nenhum anuncio persistido ainda.</p>}
                      </div>
                    </div>
                  </div>
                </Panel>
  );
}
