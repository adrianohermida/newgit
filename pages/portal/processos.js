import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

function formatDate(value) {
  if (!value) return "Sem atualizacao";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function PortalProcessosPage() {
  const [state, setState] = useState({ loading: true, error: null, warning: null, items: [] });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Processos"
          description="Acompanhe sua carteira processual com leitura progressiva do schema judiciario: capa do processo, partes, andamentos e publicacoes quando a fonte estiver disponivel."
        >
          <ProcessosContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function ProcessosContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-processos");
        if (!cancelled) {
          setState({ loading: false, error: null, warning: payload.warning || null, items: payload.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, warning: null, items: [] });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  const stats = useMemo(() => {
    return {
      total: state.items.length,
      active: state.items.filter((item) => !String(item.status || "").toLowerCase().includes("arquiv")).length,
      withActs: state.items.filter((item) => item.movement_count > 0).length,
    };
  }, [state.items]);

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando modulo...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Processos totais" value={stats.total} helper="Processos vinculados ao seu cadastro." />
        <StatCard label="Em acompanhamento" value={stats.active} helper="Processos nao arquivados no portal." />
        <StatCard label="Com atos visiveis" value={stats.withActs} helper="Processos com andamentos identificados." />
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}

      {!state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Carteira vazia</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhum processo disponivel no portal para o seu cadastro.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Quando o schema judiciario estiver ligado ao seu cadastro, os processos aparecerao aqui com acesso ao detalhe, partes, andamentos e publicacoes.
          </p>
        </div>
      ) : null}

      {state.items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {state.items.map((item) => (
            <Link
              key={item.id}
              href={`/portal/processos/detalhe?id=${encodeURIComponent(item.id)}`}
              prefetch={false}
              className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 transition hover:border-[#C49C56]"
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>
                  {item.court || "Tribunal"}
                </span>
                <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                  {item.status}
                </span>
                {item.movement_count ? (
                  <span className="rounded-full border border-[#375B78] bg-[rgba(31,67,96,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#C9E7FF]">
                    {item.movement_count} atos
                  </span>
                ) : null}
              </div>

              <h3 className="font-serif text-2xl">{item.title || item.number || "Processo"}</h3>
              <p className="mt-2 font-mono text-sm opacity-55">{item.number || "Numero nao disponivel"}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2 text-sm">
                <Meta label="Polo ativo" value={item.polo_ativo || "Nao identificado"} />
                <Meta label="Polo passivo" value={item.polo_passivo || "Nao identificado"} />
                <Meta label="Classe" value={item.classe || item.area || "Nao informada"} />
                <Meta label="Atualizado em" value={formatDate(item.updated_at)} />
              </div>

              {(item.latest_movement || item.latest_publication) ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {item.latest_movement ? (
                    <InsightCard
                      label="Ultimo andamento"
                      title={item.latest_movement.title}
                      helper={item.latest_movement.summary || formatDate(item.latest_movement.date)}
                    />
                  ) : null}
                  {item.latest_publication ? (
                    <InsightCard
                      label="Ultima publicacao"
                      title={item.latest_publication.title}
                      helper={item.latest_publication.summary || formatDate(item.latest_publication.date)}
                    />
                  ) : null}
                </div>
              ) : null}

              {item.alerts?.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {item.alerts.slice(0, 3).map((alert) => (
                    <AlertPill key={`${item.id}-${alert.label}`} alert={alert} />
                  ))}
                </div>
              ) : null}

              <div className="mt-5 text-sm font-semibold text-[#C49C56]">Abrir detalhe do processo</div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
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

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 leading-6">{value}</p>
    </div>
  );
}

function InsightCard({ label, title, helper }) {
  return (
    <div className="rounded-[22px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      {helper ? <p className="mt-2 text-xs leading-5 opacity-62">{helper}</p> : null}
    </div>
  );
}

function AlertPill({ alert }) {
  const toneClass =
    alert.tone === "highlight"
      ? "border-[#7A5C20] bg-[rgba(122,92,32,0.22)] text-[#F3DEAD]"
      : alert.tone === "info"
        ? "border-[#375B78] bg-[rgba(31,67,96,0.22)] text-[#C9E7FF]"
        : "border-[#31463F] bg-[rgba(32,51,45,0.22)] text-[#D9DFDB]";

  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${toneClass}`}>
      {alert.label}
    </span>
  );
}
