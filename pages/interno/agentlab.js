import { useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

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

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export default function AgentLabPage() {
  const router = useRouter();
  const state = useAgentLabData();
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab"
          description="Laboratorio de inteligencia para treinar agentes, comparar provedores, validar guardrails e transformar correcoes em melhoria continua."
        >
          <AgentLabModuleNav />
          <AgentLabContent state={state} copilotContext={copilotContext} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgentLabContent({ state, copilotContext }) {
  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando AgentLab...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const data = state.data || {};
  const rollout = data.rollout || {};
  const overview = data.overview || {};
  const warnings = data.warnings || [];
  const environment = data.environment || {};
  const actionQueue = data.crm?.actionQueue || [];
  const dispatchRuns = data.crm?.dispatchRuns || [];
  const automationRuns = data.crm?.automationRuns || [];
  const messageSummary = data.intelligence?.messageSummary || {};
  const widgetEventSummary = data.conversations?.widgetEventSummary || {};
  const providerMatrix = rollout.providerMatrix || [];
  const evaluationRubric = rollout.evaluationRubric || [];
  const debateModes = rollout.debateModes || [];
  const learningLoop = rollout.learningLoop || [];
  const ethicsGuardrails = rollout.ethicsGuardrails || [];
  const experimentTracks = rollout.experimentTracks || [];
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

  useEffect(() => {
    setModuleHistory(
      "agentlab",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab",
        loading: state.loading,
        error: state.error,
        degradedMode: environment.mode === "degraded",
        warnings,
        overview,
        environment: {
          mode: environment.mode || "unknown",
          message: environment.message || null,
          missingSources: environment.missingSources || [],
          schemaChecklistSize: environment.schemaChecklist?.length || 0,
        },
        intelligence: {
          mappedAgents: overview.mappedAgents || 0,
          importedConversations: overview.importedConversations || 0,
          openIncidents: overview.openIncidents || 0,
          trainingAverageScore: overview.trainingAverageScore || 0,
        },
        crm: {
          actionQueueSummary,
          dispatchSummary,
          automationByEvent,
        },
        messageSummary: {
          total: messageSummary.total || 0,
          customerMessages: messageSummary.customerMessages || 0,
          agentMessages: messageSummary.agentMessages || 0,
          qualityEvents: messageSummary.qualityEvents || 0,
        },
        rollout: {
          providerMatrix: providerMatrix.length,
          evaluationRubric: evaluationRubric.length,
          debateModes: debateModes.length,
          learningLoop: learningLoop.length,
          ethicsGuardrails: ethicsGuardrails.length,
          experimentTracks: experimentTracks.length,
        },
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          diagnosticsTracked: true,
        },
      }),
    );
  }, [
    actionQueueSummary,
    automationByEvent,
    debateModes.length,
    dispatchSummary,
    environment.message,
    environment.missingSources,
    environment.mode,
    environment.schemaChecklist,
    ethicsGuardrails.length,
    evaluationRubric.length,
    experimentTracks.length,
    learningLoop.length,
    messageSummary,
    overview,
    providerMatrix.length,
    state.error,
    state.loading,
    warnings,
  ]);

  return (
    <div className="space-y-8">
      {copilotContext ? (
        <Panel title="Contexto vindo do Copilot" eyebrow="Handoff operacional">
          <div className="space-y-2 text-sm opacity-75">
            <p className="font-semibold text-[#F5F1E8]">{copilotContext.conversationTitle || "Conversa ativa"}</p>
            {copilotContext.mission ? <p>{copilotContext.mission}</p> : null}
            <p>Use esta abertura para revisar subagentes, treinamento e roteamento antes de retomar a missão.</p>
          </div>
        </Panel>
      ) : null}
      {environment.mode === "degraded" ? (
        <Panel title="Modo de contingencia" eyebrow="Operacao">
          <div className="space-y-3 text-sm opacity-75">
            <p>{environment.message}</p>
            {(environment.missingSources || []).length ? (
              <p>Fontes ausentes neste ambiente: {environment.missingSources.join(", ")}</p>
            ) : null}
            <p>
              Bootstrap recomendado:
              {" "}
              [agentlab-bootstrap-supabase.sql](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.sql)
            </p>
            <p>
              Runbook:
              {" "}
              [agentlab-bootstrap-supabase.md](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.md)
            </p>
            <p>
              Diagnostico detalhado:
              {" "}
              [environment](/D:/Github/newgit/pages/interno/agentlab/environment.js)
            </p>
          </div>
        </Panel>
      ) : null}

      {(environment.schemaChecklist || []).length ? (
        <Panel title="Checklist do schema" eyebrow="Ambiente">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm opacity-75">
            {environment.schemaChecklist.map((item) => (
              <div key={item.table} className="border border-[#2D2E2E] p-3">
                <p className="font-semibold">{item.table}</p>
                <p className={item.status === "ready" ? "text-emerald-400" : "text-amber-300"}>
                  {item.status === "ready" ? "Disponivel" : "Ausente"}
                </p>
              </div>
            ))}
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

      <Panel title="Laboratorio de inteligencia" eyebrow="Visao geral">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 text-sm opacity-75">
          {(rollout.phases || []).map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] opacity-50">{item.id}</p>
              <p className="mt-2">{item.focus}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Agentes mapeados" value={overview.mappedAgents || 0} helper="Catalogo operacional ligado ao workspace, aos perfis de treinamento e aos experimentos." />
        <Metric label="Conversas importadas" value={overview.importedConversations || 0} helper="Threads que alimentam inteligencia, handoff, avaliacao e melhoria continua." />
        <Metric label="Incidentes abertos" value={overview.openIncidents || 0} helper="Erros de classificacao, falha de fluxo, risco juridico e gaps de atendimento." />
        <Metric label="Score medio treino" value={`${overview.trainingAverageScore || 0}%`} helper="Media das ultimas avaliacoes e comparacao de qualidade do agente." />
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
        <Panel title="Mensagens reais" eyebrow="Freshchat intelligence">
          <div className="space-y-3 text-sm opacity-75">
            <p>Total: {messageSummary.total || 0}</p>
            <p>Clientes: {messageSummary.customerMessages || 0}</p>
            <p>Agente/bot: {messageSummary.agentMessages || 0}</p>
            <p>Sinais de qualidade: {messageSummary.qualityEvents || 0}</p>
          </div>
        </Panel>

        <Panel title="Freshchat Widget" eyebrow="Telemetria do site">
          <div className="space-y-3 text-sm opacity-75">
            <p>Eventos: {widgetEventSummary.total || 0}</p>
            <p>Aberturas: {widgetEventSummary.openedCount || 0}</p>
            <p>Auth: {widgetEventSummary.authCount || 0}</p>
            <p>Falhas: {widgetEventSummary.failureCount || 0}</p>
            {(widgetEventSummary.byEvent || []).length ? (
              <div className="pt-2 space-y-2">
                {widgetEventSummary.byEvent.slice(0, 5).map((item) => (
                  <p key={item.label}>{item.label}: {item.value}</p>
                ))}
              </div>
            ) : (
              <p>Sem telemetria consolidada do widget ainda.</p>
            )}
          </div>
        </Panel>

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

        <Panel title="Qualidade e roteamento" eyebrow="Mensagens">
          <div className="space-y-3 text-sm opacity-75">
            {(messageSummary.bySuggestedAgent || []).length ? (
              messageSummary.bySuggestedAgent.map((item) => (
                <p key={item.label}>{item.label}: {item.value}</p>
              ))
            ) : (
              <p>Sem dados de roteamento ainda.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Sinais de qualidade" eyebrow="Mensagens">
          <div className="space-y-3 text-sm opacity-75">
            {(messageSummary.qualitySignals || []).length ? (
              messageSummary.qualitySignals.map((item) => (
                <p key={item.label}>{item.label}: {item.value}</p>
              ))
            ) : (
              <p>Nenhum sinal de qualidade consolidado ainda.</p>
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Matriz de provedores" eyebrow="Experimentos">
          <div className="space-y-3 text-sm opacity-75">
            {providerMatrix.length ? providerMatrix.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.provider}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">
                  {item.mode} | fallback #{item.fallback_order}
                </p>
                <p className="mt-2">{(item.strengths || []).join(" · ")}</p>
              </div>
            )) : <p>Nenhum provedor cadastrado.</p>}
          </div>
        </Panel>

        <Panel title="Rubrica de avaliacao" eyebrow="Qualidade">
          <div className="space-y-3 text-sm opacity-75">
            {evaluationRubric.length ? evaluationRubric.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.label}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">{item.weight}%</p>
                <p className="mt-2">{item.description}</p>
              </div>
            )) : <p>Nenhuma rubrica cadastrada.</p>}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Modo debate" eyebrow="Experimentos">
          <div className="space-y-3 text-sm opacity-75">
            {debateModes.length ? debateModes.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2">{item.description}</p>
              </div>
            )) : <p>Nenhum modo de debate cadastrado.</p>}
          </div>
        </Panel>

        <Panel title="Loop de aprendizado" eyebrow="Evolucao">
          <div className="space-y-3 text-sm opacity-75">
            {learningLoop.length ? learningLoop.map((item, index) => (
              <p key={`${item}-${index}`}>{index + 1}. {item}</p>
            )) : <p>Nenhum ciclo de aprendizado definido.</p>}
          </div>
        </Panel>

        <Panel title="Guardrails legais" eyebrow="Etica">
          <div className="space-y-3 text-sm opacity-75">
            {ethicsGuardrails.length ? ethicsGuardrails.map((item) => (
              <p key={item}>{item}</p>
            )) : <p>Nenhum guardrail cadastrado.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Trilhas de experimento" eyebrow="A/B e comparacao">
        <div className="grid gap-4 md:grid-cols-3 text-sm opacity-75">
          {experimentTracks.length ? experimentTracks.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2">{item.description}</p>
            </div>
          )) : <p>Nenhuma trilha de experimento cadastrada.</p>}
        </div>
      </Panel>
    </div>
  );
}
