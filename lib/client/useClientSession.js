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

async function loadClientProfile(supabase, user) {
  if (!supabase || !user?.id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("client_profiles")
      .select("id,email,full_name,is_active,whatsapp,cpf,metadata,created_at,updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      const message = String(error?.message || "");
      if (message.includes("404") || message.includes("PGRST205") || message.includes("client_profiles")) {
        return buildFallbackClientProfile(user);
      }
      throw error;
    }

    return data || buildFallbackClientProfile(user);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("404") || message.includes("PGRST205") || message.includes("client_profiles")) {
      return buildFallbackClientProfile(user);
    }
    throw error;
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
        const profile = await loadClientProfile(supabase, session.user);
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
