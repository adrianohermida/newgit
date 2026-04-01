import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../lib/agentlab/useAgentLabData";

function Metric({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl mb-2">{value}</p>
      {helper ? <p className="text-sm opacity-65 leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function Panel({ title, children, eyebrow }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabPage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab"
          description="Cockpit administrativo para evoluir agentes, chatbot e recursos de CRM usados nas conversas de vendas e atendimento."
        >
          <AgentLabModuleNav />
          <AgentLabContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgentLabContent({ state }) {
  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando AgentLab...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const data = state.data || {};
  const overview = data.overview || {};
  const warnings = data.warnings || [];

  return (
    <div className="space-y-8">
      {warnings.length ? (
        <Panel title="Avisos de fontes" eyebrow="Operacao">
          <div className="space-y-3 text-sm opacity-75">
            {warnings.map((item) => (
              <p key={`${item.source}-${item.message}`}>
                <span className="font-semibold">{item.source}</span>
                <br />
                {item.message}
              </p>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Agentes mapeados" value={overview.mappedAgents || 0} helper="Catalogo operacional ligado ao workspace e aos perfis de treinamento." />
        <Metric label="Conversas importadas" value={overview.importedConversations || 0} helper="Threads que alimentam inteligencia, handoff e melhoria continua." />
        <Metric label="Incidentes abertos" value={overview.openIncidents || 0} helper="Erros de classificacao, falha de fluxo e gaps de atendimento." />
        <Metric label="Score medio treino" value={`${overview.trainingAverageScore || 0}%`} helper="Media das ultimas avaliacoes do training center." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Sprint semanal" eyebrow="Cadencia recomendada">
          <ul className="space-y-3 text-sm opacity-75">
            <li>Top 20 unanswered</li>
            <li>Top 10 poor responses</li>
            <li>Top 5 workflows novos</li>
            <li>Top 10 conteudos novos</li>
          </ul>
        </Panel>

        <Panel title="Visao do CRM e conversas" eyebrow="Fonte de contexto">
          <div className="grid gap-4 md:grid-cols-2 text-sm opacity-75">
            <p>Snapshots CRM: {overview.crmSnapshots || 0}</p>
            <p>Runs de sync: {overview.syncRuns || 0}</p>
            <p>Perfis configurados: {overview.configuredProfiles || 0}</p>
            <p>Fila de melhoria: {overview.queueItems || 0}</p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Top intents" eyebrow="Conversation intelligence">
          <div className="space-y-3 text-sm opacity-75">
            {(data.conversations?.summary?.intents || []).length ? (
              data.conversations.summary.intents.map((item) => (
                <p key={item.label}>{item.label}: {item.value}</p>
              ))
            ) : (
              <p>Nenhuma intent consolidada ainda. Isso precisa ser atacado no treino.</p>
            )}
          </div>
        </Panel>

        <Panel title="Categorias de incidente" eyebrow="Risco operacional">
          <div className="space-y-3 text-sm opacity-75">
            {(data.intelligence?.summary?.byCategory || []).length ? (
              data.intelligence.summary.byCategory.map((item) => (
                <p key={item.label}>{item.label}: {item.value}</p>
              ))
            ) : (
              <p>Sem incidentes catalogados no momento.</p>
            )}
          </div>
        </Panel>

        <Panel title="Knowledge packs prioritarios" eyebrow="Treinamento">
          <div className="space-y-3 text-sm opacity-75">
            {(data.rollout?.knowledgePacks || []).map((item) => (
              <p key={item.id}>
                <span className="font-semibold">{item.title}</span>
                <br />
                {item.description}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
