import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

let browserSupabase = null;
let browserSupabasePromise = null;

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
    browserSupabasePromise = fetchSupabaseConfig()
      .then((config) => {
        browserSupabase = createClient(config.url, config.anonKey);
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
  const [state, setState] = useState({
    loading: true,
    supabase: browserSupabase,
    configError: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (browserSupabase) {
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
  }, []);

  return useMemo(
    () => ({
      ...state,
      isConfigured: Boolean(state.supabase),
    }),
    [state]
  );
}
