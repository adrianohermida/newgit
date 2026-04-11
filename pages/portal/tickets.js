import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/ui/toast";
import TicketModal from "../../components/portal/TicketModal";
import { useRouter } from "next/router";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";

function formatDateTime(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("fech")) return "border-[#24533D] bg-[rgba(19,72,49,0.22)] text-[#B8F0D5]";
  if (normalized.includes("resol")) return "border-[#375B78] bg-[rgba(31,67,96,0.22)] text-[#C9E7FF]";
  if (normalized.includes("pend")) return "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#F2DEB5]";
  return "border-[#4C4F6E] bg-[rgba(40,41,71,0.22)] text-[#D8DAFF]";
}

function priorityTone(priority) {
  const normalized = String(priority || "").toLowerCase();
  if (normalized.includes("urg")) return "text-[#FFD0D0]";
  if (normalized.includes("alta")) return "text-[#F3D5B5]";
  return "text-white/55";
}

export default function PortalTicketsPage() {
  const router = useRouter();
  const [state, setState] = useState({
    loading: true,
    error: null,
    warning: null,
    items: [],
    urls: null,
  });
  const [form, setForm] = useState({ subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [modalTicket, setModalTicket] = useState(null);
  // Salva o timestamp do último acesso aos tickets
  const [lastSeen, setLastSeen] = useState(() => {
    if (typeof window !== 'undefined') {
      return Number(localStorage.getItem('dotobot_tickets_last_seen') || 0);
    }
    return 0;
  });

  // Atualiza o lastSeen ao abrir o painel
  useEffect(() => {
    const now = Date.now();
    setLastSeen(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dotobot_tickets_last_seen', String(now));
    }
  }, []);

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Solicitacoes e suporte"
          description="Acompanhe seus pedidos, registre novas solicitacoes e fale com o escritorio sobre o que precisar no seu atendimento."
          rightRailLabel="painel de apoio"
          rightRailDefaultOpen={false}
        >
          <TicketsContent
            router={router}
            state={state}
            setState={setState}
            form={form}
            setForm={setForm}
            submitting={submitting}
            setSubmitting={setSubmitting}
            feedback={feedback}
            setFeedback={setFeedback}
            onShowDetails={setModalTicket}
            lastSeen={lastSeen}
          />
          <TicketModal ticket={modalTicket} onClose={() => setModalTicket(null)} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function TicketsContent({ router, state, setState, form, setForm, submitting, setSubmitting, feedback, setFeedback, onShowDetails, lastSeen }) {
  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const filteredItems = state.items.filter(item => {
    const statusOk = !statusFilter || String(item.status).toLowerCase().includes(statusFilter);
    const priorityOk = !priorityFilter || String(item.priority).toLowerCase().includes(priorityFilter);
    return statusOk && priorityOk;
  });
  // Paginação simples
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
  const paginatedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const setToast = useToast();
  useEffect(() => {
    if (!router.isReady) return;
    const subject = String(router.query.subject || "").trim();
    const description = String(router.query.description || "").trim();
    if (!subject && !description) return;
    setForm((current) => ({
      subject: current.subject || subject,
      description: current.description || description,
    }));
  }, [router.isReady, router.query.description, router.query.subject, setForm]);

  async function loadTickets() {
    const payload = await clientFetch("/api/client-tickets");
    appendActivityLog({
      type: "ui",
      action: "portal_tickets_refresh",
      label: "Tickets atualizados",
      module: "portal-tickets",
      status: "success",
      path: "/portal/tickets",
      response: `itens=${payload.items?.length || 0}`,
      consolePane: "jobs",
      domain: "portal",
      system: "tickets",
    });
    setState({
      loading: false,
      error: null,
      warning: payload.warning || null,
      items: payload.items || [],
      urls: payload.urls || null,
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-tickets");
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_tickets_load",
            label: "Tickets carregados",
            module: "portal-tickets",
            status: "success",
            path: "/portal/tickets",
            response: `itens=${payload.items?.length || 0}`,
            consolePane: "routes",
            domain: "portal",
            system: "tickets",
          });
          setState({
            loading: false,
            error: null,
            warning: payload.warning || null,
            items: payload.items || [],
            urls: payload.urls || null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_tickets_load",
            label: "Falha ao carregar tickets",
            module: "portal-tickets",
            status: "error",
            path: "/portal/tickets",
            error: error.message,
            consolePane: "routes",
            domain: "portal",
            system: "tickets",
          });
          setState({ loading: false, error: error.message, warning: null, items: [], urls: null });
        }
      }
    }
    load();
    const interval = setInterval(() => {
      load();
    }, 15000); // 15 segundos
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setState]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const payload = await clientFetch("/api/client-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      appendActivityLog({
        type: "ui",
        action: "portal_ticket_create",
        label: "Solicitacao criada",
        module: "portal-tickets",
        status: "success",
        path: "/portal/tickets",
        response: `subject=${form.subject || ""}`,
        consolePane: ["crm", "jobs"],
        domain: "portal",
        system: "tickets",
      });

      setForm({ subject: "", description: "" });
      setToast({
        type: "success",
        message: payload.ticket?.urls?.ticket_url
          ? "Solicitação criada com sucesso. Você já pode acompanhar o andamento pelo portal e continuar a conversa pelo atendimento."
          : "Solicitação criada com sucesso.",
      });
      await loadTickets();
    } catch (error) {
      appendActivityLog({
        type: "ui",
        action: "portal_ticket_create",
        label: "Falha ao criar solicitacao",
        module: "portal-tickets",
        status: "error",
        path: "/portal/tickets",
        error: error.message,
        consolePane: ["crm", "jobs"],
        domain: "portal",
        system: "tickets",
      });
      setToast({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const counts = useMemo(() => {
    const total = state.items.length;
    const open = state.items.filter((item) => ["Aberto", "Pendente"].includes(item.status)).length;
    const resolved = state.items.filter((item) => ["Resolvido", "Fechado"].includes(item.status)).length;
    return { total, open, resolved };
  }, [state.items]);

  useEffect(() => {
    setModuleHistory(
      "portal-tickets",
      buildModuleSnapshot("portal-tickets", {
        routePath: "/portal/tickets",
        status: state.error ? "error" : state.loading ? "loading" : "ready",
        filters: {
          status: statusFilter || "todos",
          priority: priorityFilter || "todas",
          page,
        },
        counts: {
          ...counts,
          filtered: filteredItems.length,
          visible: paginatedItems.length,
        },
        warning: state.warning || null,
        coverage: {
          hasItems: state.items.length > 0,
          hasWarning: Boolean(state.warning),
          hasOpenTickets: counts.open > 0,
        },
      })
    );
  }, [counts, filteredItems.length, page, paginatedItems.length, priorityFilter, state.error, state.items.length, state.loading, state.warning, statusFilter]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Abrir nova solicitacao</p>
          <h3 className="mt-3 font-serif text-3xl">Use o portal para registrar sua necessidade</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Sua solicitacao fica vinculada ao seu cadastro. Quando for necessario complementar a conversa, o atendimento do escritorio continua pelo canal apropriado.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <input
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none transition focus:border-[#C49C56]"
              placeholder="Assunto da solicitacao"
              required
            />
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none transition focus:border-[#C49C56]"
              placeholder="Descreva o que voce precisa"
              required
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Enviando...
                  </>
                ) : (
                  "Enviar solicitacao"
                )}
              </button>
              {state.urls?.new_ticket_url ? (
                <a
                  href={state.urls.new_ticket_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56]"
                >
                  Abrir central de atendimento
                </a>
              ) : null}
            </div>
          </form>
          {/* Toasts globais substituem feedback local */}
        </div>

        <div className="space-y-4">
          <SummaryCard label="Solicitacoes totais" value={counts.total} helper="Pedidos vinculados ao seu cadastro." />
          <SummaryCard label="Em andamento" value={counts.open} helper="Solicitacoes abertas ou pendentes." />
          <SummaryCard label="Encerradas" value={counts.resolved} helper="Solicitacoes resolvidas ou finalizadas." />
        </div>
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}
      {state.loading ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando solicitacoes...</div> : null}
      {!state.loading && state.error ? <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div> : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C49C56]">Central vazia</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhuma solicitacao encontrada para o seu cadastro.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Assim que um pedido for criado, ele aparece aqui com status, prioridade e orientacoes de acompanhamento.
          </p>
        </div>
      ) : null}

      {!state.loading && !state.error && state.items.length ? (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <label className="text-sm">
              Status:
              <select
                className="ml-2 rounded border px-2 py-1 bg-white/10"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                aria-label="Filtrar por status"
              >
                <option value="">Todos</option>
                <option value="aberto">Aberto</option>
                <option value="pend">Pendente</option>
                <option value="resol">Resolvido</option>
                <option value="fech">Fechado</option>
              </select>
            </label>
            <label className="text-sm">
              Prioridade:
              <select
                className="ml-2 rounded border px-2 py-1 bg-white/10"
                value={priorityFilter}
                onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
                aria-label="Filtrar por prioridade"
              >
                <option value="">Todas</option>
                <option value="urg">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </label>
          </div>

          {paginatedItems.map((item) => {
            const updatedAt = new Date(item.updated_at).getTime();
            const isNew = updatedAt > lastSeen;
            return (
              <article
                key={item.id}
                className={`rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 cursor-pointer hover:border-[#C49C56] transition focus:outline-none focus:ring-2 focus:ring-[#C49C56]`}
                tabIndex={0}
                aria-label={`Ver detalhes do ticket ${item.id}`}
                role="button"
                aria-pressed="false"
                onClick={() => onShowDetails(item)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onShowDetails(item); }}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between" aria-label={`Conteúdo do ticket ${item.id}`}> 
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }} id={`ticket-label-${item.id}`}> 
                        Solicitacao #{item.id}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusTone(item.status)}`}>
                        {item.status}
                      </span>
                      <span className={`text-[10px] uppercase tracking-[0.15em] ${priorityTone(item.priority)}`}>Prioridade {item.priority}</span>
                      {isNew && (
                        <span className="ml-2 rounded-full bg-green-500 px-2 py-1 text-[10px] text-white font-bold animate-pulse">Novo</span>
                      )}
                    </div>
                    <h3 className="font-serif text-2xl" aria-labelledby={`ticket-label-${item.id}`}>{item.subject}</h3>
                    <p className="mt-2 text-sm opacity-55">Atualizado em {formatDateTime(item.updated_at)}</p>
                    {item.description_text ? <p className="mt-4 max-w-3xl text-sm leading-6 opacity-65">{item.description_text}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {item.urls?.ticket_url ? (
                      <a
                        href={item.urls.ticket_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl bg-[#C49C56] px-4 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110"
                        onClick={e => e.stopPropagation()}
                      >
                        Abrir atendimento
                      </a>
                    ) : null}
                    {item.urls?.agent_ticket_url ? (
                      <a
                        href={item.urls.agent_ticket_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56]"
                        onClick={e => e.stopPropagation()}
                      >
                        Link alternativo
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {/* Paginação */}
      {!state.loading && !state.error && state.items.length > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            className="px-3 py-1 rounded border bg-white/10 hover:bg-[#C49C56] hover:text-[#07110E] disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Página anterior"
          >
            Anterior
          </button>
          <span className="px-3 py-1">Página {page} de {totalPages}</span>
          <button
            className="px-3 py-1 rounded border bg-white/10 hover:bg-[#C49C56] hover:text-[#07110E] disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Próxima página"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-xs uppercase tracking-[0.2em] opacity-45">{label}</p>
      <p className="mt-4 font-serif text-5xl">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-60">{helper}</p>
    </div>
  );
}
