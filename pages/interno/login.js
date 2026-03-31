import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import AuthLayout from "../../components/interno/AuthLayout";
import { useAdminSession } from "../../lib/admin/useAdminSession";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function InternoLoginPage() {
  const router = useRouter();
  const { authorized, loading } = useAdminSession();
  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && authorized) {
      const target = typeof router.query.next === "string" ? router.query.next : "/interno";
      router.replace(target);
    }
  }, [authorized, loading, router]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase nao configurado no frontend.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    const target = typeof router.query.next === "string" ? router.query.next : "/interno";
    router.replace(target);
  }

  return (
    <AuthLayout
      title="Entrar no dashboard"
      description="Use a conta interna autenticada no Supabase para acessar blog, agendamentos e leads sem alterar ainda a entrada da home."
      highlights={[
        "Referencia visual portada de login_elite_dark_mode do Stitch.",
        "Sessao persistente no navegador para homologacao interna.",
        "Fluxo de recuperacao e onboarding inicial disponiveis em rotas separadas.",
      ]}
    >
      {!isSupabaseConfigured() ? (
        <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-[#F9D2D2]">
          Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para habilitar o login.
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-[#D4AF37]/10 bg-white/[0.03] p-5">
            <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37]">Acesso restrito</p>
              <p className="mt-2 text-sm leading-6 text-[#D8D1C6]/70">
                O acesso ao dashboard depende de uma conta no Supabase Auth e de um perfil ativo em <code>admin_profiles</code>.
              </p>
            </div>

            <div className="space-y-5">
              <Field label="E-mail corporativo">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                  placeholder="equipe@hermidamaia.adv.br"
                  required
                />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">Senha</span>
                  <Link href="/interno/recuperar-senha" className="text-[11px] uppercase tracking-[0.16em] text-[#D8D1C6]/55 transition hover:text-[#D4AF37]">
                    Esqueci minha senha
                  </Link>
                </div>

                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                  placeholder="Digite sua senha"
                  required
                />
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/10 px-4 py-3 text-sm text-[#D8D1C6]/70">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(event) => setForm((current) => ({ ...current, remember: event.target.checked }))}
                  className="rounded border-white/20 bg-transparent text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                Manter sessao neste navegador
              </label>
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-[#FCA5A5]">{error}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[linear-gradient(90deg,#D4AF37,#A67C00)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.28em] text-[#050706] shadow-[0_16px_36px_rgba(212,175,55,0.22)] transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Entrando..." : "Acessar sistema"}
          </button>

          <div className="flex flex-col gap-3 text-sm text-[#D8D1C6]/65 md:flex-row md:items-center md:justify-between">
            <span>Auth via Supabase + validacao em admin_profiles</span>
            <Link href="/interno/cadastro-inicial" className="text-[#D4AF37] transition hover:text-[#F3D98B]">
              Cadastro inicial
            </Link>
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
