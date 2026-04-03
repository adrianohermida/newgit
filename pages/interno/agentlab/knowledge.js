import { useMemo } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabKnowledgePage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Conhecimento"
          description="Governanca dos knowledge packs e backlog editorial que sustentam as respostas do agente."
        >
          <AgentLabModuleNav />
          <KnowledgeContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function KnowledgeContent({ state }) {
  const packs = state.data?.rollout?.knowledgePacks || [];
  const queue = useMemo(
    () => (state.data?.governance?.queue || []).filter((item) => ["knowledge", "evaluation", "handoff"].includes(item.category)),
    [state.data]
  );

  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando conhecimento...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  return (
    <div className="space-y-8">
      <Panel title="Knowledge packs prioritarios">
        <div className="space-y-4 text-sm opacity-75">
          {packs.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <p className="font-semibold">{item.title}</p>
              <p>{item.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] opacity-50">Prioridade: {item.priority}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Backlog operacional de conhecimento">
        <div className="space-y-4 text-sm opacity-75">
          {queue.length ? queue.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <p className="font-semibold">{item.title}</p>
              <p>{item.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] opacity-50">
                {item.category} · {item.priority} · {item.status}
              </p>
            </div>
          )) : <p>Nenhum backlog operacional de conhecimento neste momento.</p>}
        </div>
      </Panel>

      <Panel title="Playbook editorial">
        <div className="space-y-3 text-sm opacity-75">
          <p>1. Responder em PT-BR claro, sem prometer resultado juridico.</p>
          <p>2. Em tema processual sensivel, priorizar orientacao geral e handoff humano.</p>
          <p>3. Em financeiro e agendamento, buscar autosservico antes do handoff.</p>
          <p>4. Separar sempre conteudo estatico de consulta dinamica via CRM e workflow.</p>
        </div>
      </Panel>
    </div>
  );
}
