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
    </section>
  );
}

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

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab Evaluation"
          description="Painel de governanca para acompanhar lacunas de resposta, erros operacionais, prioridades de tuning e a cadencia semanal de melhoria do agente."
        >
          <AgentLabModuleNav />
          <EvaluationContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

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
    </div>
  );
}
