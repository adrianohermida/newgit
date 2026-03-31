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

export default function AgentLabKnowledgePage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab Knowledge"
          description="Curadoria das fontes que alimentam o chatbot e os agentes, conectando CRM, conteudo estatico e prioridades de publicacao."
        >
          <AgentLabModuleNav />
          <KnowledgeContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function KnowledgeContent({ state }) {
  if (state.loading) {
    return <LoadingBlock>Carregando modulo de conhecimento...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const planning = state.data?.planning || {};
  const coverage = state.data?.crm_sync?.coverage || [];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Knowledge packs" value={planning.knowledge_packs?.length || 0} helper="Blocos editoriais priorizados para o Freddy." />
        <Metric label="Entidades CRM" value={coverage.length} helper="Fontes dinamicas ja espelhadas para enriquecer contexto." />
        <Metric label="Fontes hibridas" value="3" helper="Conteudo estatico, consulta dinamica e contexto comercial convivendo no AgentLab." />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Pacotes de conhecimento</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Esses pacotes devem virar FAQ, respostas predefinidas, URLs, arquivos e instrucoes operacionais no Freddy.
          </p>
          <div className="mt-5 space-y-4">
            {planning.knowledge_packs?.map((item) => (
              <article key={item.id} className="border border-[#202321] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.sourceType}</p>
                <h4 className="mt-2 font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{item.goal}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Regras de curadoria</h3>
            <div className="mt-5 space-y-3 text-sm opacity-70">
              <div>Conteudo estatico vai para knowledge source versionado.</div>
              <div>Consulta dinamica vira workflow com API action e validacao.</div>
              <div>Contexto de jornada, sequencia e canal fica no AgentLab e no CRM.</div>
              <div>FAQ monolitico deve ser quebrado em temas, intents e blocos de decisao.</div>
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Cobertura CRM util</h3>
            <p className="mt-2 text-sm leading-relaxed opacity-60">
              O espelho do Freshsales ja mostra quais entidades podem enriquecer o agente com memoria comercial.
            </p>
            <div className="mt-5 space-y-3">
              {coverage.map((item) => (
                <div key={item.entity} className="border-t border-[#202321] pt-3 text-sm first:border-t-0 first:pt-0">
                  <span className="font-semibold">{item.entity}</span>
                  <span className="opacity-60"> · {item.total} registros espelhados</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
