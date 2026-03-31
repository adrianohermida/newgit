import Link from "next/link";
import { useState } from "react";
import AuthLayout from "../../components/interno/AuthLayout";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase nao configurado no frontend.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const redirectTo = `${window.location.origin}/interno/atualizar-senha`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      setError(resetError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Se o e-mail existir no Supabase Auth, voce recebera um link para redefinir a senha.");
    setSubmitting(false);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      description="Portado do Stitch para um fluxo simples de recuperacao: um campo, uma acao primaria e retorno rapido ao login."
      highlights={[
        "Referencia visual portada de recupera_o_de_senha_solicita_o.",
        "Reset disparado por supabase.auth.resetPasswordForEmail.",
        "Fluxo separado da home enquanto a homologacao interna avanca.",
      ]}
    >
      {!isSupabaseConfigured() ? (
        <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-[#F9D2D2]">
          Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para habilitar a recuperacao.
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-[24px] border border-[#1BD473]/15 bg-[#F7FAF8] p-6 text-[#0F1F18] shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#11D473]/12 text-2xl text-[#0C9C55]">
                @
              </div>
              <h3 className="text-2xl font-bold text-[#102219]">Recuperar acesso</h3>
              <p className="mt-2 text-sm leading-6 text-[#345246]">
                Informe o e-mail da conta interna para receber o link de redefinicao no fluxo do Supabase.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#102219]">E-mail cadastrado</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-[#102219] placeholder:text-slate-400 focus:border-[#11D473] focus:ring-[#11D473]"
                placeholder="equipe@hermidamaia.adv.br"
                required
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-[#11D473] px-4 py-4 text-sm font-bold text-[#092014] transition hover:brightness-95 disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar instrucoes de recuperacao"}
            </button>
          </div>

          {error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-[#FCA5A5]">{error}</div> : null}
          {message ? <div className="rounded-2xl border border-[#0C9C55]/30 bg-[#0C9C55]/10 px-4 py-3 text-sm text-[#C8F3DD]">{message}</div> : null}

          <div className="flex flex-col gap-3 text-sm text-[#D8D1C6]/70 md:flex-row md:items-center md:justify-between">
            <Link href="/interno/login" className="text-[#11D473] transition hover:text-[#7DE5B1]">
              Voltar para o login
            </Link>
            <span>Suporte interno disponivel durante a homologacao</span>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
