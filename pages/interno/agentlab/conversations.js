import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

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

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab Conversations"
          description="Leitura operacional das conversas, sinais de handoff, incidentes e saúde do pipeline de ingestão que alimenta o treinamento do agente."
        >
          <AgentLabModuleNav />
          <ConversationsContent state={state} sync={sync} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

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
    </div>
  );
}
