import { useEffect, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";

function formatDateLabel(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-03:00`));
}

function formatDateTimeLabel(item) {
  if (!item?.data) return "Sem data definida";
  return `${formatDateLabel(item.data)}${item.hora ? ` às ${item.hora}` : ""}`;
}

function statusTone(status) {
  if (status === "confirmada") return "border-[#2E6B59] bg-[rgba(46,107,89,0.18)] text-[#D7F5EC]";
  if (status === "realizada") return "border-[#375B78] bg-[rgba(31,67,96,0.18)] text-[#DCEBFA]";
  if (status === "cancelada") return "border-[#8A2E2E] bg-[rgba(138,46,46,0.14)] text-[#F7D7D7]";
  if (status === "remarcada") return "border-[#7A5C20] bg-[rgba(122,92,32,0.18)] text-[#F2DEB5]";
  if (status === "pendente") return "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#F2DEB5]";
  return "border-[#20332D] bg-[rgba(255,255,255,0.04)] text-[#E7DED1]";
}

function sortByDateTimeAsc(items) {
  return [...items].sort((left, right) => {
    const leftTime = left.datetime_iso ? new Date(left.datetime_iso).getTime() : Infinity;
    const rightTime = right.datetime_iso ? new Date(right.datetime_iso).getTime() : Infinity;
    return leftTime - rightTime;
  });
}

function sortByDateTimeDesc(items) {
  return [...items].sort((left, right) => {
    const leftTime = left.datetime_iso ? new Date(left.datetime_iso).getTime() : 0;
    const rightTime = right.datetime_iso ? new Date(right.datetime_iso).getTime() : 0;
    return rightTime - leftTime;
  });
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-xs uppercase tracking-[0.2em] opacity-45">{label}</p>
      <p className="mt-4 font-serif text-5xl">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-60">{helper}</p>
    </div>
  );
}

export default function PortalConsultasPage() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    items: [],
    summary: null,
    nextConsulta: null,
  });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Consultas"
          description="Acompanhe sua jornada de atendimento, veja a próxima consulta e retome seu histórico de agendamentos."
          actions={
            <div className="flex flex-wrap gap-3">
              <a
                href="/agendamento"
                className="rounded-2xl bg-[#C49C56] px-4 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110"
              >
                Agendar nova consulta
              </a>
              <a
                href="/portal/tickets"
                className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm font-semibold transition hover:border-[#C49C56]"
              >
                Abrir solicitacao
              </a>
            </div>
          }
        >
          <ConsultasContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function ConsultasContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-consultas");
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_consultas_load",
            label: "Consultas carregadas",
            module: "portal-consultas",
            status: "success",
            path: "/portal/consultas",
            response: `itens=${payload.items?.length || 0}, proximas=${payload.summary?.proximas || 0}`,
            consolePane: "routes",
            domain: "portal",
            system: "consultas",
          });
          setState({
            loading: false,
            error: null,
            items: payload.items || [],
            summary: payload.summary || null,
            nextConsulta: payload.next_consulta || null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_consultas_load",
            label: "Falha ao carregar consultas",
            module: "portal-consultas",
            status: "error",
            path: "/portal/consultas",
            error: error.message,
            consolePane: "routes",
            domain: "portal",
            system: "consultas",
          });
          setState({
            loading: false,
            error: error.message,
            items: [],
            summary: null,
            nextConsulta: null,
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  if (state.loading) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando consultas...</div>;
  }

  if (state.error) {
    return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  const summary = state.summary || { total: 0, agendadas: 0, realizadas: 0, canceladas: 0, proximas: 0 };
  const upcomingItems = sortByDateTimeAsc(state.items.filter((item) => item.is_upcoming));
  const historyItems = sortByDateTimeDesc(state.items.filter((item) => !item.is_upcoming));

  useEffect(() => {
    if (state.loading) return;
    setModuleHistory(
      "portal-consultas",
      buildModuleSnapshot("portal-consultas", {
        routePath: "/portal/consultas",
        status: state.error ? "error" : "ready",
        summary,
        nextConsulta: state.nextConsulta
          ? {
              id: state.nextConsulta.id,
              status: state.nextConsulta.status,
              datetime: state.nextConsulta.datetime_iso || null,
            }
          : null,
        counts: {
          upcoming: upcomingItems.length,
          history: historyItems.length,
        },
        coverage: {
          hasItems: state.items.length > 0,
          hasNextConsulta: Boolean(state.nextConsulta),
          hasUpcoming: upcomingItems.length > 0,
        },
      })
    );
  }, [historyItems.length, state.error, state.items.length, state.loading, state.nextConsulta, summary, upcomingItems.length]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={summary.total} helper="Historico completo de consultas encontradas para o seu cadastro." />
        <StatCard label="Ativas" value={summary.agendadas} helper="Consultas agendadas, confirmadas, pendentes ou remarcadas." />
        <StatCard label="Realizadas" value={summary.realizadas} helper="Atendimentos que ja foram concluídos no fluxo do site." />
        <StatCard label="Proximas" value={summary.proximas} helper="Consultas futuras que pedem sua atenção agora." />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Proxima consulta</p>
          {!state.nextConsulta ? (
            <div className="mt-4 space-y-3">
              <h3 className="font-serif text-3xl">Nenhuma consulta futura encontrada</h3>
              <p className="text-sm leading-6 opacity-62">
                Quando houver um novo agendamento confirmado para o seu e-mail, ele aparece em destaque aqui.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em] text-[#C49C56]">{state.nextConsulta.area}</span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(state.nextConsulta.status)}`}>
                  {state.nextConsulta.status_label}
                </span>
              </div>
              <h3 className="mt-4 font-serif text-3xl">{formatDateTimeLabel(state.nextConsulta)}</h3>
              <p className="mt-3 text-sm leading-6 opacity-62">
                {state.nextConsulta.observacoes || "Seu próximo atendimento já está no radar do portal. Se precisar ajustar algo, abra suporte ou reagende pelo site."}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Orientacoes</p>
          <div className="mt-4 space-y-4 text-sm leading-6 opacity-72">
            <p>Mantenha seus dados atualizados para receber avisos e orientações do escritório.</p>
            <p>Se precisar enviar contexto, documentos ou pedir ajuste em um horário, use o suporte do portal.</p>
            <p>Tratativas operacionais podem seguir pelo atendimento do escritorio ou pela solicitacao relacionada.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "Precisa ajustar o horario?",
            helper: "Use o fluxo de agendamento para solicitar um novo horário quando for o caso.",
            href: "/agendamento",
            label: "Reagendar atendimento",
          },
          {
            title: "Quer enviar contexto antes da consulta?",
            helper: "Abra uma solicitacao para registrar duvidas, documentos ou instrucoes complementares.",
            href: "/portal/tickets",
            label: "Abrir solicitacao",
          },
          {
            title: "Atualize seus dados de contato",
            helper: "Seu telefone e cadastro ajudam o escritório a conduzir o atendimento com mais precisão.",
            href: "/portal/perfil",
            label: "Atualizar perfil",
          },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 transition hover:border-[#C49C56]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C49C56]">Acao rapida</p>
            <h3 className="mt-3 font-serif text-2xl">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 opacity-62">{item.helper}</p>
            <p className="mt-5 text-sm font-semibold text-[#C49C56]">{item.label}</p>
          </a>
        ))}
      </section>

      <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex flex-col gap-3 border-b border-[#20332D] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Agenda futura</p>
            <h3 className="mt-3 font-serif text-3xl">O que vem pela frente</h3>
          </div>
          <p className="text-sm opacity-60">Consultas futuras identificadas no seu cadastro.</p>
        </div>

        <div className="mt-5 space-y-4">
          {!upcomingItems.length ? (
            <p className="text-sm leading-6 opacity-70">Nenhuma consulta futura localizada no momento.</p>
          ) : null}
          {upcomingItems.map((item) => (
            <article key={item.id} className="rounded-[24px] border border-[#20332D] bg-black/10 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em] text-[#C49C56]">{item.area}</span>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                      {item.status_label}
                    </span>
                  </div>
                  <h4 className="mt-4 font-serif text-2xl">{formatDateTimeLabel(item)}</h4>
                  <p className="mt-3 text-sm leading-6 opacity-70">
                    {item.observacoes || "Use o suporte se precisar complementar informações antes do atendimento."}
                  </p>
                </div>
                <div className="flex min-w-[210px] flex-col gap-3">
                  <a
                    href="/portal/tickets"
                    className="rounded-2xl bg-[#C49C56] px-4 py-3 text-center text-sm font-semibold text-[#07110E] transition hover:brightness-110"
                  >
                    Pedir apoio
                  </a>
                  <a
                    href="/agendamento"
                    className="rounded-2xl border border-[#20332D] px-4 py-3 text-center text-sm transition hover:border-[#C49C56]"
                  >
                    Solicitar novo horario
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex flex-col gap-3 border-b border-[#20332D] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Historico</p>
            <h3 className="mt-3 font-serif text-3xl">Sua trilha de atendimentos</h3>
          </div>
          <p className="text-sm opacity-60">Do mais recente para o mais antigo.</p>
        </div>

        <div className="mt-5 space-y-4">
          {!historyItems.length ? (
            <p className="text-sm leading-6 opacity-70">Nenhuma consulta encontrada para o seu cadastro.</p>
          ) : null}
          {historyItems.map((item) => (
            <article key={item.id} className="rounded-[24px] border border-[#20332D] bg-black/10 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em] text-[#C49C56]">{item.area}</span>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                      {item.status_label}
                    </span>
                  </div>
                  <h4 className="mt-4 font-serif text-2xl">{formatDateTimeLabel(item)}</h4>
                  <p className="mt-2 text-sm opacity-55">
                    Registrada em {item.created_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(item.created_at)) : "data nao informada"}
                  </p>
                  {item.observacoes ? (
                    <p className="mt-4 max-w-3xl text-sm leading-6 opacity-70">{item.observacoes}</p>
                  ) : (
                    <p className="mt-4 text-sm leading-6 opacity-55">Sem observações adicionais registradas para este atendimento.</p>
                  )}
                </div>
                <div className="min-w-[180px] rounded-[20px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
                  <p className="text-[10px] uppercase tracking-[0.16em] opacity-45">Atualizacao</p>
                  <p className="mt-2 font-semibold">
                    {item.updated_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.updated_at)) : "Sem data"}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
