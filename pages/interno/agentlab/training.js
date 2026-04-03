import { useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabTrainingPage() {
  const state = useAgentLabData();
  const [runningId, setRunningId] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState("all");

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
          description="Centro de treinamento para chatbot e agente de IA, com cenarios juridicos, scorecards e fallback heuristico."
        >
          <AgentLabModuleNav />
          <TrainingContent
            state={state}
            runningId={runningId}
            runScenario={runScenario}
            resultMessage={resultMessage}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
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
}) {
  if (state.loading) {
    return (
      <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
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

  const agents = state.data?.agents || [];
  const scenarios = state.data?.training?.scenarios || [];
  const runs = state.data?.training?.runs || [];
  const summary = state.data?.training?.summary || {};
  const visibleScenarios =
    selectedAgent === "all" ? scenarios : scenarios.filter((item) => item.agent_ref === selectedAgent);
  const visibleRuns =
    selectedAgent === "all" ? runs : runs.filter((item) => item.agent_ref === selectedAgent);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Cenarios: ${scenarios.length}`}>
          <p className="text-sm opacity-70">Cenarios para treino de intents, handoff e fluxo.</p>
        </Panel>
        <Panel title={`Runs: ${summary.total || 0}`}>
          <p className="text-sm opacity-70">Execucoes salvas no training center.</p>
        </Panel>
        <Panel title={`Score medio: ${summary.averageScore || 0}%`}>
          <p className="text-sm opacity-70">Media recente das avaliacoes do agente.</p>
        </Panel>
      </div>

      {resultMessage ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm opacity-80">
          {resultMessage}
        </div>
      ) : null}

      <Panel title="Escopo do treinamento">
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">
              Agente treinado
            </span>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            >
              <option value="all">Todos</option>
              {agents.map((item) => (
                <option key={item.id} value={item.agent_slug || item.agent_ref}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
            O AgentLab agora separa o treino do chatbot de triagem e do agente de IA mais sensivel.
            Quando o Workers AI estiver indisponivel, o painel usa uma avaliacao heuristica de contingencia
            para continuar gerando score, recomendacoes e backlog.
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cenarios ativos">
          <div className="space-y-4">
            {visibleScenarios.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.agent_ref}</span>
                  <span>{item.category}</span>
                  <span>{item.difficulty}</span>
                  <span>threshold {Math.round(Number(item.score_threshold || 0) * 100)}%</span>
                </div>
                <p className="mb-2 font-semibold">{item.scenario_name}</p>
                <p className="mb-2 text-sm opacity-75">{item.user_message}</p>
                <p className="mb-4 text-xs opacity-50">Intent esperada: {item.expected_intent}</p>
                <button
                  type="button"
                  onClick={() => runScenario(item.id)}
                  disabled={runningId === item.id}
                  className="border border-[#C5A059] px-4 py-2 text-sm"
                >
                  {runningId === item.id ? "Executando..." : "Rodar treinamento"}
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Ultimos runs">
          <div className="space-y-4">
            {visibleRuns.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.agent_ref || "sem agente"}</span>
                  <span>{item.provider}</span>
                  <span>{item.model}</span>
                  <span>{item.status}</span>
                </div>
                <p className="mb-2 text-sm opacity-75">
                  {item.evaluator_summary || "Sem resumo do avaliador."}
                </p>
                <p className="text-xs opacity-50">
                  Intent detectada: {item.intent_detected || "n/a"} | Score:{" "}
                  {item.scores?.overall ?? "n/a"}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
