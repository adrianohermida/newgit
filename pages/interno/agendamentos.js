import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../components/interno/InternalThemeProvider";
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

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function SummaryCard({ label, value, isLightTheme }) {
  return (
    <div className={`border p-5 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </div>
  );
}

export default function InternoAgendamentosPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({
    status: "",
    dateFrom: "",
    dateTo: "",
  });
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const routeFocus = {
    id: typeof router.query.id === "string" ? router.query.id : "",
    clientId: typeof router.query.clientId === "string" ? router.query.clientId : "",
  };
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Agenda"
      description="Agenda comercial e juridica com confirmacoes, contexto e acompanhamento dos compromissos."
        >
          <AgendamentosContent
            filters={filters}
            setFilters={setFilters}
            state={state}
            setState={setState}
            routeFocus={routeFocus}
            copilotContext={copilotContext}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgendamentosContent({ filters, setFilters, state, setState, routeFocus, copilotContext }) {
  const { isLightTheme } = useInternalTheme();
  const [draftFilters, setDraftFilters] = useState(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

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
  const copilotPrimaryEmail = normalizeSearchValue(copilotContext?.entities?.primaryEmail);
  const copilotConversationTitle = normalizeSearchValue(copilotContext?.conversationTitle);
  const contextualFocusReason = (item) => {
    if (routeFocus?.id && String(item.id) === String(routeFocus.id)) return "jobs";
    if (copilotPrimaryEmail && normalizeSearchValue(item.email) === copilotPrimaryEmail) return "copilot_email";
    if (copilotConversationTitle && normalizeSearchValue(item.nome).includes(copilotConversationTitle)) return "copilot_nome";
    return "";
  };
  const orderedItems = [...state.items].sort((left, right) => {
    const leftFocused = contextualFocusReason(left) ? 1 : 0;
    const rightFocused = contextualFocusReason(right) ? 1 : 0;
    return rightFocused - leftFocused;
  });

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
      {copilotContext ? (
        <div className={`mb-6 border p-5 ${isLightTheme ? "border-[#bdd8cf] bg-[#f3fbf8] text-[#25403a]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>
            Contexto da conversa
          </p>
          <p className={`mt-3 text-sm font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
          {copilotContext.mission ? (
            <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#4b5563]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p>
          ) : null}
          {copilotContext?.entities?.primaryEmail ? (
            <p className={`mt-3 text-xs uppercase tracking-[0.14em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>
              Foco sugerido: {copilotContext.entities.primaryEmail}
            </p>
          ) : null}
        </div>
      ) : null}
      {routeFocus?.id || routeFocus?.clientId ? (
        <div className={`mb-6 border p-5 ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#5b4a22]" : "border-[#6F5826] bg-[rgba(111,88,38,0.12)]"}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
            Contexto trazido por automacoes
          </p>
          <div className={`mt-3 flex flex-wrap gap-3 text-sm ${isLightTheme ? "text-[#6b7280]" : "opacity-80"}`}>
            {routeFocus.id ? <span>Agendamento: {routeFocus.id}</span> : null}
            {routeFocus.clientId ? <span>Cliente: {routeFocus.clientId}</span> : null}
          </div>
          {routeFocus.id ? (
            <div className="mt-4">
              <Link
                href={`/interno/agendamentos/detalhe?id=${routeFocus.id}`}
                className={`inline-flex border px-4 py-2 text-sm transition-colors ${isLightTheme ? "border-[#c79b2c] text-[#8a6217] hover:border-[#8a6217] hover:text-[#5b4a22]" : "border-[#C5A059] hover:border-[#E7C98C]"}`}
              >
                Abrir detalhe do agendamento focado
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total" value={total} isLightTheme={isLightTheme} />
        <SummaryCard label="Pendentes" value={pendentes} isLightTheme={isLightTheme} />
        <SummaryCard label="Confirmados" value={confirmados} isLightTheme={isLightTheme} />
        <SummaryCard label="Cancelados" value={cancelados} isLightTheme={isLightTheme} />
      </div>

      <div className={`mb-6 border p-5 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
        <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
          Filtros
        </p>
        <div className="grid gap-4 md:grid-cols-5">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">Status</span>
            <select
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
              className={`w-full border px-4 py-3 outline-none transition-colors ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`}
            >
              <option value="">Todos</option>
              <option value="pendente">pendente</option>
              <option value="confirmado">confirmado</option>
              <option value="cancelado">cancelado</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">De</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              className={`w-full border px-4 py-3 outline-none transition-colors ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]"}`}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">Ate</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
              className={`w-full border px-4 py-3 outline-none transition-colors ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]"}`}
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters(draftFilters)}
              className={`w-full border px-4 py-3 text-sm transition-colors ${isLightTheme ? "border-[#c79b2c] text-[#8a6217] hover:border-[#8a6217] hover:text-[#5b4a22]" : "border-[#C5A059] text-[#C5A059] hover:border-[#E7C98C] hover:text-[#E7C98C]"}`}
            >
              Aplicar filtros
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                const clearedFilters = { status: "", dateFrom: "", dateTo: "" };
                setDraftFilters(clearedFilters);
                setFilters(clearedFilters);
              }}
              className={`w-full border px-4 py-3 text-sm transition-colors ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {state.loading ? (
        <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando agenda...</div>
      ) : null}

      {!state.loading && state.error ? (
        <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
      ) : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className={`border p-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#6b7280]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] opacity-70"}`}>
          Nenhum agendamento encontrado para a consulta atual.
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="space-y-4">
          {orderedItems.map((item) => {
            const focusReason = contextualFocusReason(item);
            const isFocused = Boolean(focusReason);
            return (
              <article
                key={item.id}
                className={`border p-5 ${isFocused
                  ? (isLightTheme ? "border-[#d7b14c] bg-[#fff8e7] text-[#1f2937]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]")
                  : (isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]")}`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className={`text-[10px] font-semibold tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
                    {item.area}
                  </span>
                  <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>{item.status}</span>
                  {focusReason === "jobs" ? <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Prioridade automatica</span> : null}
                  {focusReason === "copilot_email" ? <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Prioridade por e-mail</span> : null}
                  {focusReason === "copilot_nome" ? <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Prioridade por contexto</span> : null}
                </div>
                <h3 className="mb-2 font-serif text-2xl">{item.nome}</h3>
                <div className={`grid gap-2 text-sm md:grid-cols-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>
                  <p>E-mail: {item.email}</p>
                  <p>Telefone: {item.telefone}</p>
                  <p>Data: {formatDateLabel(item.data)}</p>
                  <p>Hora: {item.hora}</p>
                </div>
                {item.observacoes ? <p className={`mt-4 text-sm ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{item.observacoes}</p> : null}
                <div className="mt-4">
                  <Link
                    href={`/interno/agendamentos/detalhe?id=${item.id}`}
                    className={`inline-flex border px-4 py-2 text-sm transition-colors ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                  >
                    Abrir compromisso
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
