import { useMemo } from "react";
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
  const environment = data.environment || {};
  const actionQueue = data.crm?.actionQueue || [];
  const dispatchRuns = data.crm?.dispatchRuns || [];
  const automationRuns = data.crm?.automationRuns || [];
  const actionQueueSummary = useMemo(() => {
    return actionQueue.reduce((acc, item) => {
      const key = item.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [actionQueue]);
  const dispatchSummary = useMemo(() => {
    return dispatchRuns.reduce((acc, item) => {
      const key = item.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [dispatchRuns]);
  const automationByEvent = useMemo(() => {
    const counts = automationRuns.reduce((acc, item) => {
      const key = item.event_key || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [automationRuns]);

  return (
    <div className="space-y-8">
      {environment.mode === "degraded" ? (
        <Panel title="Modo de contingencia" eyebrow="Operacao">
          <div className="space-y-3 text-sm opacity-75">
            <p>{environment.message}</p>
            {(environment.missingSources || []).length ? (
              <p>Fontes ausentes neste ambiente: {environment.missingSources.join(", ")}</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

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
        <Panel title="Fila operacional CRM" eyebrow="Sequences e journeys">
          <div className="space-y-3 text-sm opacity-75">
            <p>Ready: {actionQueueSummary.ready || 0}</p>
            <p>Pending: {actionQueueSummary.pending || 0}</p>
            <p>Missing mapping: {actionQueueSummary.missing_mapping || 0}</p>
            <p>Done: {actionQueueSummary.done || 0}</p>
            <p>Failed: {actionQueueSummary.failed || 0}</p>
          </div>
        </Panel>

        <Panel title="Fila de dispatch" eyebrow="Email e WhatsApp">
          <div className="space-y-3 text-sm opacity-75">
            <p>Pending approval: {dispatchSummary.pending_approval || 0}</p>
            <p>Approved: {dispatchSummary.approved || 0}</p>
            <p>Sent: {dispatchSummary.sent || 0}</p>
            <p>Failed: {dispatchSummary.failed || 0}</p>
            <p>Skipped: {dispatchSummary.skipped || 0}</p>
          </div>
        </Panel>

        <Panel title="Top eventos CRM" eyebrow="Automacao">
          <div className="space-y-3 text-sm opacity-75">
            {automationByEvent.length ? (
              automationByEvent.map((item) => (
                <p key={item.label}>{item.label}: {item.value}</p>
              ))
            ) : (
              <p>Nenhum evento automatizado consolidado ainda.</p>
            )}
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
