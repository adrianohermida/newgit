import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  const { isLightTheme } = useInternalTheme();

  return (
    <section
      className={`border p-6 ${
        isLightTheme
          ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.92)] text-[#1f2937]"
          : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"
      }`}
    >
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function StatCard({ title, helper }) {
  const { isLightTheme } = useInternalTheme();

  return (
    <Panel title={title}>
      <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>{helper}</p>
    </Panel>
  );
}

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export default function AgentLabTrainingPage() {
  const router = useRouter();
  const state = useAgentLabData();
  const [runningId, setRunningId] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const copilotContext = parseCopilotContext(
    typeof router.query.copilotContext === "string" ? router.query.copilotContext : ""
  );
  const copilotAgentSeedAppliedRef = useRef(false);

  async function runScenario(id) {
    try {
      setRunningId(id);
      setResultMessage(null);
      const payload = await adminFetch("/api/admin-agentlab-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: id }),
      });
      const score = payload.result?.run?.scores?.overall;
      const provider = payload.result?.run?.provider || "n/a";
      setResultMessage(`Treino executado. Score geral: ${score ?? "n/a"} | Motor: ${provider}`);
      state.refresh();
    } catch (error) {
      setResultMessage(error.message);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab | Treinamento"
          description="Centro de treinamento, avaliacao e evolucao de agentes, com cenarios juridicos, scorecards, comparacao de prompts e fallback heuristico."
        >
          <AgentLabModuleNav />
          <TrainingContent
            state={state}
            runningId={runningId}
            runScenario={runScenario}
            resultMessage={resultMessage}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
            copilotContext={copilotContext}
            copilotAgentSeedAppliedRef={copilotAgentSeedAppliedRef}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function TrainingContent({
  state,
  runningId,
  runScenario,
  resultMessage,
  selectedAgent,
  setSelectedAgent,
  copilotContext,
  copilotAgentSeedAppliedRef,
}) {
  const { isLightTheme } = useInternalTheme();
  const agents = state.data?.agents || [];
  const scenarios = state.data?.training?.scenarios || [];
  const runs = state.data?.training?.runs || [];
  const summary = state.data?.training?.summary || {};
  const visibleScenarios = useMemo(
    () => (selectedAgent === "all" ? scenarios : scenarios.filter((item) => item.agent_ref === selectedAgent)),
    [scenarios, selectedAgent]
  );
  const visibleRuns = useMemo(
    () => (selectedAgent === "all" ? runs : runs.filter((item) => item.agent_ref === selectedAgent)),
    [runs, selectedAgent]
  );

  useEffect(() => {
    if (copilotAgentSeedAppliedRef.current) return;
    const mission = String(copilotContext?.mission || "").toLowerCase();
    if (!mission) return;
    if (mission.match(/dotobot|prompt|modelo|fallback|score|avali/)) {
      copilotAgentSeedAppliedRef.current = true;
      setSelectedAgent("dotobot-ai");
    }
  }, [copilotAgentSeedAppliedRef, copilotContext, setSelectedAgent]);

  useEffect(() => {
    setModuleHistory(
      "agentlab-training",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/training",
        loading: state.loading,
        error: state.error,
        section: "training",
        selectedAgent,
        scenarios: visibleScenarios.length,
        runs: visibleRuns.length,
        runningId: runningId || null,
        resultMessage: resultMessage || null,
        averageScore: summary.averageScore || 0,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      })
    );
  }, [
    resultMessage,
    runningId,
    selectedAgent,
    state.error,
    state.loading,
    summary.averageScore,
    visibleRuns.length,
    visibleScenarios.length,
  ]);

  if (state.loading) {
    return (
      <div
        className={`border p-6 ${
          isLightTheme
            ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]"
            : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"
        }`}
      >
        Carregando centro de treinamento...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">
        {state.error}
      </div>
    );
  }

  const boxTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";
  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const selectTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]"
    : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]";
  const buttonTone = isLightTheme
    ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#f6efe1]"
    : "border-[#C5A059] text-inherit hover:bg-[rgba(197,160,89,0.12)]";

  return (
    <div className="space-y-8">
      {copilotContext ? (
        <Panel title="Contexto vindo do Copilot">
          <div className={`space-y-2 text-sm ${muted}`}>
            <p className="font-semibold text-inherit">
              {copilotContext.conversationTitle || "Conversa ativa"}
            </p>
            {copilotContext.mission ? <p>{copilotContext.mission}</p> : null}
            <p>
              Use esta trilha para comparar cenarios, score e fallback antes de retomar a
              missao.
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={`Cenarios: ${scenarios.length}`}
          helper="Cenarios para treino de intents, handoff e fluxo."
        />
        <StatCard
          title={`Runs: ${summary.total || 0}`}
          helper="Execucoes salvas no training center."
        />
        <StatCard
          title={`Score medio: ${summary.averageScore || 0}%`}
          helper="Media recente das avaliacoes do agente."
        />
      </div>

      {resultMessage ? (
        <div
          className={`border p-4 text-sm ${
            isLightTheme
              ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]"
              : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] opacity-80"
          }`}
        >
          {resultMessage}
        </div>
      ) : null}

      <Panel title="Escopo do treinamento">
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <label className="block">
            <span className={`mb-2 block text-xs font-semibold uppercase tracking-[0.15em] ${subtle}`}>
              Agente treinado
            </span>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className={`w-full border px-4 py-3 outline-none ${selectTone}`}
            >
              <option value="all">Todos</option>
              {agents.map((item) => (
                <option key={item.id} value={item.agent_slug || item.agent_ref}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className={`border p-4 text-sm ${boxTone} ${muted}`}>
            O AgentLab separa treino, avaliacao, experimentos e refinamento do Dotobot.
            Quando o Workers AI estiver indisponivel, o painel usa uma avaliacao heuristica de
            contingencia para continuar gerando score, recomendacoes, comparacao e backlog.
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cenarios ativos">
          <div className="space-y-4">
            {visibleScenarios.length ? (
              visibleScenarios.map((item) => (
                <div key={item.id} className={`border p-4 ${boxTone}`}>
                  <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                    <span>{item.agent_ref}</span>
                    <span>{item.category}</span>
                    <span>{item.difficulty}</span>
                    <span>threshold {Math.round(Number(item.score_threshold || 0) * 100)}%</span>
                  </div>
                  <p className="mb-2 font-semibold">{item.scenario_name}</p>
                  <p className={`mb-2 text-sm ${muted}`}>{item.user_message}</p>
                  <p className={`mb-4 text-xs ${subtle}`}>
                    Intent esperada: {item.expected_intent}
                  </p>
                  <button
                    type="button"
                    onClick={() => runScenario(item.id)}
                    disabled={runningId === item.id}
                    className={`border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonTone}`}
                  >
                    {runningId === item.id ? "Executando..." : "Rodar treinamento"}
                  </button>
                </div>
              ))
            ) : (
              <div className={`border p-4 text-sm ${boxTone} ${muted}`}>
                Nenhum cenario disponivel para o filtro atual.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Ultimos runs">
          <div className="space-y-4">
            {visibleRuns.length ? (
              visibleRuns.map((item) => (
                <div key={item.id} className={`border p-4 ${boxTone}`}>
                  <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                    <span>{item.agent_ref || "sem agente"}</span>
                    <span>{item.provider}</span>
                    <span>{item.model}</span>
                    <span>{item.status}</span>
                  </div>
                  <p className={`mb-2 text-sm ${muted}`}>
                    {item.evaluator_summary || "Sem resumo do avaliador."}
                  </p>
                  <p className={`text-xs ${subtle}`}>
                    Intent detectada: {item.intent_detected || "n/a"} | Score:{" "}
                    {item.scores?.overall ?? "n/a"}
                  </p>
                </div>
              ))
            ) : (
              <div className={`border p-4 text-sm ${boxTone} ${muted}`}>
                Nenhum run recente encontrado para o agente selecionado.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
