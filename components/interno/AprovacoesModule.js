import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { useInternalTheme } from "./InternalThemeProvider";

const DEPARTMENTS = [
  {
    key: "cadastro",
    label: "Dados Cadastrais",
    description: "Alteracoes de perfil, contatos, enderecos e travas de validacao.",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Aprovacoes futuras de cobrancas, comprovantes, renegociacoes e ajustes operacionais.",
  },
  {
    key: "documentacoes",
    label: "Documentacoes",
    description: "Documentos enviados pelo cliente e pendentes de apreciacao pelo escritorio.",
  },
];

function StatusBadge({ status }) {
  const tone =
    status === "pending"
      ? "border-[#6E5630] text-[#FDE68A]"
      : status === "applied"
        ? "border-[#24533D] text-[#B8F0D5]"
        : "border-[#4B2222] text-[#FFD5D5]";
  return <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${tone}`}>{status}</span>;
}

function SummaryPair({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.15em] opacity-45">{label}</span>
      <span className="text-right text-sm">{value || "—"}</span>
    </div>
  );
}

function DepartmentTab({ item, active, count, onClick, isLightTheme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border px-4 py-4 text-left transition-colors ${
        active
          ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)]"
          : isLightTheme
            ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]"
            : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{item.label}</p>
          <p className="mt-2 text-xs opacity-60">{item.description}</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs opacity-85">{count}</span>
      </div>
    </button>
  );
}

function PlaceholderDepartment({ title, description, stats, isLightTheme }) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
            <p className="text-xs uppercase tracking-[0.16em] opacity-45">{item.label}</p>
            <p className="mt-3 font-serif text-3xl">{item.value}</p>
            <p className="mt-2 text-sm opacity-60">{item.helper}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-[28px] border p-6 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
        <p className="text-xs uppercase tracking-[0.16em] opacity-45">{title}</p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed opacity-70">{description}</p>
      </div>
    </section>
  );
}

function CadastroDepartment({ state, load, handleReview, handleCpfLock, handleNameLock, focusContext, isLightTheme }) {
  if (state.loading) {
    return <div className={`border p-6 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando fila cadastral...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
          <p className="text-xs uppercase tracking-[0.16em] opacity-45">Pendencias</p>
          <p className="mt-3 font-serif text-3xl">{state.items.length}</p>
          <p className="mt-2 text-sm opacity-60">Solicitacoes aguardando analise e decisao do escritorio.</p>
        </div>
        <div className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
          <p className="text-xs uppercase tracking-[0.16em] opacity-45">Escopo atual</p>
          <p className="mt-3 font-serif text-3xl">Perfil</p>
          <p className="mt-2 text-sm opacity-60">Nome, contatos, enderecos, profissao, estado civil e travas cadastrais.</p>
        </div>
        <div className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
          <p className="text-xs uppercase tracking-[0.16em] opacity-45">Acao rapida</p>
          <button
            type="button"
            onClick={load}
            className={`mt-3 border px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8]" : "border-[#2D2E2E]"}`}
          >
            Atualizar fila
          </button>
        </div>
      </div>

      {state.error ? <div className="border border-[#6E2A2A] bg-[rgba(110,42,42,0.22)] p-4 text-sm">{state.error}</div> : null}
      {state.message ? <div className="border border-[#24533D] bg-[rgba(19,72,49,0.22)] p-4 text-sm">{state.message}</div> : null}

      {!state.items.length ? (
        <div className={`border p-6 text-sm opacity-70 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
          Nenhuma solicitacao cadastral pendente no momento.
        </div>
      ) : null}

      {state.items.map((item) => {
        const requested = item.requested_payload || {};
        const currentSnapshot = item.current_snapshot || {};
        const profile = item.profile || {};
        const currentLocks = profile?.metadata?.personal_data_locks || currentSnapshot?.metadata?.personal_data_locks || {};
        const isFocused =
          (focusContext?.requestId && String(item.id) === String(focusContext.requestId)) ||
          (focusContext?.clientId && String(item.client_id) === String(focusContext.clientId));

        return (
          <section key={item.id} className={`border p-6 ${isFocused ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Cliente</p>
                <h3 className="mt-2 font-serif text-3xl">{profile.full_name || currentSnapshot.full_name || item.client_email}</h3>
                <p className="mt-2 text-sm opacity-65">{item.client_email}</p>
                {isFocused ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#C5A059]">Foco trazido da mesa de jobs</p> : null}
              </div>
              <StatusBadge status={item.status} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className={`rounded-[24px] border p-5 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E] bg-[#050706]"}`}>
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Cadastro atual</p>
                <div className="mt-4 space-y-3">
                  <SummaryPair label="Nome" value={currentSnapshot.full_name} />
                  <SummaryPair label="WhatsApp" value={currentSnapshot.whatsapp} />
                  <SummaryPair label="CPF" value={currentSnapshot.cpf} />
                  <SummaryPair label="Profissao" value={currentSnapshot.profession} />
                  <SummaryPair label="Estado civil" value={currentSnapshot.marital_status} />
                </div>
              </div>

              <div className="rounded-[24px] border border-[#6E5630] bg-[rgba(76,57,26,0.12)] p-5">
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Solicitado pelo cliente</p>
                <div className="mt-4 space-y-3">
                  <SummaryPair label="Nome" value={requested.full_name} />
                  <SummaryPair label="WhatsApp" value={requested.whatsapp} />
                  <SummaryPair label="CPF" value={requested.cpf} />
                  <SummaryPair label="Profissao" value={requested?.metadata?.profession} />
                  <SummaryPair label="Estado civil" value={requested?.metadata?.marital_status} />
                  <SummaryPair label="Contatos" value={Array.isArray(requested?.metadata?.contacts) ? String(requested.metadata.contacts.length) : "0"} />
                  <SummaryPair label="Enderecos" value={Array.isArray(requested?.metadata?.addresses) ? String(requested.metadata.addresses.length) : "0"} />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleReview(item.id, "approve")}
                disabled={state.actingId === item.id}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aprovar e aplicar
              </button>
              <button
                type="button"
                onClick={() => handleReview(item.id, "reject")}
                disabled={state.actingId === item.id}
                className="border border-[#6E2A2A] px-5 py-3 text-sm text-[#FFD5D5] disabled:opacity-50"
              >
                Rejeitar
              </button>
              <button
                type="button"
                onClick={() => handleCpfLock(item.client_id, currentLocks)}
                disabled={state.actingId === item.client_id}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                {currentLocks?.cpf_verified ? "Desbloquear CPF" : "Marcar CPF validado"}
              </button>
              <button
                type="button"
                onClick={() => handleNameLock(item.client_id, currentLocks)}
                disabled={state.actingId === item.client_id}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                {currentLocks?.full_name_verified ? "Desbloquear nome" : "Marcar nome verificado"}
              </button>
            </div>
          </section>
        );
      })}
    </section>
  );
}

