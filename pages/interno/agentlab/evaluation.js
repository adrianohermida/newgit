<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
=======
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function SectionCard({ title, description, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-3xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-60">{description}</p>
      <div className="mt-5">{children}</div>
>>>>>>> codex/hmadv-tpu-fase53
    </section>
  );
}

<<<<<<< HEAD
export default function AgentLabEvaluationPage() {
  const state = useAgentLabData();
  const [message, setMessage] = useState(null);
=======
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

export default function AgentLabEvaluationPage() {
  const state = useAgentLabData();
>>>>>>> codex/hmadv-tpu-fase53

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
<<<<<<< HEAD
          title="AgentLab · Avaliacao"
          description="Fila gerencial de unanswered, poor responses, incidentes, rubrica de qualidade e melhoria semanal do agente."
        >
          <AgentLabModuleNav />
          <EvaluationContent state={state} message={message} setMessage={setMessage} />
=======
          title="AgentLab Evaluation"
          description="Painel de governanca para acompanhar lacunas de resposta, erros operacionais, prioridades de tuning e a cadencia semanal de melhoria do agente."
        >
          <AgentLabModuleNav />
          <EvaluationContent state={state} />
>>>>>>> codex/hmadv-tpu-fase53
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

<<<<<<< HEAD
function EvaluationContent({ state, message, setMessage }) {
  const incidents = state.data?.intelligence?.incidents || [];
  const queue = state.data?.governance?.queue || [];
  const threads = state.data?.conversations?.threads || [];
  const summary = state.data?.intelligence?.summary || {};
  const messageSummary = state.data?.intelligence?.messageSummary || {};
  const messages = state.data?.conversations?.messages || [];
  const unresolvedThreads = useMemo(() => threads.filter((item) => !item.intent_label), [threads]);
  const backlog = useMemo(() => queue.filter((item) => item.category === "evaluation"), [queue]);
  const riskyMessages = useMemo(
    () => messages.filter((item) => Array.isArray(item.quality_signals) && item.quality_signals.length).slice(0, 12),
    [messages]
  );

  useEffect(() => {
    setModuleHistory(
      "agentlab-evaluation",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/evaluation",
        loading: state.loading,
        error: state.error,
        section: "evaluation",
        openIncidents: summary.open || 0,
        unresolvedThreads: unresolvedThreads.length,
        backlog: backlog.length,
        riskyMessages: riskyMessages.length,
        message: message || null,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [
    backlog.length,
    message,
    riskyMessages.length,
    state.error,
    state.loading,
    summary.open,
    unresolvedThreads.length,
  ]);

  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando avaliacao...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  async function moveIncident(id, status) {
    try {
      setMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_incident_item",
          id,
          status,
        }),
      });
      setMessage("Incidente atualizado.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createBacklogFromIncident(incident) {
    try {
      setMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_queue_item",
          agent_ref: incident.agent_ref || "dotobot-ai",
          category: "evaluation",
          title: `Tratar incidente: ${incident.title}`,
          description: incident.description,
          priority: incident.severity === "alta" ? "alta" : "media",
          status: "backlog",
          source_channel: "evaluation-center",
          sprint_bucket: "Sprint atual",
          metadata: {
            incident_id: incident.id,
            category: incident.category,
          },
        }),
      });
      setMessage("Item de backlog criado a partir do incidente.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createBacklogFromThread(thread) {
    try {
      setMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_queue_item",
          agent_ref: "dotobot-ai",
          category: "evaluation",
          title: `Classificar conversa: ${thread.subject || "sem assunto"}`,
          description: thread.last_message || "Conversa sem intent_label.",
          priority: thread.issue_category === "processual" ? "alta" : "media",
          status: "backlog",
          source_channel: "conversation-intelligence",
          sprint_bucket: "Sprint atual",
          metadata: {
            conversation_id: thread.id,
            source_system: thread.source_system,
            channel: thread.channel,
          },
        }),
      });
      setMessage("Gap de conversa enviado para backlog.");
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="space-y-8">
      {message ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm opacity-80">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Panel title={`Incidentes abertos: ${summary.open || 0}`}><p className="text-sm opacity-75">Falhas em classificacao, coerencia, seguranca juridica e operacao.</p></Panel>
        <Panel title={`Gaps de intent: ${unresolvedThreads.length}`}><p className="text-sm opacity-75">Conversas sem intencao classificada e prontas para treino ou correcao.</p></Panel>
        <Panel title={`Backlog de avaliacao: ${backlog.length}`}><p className="text-sm opacity-75">Itens que ja viraram trabalho operacional para a sprint de evolucao.</p></Panel>
        <Panel title={`Sinais de mensagem: ${messageSummary.qualityEvents || 0}`}><p className="text-sm opacity-75">Mensagens com baixa qualidade, handoff generico, risco operacional ou perda de contexto.</p></Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cadencia semanal">
          <ul className="space-y-3 text-sm opacity-75">
            <li>Top 20 unanswered</li>
            <li>Top 10 poor responses</li>
            <li>Top 5 workflows novos</li>
            <li>Top 10 conteudos novos</li>
          </ul>
        </Panel>

        <Panel title="Categorias de incidente">
          <div className="space-y-3 text-sm opacity-75">
            {(summary.byCategory || []).length ? (
              summary.byCategory.map((item) => <p key={item.label}>{item.label}: {item.value}</p>)
            ) : (
              <p>Sem categorias consolidadas no momento.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Incidentes abertos">
        <div className="space-y-4 text-sm opacity-75">
          {incidents.length ? incidents.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.category}</span>
                <span>{item.severity}</span>
                <span>{item.status}</span>
              </div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => createBacklogFromIncident(item)} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Virar backlog
                </button>
                <button type="button" onClick={() => moveIncident(item.id, "reviewing")} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Em revisao
                </button>
                <button type="button" onClick={() => moveIncident(item.id, "resolved")} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Resolver
                </button>
              </div>
            </div>
          )) : <p>Nenhum incidente aberto no momento.</p>}
        </div>
      </Panel>

      <Panel title="Conversas sem intent para treino">
        <div className="space-y-4 text-sm opacity-75">
          {unresolvedThreads.length ? unresolvedThreads.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.channel || "sem canal"}</span>
                <span>{item.source_system || "sem origem"}</span>
                <span>{item.issue_category || "gap"}</span>
              </div>
              <p className="font-semibold">{item.subject || "Sem assunto"}</p>
              <p className="mt-2">{item.last_message || "Sem ultima mensagem"}</p>
              <div className="mt-4">
                <button type="button" onClick={() => createBacklogFromThread(item)} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Criar backlog de treino
                </button>
              </div>
            </div>
          )) : <p>Nao ha gaps de classificacao neste momento.</p>}
        </div>
      </Panel>

      <Panel title="Backlog de avaliacao">
        <div className="space-y-4 text-sm opacity-75">
          {backlog.length ? backlog.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.priority}</span>
                <span>{item.status}</span>
                <span>{item.sprint_bucket || "Sem sprint"}</span>
              </div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2">{item.description}</p>
            </div>
          )) : <p>Nenhum item de avaliacao no backlog ainda.</p>}
        </div>
      </Panel>

      <Panel title="Mensagens com risco operacional">
        <div className="space-y-4 text-sm opacity-75">
          {riskyMessages.length ? riskyMessages.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.role}</span>
                <span>{item.suggested_agent_ref}</span>
                <span>{item.source_system}</span>
                <span>{(item.quality_signals || []).join(", ")}</span>
              </div>
              <p className="font-semibold">{item.thread_subject || "Mensagem sem thread"}</p>
              <p className="mt-2">{item.body_text || "Sem texto"}</p>
            </div>
          )) : <p>Nenhuma mensagem de risco consolidada ainda.</p>}
        </div>
      </Panel>
