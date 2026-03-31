import { useEffect, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

export default function PortalDocumentosPage() {
  const [state, setState] = useState({ loading: true, error: null, warning: null, items: [] });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Documentos"
          description="Estante documental do cliente, preparada para crescer sem quebrar o restante do portal."
        >
          <DocumentosContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function DocumentosContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-documentos");
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

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando documentos...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-4">
      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}
      {!state.items.length ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 text-sm opacity-70">Nenhum documento disponivel no portal neste momento.</div> : null}
      {state.items.map((item) => (
        <article key={item.id} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.status}</span>
          </div>
          <h3 className="font-serif text-2xl">{item.name}</h3>
          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-[#C49C56]">Abrir documento</a> : null}
        </article>
      ))}
    </div>
  );
}
