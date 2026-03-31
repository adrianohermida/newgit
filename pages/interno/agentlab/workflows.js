import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

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

export default function AgentLabWorkflowsPage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab Workflows"
          description="Mapa operacional dos fluxos prioritarios que devem sair do AgentLab e entrar no Freddy como skill, workflow ou handoff rule."
        >
          <AgentLabModuleNav />
          <WorkflowsContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function WorkflowsContent({ state }) {
  if (state.loading) {
    return <LoadingBlock>Carregando backlog de workflows...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const planning = state.data?.planning || {};

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Workflows no backlog" value={planning.workflow_backlog?.length || 0} helper="Fluxos mais importantes para o proximo ciclo no Freddy." />
        <Metric label="Playbooks de resposta" value={planning.response_playbooks?.length || 0} helper="Regras que devem guiar abertura, fallback e handoff." />
        <Metric label="Fases do rollout" value={planning.rollout_phases?.length || 0} helper="Sequencia de implementacao para evitar rollout desorganizado." />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Backlog de workflows</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Cada item abaixo deve nascer com trigger phrase, dados minimos, validacao, API action, resposta final e fallback.
          </p>
          <div className="mt-5 space-y-4">
            {planning.workflow_backlog?.map((item) => (
              <article key={item.id} className="border border-[#202321] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#F2DEB5]">
                    {item.priority}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.owner}</span>
                </div>
                <h4 className="mt-3 font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{item.objective}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Playbooks de resposta</h3>
            <div className="mt-5 space-y-4">
              {planning.response_playbooks?.map((item) => (
                <article key={item.title} className="border border-[#202321] p-4">
                  <h4 className="font-serif text-2xl">{item.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-65">{item.rule}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Checklist de configuracao</h3>
            <div className="mt-5 space-y-3 text-sm opacity-70">
              <div>Trigger phrases reais de clientes e leads.</div>
              <div>Coleta progressiva em vez de formulario logo na abertura.</div>
              <div>Handoff por regra: financeiro, agendamento, processo sensivel e reclamacao.</div>
              <div>Resposta final curta, comercial e orientada a proximo passo.</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
