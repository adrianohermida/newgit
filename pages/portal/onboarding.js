import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";
import { useClientSession } from "../../lib/client/useClientSession";
import { useSupabaseBrowser } from "../../lib/supabase";

export default function PortalOnboardingPage() {
  const router = useRouter();
  const { authorized } = useClientSession();
  const [state, setState] = useState({ loading: true, saving: false, error: null, profile: null });

  useEffect(() => {
    if (authorized) {
      router.replace("/portal");
    }
  }, [authorized, router]);

  return (
    <RequireClient allowIncomplete>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Concluir cadastro"
          description="Complete os dados essenciais para ativar seu acesso ao portal do cliente."
        >
          <OnboardingContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function OnboardingContent({ state, setState }) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-profile");
        if (!cancelled) {
          setState({ loading: false, saving: false, error: null, profile: payload.profile });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, saving: false, error: error.message, profile: null });
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
    setState((current) => ({ ...current, saving: true, error: null }));
    const formData = new FormData(event.currentTarget);

    try {
      await clientFetch("/api/client-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.get("full_name"),
          whatsapp: formData.get("whatsapp"),
          cpf: formData.get("cpf"),
          consent_lgpd: formData.get("consent_lgpd") === "on",
          communication_consent: formData.get("communication_consent") === "on",
        }),
      });

      if (supabase) {
        await supabase.auth.refreshSession();
      }

      router.replace("/portal");
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  }

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando onboarding...</div>;
  if (state.error && !state.profile) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  const profile = state.profile || {};

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
        <p className="mb-6 text-sm leading-6 opacity-65">
          Este onboarding inicial ativa o portal com os dados minimos do cliente e os consentimentos basicos de atendimento.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Nome completo" name="full_name" defaultValue={profile.full_name || ""} required />
          <Field label="E-mail" name="email" defaultValue={profile.email || ""} disabled />
          <Field label="WhatsApp" name="whatsapp" defaultValue={profile.whatsapp || ""} required />
          <Field label="CPF" name="cpf" defaultValue={profile.cpf || ""} required />
        </div>
        <div className="mt-6 space-y-3 text-sm">
          <label className="flex items-start gap-3 rounded-xl border border-[#20332D] bg-black/10 px-4 py-3">
            <input type="checkbox" name="consent_lgpd" defaultChecked className="mt-1" />
            <span>Aceito o tratamento dos meus dados para acesso ao portal e atendimento do escritorio.</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-[#20332D] bg-black/10 px-4 py-3">
            <input type="checkbox" name="communication_consent" defaultChecked className="mt-1" />
            <span>Autorizo comunicacoes operacionais relacionadas a consultas, suporte e documentos.</span>
          </label>
        </div>
      </div>

      {state.error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm">{state.error}</div> : null}
      <button type="submit" disabled={state.saving} className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60">
        {state.saving ? "Ativando..." : "Concluir cadastro e entrar"}
      </button>
    </form>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] opacity-55">{label}</span>
      <input {...props} className={`w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 ${props.disabled ? "opacity-60" : ""}`} />
    </label>
  );
}
