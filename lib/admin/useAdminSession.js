import { useEffect, useMemo, useState } from "react";
import { useSupabaseBrowser } from "../supabase";
import { getFallbackSuperadminProfile, isFallbackSuperadminIdentity } from "./superadmin";

const ADMIN_SESSION_CACHE_KEY = "hmadv:admin-session-cache";
let adminSessionMemoryCache = null;

function readAdminSessionCache() {
  if (adminSessionMemoryCache) {
    return adminSessionMemoryCache;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ADMIN_SESSION_CACHE_KEY) || "null");
    adminSessionMemoryCache = parsed && typeof parsed === "object" ? parsed : null;
    return adminSessionMemoryCache;
  } catch {
    return null;
  }
}

function writeAdminSessionCache(value) {
  adminSessionMemoryCache = value;
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!value) {
      window.sessionStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
      return;
    }
    window.sessionStorage.setItem(ADMIN_SESSION_CACHE_KEY, JSON.stringify(value));
  } catch {
    // noop
  }
}

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
  const cachedState = readAdminSessionCache();
  const [state, setState] = useState({
    loading: !cachedState,
    session: cachedState?.session || null,
    profile: cachedState?.profile || null,
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
          const nextState = {
            loading: false,
            session,
            profile,
            error: null,
            configError: false,
          };
          writeAdminSessionCache({
            session,
            profile,
          });
          setState(nextState);
        }
      } catch (error) {
        if (!cancelled) {
          const nextState = {
            loading: false,
            session,
            profile: null,
            error,
            configError: false,
          };
          writeAdminSessionCache({
            session,
            profile: null,
          });
          setState(nextState);
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      syncSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        writeAdminSessionCache(null);
      }
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
