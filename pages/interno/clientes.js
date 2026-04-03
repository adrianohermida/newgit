import { useEffect, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

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
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export default function InternoClientesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Clientes"
          description="Fila de aprovacao das alteracoes cadastrais solicitadas pelos clientes no portal."
        >
          <InternoClientesContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function InternoClientesContent() {
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

  async function handleReview(id, action) {
    setState((current) => ({ ...current, actingId: id, error: null, message: null }));
    try {
      const payload = await adminFetch("/api/admin-client-profile-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      setState((current) => ({
        ...current,
        actingId: null,
        message: action === "approve" ? "Solicitacao aprovada e aplicada." : "Solicitacao rejeitada.",
      }));
      await load();
      return payload;
    } catch (error) {
      setState((current) => ({ ...current, actingId: null, error: error.message }));
      return null;
    }
  }

  async function handleLocks(clientId, currentLocks) {
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
      setState((current) => ({ ...current, actingId: null, message: "Bloqueio de CPF atualizado." }));
      await load();
    } catch (error) {
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
      setState((current) => ({ ...current, actingId: null, message: "Bloqueio do nome atualizado." }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, actingId: null, error: error.message }));
    }
  }

  if (state.loading) return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando fila de clientes...</div>;

  return (
    <div className="space-y-6">
      {state.error ? <div className="border border-[#6E2A2A] bg-[rgba(110,42,42,0.22)] p-4 text-sm">{state.error}</div> : null}
      {state.message ? <div className="border border-[#24533D] bg-[rgba(19,72,49,0.22)] p-4 text-sm">{state.message}</div> : null}

      {!state.items.length ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm opacity-70">
          Nenhuma solicitacao pendente no momento.
        </div>
      ) : null}

      {state.items.map((item) => {
        const requested = item.requested_payload || {};
        const currentSnapshot = item.current_snapshot || {};
        const profile = item.profile || {};
        const currentLocks = profile?.metadata?.personal_data_locks || currentSnapshot?.metadata?.personal_data_locks || {};

        return (
          <section key={item.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-45">Cliente</p>
                <h3 className="mt-2 font-serif text-3xl">{profile.full_name || currentSnapshot.full_name || item.client_email}</h3>
                <p className="mt-2 text-sm opacity-65">{item.client_email}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[24px] border border-[#2D2E2E] bg-[#050706] p-5">
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
                onClick={() => handleLocks(item.client_id, currentLocks)}
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
    </div>
  );
}
