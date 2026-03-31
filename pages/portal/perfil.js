import { useEffect, useMemo, useState } from "react";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";
import { useSupabaseBrowser } from "../../lib/supabase";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = digitsOnly(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatWhatsapp(value) {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function buildForm(profile) {
  const metadata = profile?.metadata || {};
  return {
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    whatsapp: profile?.whatsapp || "",
    cpf: profile?.cpf || "",
    consent_lgpd: metadata.consent_lgpd === true,
    communication_consent: metadata.communication_consent === true,
  };
}

export default function PortalPerfilPage() {
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    message: null,
    profile: null,
    form: buildForm(null),
  });

  return (
    <RequireClient allowIncomplete>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Perfil"
          description="Gerencie seus dados operacionais, acompanhe o nivel de completude do cadastro e mantenha o portal pronto para consultas, suporte e documentos."
        >
          <PerfilContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function PerfilContent({ state, setState }) {
  const { supabase } = useSupabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-profile");
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: null,
            message: null,
            profile: payload.profile,
            form: buildForm(payload.profile),
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: error.message,
            message: null,
            profile: null,
          }));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  function updateField(name, value) {
    setState((current) => ({
      ...current,
      error: null,
      message: null,
      form: {
        ...current.form,
        [name]: value,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setState((current) => ({ ...current, saving: true, error: null, message: null }));

    try {
      const payload = await clientFetch("/api/client-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: state.form.full_name,
          whatsapp: digitsOnly(state.form.whatsapp),
          cpf: digitsOnly(state.form.cpf),
          consent_lgpd: state.form.consent_lgpd,
          communication_consent: state.form.communication_consent,
        }),
      });

      if (supabase) {
        await supabase.auth.refreshSession();
      }

      setState((current) => ({
        ...current,
        loading: false,
        saving: false,
        error: null,
        message: "Perfil atualizado com sucesso.",
        profile: payload.profile,
        form: buildForm(payload.profile),
      }));
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message, message: null }));
    }
  }

  const completion = useMemo(() => {
    const checks = [
      Boolean(String(state.form.full_name || "").trim()),
      digitsOnly(state.form.whatsapp).length >= 10,
      digitsOnly(state.form.cpf).length === 11,
      state.form.consent_lgpd === true,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [state.form]);

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando perfil...</div>;
  if (state.error && !state.profile) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.8fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
          <div className="flex flex-col gap-5 border-b border-[#20332D] pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Cadastro do cliente</p>
              <h3 className="mt-3 font-serif text-3xl">Dados essenciais do portal</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 opacity-68">
                Inspirado no fluxo do meu-painel dos projetos de referencia, este perfil concentra identificacao, contato e consentimentos sem espalhar a manutencao do cadastro.
              </p>
            </div>
            <div className="rounded-full border border-[#32453E] px-4 py-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-45">Completude</p>
              <p className="mt-1 text-2xl font-semibold">{completion}%</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field
              label="Nome completo"
              value={state.form.full_name}
              onChange={(event) => updateField("full_name", event.target.value)}
              required
            />
            <Field label="E-mail de acesso" value={state.form.email} disabled helper="Usado no login e para vinculo com tickets e consultas." />
            <Field
              label="WhatsApp"
              value={state.form.whatsapp}
              onChange={(event) => updateField("whatsapp", formatWhatsapp(event.target.value))}
              placeholder="(92) 98509-0354"
              required
            />
            <Field
              label="CPF"
              value={state.form.cpf}
              onChange={(event) => updateField("cpf", formatCpf(event.target.value))}
              placeholder="000.000.000-00"
              required
            />
          </div>
        </div>

        <div className="space-y-5">
          <StatusPanel completion={completion} profile={state.profile} />
          <QuickRule title="Consultas e suporte" body="Seu e-mail e WhatsApp sao reaproveitados nas consultas do site e nos chamados do Freshdesk." />
          <QuickRule title="Privacidade" body="O portal usa apenas os dados minimos do cliente e separa o acesso interno administrativo." />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.95fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Consentimentos</p>
          <div className="mt-5 space-y-4">
            <ConsentCard
              checked={state.form.consent_lgpd}
              onChange={(event) => updateField("consent_lgpd", event.target.checked)}
              title="Tratamento de dados para acesso ao portal e atendimento do escritorio."
              body="Mantem o portal ativo e habilita o uso do cadastro nos fluxos do escritorio."
            />
            <ConsentCard
              checked={state.form.communication_consent}
              onChange={(event) => updateField("communication_consent", event.target.checked)}
              title="Comunicacoes operacionais sobre consultas, suporte e documentos."
              body="Permite avisos de andamento, agendamento e retorno operacional sem misturar com a area comercial."
            />
          </div>
        </div>

        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(10,40,30,0.3)] p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#D8C18A]">Resumo operacional</p>
          <div className="mt-5 space-y-4 text-sm">
            <SummaryRow label="Cliente" value={state.form.full_name || "A confirmar"} />
            <SummaryRow label="E-mail" value={state.form.email || "A confirmar"} />
            <SummaryRow label="WhatsApp" value={state.form.whatsapp || "A confirmar"} />
            <SummaryRow label="CPF" value={state.form.cpf || "A confirmar"} />
            <SummaryRow label="LGPD" value={state.form.consent_lgpd ? "Ativo" : "Pendente"} />
          </div>
        </div>
      </section>

      {state.error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm">{state.error}</div> : null}
      {state.message ? <div className="rounded-2xl border border-[#1f3a2f] bg-[rgba(12,39,28,0.42)] px-4 py-3 text-sm">{state.message}</div> : null}

      <button type="submit" disabled={state.saving} className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60">
        {state.saving ? "Salvando..." : "Salvar perfil"}
      </button>
    </form>
  );
}

function Field({ label, helper = null, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] opacity-55">{label}</span>
      <input
        {...props}
        className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none transition focus:border-[#C49C56] ${props.disabled ? "opacity-60" : ""}`}
      />
      {helper ? <span className="mt-2 block text-xs leading-5 opacity-50">{helper}</span> : null}
    </label>
  );
}

function ConsentCard({ checked, onChange, title, body }) {
  return (
    <label className="flex gap-4 rounded-[26px] border border-[#20332D] bg-black/10 p-5">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-1 h-4 w-4" />
      <span className="block">
        <span className="block text-sm font-semibold leading-6">{title}</span>
        <span className="mt-2 block text-sm leading-6 opacity-62">{body}</span>
      </span>
    </label>
  );
}

function StatusPanel({ completion, profile }) {
  const onboardingRequired = profile?.onboarding_required === true;
  return (
    <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Status do portal</p>
      <p className="mt-4 font-serif text-3xl">{onboardingRequired ? "Cadastro em ajuste" : "Portal operacional"}</p>
      <p className="mt-3 text-sm leading-6 opacity-68">
        {onboardingRequired
          ? "Ainda ha informacoes essenciais pendentes para operar o portal sem restricoes."
          : "O cadastro esta pronto para consultas, tickets e expansao progressiva dos demais modulos."}
      </p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#C49C56]" style={{ width: `${completion}%` }} />
      </div>
    </section>
  );
}

function QuickRule({ title, body }) {
  return (
    <section className="rounded-[28px] border border-[#20332D] bg-black/10 p-5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 opacity-62">{body}</p>
    </section>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.18em] opacity-45">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
