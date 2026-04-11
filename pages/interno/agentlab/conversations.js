import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
<<<<<<< HEAD
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

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

function formatDateTime(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function useSyncRuns() {
  const [state, setState] = useState({
    loading: true,
    syncing: false,
    error: "",
    flash: "",
    runs: [],
  });

  async function loadRuns() {
    try {
      const payload = await adminFetch("/api/admin-agentlab-sync");
      setState((current) => ({
        ...current,
        loading: false,
        runs: payload.runs || [],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Falha ao carregar runs de sync.",
      }));
    }
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function syncNow(action = "sync_legacy_conversations") {
    setState((current) => ({
      ...current,
      syncing: true,
      error: "",
      flash: "",
    }));

    try {
      const payload = await adminFetch("/api/admin-agentlab-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          limit: 200,
        }),
      });

      const refreshed = await adminFetch("/api/admin-agentlab-sync");
      setState((current) => ({
        ...current,
        syncing: false,
        runs: refreshed.runs || [],
        flash: `Sync concluido (${payload.result?.source || action}): ${payload.result?.synced_threads || 0} threads atualizadas.`,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : "Falha ao sincronizar conversas.",
      }));
    }
  }

  return {
    ...state,
    syncNow,
  };
}

export default function AgentLabConversationsPage() {
  const state = useAgentLabData();
  const sync = useSyncRuns();
>>>>>>> codex/hmadv-tpu-fase53

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
<<<<<<< HEAD
          title="AgentLab | Conversas"
          description="Painel de inteligencia conversacional para sincronizar historico real, detectar falhas de leitura e alimentar treino, avaliacao e feedback loop."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} syncState={syncState} runSync={runSync} />
=======
          title="AgentLab Conversations"
          description="Leitura operacional das conversas, sinais de handoff, incidentes e saúde do pipeline de ingestão que alimenta o treinamento do agente."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} sync={sync} />
>>>>>>> codex/hmadv-tpu-fase53
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

