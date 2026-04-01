import { useEffect, useState } from "react";
import { AdminApiError, adminFetch } from "../admin/api.js";
import { useAdminSession } from "../admin/useAdminSession.js";

export function useAgentLabData() {
  const admin = useAdminSession();
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
    unauthorized: false,
  });

  useEffect(() => {
    if (admin.loading) {
      setState((current) => ({
        ...current,
        loading: true,
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
          loading: true,
          error: null,
          unauthorized: false,
        }));
        const payload = await adminFetch("/api/admin-agentlab");
        if (!cancelled) {
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
  }, [admin.authorized, admin.configError, admin.loading, admin.session]);

  return state;
}
