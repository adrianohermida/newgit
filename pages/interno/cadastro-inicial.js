import Link from "next/link";
import { useState } from "react";
import AuthLayout from "../../components/interno/AuthLayout";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

const initialForm = {
  fullName: "",
  email: "",
  cpf: "",
  whatsapp: "",
  password: "",
  acceptTerms: false,
};

export default function CadastroInicialPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase nao configurado no frontend.");
      return;
    }

    if (!form.acceptTerms) {
      setError("Aceite os termos para continuar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/interno/login`,
        data: {
          full_name: form.fullName,
          cpf: form.cpf,
          whatsapp: form.whatsapp,
          auth_origin: "cadastro_inicial_stitch",
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Cadastro enviado. A conta precisa ser validada no Supabase Auth e vinculada a admin_profiles para liberar o dashboard.");
    setSubmitting(false);
    setForm(initialForm);
  }

  return (
    <AuthLayout
      title="Cadastro inicial"
      description="Rota de onboarding inspirada no Stitch, criada para homologacao do Supabase sem expor ainda esse fluxo no header publico."
      highlights={[
        "Referencia visual portada de cadastro_inicial_elite_dark_mode.",
        "Sign up no Supabase com metadados basicos para onboarding.",
        "Acesso continua bloqueado ate haver vinculo em admin_profiles.",
      ]}
    >
      {!isSupabaseConfigured() ? (
        <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-[#F9D2D2]">
          Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para habilitar o cadastro inicial.
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-5 rounded-2xl border border-[#D4AF37]/12 bg-white/[0.03] p-6 md:grid-cols-2">
            <Field label="Nome completo">
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateField(setForm, "fullName", event.target.value)}
                className="auth-input w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                placeholder="Nome e sobrenome"
                required
              />
            </Field>

            <Field label="E-mail corporativo">
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField(setForm, "email", event.target.value)}
                className="auth-input w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                placeholder="equipe@hermidamaia.adv.br"
                required
              />
            </Field>

            <Field label="CPF">
              <input
                type="text"
                value={form.cpf}
                onChange={(event) => updateField(setForm, "cpf", event.target.value)}
                className="auth-input w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                placeholder="000.000.000-00"
                required
              />
            </Field>

            <Field label="WhatsApp">
              <input
                type="text"
                value={form.whatsapp}
                onChange={(event) => updateField(setForm, "whatsapp", event.target.value)}
                className="auth-input w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                placeholder="(11) 99999-9999"
                required
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Senha inicial">
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField(setForm, "password", event.target.value)}
                  className="auth-input w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                  placeholder="Crie uma senha com pelo menos 8 caracteres"
                  minLength={8}
                  required
                />
              </Field>
            </div>

            <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-white/8 bg-black/10 px-4 py-4 text-sm text-[#D8D1C6]/72">
              <input
                type="checkbox"
                checked={form.acceptTerms}
                onChange={(event) => updateField(setForm, "acceptTerms", event.target.checked)}
                className="mt-1 rounded border-white/20 bg-transparent text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              <span>
                Confirmo que este cadastro e apenas para homologacao interna e que a liberacao do dashboard depende de aprovacao e perfil ativo.
              </span>
            </label>
          </div>

          {error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-[#FCA5A5]">{error}</div> : null}
          {message ? <div className="rounded-2xl border border-[#0C9C55]/30 bg-[#0C9C55]/10 px-4 py-3 text-sm text-[#C8F3DD]">{message}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[linear-gradient(90deg,#D4AF37,#A67C00)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-[#050706] shadow-[0_16px_36px_rgba(212,175,55,0.22)] transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Criando..." : "Criar acesso inicial"}
          </button>

          <div className="flex flex-col gap-3 text-sm text-[#D8D1C6]/70 md:flex-row md:items-center md:justify-between">
            <Link href="/interno/login" className="text-[#D4AF37] transition hover:text-[#F3D98B]">
              Voltar para o login
            </Link>
            <span>Rota off-menu para homologacao do onboarding</span>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">{label}</span>
      {children}
    </label>
  );
}

function updateField(setForm, key, value) {
  setForm((current) => ({ ...current, [key]: value }));
}
