import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.92)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function StatCard({ title, helper }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <Panel title={title}>
      <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>{helper}</p>
    </Panel>
  );
}

export default function AgentLabEvaluationPage() {
  const state = useAgentLabData();
  const [message, setMessage] = useState(null);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Avaliacao"
          description="Fila gerencial de unanswered, poor responses, incidentes, rubrica de qualidade e melhoria semanal do agente."
        >
          <AgentLabModuleNav />
          <EvaluationContent state={state} message={message} setMessage={setMessage} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function EvaluationContent({ state, message, setMessage }) {
  const { isLightTheme } = useInternalTheme();
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
    return <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando avaliacao...</div>;
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

  const boxTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";
  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const actionTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#374151] hover:border-[#9a6d14] hover:text-[#9a6d14]"
    : "border-[#2D2E2E]";

  return (
    <div className="space-y-8">
      {message ? <div className={`border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] opacity-80"}`}>{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title={`Incidentes abertos: ${summary.open || 0}`} helper="Falhas em classificacao, coerencia, seguranca juridica e operacao." />
        <StatCard title={`Gaps de intent: ${unresolvedThreads.length}`} helper="Conversas sem intencao classificada e prontas para treino ou correcao." />
        <StatCard title={`Backlog de avaliacao: ${backlog.length}`} helper="Itens que ja viraram trabalho operacional para a sprint de evolucao." />
        <StatCard title={`Sinais de mensagem: ${messageSummary.qualityEvents || 0}`} helper="Mensagens com baixa qualidade, handoff generico, risco operacional ou perda de contexto." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Cadencia semanal">
          <ul className={`space-y-3 text-sm ${muted}`}>
            <li>Top 20 unanswered</li>
            <li>Top 10 poor responses</li>
            <li>Top 5 workflows novos</li>
            <li>Top 10 conteudos novos</li>
          </ul>
        </Panel>

        <Panel title="Categorias de incidente">
          <div className={`space-y-3 text-sm ${muted}`}>
            {(summary.byCategory || []).length ? (
              summary.byCategory.map((item) => <p key={item.label}>{item.label}: {item.value}</p>)
            ) : (
              <p>Sem categorias consolidadas no momento.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Incidentes abertos">
        <div className={`space-y-4 text-sm ${muted}`}>
          {incidents.length ? incidents.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                <span>{item.category}</span>
                <span>{item.severity}</span>
                <span>{item.status}</span>
              </div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => createBacklogFromIncident(item)} className={`border px-3 py-2 text-xs transition ${actionTone}`}>
                  Virar backlog
                </button>
                <button type="button" onClick={() => moveIncident(item.id, "reviewing")} className={`border px-3 py-2 text-xs transition ${actionTone}`}>
                  Em revisao
                </button>
                <button type="button" onClick={() => moveIncident(item.id, "resolved")} className={`border px-3 py-2 text-xs transition ${actionTone}`}>
                  Resolver
                </button>
              </div>
            </div>
          )) : <p>Nenhum incidente aberto no momento.</p>}
        </div>
      </Panel>

      <Panel title="Conversas sem intent para treino">
        <div className={`space-y-4 text-sm ${muted}`}>
          {unresolvedThreads.length ? unresolvedThreads.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                <span>{item.channel || "sem canal"}</span>
                <span>{item.source_system || "sem origem"}</span>
                <span>{item.issue_category || "gap"}</span>
              </div>
              <p className="font-semibold">{item.subject || "Sem assunto"}</p>
              <p className="mt-2">{item.last_message || "Sem ultima mensagem"}</p>
              <div className="mt-4">
                <button type="button" onClick={() => createBacklogFromThread(item)} className={`border px-3 py-2 text-xs transition ${actionTone}`}>
                  Criar backlog de treino
                </button>
              </div>
            </div>
          )) : <p>Nao ha gaps de classificacao neste momento.</p>}
        </div>
      </Panel>

      <Panel title="Backlog de avaliacao">
        <div className={`space-y-4 text-sm ${muted}`}>
          {backlog.length ? backlog.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
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
        <div className={`space-y-4 text-sm ${muted}`}>
          {riskyMessages.length ? riskyMessages.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
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
    </div>
  );
}