export default function AprovacoesModule({ initialDepartment = "cadastro", focusContext = null }) {
  const { isLightTheme } = useInternalTheme();
  const [activeDepartment, setActiveDepartment] = useState(initialDepartment);
  const [state, setState] = useState({
    loading: true,
    error: null,
    items: [],
    actingId: null,
    message: null,
  });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-client-profile-requests?status=pending&limit=50");
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        items: payload.items || [],
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message, items: [] }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setActiveDepartment(initialDepartment);
  }, [initialDepartment]);

  async function handleReview(id, action) {
    setState((current) => ({ ...current, actingId: id, error: null, message: null }));
    try {
      await adminFetch("/api/admin-client-profile-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      setState((current) => ({
        ...current,
        actingId: null,
        message: action === "approve" ? "Solicitacao aprovada e aplicada." : "Solicitacao rejeitada.",
      }));
      appendActivityLog({
        label: "Aprovacao processada",
        action: "approval_review",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "success",
        response: `Acao ${action} aplicada para a solicitacao ${id}.`,
        consolePane: "security",
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      await load();
    } catch (error) {
      appendActivityLog({
        label: "Falha ao processar aprovacao",
        action: "approval_review",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "error",
        error: error.message || "Falha ao processar aprovacao.",
        consolePane: "security",
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      setState((current) => ({ ...current, actingId: null, error: error.message }));
    }
  }

  async function handleCpfLock(clientId, currentLocks) {
    setState((current) => ({ ...current, actingId: clientId, error: null, message: null }));
    try {
      await adminFetch("/api/admin-client-profile-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_locks",
          client_id: clientId,
          cpf_verified: !(currentLocks?.cpf_verified === true),
          full_name_verified: currentLocks?.full_name_verified === true,
        }),
      });
      appendActivityLog({
        label: "Lock de CPF atualizado",
        action: "approval_lock_cpf",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "success",
        response: `Cliente ${clientId} teve o lock de CPF alternado.`,
        consolePane: ["security", "data-quality"],
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      setState((current) => ({ ...current, actingId: null, message: "Bloqueio de CPF atualizado." }));
      await load();
    } catch (error) {
      appendActivityLog({
        label: "Falha ao atualizar lock de CPF",
        action: "approval_lock_cpf",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "error",
        error: error.message || "Falha ao atualizar lock de CPF.",
        consolePane: ["security", "data-quality"],
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      setState((current) => ({ ...current, actingId: null, error: error.message }));
    }
  }

  async function handleNameLock(clientId, currentLocks) {
    setState((current) => ({ ...current, actingId: clientId, error: null, message: null }));
    try {
      await adminFetch("/api/admin-client-profile-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_locks",
          client_id: clientId,
          cpf_verified: currentLocks?.cpf_verified === true,
          full_name_verified: !(currentLocks?.full_name_verified === true),
        }),
      });
      appendActivityLog({
        label: "Lock de nome atualizado",
        action: "approval_lock_name",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "success",
        response: `Cliente ${clientId} teve o lock de nome alternado.`,
        consolePane: ["security", "data-quality"],
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      setState((current) => ({ ...current, actingId: null, message: "Bloqueio do nome atualizado." }));
      await load();
    } catch (error) {
      appendActivityLog({
        label: "Falha ao atualizar lock de nome",
        action: "approval_lock_name",
        method: "UI",
        module: "aprovacoes",
        page: "/interno/aprovacoes",
        status: "error",
        error: error.message || "Falha ao atualizar lock de nome.",
        consolePane: ["security", "data-quality"],
        domain: "approval",
        system: "cadastro",
        tags: ["approval", "manual"],
      });
      setState((current) => ({ ...current, actingId: null, error: error.message }));
    }
  }

  const departmentCounts = useMemo(
    () => ({
      cadastro: state.items.length,
      financeiro: 0,
      documentacoes: 0,
    }),
    [state.items.length],
  );

  useEffect(() => {
    setModuleHistory(
      "aprovacoes",
      buildModuleSnapshot("aprovacoes", {
        routePath: "/interno/aprovacoes",
        activeDepartment,
        loading: state.loading,
        error: state.error,
        pendingCadastro: state.items.length,
        actingId: state.actingId,
        message: state.message,
        departmentCounts,
        queuePreview: state.items.slice(0, 8).map((item) => ({
          id: item.id,
          client_id: item.client_id,
          client_email: item.client_email,
          status: item.status,
        })),
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          approvalsTracked: true,
        },
      }),
    );
  }, [activeDepartment, departmentCounts, state]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {DEPARTMENTS.map((item) => (
          <DepartmentTab
            key={item.key}
            item={item}
            active={activeDepartment === item.key}
            count={departmentCounts[item.key] || 0}
            onClick={() => setActiveDepartment(item.key)}
          />
        ))}
      </div>

      {activeDepartment === "cadastro" ? (
        <CadastroDepartment
          state={state}
          load={load}
          handleReview={handleReview}
          handleCpfLock={handleCpfLock}
          handleNameLock={handleNameLock}
          focusContext={focusContext}
        />
      ) : null}

      {activeDepartment === "financeiro" ? (
        <PlaceholderDepartment
          title="Aprovacoes financeiras"
          description="Este departamento vai concentrar validacoes operacionais ligadas a cobrancas, comprovantes, acordos, renegociacoes e pendencias vindas do financeiro do cliente."
          stats={[
            { label: "Pendencias", value: "0", helper: "Nenhuma aprovacao financeira conectada neste ambiente." },
            { label: "Origem", value: "Freshsales", helper: "Deals, faturas e eventos financeiros poderao alimentar esta fila." },
            { label: "Modelo", value: "Fila unica", helper: "Cada aprovacao sera vinculada ao cliente e ao contexto financeiro correspondente." },
          ]}
        />
      ) : null}

      {activeDepartment === "documentacoes" ? (
        <PlaceholderDepartment
          title="Documentacoes em apreciacao"
          description="Esta area vai receber documentos enviados pelo cliente no portal para aprovacao, exigencia complementar ou validacao formal do escritorio de advocacia."
          stats={[
            { label: "Pendencias", value: "0", helper: "Nenhum documento aguardando parecer neste momento." },
            { label: "Origem", value: "Portal", helper: "Os uploads do cliente poderao ser associados a processo, categoria e observacoes." },
            { label: "Fluxo", value: "Analise", helper: "Cada documento podera ser aprovado, rejeitado ou devolvido com solicitacao complementar." },
          ]}
        />
      ) : null}
    </div>
  );
}
