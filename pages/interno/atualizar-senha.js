import Link from "next/link";
import { useState } from "react";
import AuthLayout from "../../components/interno/AuthLayout";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function AtualizarSenhaPage() {
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const rules = [
    { label: "Minimo de 8 caracteres", valid: form.password.length >= 8 },
    { label: "Incluir ao menos uma letra maiuscula", valid: /[A-Z]/.test(form.password) },
    { label: "Incluir um numero ou caractere especial", valid: /[\d\W]/.test(form.password) },
    { label: "Senhas devem ser identicas", valid: Boolean(form.password) && form.password === form.confirmPassword },
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase nao configurado no frontend.");
      return;
    }

    if (form.password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("A confirmacao de senha nao confere.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Senha atualizada com sucesso. Agora voce ja pode entrar no dashboard.");
    setSubmitting(false);
  }

  return (
    <AuthLayout
      title="Atualizar senha"
      description="Fluxo inspirado no Stitch com feedback visual de seguranca, mantendo a atualizacao real da senha via Supabase Auth."
      highlights={[
        "Referencia visual portada de recupera_o_de_senha_nova_senha.",
        "Checklist de seguranca para reduzir erro no reset.",
        "Atualizacao final usando supabase.auth.updateUser.",
      ]}
    >
      {!isSupabaseConfigured() ? (
        <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-[#F9D2D2]">
          Defina <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> para habilitar a atualizacao.
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-[24px] border border-[#1BD473]/12 bg-[#F6F8F7] p-6 text-[#102219] shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="mb-6">
              <h3 className="text-3xl font-black text-[#102219]">Redefinir senha</h3>
              <p className="mt-2 text-sm leading-6 text-[#345246]">
                Crie uma nova senha para acessar o painel interno e concluir a homologacao do fluxo.
              </p>
            </div>

            <div className="space-y-5">
              <PasswordField
                label="Nova senha"
                value={form.password}
                onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                shown={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />

              <PasswordField
                label="Confirmar nova senha"
                value={form.confirmPassword}
                onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))}
                shown={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((current) => !current)}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-[#11D473]/15 bg-[#11D473]/8 p-4">
              <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#0C9C55]">Seguranca da senha</h4>
              <ul className="space-y-2">
                {rules.map((rule) => (
                  <li key={rule.label} className={`flex items-center gap-3 text-sm ${rule.valid ? "text-[#102219]" : "text-[#5B7267]"}`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${rule.valid ? "bg-[#11D473] text-[#092014]" : "bg-slate-200 text-slate-500"}`}>
                      {rule.valid ? "OK" : "..."}
                    </span>
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-[#11D473] px-4 py-4 text-sm font-bold text-[#092014] transition hover:brightness-95 disabled:opacity-60"
            >
              {submitting ? "Atualizando..." : "Atualizar senha"}
            </button>
          </div>

          {error ? <div className="rounded-2xl border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] px-4 py-3 text-sm text-[#FCA5A5]">{error}</div> : null}
          {message ? <div className="rounded-2xl border border-[#0C9C55]/30 bg-[#0C9C55]/10 px-4 py-3 text-sm text-[#C8F3DD]">{message}</div> : null}

          <div className="flex flex-col gap-3 text-sm text-[#D8D1C6]/70 md:flex-row md:items-center md:justify-between">
            <Link href="/interno/login" className="text-[#11D473] transition hover:text-[#7DE5B1]">
              Ir para o login
            </Link>
            <span>Depois do reset, o acesso segue condicionado ao perfil interno ativo</span>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

function PasswordField({ label, value, onChange, shown, onToggle }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#102219]">{label}</span>
      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-0 bg-transparent px-4 py-4 text-[#102219] focus:ring-[#11D473]"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="border-l border-slate-200 px-4 text-sm font-semibold text-slate-500 transition hover:text-[#0C9C55]"
        >
          {shown ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </label>
  );
}