<<<<<<< HEAD
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

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Panel title={`Threads: ${summary.total || 0}`}>
          <p className="text-sm opacity-70">Base de treino, leitura contextual e analise operacional.</p>
        </Panel>
        <Panel title={`Handoffs: ${summary.handoffs || 0}`}>
          <p className="text-sm opacity-70">Escalacoes detectadas nas threads importadas.</p>
        </Panel>
        <Panel title={`Erros: ${summary.withErrors || 0}`}>
          <p className="text-sm opacity-70">Conversas com risco de falha operacional ou leitura imprecisa.</p>
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
            Cada execucao sincroniza um lote curto, salva checkpoint no Supabase e protege o fluxo contra excesso de subrequests.
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={syncBlocked}
            onClick={() => runSync("sync_workspace_conversations", 5)}
            className="border border-[#2D2E2E] px-4 py-3 text-sm disabled:opacity-40"
          >
            Sincronizar legado
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
=======
function ConversationsContent({ state, sync }) {
  if (state.loading) {
    return <LoadingBlock>Carregando modulo de conversas...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const conversations = state.data?.conversations?.recent || [];
  const channels = state.data?.conversations?.channels || [];
  const intelligence = state.data?.intelligence || {};
  const summary = intelligence.summary || {};
  const incidents = intelligence.incidents || [];
  const warnings = state.data?.warnings || [];

  return (
    <div className="space-y-8">
      {sync.flash ? (
        <section className="border border-[#355E3B] bg-[rgba(28,63,36,0.25)] p-5 text-sm text-[#CDE7D1]">{sync.flash}</section>
      ) : null}

      {sync.error ? (
        <section className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-5 text-sm text-[#F2DEB5]">{sync.error}</section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Conversas importadas" value={summary.total_threads || conversations.length} helper="Base propria do AgentLab para inteligencia conversacional e predicao de comportamento." />
        <Metric label="Handoffs sinalizados" value={summary.handoff_threads || 0} helper="Ajuda a medir onde a IA deixa de resolver e onde deve transferir melhor." />
        <Metric label="Incidentes abertos" value={summary.open_incidents || 0} helper="Falhas do agente ou da operacao humana que precisam virar melhoria objetiva." />
        <Metric label="Canais visiveis" value={channels.length} helper="Leitura gerencial do mix de canais que alimenta o laboratorio de IA." />
      </section>

      <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-3xl">Pipeline de ingestão</h3>
            <p className="mt-2 text-sm leading-relaxed opacity-60">
              O AgentLab precisa operar com dados frescos. Esse pipeline sincroniza a base legada agora e fica pronto para receber Freshchat/Freshsales em seguida.
            </p>
          </div>
          <button
            type="button"
            onClick={sync.syncNow}
            disabled={sync.syncing}
            className="border border-[#C5A059] px-5 py-3 text-sm transition-colors hover:bg-[#C5A059] hover:text-[#050706] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {sync.syncing ? "Sincronizando..." : "Sincronizar legado"}
          </button>
          <button
            type="button"
            onClick={() => sync.syncNow("sync_freshsales_activities")}
            disabled={sync.syncing}
            className="border border-[#2D2E2E] px-5 py-3 text-sm transition-colors hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {sync.syncing ? "Sincronizando..." : "Sincronizar Freshsales"}
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {sync.loading ? (
            <div className="text-sm opacity-60">Carregando historico de sync...</div>
          ) : sync.runs.length ? (
            sync.runs.map((run) => (
              <article key={run.id} className="border border-[#202321] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="border border-[#355E3B] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#CDE7D1]">
                    {run.status}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{run.source_name}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{formatDateTime(run.created_at)}</span>
                </div>
                <h4 className="font-serif text-2xl">{run.records_synced} registros sincronizados</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{run.notes || "Sem observacao adicional."}</p>
              </article>
            ))
          ) : (
            <div className="text-sm opacity-60">Ainda nao ha runs de sync registrados.</div>
          )}
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Footprint por canal</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Esse recorte ajuda a descobrir onde a triagem esta mais fraca e onde faltam workflows dedicados.
          </p>
          <div className="mt-5 space-y-4">
            {channels.map((channel) => (
              <article key={channel.channel} className="border border-[#202321] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{channel.channel}</p>
                <p className="mt-3 font-serif text-4xl">{channel.total}</p>
                <p className="mt-2 text-sm opacity-60">Volume importado do espelho atual.</p>
              </article>
            ))}
          </div>
        </div>

        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Top intents observadas</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Esse recorte e o inicio da camada de predicao: quais perguntas estao mais aparecendo e onde o agente precisa ficar melhor.
          </p>
          <div className="mt-5 space-y-4">
            {(summary.top_intents || []).length ? (
              summary.top_intents.map((item) => (
                <article key={item.intent} className="border border-[#202321] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
                    intent
                  </p>
                  <h4 className="mt-2 font-serif text-2xl">{item.intent}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-65">{item.total} ocorrencias no espelho atual.</p>
                </article>
              ))
            ) : (
              <div className="text-sm opacity-60">As conversas importadas ainda nao possuem intents classificadas. O incidente aberto do painel aponta exatamente esse gap.</div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Conversas recentes</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Aqui o AgentLab opera com threads normalizadas, preparadas para importar Freshchat/Freshsales e alimentar treino e analytics.
          </p>
          <div className="mt-5 space-y-4">
            {conversations.map((conversation) => (
              <article key={conversation.id} className="border border-[#202321] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>
                    {conversation.channel || conversation.canal}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{conversation.status || "sem status"}</span>
                  {conversation.intent_label ? (
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{conversation.intent_label}</span>
                  ) : null}
                </div>
                <h4 className="font-serif text-2xl">{conversation.subject || conversation.assunto || "Sem assunto"}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{conversation.last_message || conversation.ultima_mensagem || "Sem ultima mensagem registrada."}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Erros e incidentes</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Essa e a trilha gerencial para enxergar falhas do agente, do fluxo ou do usuario interno sem depender de memoria ou suposicao.
          </p>
          <div className="mt-5 space-y-4">
            {incidents.length ? (
              incidents.map((incident) => (
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
                Ainda nao ha incidentes registrados. A API de intelligence ja esta pronta para receber erros do agente, falhas de handoff e erros operacionais do time interno.
              </div>
            )}
          </div>
        </div>
      </section>

      {warnings.length ? (
        <section className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-5 text-sm text-[#F2DEB5]">
          Existem {warnings.length} avisos de fonte neste ambiente. O fallback remoto continua ativo, mas o objetivo agora e operar pela camada propria de intelligence do AgentLab.
        </section>
      ) : null}
>>>>>>> codex/hmadv-tpu-fase53
    </div>
  );
}
