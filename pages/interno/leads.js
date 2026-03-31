import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

function SummaryCard({ label, value }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </div>
  );
}

function formatDateLabel(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

export default function InternoLeadsPage() {
  const [filters, setFilters] = useState({ email: "" });
  const [state, setState] = useState({ loading: true, error: null, warning: null, items: [] });

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Leads"
          description="Visao inicial dos tickets e contatos recebidos pelo Freshdesk, centralizada no painel interno."
        >
          <LeadsContent filters={filters} setFilters={setFilters} state={state} setState={setState} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function LeadsContent({ filters, setFilters, state, setState }) {
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState((current) => ({ ...current, loading: true, error: null }));
        const params = new URLSearchParams({ perPage: "30" });
        if (filters.email) {
          params.set("email", filters.email);
        }

        const payload = await adminFetch(`/api/admin-leads?${params.toString()}`);
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
  }, [filters, setState]);

  const total = state.items.length;
  const abertos = useMemo(() => countByStatus(state.items, 2), [state.items]);
  const pendentes = useMemo(() => countByStatus(state.items, 3), [state.items]);
  const resolvidos = useMemo(() => countByStatus(state.items, 4), [state.items]);

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <SummaryCard label="Total" value={total} />
        <SummaryCard label="Abertos" value={abertos} />
        <SummaryCard label="Pendentes" value={pendentes} />
        <SummaryCard label="Resolvidos" value={resolvidos} />
      </div>

      <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 mb-6">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: "#C5A059" }}>
          Filtro
        </p>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">E-mail</span>
            <input
              value={filters.email}
              onChange={(event) => setFilters({ email: event.target.value })}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="cliente@email.com"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters({ email: "" })}
              className="w-full border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {state.loading ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando leads...</div>
      ) : null}

      {!state.loading && state.error ? (
        <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
      ) : null}

      {!state.loading && !state.error && state.warning ? (
        <div className="mb-6 border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div>
      ) : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm opacity-70">
          Nenhum ticket encontrado para a consulta atual.
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="space-y-4">
          {state.items.map((item) => (
            <article key={item.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                  Ticket #{item.id}
                </span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">status {item.status}</span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">prioridade {item.priority}</span>
              </div>

              <h3 className="font-serif text-2xl mb-2">{item.subject || "Sem assunto"}</h3>
              <div className="grid gap-2 text-sm opacity-70 md:grid-cols-2">
                <p>Nome: {item.name || "—"}</p>
                <p>E-mail: {item.email || "—"}</p>
                <p>Criado em: {formatDateLabel(item.created_at)}</p>
                <p>Atualizado em: {formatDateLabel(item.updated_at)}</p>
              </div>

              {item.description_text ? (
                <p className="mt-4 text-sm opacity-60 leading-relaxed">{item.description_text}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
