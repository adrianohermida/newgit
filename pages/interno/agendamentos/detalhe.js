import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

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
  const { isLightTheme } = useInternalTheme();
  return (
    <div>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>{label}</p>
      <p className={`break-all text-sm ${isLightTheme ? "text-[#374151]" : "opacity-80"}`}>{value || "—"}</p>
    </div>
  );
}

function SectionCard({ title, children, accent = false }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.92)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      {title ? (
        <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.15em] ${accent ? (isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]") : isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>
          {title}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function SecondaryAction({ as: Component = "button", className = "", ...props }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <Component
      className={`border px-5 py-3 text-sm transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#374151] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"} ${className}`.trim()}
      {...props}
    />
  );
}

function PrimaryAction({ className = "", ...props }) {
  return (
    <button
      className={`bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60 ${className}`.trim()}
      {...props}
    />
  );
}

export default function InternoAgendamentoDetalhePage() {
  const { isLightTheme } = useInternalTheme();
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
          appendActivityLog({
            label: "Leitura do detalhe de agendamento",
            action: "agendamento_detail_load",
            method: "UI",
            module: "agendamentos",
            page: "/interno/agendamentos/detalhe",
            status: "success",
            response: `Agendamento ${id} carregado.`,
            tags: ["agendamentos", "manual"],
          });
          setState({ loading: false, error: null, item: payload.item });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            label: "Falha ao carregar detalhe de agendamento",
            action: "agendamento_detail_load",
            method: "UI",
            module: "agendamentos",
            page: "/interno/agendamentos/detalhe",
            status: "error",
            error: error.message || "Falha ao carregar agendamento.",
            tags: ["agendamentos", "manual"],
          });
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
      appendActivityLog({
        label: "Desfecho do agendamento sincronizado",
        action: "agendamento_outcome_submit",
        method: "UI",
        module: "agendamentos",
        page: "/interno/agendamentos/detalhe",
        status: "success",
        response: `Outcome ${outcome} enviado para o CRM.`,
        tags: ["agendamentos", "manual", "crm"],
      });
      setActionState({
        loading: false,
        error: null,
        success: "Desfecho registrado e sincronizado com o CRM.",
        warnings: payload.warnings || [],
      });
    } catch (error) {
      appendActivityLog({
        label: "Falha ao sincronizar desfecho do agendamento",
        action: "agendamento_outcome_submit",
        method: "UI",
        module: "agendamentos",
        page: "/interno/agendamentos/detalhe",
        status: "error",
        error: error.message || "Falha ao registrar desfecho.",
        tags: ["agendamentos", "manual", "crm"],
      });
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
      appendActivityLog({
        label: applySuggestion ? "Sugestao do Zoom aplicada" : "Presenca do Zoom sincronizada",
        action: "agendamento_zoom_sync",
        method: "UI",
        module: "agendamentos",
        page: "/interno/agendamentos/detalhe",
        status: "success",
        response: `Participantes ${payload.zoom?.participants?.length || 0}. Aplicacao=${applySuggestion ? "sim" : "nao"}.`,
        tags: ["agendamentos", "manual", "crm"],
      });

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
      appendActivityLog({
        label: "Falha na sincronizacao de presenca do Zoom",
        action: "agendamento_zoom_sync",
        method: "UI",
        module: "agendamentos",
        page: "/interno/agendamentos/detalhe",
        status: "error",
        error: error.message || "Falha ao consultar presenca do Zoom.",
        tags: ["agendamentos", "manual", "crm"],
      });
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

  useEffect(() => {
    setModuleHistory(
      "agendamentos-detalhe",
      buildModuleSnapshot("agendamentos", {
        routePath: "/interno/agendamentos/detalhe",
        loading: state.loading,
        error: state.error,
        itemId: state.item?.id || null,
        status: state.item?.status || null,
        area: state.item?.area || null,
        outcome,
        notesLength: notes.length,
        actionState,
        zoomState: {
          loading: zoomState.loading,
          error: zoomState.error,
          success: zoomState.success,
          participants: zoomState.participants?.length || 0,
          hasSuggestion: Boolean(zoomState.suggestion),
        },
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [actionState, notes.length, outcome, state, zoomState]);

  const inputTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]"
    : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]";
  const textareaTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]"
    : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]";
  const mutedText = isLightTheme ? "text-[#6b7280]" : "opacity-60";
  const subtleText = isLightTheme ? "text-[#4b5563]" : "opacity-55";
  const warningCard = isLightTheme
    ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]"
    : "border-[#2D2E2E] bg-[rgba(13,15,14,0.65)]";

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Detalhe do agendamento"
          description="Visao operacional completa do registro, com links administrativos seguros para as acoes que ja existem no fluxo."
        >
          {state.loading ? (
            <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
              Carregando agendamento...
            </div>
          ) : null}

          {!state.loading && state.error ? (
            <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
          ) : null}

          {!state.loading && state.item ? (
            <div className="space-y-6">
              <SectionCard>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className={`text-[10px] font-semibold tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
                    {state.item.area}
                  </span>
                  <span className={`text-[10px] uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>{state.item.status}</span>
                </div>

                <h3 className="mb-2 font-serif text-3xl">{state.item.nome}</h3>
                <p className={`mb-6 text-sm ${mutedText}`}>
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
                    <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-45"}`}>Observacoes</p>
                    <p className={`text-sm leading-relaxed ${isLightTheme ? "text-[#374151]" : "opacity-80"}`}>{state.item.observacoes}</p>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Acoes administrativas" accent>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={actions.confirmar}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706]"
                  >
                    Abrir confirmacao
                  </a>
                  <SecondaryAction as="a" href={actions.cancelar} target="_blank" rel="noreferrer">
                    Abrir cancelamento
                  </SecondaryAction>
                  <SecondaryAction as="a" href={actions.remarcar} target="_blank" rel="noreferrer">
                    Abrir remarcacao
                  </SecondaryAction>
                  <SecondaryAction as={Link} href="/interno/agendamentos">
                    Voltar para lista
                  </SecondaryAction>
                </div>
              </SectionCard>

              <SectionCard title="Pos-reuniao e CRM" accent>
                <div className="grid gap-4 md:grid-cols-[240px,1fr]">
                  <label className="block">
                    <span className={`mb-2 block text-xs font-semibold uppercase tracking-[0.15em] ${mutedText}`}>Desfecho</span>
                    <select
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                      className={`w-full border px-4 py-3 outline-none transition ${inputTone}`}
                    >
                      {OUTCOME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={`mb-2 block text-xs font-semibold uppercase tracking-[0.15em] ${mutedText}`}>Observacoes internas</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      className={`w-full border px-4 py-3 outline-none transition ${textareaTone}`}
                      placeholder="Ex.: cliente compareceu, demonstrou interesse e pediu proposta ainda hoje."
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <PrimaryAction type="button" onClick={handleOutcomeSubmit} disabled={actionState.loading}>
                    {actionState.loading ? "Sincronizando..." : "Registrar no CRM"}
                  </PrimaryAction>
                  <p className={`text-xs ${subtleText}`}>
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
                  <div className={`mt-4 border p-4 ${warningCard}`}>
                    <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-50"}`}>Avisos da sincronizacao</p>
                    <div className={`space-y-2 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
                      {actionState.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Presenca via Zoom" accent>
                <div className="flex flex-wrap gap-3">
                  <SecondaryAction
                    type="button"
                    onClick={() => handleZoomAttendanceSync(false)}
                    disabled={zoomState.loading || !state.item.zoom_meeting_id}
                    className="disabled:opacity-50"
                  >
                    {zoomState.loading ? "Consultando Zoom..." : "Sincronizar presenca"}
                  </SecondaryAction>
                  <PrimaryAction
                    type="button"
                    onClick={() => handleZoomAttendanceSync(true)}
                    disabled={zoomState.loading || !state.item.zoom_meeting_id}
                    className="disabled:opacity-50"
                  >
                    Aplicar sugestao no CRM
                  </PrimaryAction>
                </div>

                {!state.item.zoom_meeting_id ? (
                  <p className={`mt-4 text-sm ${mutedText}`}>
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
                  <div className={`mt-4 border p-4 ${warningCard}`}>
                    <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-50"}`}>Sugestao automatica</p>
                    <div className={`space-y-2 text-sm ${isLightTheme ? "text-[#374151]" : "opacity-80"}`}>
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
                  <div className={`mt-4 border p-4 ${warningCard}`}>
                    <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-50"}`}>Participantes do Zoom</p>
                    <div className={`space-y-3 text-sm ${isLightTheme ? "text-[#374151]" : "opacity-80"}`}>
                      {zoomState.participants.map((participant, index) => (
                        <div key={`${participant.id || participant.user_email || participant.name || "participant"}-${index}`} className={`border p-3 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E]"}`}>
                          <p>{participant.name || "Sem nome"}</p>
                          <p className={mutedText}>{participant.user_email || participant.email || "Sem e-mail"}</p>
                          {participant.join_time ? <p className={mutedText}>Entrada: {participant.join_time}</p> : null}
                          {participant.leave_time ? <p className={mutedText}>Saida: {participant.leave_time}</p> : null}
                          {participant.duration ? <p className={mutedText}>Duracao: {participant.duration} min</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {zoomState.warnings?.length ? (
                  <div className={`mt-4 border p-4 ${warningCard}`}>
                    <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.15em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-50"}`}>Avisos da consulta</p>
                    <div className={`space-y-2 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
                      {zoomState.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Tokens administrativos" accent>
                <div className="grid gap-6 md:grid-cols-3">
                  <MetaBlock label="Token confirmar" value={state.item.admin_token_confirmacao} />
                  <MetaBlock label="Token cancelar" value={state.item.admin_token_cancelamento} />
                  <MetaBlock label="Token remarcar" value={state.item.admin_token_remarcacao} />
                </div>
              </SectionCard>
            </div>
          ) : null}
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
