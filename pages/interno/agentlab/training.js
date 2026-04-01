import { useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabTrainingPage() {
  const state = useAgentLabData();
  const [runningId, setRunningId] = useState(null);
  const [resultMessage, setResultMessage] = useState(null);

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
      setResultMessage(`Treino executado. Score overall: ${score ?? "n/a"}`);
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
          title="AgentLab · Training"
          description="Centro de treinamento com cenarios juridicos, scorecards e uso de Workers AI como motor avaliador."
        >
          <AgentLabModuleNav />
          <TrainingContent state={state} runningId={runningId} runScenario={runScenario} resultMessage={resultMessage} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function TrainingContent({ state, runningId, runScenario, resultMessage }) {
  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando training center...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const scenarios = state.data?.training?.scenarios || [];
  const runs = state.data?.training?.runs || [];
  const summary = state.data?.training?.summary || {};

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Cenarios: ${scenarios.length}`}><p className="text-sm opacity-70">Cenarios para treino de intents, handoff e fluxo.</p></Panel>
        <Panel title={`Runs: ${summary.total || 0}`}><p className="text-sm opacity-70">Execucoes salvas no training center.</p></Panel>
        <Panel title={`Score medio: ${summary.averageScore || 0}%`}><p className="text-sm opacity-70">Media recente das avaliacoes do agente.</p></Panel>
      </div>

      {resultMessage ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm opacity-80">{resultMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cenarios ativos">
          <div className="space-y-4">
            {scenarios.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="flex flex-wrap gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.category}</span>
                  <span>{item.difficulty}</span>
                  <span>threshold {Math.round(Number(item.score_threshold || 0) * 100)}%</span>
                </div>
                <p className="font-semibold mb-2">{item.scenario_name}</p>
                <p className="text-sm opacity-75 mb-2">{item.user_message}</p>
                <p className="text-xs opacity-50 mb-4">Intent esperada: {item.expected_intent}</p>
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
            {runs.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="flex flex-wrap gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.provider}</span>
                  <span>{item.model}</span>
                  <span>{item.status}</span>
                </div>
                <p className="text-sm opacity-75 mb-2">{item.evaluator_summary || "Sem resumo do avaliador."}</p>
                <p className="text-xs opacity-50">
                  Intent detectada: {item.intent_detected || "n/a"} · Score: {item.scores?.overall ?? "n/a"}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
