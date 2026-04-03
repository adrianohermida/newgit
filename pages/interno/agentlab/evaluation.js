import { useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
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
          description="Fila gerencial de unanswered, poor responses, incidentes e melhoria semanal do agente."
        >
          <AgentLabModuleNav />
          <EvaluationContent state={state} message={message} setMessage={setMessage} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function EvaluationContent({ state, message, setMessage }) {
  const incidents = state.data?.intelligence?.incidents || [];
  const queue = state.data?.governance?.queue || [];
  const threads = state.data?.conversations?.threads || [];
  const summary = state.data?.intelligence?.summary || {};
  const unresolvedThreads = useMemo(() => threads.filter((item) => !item.intent_label), [threads]);
  const backlog = useMemo(() => queue.filter((item) => item.category === "evaluation"), [queue]);

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
        <Panel title={`Incidentes abertos: ${summary.open || 0}`}><p className="text-sm opacity-75">Falhas em classificacao, fluxo, cobertura e operacao.</p></Panel>
        <Panel title={`Gaps de intent: ${unresolvedThreads.length}`}><p className="text-sm opacity-75">Conversas sem intencao classificada e prontas para treino.</p></Panel>
        <Panel title={`Backlog de avaliacao: ${backlog.length}`}><p className="text-sm opacity-75">Itens que ja viraram trabalho operacional para a sprint.</p></Panel>
        <Panel title={`Categorias: ${(summary.byCategory || []).length}`}><p className="text-sm opacity-75">Visao agrupada dos problemas recorrentes do agente.</p></Panel>
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
    </div>
  );
}
