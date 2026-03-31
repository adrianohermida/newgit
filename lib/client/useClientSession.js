import { useEffect, useMemo, useState } from "react";
import { useSupabaseBrowser } from "../supabase";

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildFallbackClientProfile(user) {
  const metadata = normalizeMetadata(user?.user_metadata);
  return {
    id: user?.id || null,
    email: user?.email || "",
    full_name: metadata.full_name || metadata.name || "",
    is_active: metadata.is_active !== false,
    whatsapp: metadata.whatsapp || "",
    cpf: metadata.cpf || "",
    metadata: {
      consent_lgpd: metadata.consent_lgpd === true,
      communication_consent: metadata.communication_consent === true,
      office_whatsapp: metadata.office_whatsapp || null,
    },
  };
}

export function isClientProfileComplete(profile) {
  const metadata = normalizeMetadata(profile?.metadata);
  return Boolean(
    profile?.is_active &&
      profile?.full_name &&
      profile?.whatsapp &&
      profile?.cpf &&
      metadata.consent_lgpd === true
  );
}

async function loadClientProfile(session) {
  if (!session?.user?.id || !session?.access_token) {
    return null;
  }

  try {
    const response = await fetch("/api/client-profile", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      return buildFallbackClientProfile(session.user);
    }

    return payload.profile || buildFallbackClientProfile(session.user);
  } catch (error) {
    console.warn("Falha ao carregar perfil do cliente pela API do portal.", error);
    return buildFallbackClientProfile(session.user);
  }
}

export function useClientSession() {
  const { supabase, loading: configLoading, configError } = useSupabaseBrowser();
  const [state, setState] = useState({
    loading: true,
    session: null,
    profile: null,
    error: null,
    configError: null,
  });

  useEffect(() => {
    if (configLoading) {
      setState((current) => ({
        ...current,
        loading: true,
        configError: null,
      }));
      return undefined;
    }

    if (configError) {
      setState({
        loading: false,
        session: null,
        profile: null,
        error: null,
        configError,
      });
      return undefined;
    }

    let cancelled = false;

    async function syncSession(session) {
      if (!session?.user) {
        if (!cancelled) {
          setState({
            loading: false,
            session: null,
            profile: null,
            error: null,
            configError: false,
          });
        }
        return;
      }

      try {
        const profile = await loadClientProfile(session);
        if (!cancelled) {
          setState({
            loading: false,
            session,
            profile,
            error: null,
            configError: false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            session,
            profile: null,
            error,
            configError: false,
          });
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      syncSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [configError, configLoading, supabase]);

  return useMemo(() => {
    const activeProfile = Boolean(state.profile && state.profile.is_active);
    const onboardingRequired = Boolean(state.session && !isClientProfileComplete(state.profile));
    const authorized = Boolean(state.session && activeProfile && !onboardingRequired);

    return {
      ...state,
      onboardingRequired,
      authorized,
    };
  }, [state]);
}
