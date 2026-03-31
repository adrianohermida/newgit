import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";

function LoadingBlock({ children }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm">{children}</div>;
}

function Metric({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(18,20,19,0.98),rgba(10,12,11,0.98))] p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="font-serif text-4xl leading-none">{value}</p>
      <p className="mt-3 text-sm leading-relaxed opacity-60">{helper}</p>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "Sem execucao";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function useTrainingCenter() {
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    data: null,
    latestResult: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await adminFetch("/api/admin-agentlab-training");
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: null,
            data: payload.training,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Falha ao carregar o Training Center.",
          }));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runScenario(scenarioId, agentRef) {
    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      const payload = await adminFetch("/api/admin-agentlab-training", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scenarioId, agentRef }),
      });

      const refreshed = await adminFetch("/api/admin-agentlab-training");
      setState((current) => ({
        ...current,
        saving: false,
        latestResult: payload.result,
        data: refreshed.training,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "Falha ao executar o treino.",
      }));
    }
  }

  return {
    ...state,
    runScenario,
  };
}

export default function AgentLabTrainingPage() {
  const state = useTrainingCenter();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab Training"
          description="Centro de treinamento para elevar o desempenho dos agentes juridicos com cenarios, scorecards e recomendacoes operacionais."
        >
          <AgentLabModuleNav />
          <TrainingContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function TrainingContent({ state }) {
  if (state.loading) {
    return <LoadingBlock>Carregando centro de treinamento...</LoadingBlock>;
  }

  if (state.error && !state.data) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const training = state.data || {};
  const summary = training.summary || {};
  const scenarios = training.scenarios || [];
  const recentRuns = training.recent_runs || [];
  const profiles = training.profiles || [];
  const latestRun = state.latestResult?.run || recentRuns[0] || null;

  return (
    <div className="space-y-8">
      {state.error ? (
        <section className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-5 text-sm text-[#F2DEB5]">{state.error}</section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Cenarios ativos" value={summary.active_scenarios || 0} helper="Biblioteca de simulacoes juridico-comerciais prontas para treino continuo." />
        <Metric label="Treinos executados" value={summary.total_runs || 0} helper="Cada rodada mede clareza, seguranca juridica, qualificacao, fluxo e empatia." />
        <Metric label="Pass rate" value={`${summary.pass_rate || 0}%`} helper="Mostra quantas respostas atingem o patamar minimo de confianca do escritorio." />
        <Metric label="Media geral" value={summary.average_score || 0} helper="Score consolidado para enxergar se o agente esta melhorando ou apenas respondendo mais." />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Cenarios juridicos</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Esses cenarios representam perguntas reais de vendas, financeiro, processo, reclamacao e atendimento sensivel. O treino deve forcar o agente a responder melhor, nao apenas responder mais.
          </p>

          <div className="mt-5 space-y-4">
            {scenarios.map((scenario) => (
              <article key={scenario.id} className="border border-[#202321] p-5">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#F2DEB5]">
                    {scenario.category}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{scenario.difficulty}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">threshold {scenario.score_threshold}</span>
                </div>

                <h4 className="font-serif text-2xl">{scenario.scenario_name}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-70">{scenario.user_message}</p>

                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <Meta label="Intent esperada" value={scenario.expected_intent} />
                  <Meta label="Knowledge pack" value={scenario.expected_knowledge_pack || "Nao definido"} />
                  <Meta label="Workflow esperado" value={scenario.expected_workflow || "Nao definido"} />
                  <Meta label="Handoff esperado" value={scenario.expected_handoff ? "Sim" : "Nao"} />
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm opacity-55">{scenario.tags?.join(", ") || "Sem tags"}</div>
                  <button
                    type="button"
                    onClick={() => state.runScenario(scenario.id, scenario.agent_ref)}
                    disabled={state.saving}
                    className="border border-[#C5A059] px-4 py-3 text-sm transition-colors hover:bg-[#C5A059] hover:text-[#050706] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {state.saving ? "Executando treino..." : "Rodar treino"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="space-y-8">
          <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Configuracao treinada</h3>
            <p className="mt-2 text-sm leading-relaxed opacity-60">
              O treino faz sentido porque existe uma estrategia persistida de persona, conhecimento e handoff para o agente.
            </p>
            <div className="mt-5 space-y-4">
              {profiles.map((profile) => (
                <article key={profile.id} className="border border-[#202321] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="border border-[#355E3B] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#CDE7D1]">
                      {profile.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{profile.owner_name || "Sem owner"}</span>
                  </div>
                  <h4 className="font-serif text-2xl">{profile.agent_name || profile.agent_ref}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-65">{profile.business_goal}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Ultimo resultado</h3>
            <p className="mt-2 text-sm leading-relaxed opacity-60">
              O laboratorio precisa transformar cada rodada em melhoria concreta de resposta, intent routing e handoff.
            </p>

            {latestRun ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <ScoreCard label="Overall" value={latestRun.scores?.overall || 0} />
                  <ScoreCard label="Legal safety" value={latestRun.scores?.legal_safety || 0} />
                  <ScoreCard label="Workflow fit" value={latestRun.scores?.workflow_fit || 0} />
                </div>

                <article className="border border-[#202321] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Diagnostico</p>
                  <p className="mt-2 text-sm leading-relaxed opacity-70">{latestRun.evaluator_summary}</p>
                </article>

                <article className="border border-[#202321] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Resposta gerada</p>
                  <p className="mt-2 text-sm leading-relaxed opacity-70">{latestRun.generated_response}</p>
                </article>

                <article className="border border-[#202321] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Recomendacoes</p>
                  <div className="mt-3 space-y-3">
                    {(latestRun.recommendations || []).map((item, index) => (
                      <div key={`${item.title}-${index}`} className="border-t border-[#2D2E2E] pt-3 first:border-t-0 first:pt-0">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm opacity-65">{item.action}</p>
                      </div>
                    ))}
                  </div>
                </article>

                {state.latestResult?.improvement_item_created ? (
                  <article className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-4 text-sm text-[#F2DEB5]">
                    Este treino ficou abaixo do alvo e gerou um item automatico na fila viva de melhoria do AgentLab.
                  </article>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 text-sm opacity-60">Nenhum treino executado ainda neste ambiente.</div>
            )}
          </section>
        </div>
      </section>

      <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
        <h3 className="font-serif text-3xl">Historico recente</h3>
        <p className="mt-2 text-sm leading-relaxed opacity-60">
          O historico deixa claro onde o agente esta falhando: cenarios financeiros, status sensivel, qualificacao ou frustracao do cliente.
        </p>

        <div className="mt-5 space-y-4">
          {recentRuns.map((run) => (
            <article key={run.id} className="border border-[#202321] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className={`border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${run.passed ? "border-[#355E3B] text-[#CDE7D1]" : "border-[#6E5630] text-[#F2DEB5]"}`}>
                  {run.passed ? "Passou" : "Abaixo do alvo"}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{run.intent_detected}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{formatDateTime(run.created_at)}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm leading-relaxed opacity-70">{run.evaluator_summary}</p>
                  <p className="mt-3 text-sm opacity-55">{run.generated_response}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ScoreCard label="Overall" value={run.scores?.overall || 0} />
                  <ScoreCard label="Empathy" value={run.scores?.empathy || 0} />
                  <ScoreCard label="Qualification" value={run.scores?.qualification || 0} />
                  <ScoreCard label="Clarity" value={run.scores?.clarity || 0} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-1 opacity-75">{value}</p>
    </div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div className="border border-[#202321] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-3 font-serif text-3xl">{value}</p>
    </div>
  );
}
