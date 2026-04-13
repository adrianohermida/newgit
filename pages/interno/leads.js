import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../components/interno/InternalThemeProvider";
import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

function SummaryCard({ label, value, isLightTheme }) {
  return (
    <div className={`border p-5 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</p>
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

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export default function InternoLeadsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({ email: "" });
  const [draftEmail, setDraftEmail] = useState("");
  const [state, setState] = useState({ loading: true, error: null, warning: null, items: [] });
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");

  useEffect(() => {
    if (typeof router.query.email === "string" && router.query.email) {
      setDraftEmail(router.query.email);
      setFilters((current) => (current.email === router.query.email ? current : { ...current, email: router.query.email }));
    }
  }, [router.query.email]);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Leads"
          description="Visao inicial dos tickets e contatos recebidos pelo Freshdesk, centralizada no painel interno."
        >
          <LeadsContent
            draftEmail={draftEmail}
            setDraftEmail={setDraftEmail}
            filters={filters}
            setFilters={setFilters}
            state={state}
            setState={setState}
            copilotContext={copilotContext}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function LeadsContent({ draftEmail, setDraftEmail, filters, setFilters, state, setState, copilotContext }) {
  const { isLightTheme } = useInternalTheme();

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
          appendActivityLog({
            label: "Leitura de leads",
            action: "leads_load",
            method: "UI",
            module: "leads",
            page: "/interno/leads",
            status: "success",
            response: `Filtro email=${filters.email || "vazio"}, itens=${payload.items?.length || 0}.`,
            tags: ["leads", "manual", "crm"],
          });
          setState({ loading: false, error: null, warning: payload.warning || null, items: payload.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            label: "Falha na leitura de leads",
            action: "leads_load",
            method: "UI",
            module: "leads",
            page: "/interno/leads",
            status: "error",
            error: error.message || "Falha ao carregar leads.",
            tags: ["leads", "manual", "crm"],
          });
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

  useEffect(() => {
    setModuleHistory(
      "leads",
      buildModuleSnapshot("leads", {
        routePath: "/interno/leads",
        loading: state.loading,
        error: state.error,
        warning: state.warning,
        filters,
        total,
        abertos,
        pendentes,
        resolvidos,
        recentTickets: state.items.slice(0, 8).map((item) => ({
          id: item.id,
          status: item.status,
          priority: item.priority,
          subject: item.subject,
          email: item.email,
          updated_at: item.updated_at,
        })),
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          filtersTracked: true,
        },
      }),
    );
  }, [abertos, filters, pendentes, resolvidos, state, total]);

  return (
    <div>
      {copilotContext ? (
        <div className={`mb-6 border p-4 text-sm ${isLightTheme ? "border-[#bdd8cf] bg-[#f3fbf8] text-[#25403a]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Contexto vindo do Copilot</p>
          <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
          {copilotContext.mission ? <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#4b5563]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p> : null}
        </div>
      ) : null}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total" value={total} isLightTheme={isLightTheme} />
        <SummaryCard label="Abertos" value={abertos} isLightTheme={isLightTheme} />
        <SummaryCard label="Pendentes" value={pendentes} isLightTheme={isLightTheme} />
        <SummaryCard label="Resolvidos" value={resolvidos} isLightTheme={isLightTheme} />
      </div>

      <div className={`mb-6 border p-5 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
        <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
          Filtro
        </p>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">E-mail</span>
            <input
              value={draftEmail}
              onChange={(event) => setDraftEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setFilters({ email: draftEmail.trim() });
                }
              }}
              className={`w-full border px-4 py-3 outline-none transition-colors ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]"}`}
              placeholder="cliente@email.com"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters({ email: draftEmail.trim() })}
              className={`w-full border px-4 py-3 text-sm transition-colors ${isLightTheme ? "border-[#c79b2c] text-[#8a6217] hover:border-[#8a6217] hover:text-[#5b4a22]" : "border-[#C5A059] text-[#C5A059] hover:border-[#E7C98C] hover:text-[#E7C98C]"}`}
            >
              Aplicar
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setDraftEmail("");
                setFilters({ email: "" });
              }}
              className={`w-full border px-4 py-3 text-sm transition-colors ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {state.loading ? (
        <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando leads...</div>
      ) : null}

      {!state.loading && state.error ? (
        <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
      ) : null}

      {!state.loading && !state.error && state.warning ? (
        <div className={`mb-6 border p-6 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#5b4a22]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)]"}`}>{state.warning}</div>
      ) : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className={`border p-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#6b7280]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] opacity-70"}`}>
          Nenhum ticket encontrado para a consulta atual.
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="space-y-4">
          {state.items.map((item) => (
            <article key={item.id} className={`border p-5 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className={`text-[10px] font-semibold tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
                  Ticket #{item.id}
                </span>
                <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>status {item.status}</span>
                <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>prioridade {item.priority}</span>
              </div>

              <h3 className="mb-2 font-serif text-2xl">{item.subject || "Sem assunto"}</h3>
              <div className={`grid gap-2 text-sm md:grid-cols-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>
                <p>Nome: {item.name || "-"}</p>
                <p>E-mail: {item.email || "-"}</p>
                <p>Criado em: {formatDateLabel(item.created_at)}</p>
                <p>Atualizado em: {formatDateLabel(item.updated_at)}</p>
              </div>

              {item.description_text ? (
                <p className={`mt-4 text-sm leading-relaxed ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{item.description_text}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
