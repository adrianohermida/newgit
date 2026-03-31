import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgentLabDashboard } from "../lib/agentlab-admin.js";
import {
  AGENTLAB_DASHBOARD_MODULES,
  AGENTLAB_EVALUATION_BACKLOG,
  AGENTLAB_KNOWLEDGE_PACKS,
  AGENTLAB_RESPONSE_PLAYBOOKS,
  AGENTLAB_ROLLOUT_PHASES,
  AGENTLAB_WEEKLY_SPRINTS,
  AGENTLAB_WORKFLOW_BACKLOG,
} from "../../lib/agentlab/catalog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const dashboard = await getAgentLabDashboard(env);

    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        profile: {
          id: auth.profile.id,
          email: auth.profile.email,
          role: auth.profile.role,
        },
        ...dashboard,
        planning: {
          workflow_backlog: AGENTLAB_WORKFLOW_BACKLOG,
          knowledge_packs: AGENTLAB_KNOWLEDGE_PACKS,
          response_playbooks: AGENTLAB_RESPONSE_PLAYBOOKS,
          dashboard_modules: AGENTLAB_DASHBOARD_MODULES,
          evaluation_backlog: AGENTLAB_EVALUATION_BACKLOG,
          weekly_sprints: AGENTLAB_WEEKLY_SPRINTS,
          rollout_phases: AGENTLAB_ROLLOUT_PHASES,
        },
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message || "Falha ao carregar o AgentLab." }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
