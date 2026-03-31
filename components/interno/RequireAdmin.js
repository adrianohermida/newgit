import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAdminSession } from "../../lib/admin/useAdminSession";

function MessageState({ title, body }) {
  return (
    <div className="min-h-screen bg-[#050706] text-[#F4F1EA] flex items-center justify-center px-6">
      <div className="max-w-xl border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-8">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase mb-4" style={{ color: "#C5A059" }}>
          Area Interna
        </p>
        <h1 className="font-serif text-3xl mb-4">{title}</h1>
        <p className="opacity-70 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default function RequireAdmin({ children }) {
  const router = useRouter();
  const { loading, authorized, session, profile, error, configError } = useAdminSession();

  useEffect(() => {
    if (!loading && !configError && !session) {
      const next = encodeURIComponent(router.asPath || "/interno");
      router.replace(`/interno/login?next=${next}`);
    }
  }, [configError, loading, router, session]);

  if (configError) {
    return (
      <MessageState
        title="Configuracao do dashboard pendente"
        body="Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY para habilitar o login interno com Supabase."
      />
    );
  }

  if (loading) {
    return <MessageState title="Carregando acesso interno" body="Validando sessao e perfil administrativo." />;
  }

  if (error) {
    return (
      <MessageState
        title="Nao foi possivel validar o acesso"
        body="O login foi identificado, mas houve falha ao carregar o perfil administrativo no Supabase."
      />
    );
  }

  if (session && !authorized) {
    return (
      <MessageState
        title="Acesso sem permissao administrativa"
        body="Sua conta autenticada ainda nao possui um perfil ativo em admin_profiles. Cadastre o usuario no Supabase antes de liberar o dashboard."
      />
    );
  }

  if (!authorized || !profile) {
    return null;
  }

  return children(profile);
}
