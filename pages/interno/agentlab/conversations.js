import { useState } from "react";
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

export default function AgentLabConversationsPage() {
  const state = useAgentLabData();
  const [syncState, setSyncState] = useState({ loading: false, message: null });

  async function runSync(action, limit = 5, threadLimit = 2) {
    try {
      setSyncState({ loading: true, message: null });
      const payload = await adminFetch("/api/admin-agentlab-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, limit, thread_limit: threadLimit }),
      });
      setSyncState({
        loading: false,
        message: payload.result?.message || JSON.stringify(payload.result),
      });
      state.refresh();
    } catch (error) {
      setSyncState({ loading: false, message: error.message });
    }
  }

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab | Conversas"
          description="Painel de inteligencia conversacional com sync incremental de conversas internas, Freshsales e Freshchat para treino, avaliacao e feedback loop."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} syncState={syncState} runSync={runSync} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function ConversationsContent({ state, syncState, runSync }) {
  if (state.loading) {
    return (
      <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
        Carregando conversas...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">
        {state.error}
      </div>
    );
  }

  const conversations = state.data?.conversations?.primaryThreads || state.data?.conversations?.threads || [];
  const crmSignals = state.data?.conversations?.crmSignals || [];
  const recentMessages = state.data?.conversations?.messages || [];
  const widgetEvents = state.data?.conversations?.widgetEvents || [];
  const widgetEventSummary = state.data?.conversations?.widgetEventSummary || {};
  const incidents = state.data?.intelligence?.incidents || [];
  const summary = state.data?.conversations?.summary || {};
  const syncRuns = state.data?.intelligence?.syncRuns || [];
  const environment = state.data?.environment || {};
  const syncBlocked = environment.mode === "degraded";

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Panel title={`Threads: ${summary.total || 0}`}>
          <p className="text-sm opacity-70">Base de treino e analise operacional.</p>
        </Panel>
        <Panel title={`Handoffs: ${summary.handoffs || 0}`}>
          <p className="text-sm opacity-70">Escalacoes detectadas nas threads importadas.</p>
        </Panel>
        <Panel title={`Erros: ${summary.withErrors || 0}`}>
          <p className="text-sm opacity-70">Conversas com risco de falha operacional.</p>
        </Panel>
        <Panel title={`Incidentes: ${state.data?.intelligence?.summary?.open || 0}`}>
          <p className="text-sm opacity-70">Fila gerencial aberta para correcao.</p>
        </Panel>
      </div>

      <Panel title="Pipeline de sync">
        {syncBlocked ? (
          <div className="mb-4 border border-[#2D2E2E] p-4 text-sm opacity-75">
            <p>{environment.message}</p>
            <p className="mt-2">
              Neste modo, o painel mostra dados de fallback e o sync local fica desabilitado ate
              o schema principal estar alinhado.
            </p>
            <p className="mt-2">
              Aplique o bundle{" "}
              <a
                href="/docs/agentlab-bootstrap-supabase.sql"
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                agentlab-bootstrap-supabase.sql
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="mb-4 border border-[#2D2E2E] p-4 text-sm opacity-75">
            Cada execucao sincroniza apenas um lote curto e salva checkpoint no Supabase para
            evitar o limite de subrequests do Cloudflare Worker.
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_workspace_conversations", 5)}
            className="border border-[#2D2E2E] px-4 py-3 text-sm disabled:opacity-40"
          >
            Sincronizar legado opcional
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshsales_activities", 5)}
            className="border border-[#2D2E2E] px-4 py-3 text-sm disabled:opacity-40"
          >
            Sincronizar Freshsales
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshchat_conversations", 5)}
            className="border border-[#2D2E2E] px-4 py-3 text-sm disabled:opacity-40"
          >
            Sincronizar Freshchat
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshchat_messages", 20, 2)}
            className="border border-[#2D2E2E] px-4 py-3 text-sm disabled:opacity-40"
          >
            Sincronizar mensagens
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
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.channel}</span>
                  <span>{item.status}</span>
                  <span>{item.source_system}</span>
                </div>
                <p className="mb-2 font-semibold">{item.subject || "Sem assunto"}</p>
                <p className="mb-2 text-sm opacity-75">{item.last_message || "Sem mensagem"}</p>
                <p className="text-xs opacity-50">
                  Intent: {item.intent_label || "nao classificada"} | Gap:{" "}
                  {item.issue_category || "n/a"}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Incidentes e runs">
          <div className="mb-6 space-y-4">
            {incidents.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.category}</span>
                  <span>{item.severity}</span>
                  <span>{item.status}</span>
                </div>
                <p className="mb-2 font-semibold">{item.title}</p>
                <p className="text-sm opacity-75">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 text-sm opacity-75">
            {syncRuns.map((item) => (
              <p key={item.id}>
                {item.source_name} | {item.sync_scope} | {item.status} |{" "}
                {item.records_synced || 0}
              </p>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={`Mensagens recentes do Freshchat (${recentMessages.length})`}>
        <div className="mb-4 text-sm opacity-75">
          Este bloco mostra mensagens reais importadas do Freshchat para treino, auditoria e analise do desempenho do chatbot e do agente de IA.
        </div>
        <div className="space-y-4">
          {recentMessages.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.source_system}</span>
                <span>{item.role || item.actor_type || "unknown"}</span>
                <span>{item.message_type || "normal"}</span>
                <span>{item.suggested_agent_ref || "sem agente"}</span>
                <span>{item.source_conversation_id}</span>
              </div>
              <p className="text-sm opacity-75">{item.body_text || "Sem texto"}</p>
              {(item.quality_signals || []).length ? (
                <p className="mt-2 text-xs opacity-50">
                  Sinais: {item.quality_signals.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Telemetria do widget (${widgetEvents.length})`}>
        <div className="mb-4 grid gap-3 md:grid-cols-4 text-sm opacity-75">
          <p>Eventos: {widgetEventSummary.total || 0}</p>
          <p>Aberturas: {widgetEventSummary.openedCount || 0}</p>
          <p>Auth: {widgetEventSummary.authCount || 0}</p>
          <p>Falhas: {widgetEventSummary.failureCount || 0}</p>
        </div>
        {(widgetEventSummary.byEvent || []).length ? (
          <div className="mb-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
            {widgetEventSummary.byEvent.slice(0, 6).map((item) => (
              <span key={item.label}>
                {item.label}: {item.value}
              </span>
            ))}
          </div>
        ) : null}
        <div className="space-y-4">
          {widgetEvents.length ? (
            widgetEvents.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.event_name || "evento"}</span>
                  <span>{item.identity_mode || "visitor"}</span>
                  <span>{item.widget_state || "n/a"}</span>
                  <span>{item.success === true ? "ok" : item.success === false ? "falha" : "neutro"}</span>
                </div>
                <p className="text-sm opacity-75">
                  Rota: {item.route_path || "/"}{item.reference_id ? ` | Ref: ${item.reference_id}` : ""}
                </p>
                {item.created_at ? (
                  <p className="mt-2 text-xs opacity-50">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm opacity-75">
              Ainda nao ha eventos do widget gravados. Assim que o chat abrir, autenticar ou falhar, eles aparecerao aqui.
            </p>
          )}
        </div>
      </Panel>

      <Panel title={`Sinais de CRM fora da conversa (${crmSignals.length})`}>
        <div className="mb-4 text-sm opacity-75">
          Publicacoes, andamentos e outros registros do Freshsales ficam aqui apenas como contexto operacional. Eles nao entram como conversa principal do chatbot.
        </div>
        <div className="space-y-4">
          {crmSignals.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.source_system}</span>
                <span>{item.metadata?.type_name || item.channel}</span>
                <span>{item.status}</span>
              </div>
              <p className="mb-2 font-semibold">{item.subject || "Sem assunto"}</p>
              <p className="text-sm opacity-75">{item.last_message || "Sem detalhe"}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
