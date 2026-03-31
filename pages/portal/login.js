import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import PortalAuthLayout from "../../components/portal/PortalAuthLayout";
import { useClientSession } from "../../lib/client/useClientSession";
import { useSupabaseBrowser } from "../../lib/supabase";

export default function PortalLoginPage() {
  const router = useRouter();
  const { session, onboardingRequired, loading } = useClientSession();
  const { supabase, isConfigured, loading: configLoading } = useSupabaseBrowser();
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && session) {
      const target = onboardingRequired ? "/portal/onboarding" : typeof router.query.next === "string" ? router.query.next : "/portal";
      router.replace(target);
    }
  }, [loading, onboardingRequired, router, session]);

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

    const target = typeof router.query.next === "string" ? router.query.next : "/portal";
    router.replace(target);
  }

  return (
    <PortalAuthLayout
      title="Entrar no portal"
      description="Acesse sua area autenticada para acompanhar consultas, tickets, documentos e os proximos passos do seu atendimento."
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        {configLoading ? (
          <div className="rounded-2xl border border-[#1f3a2f] bg-[rgba(12,39,28,0.42)] px-4 py-3 text-sm text-[#D7F3E4]">
            Carregando configuracao segura do portal...
          </div>
        ) : !isConfigured ? (
          <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-[#F9D2D2]">
            Defina <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> para habilitar o portal do cliente.
          </div>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C49C56]">E-mail</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#C49C56] focus:ring-[#C49C56]"
            placeholder="voce@exemplo.com"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C49C56]">Senha</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[#F7F1E8] placeholder:text-white/20 focus:border-[#C49C56] focus:ring-[#C49C56]"
            placeholder="Digite sua senha"
            required
          />
        </label>

        {error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-[#FCA5A5]">{error}</div> : null}

        <button
          type="submit"
          disabled={submitting || configLoading || !isConfigured}
          className="w-full rounded-xl bg-[linear-gradient(90deg,#C49C56,#D5B273)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.28em] text-[#07110E] shadow-[0_16px_36px_rgba(196,156,86,0.22)] transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? "Entrando..." : "Acessar portal"}
        </button>
      </form>
    </PortalAuthLayout>
  );
}
