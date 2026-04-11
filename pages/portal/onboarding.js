import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";
import { useClientSession } from "../../lib/client/useClientSession";
import { useSupabaseBrowser } from "../../lib/supabase";

const STEPS = [
  { id: "identificacao", label: "Identificacao", helper: "Confirme seus dados principais." },
  { id: "contato", label: "Contato", helper: "Defina o canal operacional do portal." },
  { id: "consentimento", label: "Consentimento", helper: "Ative o acesso com os termos basicos." },
];

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

function buildInitialForm(profile) {
  const metadata = profile?.metadata || {};
  return {
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    whatsapp: profile?.whatsapp || "",
    cpf: profile?.cpf || "",
    consent_lgpd: metadata.consent_lgpd !== false,
    communication_consent: metadata.communication_consent !== false,
  };
}

function validateStep(stepIndex, form) {
  if (stepIndex === 0) {
    if (!String(form.full_name || "").trim()) return "Informe o nome completo para seguir.";
    if (digitsOnly(form.cpf).length !== 11) return "Informe um CPF valido com 11 digitos.";
  }

  if (stepIndex === 1) {
    if (digitsOnly(form.whatsapp).length < 10) return "Informe um WhatsApp valido com DDD.";
  }

  if (stepIndex === 2) {
    if (!form.consent_lgpd) return "Voce precisa aceitar o tratamento de dados para ativar o portal.";
  }

  return null;
}

