import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

let browserSupabase = null;
let browserSupabasePromise = null;
const SUPABASE_BROWSER_STORAGE_KEY = "hmadv:supabase-auth";

function buildBrowserSupabaseClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SUPABASE_BROWSER_STORAGE_KEY,
    },
  });
}

function resolveSupabaseConfigFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || null;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

async function fetchSupabaseConfig() {
  const response = await fetch("/api/admin-auth-config", {
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Configuracao publica do Supabase indisponivel.");
  }

  if (!payload.url || !payload.anonKey) {
    throw new Error("Configuracao publica do Supabase incompleta.");
  }

  return payload;
}

export async function getSupabaseBrowserClient() {
  if (browserSupabase) {
    return browserSupabase;
  }

  if (!browserSupabasePromise) {
    const envConfig = resolveSupabaseConfigFromEnv();

    if (envConfig) {
      browserSupabase = buildBrowserSupabaseClient(envConfig.url, envConfig.anonKey);
      browserSupabasePromise = Promise.resolve(browserSupabase);
      return browserSupabase;
    }

    browserSupabasePromise = fetchSupabaseConfig()
      .then((config) => {
        browserSupabase = buildBrowserSupabaseClient(config.url, config.anonKey);
        return browserSupabase;
      })
      .catch((error) => {
        browserSupabasePromise = null;
        throw error;
      });
  }

  return browserSupabasePromise;
}

export function useSupabaseBrowser() {
  const envConfig = useMemo(() => resolveSupabaseConfigFromEnv(), []);
  const [state, setState] = useState({
    loading: !browserSupabase && !envConfig,
    supabase: browserSupabase || (envConfig ? buildBrowserSupabaseClient(envConfig.url, envConfig.anonKey) : null),
    configError: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (browserSupabase || envConfig) {
      if (!browserSupabase && envConfig) {
        browserSupabase = buildBrowserSupabaseClient(envConfig.url, envConfig.anonKey);
      }
      setState({
        loading: false,
        supabase: browserSupabase,
        configError: null,
      });
      return undefined;
    }

    getSupabaseBrowserClient()
      .then((client) => {
        if (!cancelled) {
          setState({
            loading: false,
            supabase: client,
            configError: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            supabase: null,
            configError: error,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [envConfig]);

  return useMemo(
    () => ({
      ...state,
      isConfigured: Boolean(state.supabase),
    }),
    [state]
  );
}
