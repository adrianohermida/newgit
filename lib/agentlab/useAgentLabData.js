import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminFetch } from "../admin/api.js";
import { useAdminSession } from "../admin/useAdminSession.js";

const CACHE_KEY = "agentlab-dashboard-cache-v1";

export function useAgentLabData() {
  const admin = useAdminSession();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
    unauthorized: false,
  });
  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.sessionStorage.getItem(CACHE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (parsed?.data) {
        setState((current) => ({
          ...current,
          loading: current.loading,
          data: current.data || parsed.data,
        }));
      }
    } catch {
      // Ignore cache hydration failures and keep live fetch as source of truth.
    }
  }, []);

  useEffect(() => {
    if (admin.loading) {
      setState((current) => ({
        ...current,
        loading: current.data ? false : true,
        error: null,
        unauthorized: false,
      }));
      return undefined;
    }

    if (admin.configError) {
      setState({
        loading: false,
        error: "Configuracao do Supabase ausente para carregar o AgentLab.",
        data: null,
        unauthorized: false,
      });
      return undefined;
    }

    if (!admin.session || !admin.authorized) {
      setState({
        loading: false,
        error: null,
        data: null,
        unauthorized: true,
      });
      return undefined;
    }

    let cancelled = false;

    async function load() {
      try {
        setState((current) => ({
          ...current,
          loading: current.data ? false : true,
          error: null,
          unauthorized: false,
        }));
        const payload = await adminFetch("/api/admin-agentlab");
        if (!cancelled) {
          if (typeof window !== "undefined" && payload?.data) {
            window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: payload.data, updatedAt: Date.now() }));
          }
          setState({
            loading: false,
            error: null,
            data: payload.data || null,
            unauthorized: false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          const unauthorized = error instanceof AdminApiError && (error.status === 401 || error.status === 403);
          setState({
            loading: false,
            error: unauthorized ? null : error.message,
            data: null,
            unauthorized,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [admin.authorized, admin.configError, admin.loading, admin.session, reloadKey]);

  return {
    ...state,
    refresh,
  };
}
