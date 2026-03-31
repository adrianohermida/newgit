import { useEffect } from "react";
import { useRouter } from "next/router";
import { useClientSession } from "../../lib/client/useClientSession";

function MessageState({ title, body }) {
  return (
    <div className="min-h-screen bg-[#07110E] text-[#F4F1EA] flex items-center justify-center px-6">
      <div className="max-w-xl border border-[#20332D] bg-[rgba(12,20,18,0.96)] p-8">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase mb-4" style={{ color: "#C49C56" }}>
          Portal do cliente
        </p>
        <h1 className="font-serif text-3xl mb-4">{title}</h1>
        <p className="opacity-70 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default function RequireClient({ children, allowIncomplete = false }) {
  const router = useRouter();
  const { loading, authorized, onboardingRequired, session, profile, error, configError } = useClientSession();

  useEffect(() => {
    if (!loading && !configError && !session) {
      const next = encodeURIComponent(router.asPath || "/portal");
      router.replace(`/portal/login?next=${next}`);
      return;
    }

    if (!loading && session && onboardingRequired && !allowIncomplete) {
      router.replace("/portal/onboarding");
    }
  }, [allowIncomplete, configError, loading, onboardingRequired, router, session]);

  if (configError) {
    return (
      <MessageState
        title="Configuracao do portal pendente"
        body="Defina SUPABASE_URL e SUPABASE_ANON_KEY para habilitar o login do portal do cliente."
      />
    );
  }

  if (loading) {
    return <MessageState title="Carregando portal" body="Validando sessao e perfil do cliente." />;
  }

  if (error) {
    return (
      <MessageState
        title="Nao foi possivel validar o portal"
        body="O login foi identificado, mas houve falha ao carregar o perfil do cliente no Supabase."
      />
    );
  }

  if (session && onboardingRequired && allowIncomplete) {
    return children(profile);
  }

  if (!authorized && !allowIncomplete) {
    return null;
  }

  return children(profile);
}
