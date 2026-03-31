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
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
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
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