=======
function EvaluationContent({ state }) {
  if (state.loading) {
    return <LoadingBlock>Carregando backlog de evaluation...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const planning = state.data?.planning || {};
  const overview = state.data?.overview || {};
  const channels = state.data?.conversations?.channels || [];
  const intelligence = state.data?.intelligence || {};
  const incidentSummary = intelligence.summary || {};
  const incidents = intelligence.incidents || [];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Perguntas sem resposta" value="20" helper="Meta da sprint semanal para virar conteudo, regra ou workflow." />
        <Metric label="Respostas ruins" value="10" helper="Fila de tuning de copia, persona e handoff." />
        <Metric label="Conversas importadas" value={overview.imported_conversations || 0} helper="Base real de conversas para treinar o agente e entender comportamento." />
        <Metric label="Incidentes abertos" value={incidentSummary.open_incidents || 0} helper="Falhas do agente ou da operacao que precisam virar correcao objetiva." />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Fila de melhoria"
          description="Backlog operacional para revisar consultas mal atendidas e transformar falhas em evolucao de produto."
        >
          <div className="space-y-4">
            {planning.evaluation_backlog?.map((item) => (
              <article key={item.title} className="border border-[#202321] p-4">
                <h4 className="font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{item.objective}</p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Sprint semanal"
          description="Ritmo recomendado para o time manter melhoria continua sem perder foco comercial."
        >
          <div className="space-y-3">
            {planning.weekly_sprints?.map((item) => (
              <div key={item} className="border-t border-[#202321] pt-3 text-sm first:border-t-0 first:pt-0">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Leitura por canal"
          description="Sem depender apenas da API do Freddy, a inteligencia conversacional ja mostra onde comecar a investigar gargalos."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {channels.map((channel) => (
              <div key={channel.channel} className="border border-[#202321] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{channel.channel}</p>
                <p className="mt-3 font-serif text-4xl">{channel.total}</p>
                <p className="mt-2 text-sm opacity-60">{Object.keys(channel.statuses || {}).join(", ") || "Sem status"}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Critério de triagem"
          description="Toda consulta ou falha deve cair em uma destas saidas de melhoria dentro do AgentLab."
        >
          <div className="space-y-3 text-sm opacity-70">
            <div>Virou knowledge pack novo ou ajuste de fonte existente.</div>
            <div>Virou workflow acionavel com trigger phrase e handoff rule.</div>
            <div>Virou ajuste de persona, abertura, fallback ou transferencia.</div>
            <div>Virou regra comercial baseada em CRM, jornada, sequencia ou canal.</div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Gestão de erros e incidentes"
        description="Essa trilha gerencial mostra onde a IA falha, onde o humano falha e onde o fluxo inteiro precisa ser redesenhado."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Handoffs observados" value={incidentSummary.handoff_threads || 0} helper="Ajuda a medir gargalo entre IA e humano." />
          <Metric label="Incidentes totais" value={incidentSummary.total_incidents || incidents.length} helper="Fila de erros de agente, processo e operacao interna." />
          <Metric label="Canais monitorados" value={overview.conversation_channels || 0} helper="Base minima para priorizar gaps por origem." />
        </div>

        <div className="mt-6 space-y-4">
          {incidents.length ? (
            incidents.slice(0, 8).map((incident) => (
              <article key={incident.id} className="border border-[#202321] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#F2DEB5]">
                    {incident.severity}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{incident.category}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{incident.status}</span>
                </div>
                <h4 className="font-serif text-2xl">{incident.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{incident.description || "Sem descricao detalhada."}</p>
              </article>
            ))
          ) : (
            <div className="text-sm opacity-60">
              Ainda nao existem incidentes registrados. A nova API de intelligence ja esta pronta para receber erros do agente, erros do usuario interno, falhas de handoff e problemas operacionais vindos de Freshchat/Freshsales.
            </div>
          )}
        </div>
      </SectionCard>
>>>>>>> codex/hmadv-tpu-fase53
    </div>
  );
}
