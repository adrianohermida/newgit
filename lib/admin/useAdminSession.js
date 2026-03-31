import { useEffect, useMemo, useState } from "react";
import { useSupabaseBrowser } from "../supabase";
import { getFallbackSuperadminProfile, isFallbackSuperadminIdentity } from "./superadmin";

async function loadAdminProfile(supabase, user) {
  if (!supabase || !user?.id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("admin_profiles")
      .select("id,email,full_name,role,is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  } catch (error) {
    if (isFallbackSuperadminIdentity(user)) {
      return getFallbackSuperadminProfile();
    }

    throw error;
  }

  if (isFallbackSuperadminIdentity(user)) {
    return getFallbackSuperadminProfile();
  }

  return null;
}

export function useAdminSession() {
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
        const profile = await loadAdminProfile(supabase, session.user);
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
    const authorized = Boolean(state.session && state.profile && state.profile.is_active);
    return {
      ...state,
      authorized,
    };
  }, [state]);
}
