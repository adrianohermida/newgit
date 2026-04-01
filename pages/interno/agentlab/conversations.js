import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabConversationsPage() {
  const state = useAgentLabData();
  const [syncRuns, setSyncRuns] = useState([]);
  const [syncState, setSyncState] = useState({ loading: false, message: null });

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin-agentlab-sync")
      .then((payload) => {
        if (!cancelled) setSyncRuns(payload.runs || []);
      })
      .catch(() => {
        if (!cancelled) setSyncRuns([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function runSync(action) {
    try {
      setSyncState({ loading: true, message: null });
      const payload = await adminFetch("/api/admin-agentlab-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setSyncState({ loading: false, message: JSON.stringify(payload.result) });
    } catch (error) {
      setSyncState({ loading: false, message: error.message });
    }
  }

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Conversations"
          description="Painel de inteligencia conversacional com sync de conversas internas e atividades do Freshsales."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} syncRuns={syncRuns} syncState={syncState} runSync={runSync} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function ConversationsContent({ state, syncRuns, syncState, runSync }) {
  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando conversas...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const conversations = state.data?.conversations?.threads || [];
  const incidents = state.data?.intelligence?.incidents || [];
  const summary = state.data?.conversations?.summary || {};

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Panel title={`Threads: ${summary.total || 0}`}><p className="text-sm opacity-70">Base de treino e analise operacional.</p></Panel>
        <Panel title={`Handoffs: ${summary.handoffs || 0}`}><p className="text-sm opacity-70">Escalacoes detectadas nas threads importadas.</p></Panel>
        <Panel title={`Erros: ${summary.withErrors || 0}`}><p className="text-sm opacity-70">Conversas com risco de falha operacional.</p></Panel>
        <Panel title={`Incidentes: ${state.data?.intelligence?.summary?.open || 0}`}><p className="text-sm opacity-70">Fila gerencial aberta para correcao.</p></Panel>
      </div>

      <Panel title="Pipeline de sync">
        <div className="flex flex-wrap gap-3 mb-4">
          <button type="button" onClick={() => runSync("sync_workspace_conversations")} className="border border-[#2D2E2E] px-4 py-3 text-sm">
            Sincronizar legado
          </button>
          <button type="button" onClick={() => runSync("sync_freshsales_activities")} className="border border-[#2D2E2E] px-4 py-3 text-sm">
            Sincronizar Freshsales
          </button>
        </div>
        {syncState.loading ? <p className="text-sm opacity-70">Executando sync...</p> : null}
        {syncState.message ? <p className="text-sm opacity-70">{syncState.message}</p> : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Conversas recentes">
          <div className="space-y-4">
            {conversations.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="flex flex-wrap gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.channel}</span>
                  <span>{item.status}</span>
                  <span>{item.source_system}</span>
                </div>
                <p className="font-semibold mb-2">{item.subject || "Sem assunto"}</p>
                <p className="text-sm opacity-75 mb-2">{item.last_message || "Sem mensagem"}</p>
                <p className="text-xs opacity-50">Intent: {item.intent_label || "nao classificada"} · Gap: {item.issue_category || "n/a"}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Incidentes e runs">
          <div className="space-y-4 mb-6">
            {incidents.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="flex flex-wrap gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.category}</span>
                  <span>{item.severity}</span>
                  <span>{item.status}</span>
                </div>
                <p className="font-semibold mb-2">{item.title}</p>
                <p className="text-sm opacity-75">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 text-sm opacity-75">
            {syncRuns.map((item) => (
              <p key={item.id}>
                {item.source_name} · {item.sync_scope} · {item.status} · {item.records_synced || 0}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
