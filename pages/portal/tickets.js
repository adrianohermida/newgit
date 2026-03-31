import { useEffect, useState } from "react";
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

export default function PortalTicketsPage() {
  const [state, setState] = useState({ loading: true, error: null, warning: null, items: [] });
  const [form, setForm] = useState({ subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Tickets e suporte"
          description="Acompanhe seus chamados de atendimento e abra novas solicitacoes diretamente pelo portal."
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
    setState({ loading: false, error: null, warning: payload.warning || null, items: payload.items || [] });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-tickets");
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

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await clientFetch("/api/client-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ subject: "", description: "" });
      setFeedback("Chamado criado com sucesso.");
      await loadTickets();
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
        <h3 className="font-serif text-3xl">Abrir novo chamado</h3>
        <p className="mt-3 text-sm leading-6 opacity-62">Descreva sua necessidade e o portal abre um novo ticket com o seu cadastro autenticado.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
            placeholder="Assunto do chamado"
            required
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="min-h-[160px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
            placeholder="Descreva o que voce precisa"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Abrir ticket"}
          </button>
        </form>
        {feedback ? <div className="mt-4 rounded-xl border border-[#20332D] bg-black/10 px-4 py-3 text-sm">{feedback}</div> : null}
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}
      {state.loading ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando tickets...</div> : null}
      {!state.loading && state.error ? <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div> : null}
      {!state.loading && !state.error && !state.items.length ? <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 text-sm opacity-70">Nenhum ticket encontrado para o seu cadastro.</div> : null}

      {!state.loading && !state.error && state.items.length ? (
        <div className="space-y-4">
          {state.items.map((item) => (
            <article key={item.id} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>Ticket #{item.id}</span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">status {item.status}</span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">prioridade {item.priority}</span>
              </div>
              <h3 className="font-serif text-2xl">{item.subject}</h3>
              <p className="mt-2 text-sm opacity-55">Atualizado em {formatDateTime(item.updated_at)}</p>
              {item.description_text ? <p className="mt-4 text-sm leading-6 opacity-62">{item.description_text}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