export default function PortalOnboardingPage() {
  const router = useRouter();
  const { authorized } = useClientSession();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    profile: null,
    step: 0,
    form: buildInitialForm(null),
  });

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
          description="Ative seu portal com um fluxo curto, claro e seguro. O acesso fica pronto assim que os dados essenciais forem confirmados."
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
          appendActivityLog({
            type: "ui",
            action: "portal_onboarding_load",
            label: "Onboarding carregado",
            module: "portal-onboarding",
            status: "success",
            path: "/portal/onboarding",
            response: `profile=${payload.profile?.email || "sem-email"}`,
            consolePane: "routes",
            domain: "portal",
            system: "onboarding",
          });
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: null,
            profile: payload.profile,
            form: buildInitialForm(payload.profile),
          }));
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_onboarding_load",
            label: "Falha ao carregar onboarding",
            module: "portal-onboarding",
            status: "error",
            path: "/portal/onboarding",
            error: error.message,
            consolePane: "routes",
            domain: "portal",
            system: "onboarding",
          });
          setState((current) => ({
            ...current,
            loading: false,
            saving: false,
            error: error.message,
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
      form: {
        ...current.form,
        [name]: value,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateStep(state.step, state.form);
    if (validationError) {
      appendActivityLog({
        type: "ui",
        action: "portal_onboarding_validate",
        label: "Validacao do onboarding falhou",
        module: "portal-onboarding",
        status: "error",
        path: "/portal/onboarding",
        error: validationError,
        consolePane: ["crm", "data-quality"],
        domain: "portal",
        system: "onboarding",
      });
      setState((current) => ({ ...current, error: validationError }));
      return;
    }

    if (state.step < STEPS.length - 1) {
      appendActivityLog({
        type: "ui",
        action: "portal_onboarding_step_advance",
        label: "Etapa do onboarding concluida",
        module: "portal-onboarding",
        status: "success",
        path: "/portal/onboarding",
        response: `step=${STEPS[state.step]?.id || state.step}`,
        consolePane: "activity",
        domain: "portal",
        system: "onboarding",
      });
      setState((current) => ({ ...current, step: current.step + 1, error: null }));
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      await clientFetch("/api/client-profile", {
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
      appendActivityLog({
        type: "ui",
        action: "portal_onboarding_complete",
        label: "Onboarding concluido",
        module: "portal-onboarding",
        status: "success",
        path: "/portal/onboarding",
        response: "completion=100",
        consolePane: ["crm", "jobs"],
        domain: "portal",
        system: "onboarding",
      });

      if (supabase) {
        await supabase.auth.refreshSession();
      }

      router.replace("/portal");
    } catch (error) {
      appendActivityLog({
        type: "ui",
        action: "portal_onboarding_complete",
        label: "Falha ao concluir onboarding",
        module: "portal-onboarding",
        status: "error",
        path: "/portal/onboarding",
        error: error.message,
        consolePane: ["crm", "jobs"],
        domain: "portal",
        system: "onboarding",
      });
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  }

  const completion = useMemo(() => {
    const checks = [
      Boolean(String(state.form.full_name || "").trim()),
      digitsOnly(state.form.cpf).length === 11,
      digitsOnly(state.form.whatsapp).length >= 10,
      state.form.consent_lgpd === true,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [state.form]);

  useEffect(() => {
    if (state.loading) return;
    setModuleHistory(
      "portal-onboarding",
      buildModuleSnapshot("portal-onboarding", {
        routePath: "/portal/onboarding",
        status: state.error ? "error" : "ready",
        step: {
          index: state.step,
          id: STEPS[state.step]?.id || null,
          label: STEPS[state.step]?.label || null,
        },
        completion,
        profileReady: Boolean(state.profile),
        coverage: {
          hasProfile: Boolean(state.profile),
          hasWhatsapp: digitsOnly(state.form.whatsapp).length >= 10,
          hasCpf: digitsOnly(state.form.cpf).length === 11,
          hasConsent: state.form.consent_lgpd === true,
        },
      })
    );
  }, [completion, state.error, state.form.cpf, state.form.consent_lgpd, state.form.whatsapp, state.loading, state.profile, state.step]);

  if (state.loading) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando onboarding...</div>;
  }

  if (state.error && !state.profile) {
    return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  const step = STEPS[state.step];

  return (
    <form className="grid gap-6 xl:grid-cols-[1.35fr_0.8fr]" onSubmit={handleSubmit}>
      <section className="overflow-hidden rounded-[32px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]">
        <div className="border-b border-[#20332D] px-6 py-6 md:px-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Onboarding inicial</p>
              <h3 className="mt-3 font-serif text-3xl">{step.label}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 opacity-65">{step.helper}</p>
            </div>
            <div className="min-w-[92px] rounded-full border border-[#32453E] px-4 py-3 text-center">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-45">Progresso</p>
              <p className="mt-1 text-2xl font-semibold">{completion}%</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {STEPS.map((item, index) => {
              const active = index === state.step;
              const done = index < state.step;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border px-4 py-4 transition-colors ${active ? "border-[#C49C56] bg-[rgba(196,156,86,0.12)]" : "border-[#20332D]"} ${done ? "bg-[rgba(15,60,42,0.28)]" : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-55">Etapa {index + 1}</p>
                  <p className="mt-2 text-sm font-semibold">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-6 md:px-8 md:py-8">
          {state.step === 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Nome completo"
                name="full_name"
                value={state.form.full_name}
                onChange={(event) => updateField("full_name", event.target.value)}
                placeholder="Como deseja aparecer no portal"
                required
              />
              <Field label="E-mail" name="email" value={state.form.email} disabled helper="Usado para o login e comunicacoes do portal." />
              <Field
                label="CPF"
                name="cpf"
                value={state.form.cpf}
                onChange={(event) => updateField("cpf", formatCpf(event.target.value))}
                placeholder="000.000.000-00"
                required
              />
          <InfoTile title="Como usamos isso" body="Esses dados alimentam suas consultas, solicitacoes e identificacao segura no atendimento do escritorio." />
            </div>
          ) : null}

          {state.step === 1 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="WhatsApp"
                name="whatsapp"
                value={state.form.whatsapp}
                onChange={(event) => updateField("whatsapp", formatWhatsapp(event.target.value))}
                placeholder="(92) 98509-0354"
                required
              />
              <InfoTile
                title="Canal operacional"
                body="Usamos seu WhatsApp para avisos de documentos, ajustes de atendimento e retornos rapidos do escritorio."
              />
              <InfoTile
                title="Fluxo recomendado"
                body="Voce continua vendo o historico no portal, mas pode receber orientacoes operacionais pelo canal mais rapido."
              />
              <InfoTile
                title="Privacidade"
                body="Nao exibimos esse dado publicamente. Ele fica restrito aos fluxos internos e ao seu proprio acesso."
              />
            </div>
          ) : null}

          {state.step === 2 ? (
            <div className="space-y-4">
              <ConsentCard
                checked={state.form.consent_lgpd}
                onChange={(event) => updateField("consent_lgpd", event.target.checked)}
                title="Aceito o tratamento dos meus dados para acesso ao portal e atendimento do escritorio."
                body="Sem esse consentimento o portal nao pode ser ativado, porque ele depende de identificacao segura do cliente."
              />
              <ConsentCard
                checked={state.form.communication_consent}
                onChange={(event) => updateField("communication_consent", event.target.checked)}
                title="Autorizo comunicacoes operacionais relacionadas a consultas, suporte e documentos."
                body="Esse consentimento permite lembretes, retornos e avisos de andamento sem alterar preferencias comerciais."
              />
            </div>
          ) : null}

          {state.error ? <div className="mt-6 rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm">{state.error}</div> : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setState((current) => ({ ...current, step: Math.max(0, current.step - 1), error: null }))}
              disabled={state.step === 0 || state.saving}
              className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56] disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={state.saving}
              className="rounded-2xl bg-[#C49C56] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110 disabled:opacity-60"
            >
              {state.saving ? "Ativando..." : state.step === STEPS.length - 1 ? "Concluir cadastro e entrar" : "Continuar"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Resumo da ativacao</p>
          <div className="mt-5 space-y-4 text-sm">
            <SummaryRow label="Cliente" value={state.form.full_name || "A confirmar"} />
            <SummaryRow label="Login" value={state.form.email || "A confirmar"} />
            <SummaryRow label="Contato" value={state.form.whatsapp || "A confirmar"} />
            <SummaryRow label="CPF" value={state.form.cpf || "A confirmar"} />
          </div>
        </section>

        <section className="rounded-[32px] border border-[#20332D] bg-[rgba(10,40,30,0.35)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#D8C18A]">O que libera no portal</p>
          <div className="mt-4 space-y-3 text-sm leading-6 opacity-78">
            <p>Visao consolidada de consultas, suporte, documentos e proximos modulos do cliente.</p>
            <p>Cadastro unico reaproveitado nas operacoes do escritorio, evitando retrabalho em cada contato.</p>
            <p>Base pronta para ampliar processos, financeiro e estante documental sem novo login.</p>
          </div>
        </section>
      </aside>
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

function InfoTile({ title, body }) {
  return (
    <div className="rounded-2xl border border-[#20332D] bg-black/10 p-5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 opacity-62">{body}</p>
    </div>
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

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.18em] opacity-45">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
