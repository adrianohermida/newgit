import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

export default function AgentLabEvaluationPage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Evaluation"
          description="Fila gerencial de unanswered, poor responses, incidentes e melhoria semanal do agente."
        >
          <AgentLabModuleNav />
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <h3 className="font-serif text-2xl mb-4">Cadencia semanal</h3>
              <ul className="space-y-3 text-sm opacity-75">
                <li>Top 20 unanswered</li>
                <li>Top 10 poor responses</li>
                <li>Top 5 workflows novos</li>
                <li>Top 10 conteudos novos</li>
              </ul>
            </section>

            <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <h3 className="font-serif text-2xl mb-4">Incidentes abertos</h3>
              <div className="space-y-4 text-sm opacity-75">
                {(state.data?.intelligence?.incidents || []).map((item) => (
                  <div key={item.id} className="border border-[#2D2E2E] p-4">
                    <p className="font-semibold">{item.title}</p>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
