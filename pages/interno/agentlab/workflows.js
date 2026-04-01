import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

export default function AgentLabWorkflowsPage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Workflows"
          description="Backlog dos fluxos criticos que precisam existir no Freddy e nos canais conversacionais."
        >
          <AgentLabModuleNav />
          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-2xl mb-4">Workflow backlog</h3>
            <div className="space-y-4 text-sm opacity-75">
              {(state.data?.rollout?.workflows || []).map((item) => (
                <div key={item.id} className="border border-[#2D2E2E] p-4">
                  <p className="font-semibold">{item.title}</p>
                  <p>{item.outcome}</p>
                </div>
              ))}
            </div>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
