import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";

const OUTCOME_OPTIONS = [
  { value: "attended", label: "Compareceu" },
  { value: "no_show", label: "Ausencia" },
  { value: "return_requested", label: "Pedido de retorno" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "proposal_pending", label: "Pendente de aceite" },
  { value: "proposal_review", label: "Revisao de proposta" },
  { value: "proposal_accepted", label: "Proposta aceita" },
  { value: "proposal_refused", label: "Proposta recusada" },
  { value: "contract_sent", label: "Contrato enviado" },
  { value: "client_active", label: "Cliente ativo" },
  { value: "client_inactive", label: "Cliente inativo" },
];

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
  const [outcome, setOutcome] = useState("attended");
  const [notes, setNotes] = useState("");
  const [actionState, setActionState] = useState({
    loading: false,
    error: null,
    success: null,
    warnings: [],
  });
  const [zoomState, setZoomState] = useState({
    loading: false,
    error: null,
    success: null,
    suggestion: null,
    participants: [],
    warnings: [],
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

  async function handleOutcomeSubmit() {
    if (!state.item?.id) return;

    try {
      setActionState({ loading: true, error: null, success: null, warnings: [] });
      const payload = await adminFetch("/api/admin-agendamentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: state.item.id,
          outcome,
          notes,
        }),
      });

      setState((current) => ({ ...current, item: payload.item || current.item }));
      setActionState({
        loading: false,
        error: null,
        success: "Desfecho registrado e sincronizado com o CRM.",
        warnings: payload.warnings || [],
      });
    } catch (error) {
      setActionState({
        loading: false,
        error: error.message,
        success: null,
        warnings: [],
      });
    }
  }

  async function handleZoomAttendanceSync(applySuggestion = false) {
    if (!state.item?.id) return;

    try {
      setZoomState((current) => ({
        ...current,
        loading: true,
        error: null,
        success: null,
        warnings: [],
      }));

      const payload = await adminFetch("/api/admin-agendamentos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: state.item.id,
          action: "sync_zoom_attendance",
          applySuggestion,
        }),
      });

      if (payload.zoom?.applied?.item) {
        setState((current) => ({ ...current, item: payload.zoom.applied.item }));
      }

      setZoomState({
        loading: false,
        error: null,
        success: applySuggestion
          ? "Presenca sincronizada e sugestao aplicada no CRM."
          : "Presenca do Zoom sincronizada com sucesso.",
        suggestion: payload.zoom?.suggestion || null,
        participants: payload.zoom?.participants || [],
        warnings: payload.warnings || [],
      });
    } catch (error) {
      setZoomState({
        loading: false,
        error: error.message,
        success: null,
        suggestion: null,
        participants: [],
        warnings: [],
      });
    }
  }

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
                  <MetaBlock label="Zoom Meeting ID" value={state.item.zoom_meeting_id} />
                  <MetaBlock label="Zoom Join URL" value={state.item.zoom_join_url} />
                  <MetaBlock label="Criado em" value={state.item.created_at} />
                  <MetaBlock label="Atualizado em" value={state.item.updated_at} />
                  <MetaBlock label="Confirmado em" value={state.item.confirmed_at} />
                  <MetaBlock label="Cancelado em" value={state.item.cancelled_at} />
                  <MetaBlock label="Cancelado por" value={state.item.cancelled_by} />
                  <MetaBlock label="Remarcado em" value={state.item.rescheduled_at} />
                  <MetaBlock label="Remarcado por" value={state.item.rescheduled_by} />
                  <MetaBlock label="Data original" value={state.item.original_data} />
                  <MetaBlock label="Hora original" value={state.item.original_hora} />
                  <MetaBlock label="Desfecho local" value={state.item.meeting_outcome} />
                  <MetaBlock label="Ultimo evento CRM" value={state.item.crm_last_event} />
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
                  Pos-reuniao e CRM
                </p>
                <div className="grid gap-4 md:grid-cols-[240px,1fr]">
                  <label className="block">
                    <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Desfecho</span>
                    <select
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                      className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
                    >
                      {OUTCOME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Observacoes internas</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                      placeholder="Ex.: cliente compareceu, demonstrou interesse e pediu proposta ainda hoje."
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOutcomeSubmit}
                    disabled={actionState.loading}
                    className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
                  >
                    {actionState.loading ? "Sincronizando..." : "Registrar no CRM"}
                  </button>
                  <p className="text-xs opacity-55">
                    Isso atualiza o Freshsales para sequencias, jornadas, campanhas e pipeline comercial.
                  </p>
                </div>

                {actionState.success ? (
                  <div className="mt-4 border border-emerald-700 bg-[rgba(6,78,59,0.22)] p-4 text-sm">
                    {actionState.success}
                  </div>
                ) : null}

                {actionState.error ? (
                  <div className="mt-4 border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-4 text-sm">
                    {actionState.error}
                  </div>
                ) : null}

                {actionState.warnings?.length ? (
                  <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.65)] p-4">
                    <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Avisos da sincronizacao</p>
                    <div className="space-y-2 text-sm opacity-75">
                      {actionState.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
                <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: "#C5A059" }}>
                  Presenca via Zoom
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleZoomAttendanceSync(false)}
                    disabled={zoomState.loading || !state.item.zoom_meeting_id}
                    className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
                  >
                    {zoomState.loading ? "Consultando Zoom..." : "Sincronizar presenca"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleZoomAttendanceSync(true)}
                    disabled={zoomState.loading || !state.item.zoom_meeting_id}
                    className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
                  >
                    Aplicar sugestao no CRM
                  </button>
                </div>

                {!state.item.zoom_meeting_id ? (
                  <p className="mt-4 text-sm opacity-60">
                    Este agendamento ainda nao possui `zoom_meeting_id`, entao a presenca automatica nao pode ser consultada.
                  </p>
                ) : null}

                {zoomState.success ? (
                  <div className="mt-4 border border-emerald-700 bg-[rgba(6,78,59,0.22)] p-4 text-sm">
                    {zoomState.success}
                  </div>
                ) : null}

                {zoomState.error ? (
                  <div className="mt-4 border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-4 text-sm">
                    {zoomState.error}
                  </div>
                ) : null}

                {zoomState.suggestion ? (
                  <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.65)] p-4">
                    <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Sugestao automatica</p>
                    <div className="space-y-2 text-sm opacity-80">
                      <p>Desfecho sugerido: {zoomState.suggestion.suggestedOutcome || "sem sugestao segura"}</p>
                      <p>Confianca: {zoomState.suggestion.confidence}</p>
                      <p>Motivo: {zoomState.suggestion.reason}</p>
                      {zoomState.suggestion.matchedParticipant ? (
                        <p>
                          Participante encontrado: {zoomState.suggestion.matchedParticipant.name || "Sem nome"}{" "}
                          {zoomState.suggestion.matchedParticipant.user_email
                            ? `(${zoomState.suggestion.matchedParticipant.user_email})`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {zoomState.participants?.length ? (
                  <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.65)] p-4">
                    <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Participantes do Zoom</p>
                    <div className="space-y-3 text-sm opacity-80">
                      {zoomState.participants.map((participant, index) => (
                        <div key={`${participant.id || participant.user_email || participant.name || "participant"}-${index}`} className="border border-[#2D2E2E] p-3">
                          <p>{participant.name || "Sem nome"}</p>
                          <p className="opacity-60">{participant.user_email || participant.email || "Sem e-mail"}</p>
                          {participant.join_time ? <p className="opacity-60">Entrada: {participant.join_time}</p> : null}
                          {participant.leave_time ? <p className="opacity-60">Saida: {participant.leave_time}</p> : null}
                          {participant.duration ? <p className="opacity-60">Duracao: {participant.duration} min</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {zoomState.warnings?.length ? (
                  <div className="mt-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.65)] p-4">
                    <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Avisos da consulta</p>
                    <div className="space-y-2 text-sm opacity-75">
                      {zoomState.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
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
