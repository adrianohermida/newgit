import { useEffect, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

function formatDateTime(value) {
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
          description="Leitura progressiva dos processos vinculados ao seu cadastro, com ativacao conforme a fonte do projeto."
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

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando modulo...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-4">
      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}
      {!state.items.length ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 text-sm opacity-70">Nenhum processo disponivel no portal para o seu cadastro.</div> : null}
      {state.items.map((item) => (
        <article key={item.id} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>{item.court || "Tribunal"}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.status}</span>
          </div>
          <h3 className="font-serif text-2xl">{item.number || "Processo sem numero exibivel"}</h3>
          <p className="mt-3 text-sm opacity-55">Atualizado em {formatDateTime(item.updated_at)}</p>
        </article>
      ))}
    </div>
  );
}
