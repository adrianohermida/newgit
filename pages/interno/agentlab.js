<<<<<<< HEAD
import { useEffect, useMemo } from "react";
=======
import Link from "next/link";
import { useMemo } from "react";
>>>>>>> codex/hmadv-tpu-fase53
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../lib/agentlab/useAgentLabData";
<<<<<<< HEAD
import { setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

function Metric({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl mb-2">{value}</p>
      {helper ? <p className="text-sm opacity-65 leading-relaxed">{helper}</p> : null}
=======

function formatDateTime(value) {
  if (!value) return "Sem sync";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function NumberStat({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(18,20,19,0.98),rgba(10,12,11,0.98))] p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="font-serif text-4xl leading-none">{value}</p>
      <p className="mt-3 text-sm leading-relaxed opacity-60">{helper}</p>
>>>>>>> codex/hmadv-tpu-fase53
    </div>
  );
}

<<<<<<< HEAD
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
=======
function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-5">
      {eyebrow ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#C5A059" }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-serif text-3xl">{title}</h3>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed opacity-60">{description}</p> : null}
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  const toneMap = {
    neutral: "border-[#2D2E2E] text-[#F4F1EA]",
    positive: "border-[#355E3B] text-[#CDE7D1]",
    warning: "border-[#6E5630] text-[#F2DEB5]",
  };

  return (
    <span className={`inline-flex border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${toneMap[tone] || toneMap.neutral}`}>
      {children}
    </span>
  );
}

function LoadingBlock({ children }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm">{children}</div>;
}

function AgentCard({ agent }) {
  return (
    <article className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusPill tone={agent.active ? "positive" : "warning"}>{agent.status}</StatusPill>
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{agent.type}</span>
      </div>
      <h4 className="font-serif text-2xl">{agent.name}</h4>
      <p className="mt-2 text-sm leading-relaxed opacity-60">
        {agent.description || "Agente interno catalogado no workspace, pronto para governanca e integracao gradual com o Freddy."}
      </p>
      <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Slug</p>
          <p className="mt-1 opacity-80">{agent.slug || "Nao definido"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Capacidades</p>
          <p className="mt-1 opacity-80">{agent.capabilities_count}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Uso</p>
          <p className="mt-1 opacity-80">{agent.usage_count}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Ultima atualizacao</p>
          <p className="mt-1 opacity-80">{formatDateTime(agent.updated_at)}</p>
        </div>
      </div>
    </article>
>>>>>>> codex/hmadv-tpu-fase53
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
<<<<<<< HEAD
          description="Laboratorio de inteligencia para treinar agentes, comparar provedores, validar guardrails e transformar correcoes em melhoria continua."
=======
          description="Cockpit administrativo para evoluir agentes, chatbot e recursos de CRM usados nas conversas de vendas e atendimento."
>>>>>>> codex/hmadv-tpu-fase53
        >
          <AgentLabModuleNav />
          <AgentLabContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgentLabContent({ state }) {
<<<<<<< HEAD
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
=======
  const overview = state.data?.overview;
  const agents = state.data?.agents || [];
  const coverage = state.data?.crm_sync?.coverage || [];
  const runs = state.data?.crm_sync?.recent_runs || [];
  const channels = state.data?.conversations?.channels || [];
  const recentConversations = state.data?.conversations?.recent || [];
  const warnings = state.data?.warnings || [];
  const planning = state.data?.planning || {};
  const training = state.data?.training || {};
  const intelligence = state.data?.intelligence || {};

  const syncHealthLabel = useMemo(() => {
    if (!overview?.last_sync_at) return "Sem sync ainda";
    return formatDateTime(overview.last_sync_at);
  }, [overview?.last_sync_at]);

  if (state.loading) {
    return <LoadingBlock>Carregando telemetria administrativa do AgentLab...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  return (
    <div className="space-y-10">
      <section className="border border-[#2D2E2E] bg-[linear-gradient(135deg,rgba(20,16,11,0.98),rgba(9,11,10,0.98))] px-6 py-7 md:px-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: "#C5A059" }}>
          Agent operations
        </p>
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <h3 className="max-w-3xl font-serif text-4xl leading-tight">
              Governanca de agentes, workflows e dados de CRM em uma camada propria do escritorio.
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-70">
              Esta primeira versao junta o catalogo de agentes internos, o espelho do Freshsales, os canais de conversa e o backlog de
              melhoria do Freddy em uma unica view administrativa.
            </p>
          </div>

          <div className="border border-[#3A3022] bg-[rgba(7,8,8,0.78)] p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Estado atual</p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="opacity-45">Ultimo sync CRM</p>
                <p className="mt-1 font-semibold">{syncHealthLabel}</p>
              </div>
              <div>
                <p className="opacity-45">Agentes ativos</p>
                <p className="mt-1 font-semibold">
                  {overview.active_agents}/{overview.total_agents}
                </p>
              </div>
              <div>
                <p className="opacity-45">Canais vistos no workspace</p>
                <p className="mt-1 font-semibold">{overview.conversation_channels}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <NumberStat label="Agentes mapeados" value={overview.total_agents} helper="Catalogados no workspace interno e prontos para governanca." />
        <NumberStat label="Entidades CRM" value={overview.crm_entities_synced} helper="Espelho local do Freshsales disponivel para consumo do AgentLab." />
        <NumberStat label="Perfis configurados" value={overview.configured_agent_profiles || 0} helper="Agentes com estrategia persistida de persona, conhecimento e handoff." />
        <NumberStat label="Fila viva" value={overview.improvement_queue_items || 0} helper="Melhorias em andamento para aumentar utilidade, eficiencia e seguranca do agente." />
        <NumberStat label="Treinos executados" value={overview.training_runs || 0} helper={`Score medio atual: ${overview.training_average_score || 0}. O laboratorio mede clareza, seguranca, qualificacao e handoff.`} />
        <NumberStat label="Incidentes abertos" value={overview.open_incidents || 0} helper={`Conversas importadas: ${overview.imported_conversations || 0}. A trilha de erros agora entra na governanca do AgentLab.`} />
        <NumberStat label="Runs de sync" value={overview.source_sync_runs || 0} helper="Mostra se a inteligencia conversacional esta sendo atualizada com frequencia suficiente." />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ModuleLink
          href="/interno/agentlab/evaluation"
          title="Evaluation"
          description="Fila semanal de unanswered, poor responses, intent gaps e tuning operacional."
        />
        <ModuleLink
          href="/interno/agentlab/knowledge"
          title="Knowledge"
          description="Pacotes de conhecimento, curadoria editorial e cobertura CRM para o Freddy."
        />
        <ModuleLink
          href="/interno/agentlab/workflows"
          title="Workflows"
          description="Backlog prioritario de skills, handoff rules e fluxos acionaveis."
        />
        <ModuleLink
          href="/interno/agentlab/training"
          title="Training"
          description="Centro de treino juridico com cenarios, scorecards e recomendacoes geradas por Workers AI."
        />
      </section>

      {warnings.length ? (
        <section className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#F2DEB5" }}>
            Avisos de fontes
          </p>
          <div className="space-y-3 text-sm">
            {warnings.map((warning) => (
              <div key={warning.source} className="border-t border-[rgba(255,255,255,0.08)] pt-3 first:border-t-0 first:pt-0">
                <p className="font-semibold">{warning.source}</p>
                <p className="mt-1 opacity-75">{warning.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div>
          <SectionHeader
            eyebrow="Registry"
            title="Agents"
            description="O AgentLab parte dos agentes ja existentes no workspace e da ownership operacional de cada um."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Coverage"
            title="Freshsales mirror"
            description="Cobertura atual do espelho CRM que vamos usar para enriquecer contexto de conversa, qualificacao e handoff."
          />
          <div className="space-y-4">
            {coverage.map((item) => (
              <article key={item.entity} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h4 className="font-serif text-2xl">{item.entity}</h4>
                  <StatusPill tone="positive">{item.total} registros</StatusPill>
                </div>
                <p className="mb-4 text-sm opacity-60">Ultimo sync: {formatDateTime(item.last_synced_at)}</p>
                <div className="space-y-2 text-sm opacity-75">
                  {item.sample_records.map((record) => (
                    <div key={`${item.entity}-${record.source_id}`} className="flex items-start justify-between gap-4 border-t border-[#202321] pt-2 first:border-t-0 first:pt-0">
                      <span>{record.display_name}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] opacity-45">{record.filter_name || "sem view"}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <SectionHeader
            eyebrow="Runbook"
            title="Sync health"
            description="Runs recentes do espelho Freshsales para acompanhar estabilidade e cobertura do CRM."
          />
          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]">
            <div className="grid grid-cols-[1.1fr_0.7fr_0.65fr_0.85fr] gap-3 border-b border-[#202321] px-5 py-3 text-[10px] uppercase tracking-[0.18em] opacity-45">
              <span>Entidade</span>
              <span>Status</span>
              <span>Sync</span>
              <span>Filtro</span>
            </div>
            <div>
              {runs.map((run) => (
                <div key={run.id} className="grid grid-cols-[1.1fr_0.7fr_0.65fr_0.85fr] gap-3 border-b border-[#202321] px-5 py-4 text-sm last:border-b-0">
                  <span>{run.entity}</span>
                  <span className="opacity-75">{run.status}</span>
                  <span className="opacity-75">{run.records_synced}</span>
                  <span className="opacity-55">{run.filter_name || "sem filtro"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Channels"
            title="Conversation footprint"
            description="Leitura inicial dos canais ja presentes no banco para orientar roteamento, resposta, handoff e analise de comportamento."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {channels.map((channel) => (
              <div key={channel.channel} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{channel.channel}</p>
                <p className="mt-3 font-serif text-4xl">{channel.total}</p>
                <p className="mt-3 text-sm opacity-60">{Object.keys(channel.statuses).join(", ")}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
              Conversas recentes
            </p>
            <div className="space-y-3">
              {recentConversations.slice(0, 6).map((conversation) => (
                <div key={conversation.id} className="border-t border-[#202321] pt-3 first:border-t-0 first:pt-0">
                  <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                    <span>{conversation.assunto || "Sem assunto"}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{conversation.canal}</span>
                  </div>
                  <p className="text-sm opacity-55">{conversation.ultima_mensagem || "Sem ultima mensagem registrada."}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
              Incidentes e sinais
            </p>
            <div className="space-y-3 text-sm opacity-70">
              <div>Incidentes abertos: {intelligence.summary?.open_incidents || 0}</div>
              <div>Handoffs observados: {intelligence.summary?.handoff_threads || 0}</div>
              <div>Top intents classificadas: {intelligence.summary?.top_intents?.length || 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div>
          <SectionHeader
            eyebrow="Workflow backlog"
            title="Proximos workflows Freddy"
            description="Fluxos que vao gerar maior impacto em conversao e resolucao quando levados para o AI Agent Studio."
          />
          <div className="space-y-4">
            {planning.workflow_backlog?.map((item) => (
              <article key={item.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <StatusPill tone={item.priority === "Alta" ? "warning" : "neutral"}>{item.priority}</StatusPill>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.owner}</span>
                </div>
                <h4 className="font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-60">{item.objective}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <SectionHeader
              eyebrow="Knowledge"
              title="Pacotes de conhecimento"
              description="Blocos editoriais que devem virar FAQ, arquivos, URLs e respostas predefinidas no Freddy."
            />
            <div className="space-y-4">
              {planning.knowledge_packs?.map((item) => (
                <article key={item.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.sourceType}</p>
                  <h4 className="mt-2 font-serif text-2xl">{item.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-60">{item.goal}</p>
                </article>
              ))}
            </div>
          </div>

          <div>
            <SectionHeader
              eyebrow="Response design"
              title="Playbooks de resposta"
              description="Regras curtas para melhorar abertura, coleta, fallback e transferencia dos agentes."
            />
            <div className="space-y-4">
              {planning.response_playbooks?.map((item) => (
                <article key={item.title} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                  <h4 className="font-serif text-2xl">{item.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-60">{item.rule}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div>
          <SectionHeader
            eyebrow="Training center"
            title="Laboratorio de treino"
            description="Cenarios juridicos controlados ajudam a calibrar persona, conhecimento, fluxo, qualificacao e handoff antes de levar o ajuste para o Freddy."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Cenarios</p>
              <p className="mt-3 font-serif text-4xl">{training.summary?.total_scenarios || 0}</p>
              <p className="mt-3 text-sm opacity-60">Biblioteca de simulacoes juridico-comerciais versionada no AgentLab.</p>
            </div>
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Pass rate</p>
              <p className="mt-3 font-serif text-4xl">{training.summary?.pass_rate || 0}%</p>
              <p className="mt-3 text-sm opacity-60">Acompanha se o agente passa no padrao minimo de seguranca e utilidade.</p>
            </div>
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Media geral</p>
              <p className="mt-3 font-serif text-4xl">{training.summary?.average_score || 0}</p>
              <p className="mt-3 text-sm opacity-60">Score sintetico para medir a qualidade real do agente em cenarios ruins.</p>
            </div>
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Evaluation"
            title="Fila de melhoria semanal"
            description="Mesmo antes da API do Freddy expor tudo, o AgentLab ja opera com backlog claro de avaliacao e tuning."
          />
          <div className="space-y-4">
            {planning.evaluation_backlog?.map((item) => (
              <article key={item.title} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                <h4 className="font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-60">{item.objective}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
              Sprint semanal recomendado
            </p>
            <div className="space-y-3">
              {planning.weekly_sprints?.map((item) => (
                <div key={item} className="border-t border-[#202321] pt-3 text-sm first:border-t-0 first:pt-0">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <SectionHeader
            eyebrow="Rollout"
            title="Fases do programa"
            description="O painel agora ja espelha o rollout incremental para guiar implementacao, operacao e treinamento."
          />
          <div className="space-y-4">
            {planning.rollout_phases?.map((phase) => (
              <article key={phase.phase} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
                    {phase.phase}
                  </p>
                  <StatusPill>{phase.title}</StatusPill>
                </div>
                <div className="space-y-2 text-sm opacity-70">
                  {phase.deliverables?.map((deliverable) => (
                    <div key={deliverable} className="border-t border-[#202321] pt-2 first:border-t-0 first:pt-0">
                      {deliverable}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Roadmap"
          title="Modulos do dashboard"
          description="A V1 nasce como cockpit. As proximas iteracoes aprofundam governanca, treinamento e analise operacional."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {planning.dashboard_modules?.map((item) => (
            <article key={item.title} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <h4 className="font-serif text-2xl">{item.title}</h4>
              <p className="mt-3 text-sm leading-relaxed opacity-60">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleLink({ href, title, description }) {
  return (
    <Link href={href} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 transition-colors hover:border-[#C5A059]">
      <h4 className="font-serif text-2xl">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed opacity-60">{description}</p>
    </Link>
  );
}
>>>>>>> codex/hmadv-tpu-fase53
