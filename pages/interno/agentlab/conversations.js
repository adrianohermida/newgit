import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

function StatCard({ title, helper }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <Panel title={title}>
      <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{helper}</p>
    </Panel>
  );
}

export default function AgentLabConversationsPage() {
  const router = useRouter();
  const state = useAgentLabData();
  const [syncState, setSyncState] = useState({ loading: false, message: null });
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");

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
          description="Painel de inteligencia conversacional para sincronizar historico real, detectar falhas de leitura e alimentar treino, avaliacao e feedback loop."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} syncState={syncState} runSync={runSync} copilotContext={copilotContext} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function ConversationsContent({ state, syncState, runSync, copilotContext }) {
  const { isLightTheme } = useInternalTheme();

  if (state.loading) {
    return (
      <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
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

  useEffect(() => {
    setModuleHistory(
      "agentlab-conversations",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/conversations",
        loading: state.loading,
        error: state.error,
        section: "conversations",
        syncBlocked,
        syncLoading: syncState.loading,
        conversations: conversations.length,
        recentMessages: recentMessages.length,
        widgetEvents: widgetEvents.length,
        incidents: incidents.length,
        crmSignals: crmSignals.length,
        summary,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [
    conversations.length,
    crmSignals.length,
    incidents.length,
    recentMessages.length,
    state.error,
    state.loading,
    summary,
    syncBlocked,
    syncState.loading,
    widgetEvents.length,
  ]);

  const boxTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";
  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const actionTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#374151] hover:border-[#9a6d14] hover:text-[#9a6d14]"
    : "border-[#2D2E2E]";

  return (
    <div className="space-y-8">
      {copilotContext ? (
        <Panel title="Contexto vindo do Copilot">
          <div className={`space-y-2 text-sm ${muted}`}>
            <p className="font-semibold">{copilotContext.conversationTitle || "Conversa ativa"}</p>
            {copilotContext.mission ? <p>{copilotContext.mission}</p> : null}
            <p>Use esta trilha para revisar threads, handoffs e mensagens reais associadas a missao atual.</p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title={`Threads: ${summary.total || 0}`} helper="Base de treino, leitura contextual e analise operacional." />
        <StatCard title={`Handoffs: ${summary.handoffs || 0}`} helper="Escalacoes detectadas nas threads importadas." />
        <StatCard title={`Erros: ${summary.withErrors || 0}`} helper="Conversas com risco de falha operacional ou leitura imprecisa." />
        <StatCard title={`Incidentes: ${state.data?.intelligence?.summary?.open || 0}`} helper="Fila gerencial aberta para correcao." />
      </div>

      <Panel title="Pipeline de sync">
        {syncBlocked ? (
          <div className={`mb-4 border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] opacity-75"}`}>
            <p>{environment.message}</p>
            <p className="mt-2">
              Neste modo, o painel mostra dados de fallback e o sync local fica desabilitado ate o schema principal estar alinhado.
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
          <div className={`mb-4 border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] opacity-75"}`}>
            Cada execucao sincroniza um lote curto, salva checkpoint no Supabase e protege o fluxo contra excesso de subrequests.
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_workspace_conversations", 5)}
            className={`border px-4 py-3 text-sm transition disabled:opacity-40 ${actionTone}`}
          >
            Sincronizar legado
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshsales_activities", 5)}
            className={`border px-4 py-3 text-sm transition disabled:opacity-40 ${actionTone}`}
          >
            Sincronizar Freshsales
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshchat_conversations", 5)}
            className={`border px-4 py-3 text-sm transition disabled:opacity-40 ${actionTone}`}
          >
            Sincronizar Freshchat
          </button>
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_freshchat_messages", 20, 2)}
            className={`border px-4 py-3 text-sm transition disabled:opacity-40 ${actionTone}`}
          >
            Sincronizar mensagens
          </button>
        </div>

        {syncState.loading ? <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>Executando sync...</p> : null}
        {syncState.message ? <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{syncState.message}</p> : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Conversas recentes">
          <div className="space-y-4">
            {conversations.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                  <span>{item.channel}</span>
                  <span>{item.status}</span>
                  <span>{item.source_system}</span>
                </div>
                <p className="mb-2 font-semibold">{item.subject || "Sem assunto"}</p>
                <p className={`mb-2 text-sm ${muted}`}>{item.last_message || "Sem mensagem"}</p>
                <p className={`text-xs ${subtle}`}>
                  Intent: {item.intent_label || "nao classificada"} | Gap: {item.issue_category || "n/a"}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Incidentes e runs">
          <div className="mb-6 space-y-4">
            {incidents.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                  <span>{item.category}</span>
                  <span>{item.severity}</span>
                  <span>{item.status}</span>
                </div>
                <p className="mb-2 font-semibold">{item.title}</p>
                <p className={`text-sm ${muted}`}>{item.description}</p>
              </div>
            ))}
          </div>

          <div className={`space-y-3 text-sm ${muted}`}>
            {syncRuns.map((item) => (
              <p key={item.id}>
                {item.source_name} | {item.sync_scope} | {item.status} | {item.records_synced || 0}
              </p>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={`Mensagens recentes do Freshchat (${recentMessages.length})`}>
        <div className={`mb-4 text-sm ${muted}`}>
          Este bloco mostra mensagens reais importadas do Freshchat para treino, auditoria e analise do desempenho do chatbot e do agente de IA.
        </div>
        <div className="space-y-4">
          {recentMessages.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                <span>{item.source_system}</span>
                <span>{item.role || item.actor_type || "unknown"}</span>
                <span>{item.message_type || "normal"}</span>
                <span>{item.suggested_agent_ref || "sem agente"}</span>
                <span>{item.source_conversation_id}</span>
              </div>
              <p className={`text-sm ${muted}`}>{item.body_text || "Sem texto"}</p>
              {(item.quality_signals || []).length ? (
                <p className={`mt-2 text-xs ${subtle}`}>Sinais: {item.quality_signals.join(", ")}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Telemetria do widget (${widgetEvents.length})`}>
        <div className={`mb-4 grid gap-3 text-sm md:grid-cols-4 ${muted}`}>
          <p>Eventos: {widgetEventSummary.total || 0}</p>
          <p>Aberturas: {widgetEventSummary.openedCount || 0}</p>
          <p>Auth: {widgetEventSummary.authCount || 0}</p>
          <p>Falhas: {widgetEventSummary.failureCount || 0}</p>
        </div>
        {(widgetEventSummary.byEvent || []).length ? (
          <div className={`mb-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
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
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                  <span>{item.event_name || "evento"}</span>
                  <span>{item.identity_mode || "visitor"}</span>
                  <span>{item.widget_state || "n/a"}</span>
                  <span>{item.success === true ? "ok" : item.success === false ? "falha" : "neutro"}</span>
                </div>
                <p className={`text-sm ${muted}`}>
                  Rota: {item.route_path || "/"}{item.reference_id ? ` | Ref: ${item.reference_id}` : ""}
                </p>
                {item.created_at ? (
                  <p className={`mt-2 text-xs ${subtle}`}>{new Date(item.created_at).toLocaleString("pt-BR")}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className={`text-sm ${muted}`}>
              Ainda nao ha eventos do widget gravados. Assim que o chat abrir, autenticar ou falhar, eles aparecerao aqui.
            </p>
          )}
        </div>
      </Panel>

      <Panel title={`Sinais de CRM fora da conversa (${crmSignals.length})`}>
        <div className={`mb-4 text-sm ${muted}`}>
          Publicacoes, andamentos e outros registros do Freshsales ficam aqui apenas como contexto operacional. Eles nao entram como conversa principal do chatbot.
        </div>
        <div className="space-y-4">
          {crmSignals.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                <span>{item.source_system}</span>
                <span>{item.metadata?.type_name || item.channel}</span>
                <span>{item.status}</span>
              </div>
              <p className="mb-2 font-semibold">{item.subject || "Sem assunto"}</p>
              <p className={`text-sm ${muted}`}>{item.last_message || "Sem detalhe"}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
