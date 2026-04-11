import { useEffect, useState } from "react";
import Link from "next/link";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

function formatDateLabel(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00-03:00`));
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return `/api/admin-agendamentos?${params.toString()}`;
}

function countByStatus(items, status) {
  return items.filter((item) => item.status === status).length;
}

function SummaryCard({ label, value }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </div>
  );
}

export default function InternoAgendamentosPage() {
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
  });
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Agendamentos"
          description="Leitura inicial do fluxo de agendamento que ja opera no site. Aqui ganhamos visibilidade operacional antes de evoluir a UX publica."
        >
          <AgendamentosContent
            filters={filters}
            setFilters={setFilters}
            state={state}
            setState={setState}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgendamentosContent({ filters, setFilters, state, setState }) {
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setState((current) => ({ ...current, loading: true, error: null }));
        const payload = await adminFetch(buildQuery(filters));

        if (!cancelled) {
          appendActivityLog({
            label: "Leitura de agendamentos",
            action: "agendamentos_load",
            method: "UI",
            module: "agendamentos",
            page: "/interno/agendamentos",
            status: "success",
            response: `Filtros carregados: status=${filters.status || "todos"}, periodo=${filters.dateFrom || "inicio"}..${filters.dateTo || "fim"}, itens=${payload.items?.length || 0}.`,
            tags: ["agendamentos", "manual"],
          });
          setState({ loading: false, error: null, items: payload.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            label: "Falha na leitura de agendamentos",
            action: "agendamentos_load",
            method: "UI",
            module: "agendamentos",
            page: "/interno/agendamentos",
            status: "error",
            error: error.message || "Falha ao carregar agendamentos.",
            tags: ["agendamentos", "manual"],
          });
          setState({ loading: false, error: error.message, items: [] });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [filters, setState]);

  const total = state.items.length;
  const pendentes = countByStatus(state.items, "pendente");
  const confirmados = countByStatus(state.items, "confirmado");
  const cancelados = countByStatus(state.items, "cancelado");

  useEffect(() => {
    setModuleHistory(
      "agendamentos",
      buildModuleSnapshot("agendamentos", {
        routePath: "/interno/agendamentos",
        loading: state.loading,
        error: state.error,
        filters,
        total,
        pendentes,
        confirmados,
        cancelados,
        upcomingItems: state.items.slice(0, 8).map((item) => ({
          id: item.id,
          area: item.area,
          status: item.status,
          nome: item.nome,
          data: item.data,
          hora: item.hora,
        })),
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          filtersTracked: true,
        },
      }),
    );
  }, [cancelados, confirmados, filters, pendentes, state, total]);

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <SummaryCard label="Total" value={total} />
        <SummaryCard label="Pendentes" value={pendentes} />
        <SummaryCard label="Confirmados" value={confirmados} />
        <SummaryCard label="Cancelados" value={cancelados} />
      </div>

      <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5 mb-6">
        <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: "#C5A059" }}>
          Filtros
        </p>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="block">
            <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
            >
              <option value="">Todos</option>
              <option value="pendente">pendente</option>
              <option value="confirmado">confirmado</option>
              <option value="cancelado">cancelado</option>
            </select>
          </label>

          <label className="block">
            <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">De</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            />
          </label>

          <label className="block">
            <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">Ate</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters({ status: "", dateFrom: "", dateTo: "" })}
              className="w-full border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {state.loading ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando agendamentos...</div>
      ) : null}

      {!state.loading && state.error ? (
        <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
      ) : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm opacity-70">
          Nenhum agendamento encontrado para a consulta atual.
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="space-y-4">
          {state.items.map((item) => (
            <article key={item.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                  {item.area}
                </span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.status}</span>
              </div>
              <h3 className="font-serif text-2xl mb-2">{item.nome}</h3>
              <div className="grid gap-2 text-sm opacity-70 md:grid-cols-2">
                <p>E-mail: {item.email}</p>
                <p>Telefone: {item.telefone}</p>
                <p>Data: {formatDateLabel(item.data)}</p>
                <p>Hora: {item.hora}</p>
              </div>
              {item.observacoes ? <p className="mt-4 text-sm opacity-60">{item.observacoes}</p> : null}
              <div className="mt-4">
                <Link
                  href={`/interno/agendamentos/detalhe?id=${item.id}`}
                  className="inline-flex border border-[#2D2E2E] px-4 py-2 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
                >
                  Ver detalhe
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
