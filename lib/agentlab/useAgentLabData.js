<<<<<<< HEAD
import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminFetch } from "../admin/api.js";
import { useAdminSession } from "../admin/useAdminSession.js";

const CACHE_KEY = "agentlab-dashboard-cache-v1";

export function useAgentLabData() {
  const admin = useAdminSession();
  const [reloadKey, setReloadKey] = useState(0);
=======
import { useEffect, useState } from "react";
import { adminFetch } from "../admin/api";

const REMOTE_AGENTLAB_DASHBOARD_URL =
  "https://ampwhwqbtuwxpgnzsxau.functions.supabase.co/agentLabDashboardProbe";

function hasAgentLabSourceWarnings(payload) {
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
  if (!warnings.length) return false;

  const warnedSources = new Set(warnings.map((warning) => warning?.source).filter(Boolean));
  const expected = [
    "workspace_ai_agents",
    "ai_agents",
    "freshsales_sync_runs",
    "freshsales_sync_snapshots",
    "conversas",
    "agentlab_agent_profiles",
    "agentlab_improvement_queue",
    "agentlab_conversation_threads",
    "agentlab_incidents",
    "agentlab_training_scenarios",
    "agentlab_training_runs",
  ];

  return expected.some((source) => warnedSources.has(source));
}

function hasNoUsefulAgentLabData(payload) {
  const overview = payload?.overview || {};
  const agents = Array.isArray(payload?.agents) ? payload.agents : [];
  const runs = Array.isArray(payload?.crm_sync?.recent_runs) ? payload.crm_sync.recent_runs : [];
  const coverage = Array.isArray(payload?.crm_sync?.coverage) ? payload.crm_sync.coverage : [];
  const recentConversations = Array.isArray(payload?.conversations?.recent) ? payload.conversations.recent : [];

  return (
    !overview.total_agents &&
    !overview.total_snapshots &&
    agents.length === 0 &&
    runs.length === 0 &&
    coverage.length === 0 &&
    recentConversations.length === 0
  );
}

async function fetchRemoteAgentLabDashboard() {
  const response = await fetch(REMOTE_AGENTLAB_DASHBOARD_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Falha ao carregar fallback remoto do AgentLab.");
  }

  return {
    ok: true,
    ...payload,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
  };
}

export function useAgentLabData() {
>>>>>>> codex/hmadv-tpu-fase53
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
<<<<<<< HEAD
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

=======
  });

  useEffect(() => {
>>>>>>> codex/hmadv-tpu-fase53
    let cancelled = false;

    async function load() {
      try {
<<<<<<< HEAD
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
=======
        let payload = await adminFetch("/api/admin-agentlab");

        if (hasAgentLabSourceWarnings(payload)) {
          try {
            payload = await fetchRemoteAgentLabDashboard();
          } catch (remoteError) {
            if (hasNoUsefulAgentLabData(payload)) {
              throw remoteError;
            }
          }
        }

        if (!cancelled) {
          setState({ loading: false, error: null, data: payload });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "Falha ao carregar AgentLab.",
            data: null,
>>>>>>> codex/hmadv-tpu-fase53
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
<<<<<<< HEAD
  }, [admin.authorized, admin.configError, admin.loading, admin.session, reloadKey]);

  return {
    ...state,
    refresh,
  };
=======
  }, []);

  return state;
>>>>>>> codex/hmadv-tpu-fase53
}
