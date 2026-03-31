import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";

function formatDateLabel(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-03:00`));
}

function buildActionLinks(item) {
  return {
    confirmar: `/confirmar?token=${item.admin_token_confirmacao}`,
    cancelar: `/cancelar?token=${item.admin_token_cancelamento}`,
    remarcar: `/remarcar?token=${item.admin_token_remarcacao}`,
  };
}

function MetaBlock({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-45">{label}</p>
      <p className="text-sm opacity-80 break-all">{value || "—"}</p>
    </div>
  );
}

export default function InternoAgendamentoDetalhePage() {
  const router = useRouter();
  const [state, setState] = useState({
    loading: true,
    error: null,
    item: null,
  });

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const { id } = router.query;
    if (!id || typeof id !== "string") {
      setState({ loading: false, error: "Informe o id do agendamento.", item: null });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const payload = await adminFetch(`/api/admin-agendamentos?id=${encodeURIComponent(id)}`);
        if (!cancelled) {
          setState({ loading: false, error: null, item: payload.item });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, item: null });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const actions = useMemo(() => (state.item ? buildActionLinks(state.item) : null), [state.item]);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Detalhe do agendamento"
          description="Visao operacional completa do registro, com links administrativos seguros para as acoes que ja existem no fluxo."
        >
          {state.loading ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando agendamento...</div> : null}

          {!state.loading && state.error ? (
            <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
          ) : null}

          {!state.loading && state.item ? (
            <div className="space-y-6">
              <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                    {state.item.area}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{state.item.status}</span>
                </div>

                <h3 className="font-serif text-3xl mb-2">{state.item.nome}</h3>
                <p className="text-sm opacity-60 mb-6">
                  {formatDateLabel(state.item.data)} as {state.item.hora}
                </p>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <MetaBlock label="E-mail" value={state.item.email} />
                  <MetaBlock label="Telefone" value={state.item.telefone} />
                  <MetaBlock label="Google Event ID" value={state.item.google_event_id} />
                  <MetaBlock label="Criado em" value={state.item.created_at} />
                  <MetaBlock label="Atualizado em" value={state.item.updated_at} />
                  <MetaBlock label="Confirmado em" value={state.item.confirmed_at} />
                  <MetaBlock label="Cancelado em" value={state.item.cancelled_at} />
                  <MetaBlock label="Cancelado por" value={state.item.cancelled_by} />
                  <MetaBlock label="Remarcado em" value={state.item.rescheduled_at} />
                  <MetaBlock label="Remarcado por" value={state.item.rescheduled_by} />
                  <MetaBlock label="Data original" value={state.item.original_data} />
                  <MetaBlock label="Hora original" value={state.item.original_hora} />
                </div>

                {state.item.observacoes ? (
                  <div className="mt-6">
                    <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-45">Observacoes</p>
                    <p className="text-sm opacity-80 leading-relaxed">{state.item.observacoes}</p>
                  </div>
                ) : null}
              </div>

              <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: "#C5A059" }}>
                  Acoes administrativas
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={actions.confirmar}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706]"
                  >
                    Abrir confirmacao
                  </a>
                  <a
                    href={actions.cancelar}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Abrir cancelamento
                  </a>
                  <a
                    href={actions.remarcar}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Abrir remarcacao
                  </a>
                  <Link
                    href="/interno/agendamentos"
                    className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
                  >
                    Voltar para lista
                  </Link>
                </div>
              </div>

              <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: "#C5A059" }}>
                  Tokens administrativos
                </p>
                <div className="grid gap-6 md:grid-cols-3">
                  <MetaBlock label="Token confirmar" value={state.item.admin_token_confirmacao} />
                  <MetaBlock label="Token cancelar" value={state.item.admin_token_cancelamento} />
                  <MetaBlock label="Token remarcar" value={state.item.admin_token_remarcacao} />
                </div>
              </div>
            </div>
          ) : null}
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
