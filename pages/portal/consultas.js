import { useEffect, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

function formatDateLabel(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00-03:00`));
}

export default function PortalConsultasPage() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Consultas"
          description="Leitura das consultas e agendamentos vinculados ao seu e-mail no fluxo atual do site."
          actions={
            <a
              href="/agendamento"
              className="rounded-2xl bg-[#C49C56] px-4 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110"
            >
              Agendar nova consulta
            </a>
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
          setState({ loading: false, error: null, items: payload.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, items: [] });
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

  if (!state.items.length) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 text-sm opacity-70">Nenhuma consulta encontrada para o seu cadastro.</div>;
  }

  return (
    <div className="space-y-4">
      {state.items.map((item) => (
        <article key={item.id} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>{item.area}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.status}</span>
          </div>
          <h3 className="font-serif text-2xl">{formatDateLabel(item.data)} as {item.hora}</h3>
          {item.observacoes ? <p className="mt-3 text-sm leading-6 opacity-62">{item.observacoes}</p> : null}
        </article>
      ))}
    </div>
  );
}
