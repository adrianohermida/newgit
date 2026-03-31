import { useEffect, useMemo, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
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

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Tickets e suporte"
          description="Acompanhe seus chamados, abra novas solicitacoes no portal e, quando precisar responder ou continuar a conversa, siga direto para o ticket no Freshdesk."
        >
          <TicketsContent
            state={state}
            setState={setState}
            form={form}
            setForm={setForm}
            submitting={submitting}
            setSubmitting={setSubmitting}
            feedback={feedback}
            setFeedback={setFeedback}
          />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function TicketsContent({ state, setState, form, setForm, submitting, setSubmitting, feedback, setFeedback }) {
  async function loadTickets() {
    const payload = await clientFetch("/api/client-tickets");
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
          setState({ loading: false, error: error.message, warning: null, items: [], urls: null });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
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

      setForm({ subject: "", description: "" });
      setFeedback({
        type: "success",
        message: payload.ticket?.urls?.ticket_url
          ? "Chamado criado com sucesso. Voce ja pode acompanhar ou responder direto no Freshdesk."
          : "Chamado criado com sucesso.",
      });
      await loadTickets();
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
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

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Abrir novo chamado</p>
          <h3 className="mt-3 font-serif text-3xl">Use o portal para registrar a demanda</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            O portal cria o ticket com seu cadastro autenticado. Para responder ou acompanhar a conversa completa, o caminho mais seguro e claro e abrir o chamado direto no Freshdesk.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <input
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none transition focus:border-[#C49C56]"
              placeholder="Assunto do chamado"
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
                className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Enviando..." : "Abrir ticket"}
              </button>
              {state.urls?.new_ticket_url ? (
                <a
                  href={state.urls.new_ticket_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56]"
                >
                  Abrir central Freshdesk
                </a>
              ) : null}
            </div>
          </form>
          {feedback ? (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${feedback.type === "error" ? "border-[#7f1d1d] bg-[rgba(127,29,29,0.18)]" : "border-[#24533D] bg-[rgba(19,72,49,0.22)]"}`}>
              {feedback.message}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <SummaryCard label="Tickets totais" value={counts.total} helper="Chamados do seu e-mail autenticado." />
          <SummaryCard label="Em andamento" value={counts.open} helper="Tickets abertos ou pendentes." />
          <SummaryCard label="Encerrados" value={counts.resolved} helper="Chamados resolvidos ou fechados." />
        </div>
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}
      {state.loading ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando tickets...</div> : null}
      {!state.loading && state.error ? <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div> : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C49C56]">Central vazia</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhum ticket encontrado para o seu cadastro.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Assim que um chamado for criado, ele aparece aqui com status, prioridade e o atalho para continuar a conversa no Freshdesk.
          </p>
        </div>
      ) : null}

      {!state.loading && !state.error && state.items.length ? (
        <div className="space-y-4">
          {state.items.map((item) => (
            <article key={item.id} className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>
                      Ticket #{item.id}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusTone(item.status)}`}>
                      {item.status}
                    </span>
                    <span className={`text-[10px] uppercase tracking-[0.15em] ${priorityTone(item.priority)}`}>Prioridade {item.priority}</span>
                  </div>
                  <h3 className="font-serif text-2xl">{item.subject}</h3>
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
                    >
                      Abrir ticket no Freshdesk
                    </a>
                  ) : null}
                  {item.urls?.agent_ticket_url ? (
                    <a
                      href={item.urls.agent_ticket_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56]"
                    >
                      Link alternativo
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
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
