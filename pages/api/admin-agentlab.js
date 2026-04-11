<<<<<<< HEAD
import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { getAgentLabDashboard } from "../../lib/agentlab/server.js";
=======
import {
  AGENTLAB_DASHBOARD_MODULES,
  AGENTLAB_EVALUATION_BACKLOG,
  AGENTLAB_KNOWLEDGE_PACKS,
  AGENTLAB_RESPONSE_PLAYBOOKS,
  AGENTLAB_ROLLOUT_PHASES,
  AGENTLAB_WEEKLY_SPRINTS,
  AGENTLAB_WORKFLOW_BACKLOG,
} from "../../lib/agentlab/catalog";
import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server";
import { buildConversationIntelligencePayload } from "../../lib/agentlab/conversation-intelligence.js";
import {
  normalizeTrainingRun,
  normalizeTrainingScenario,
  summarizeTrainingCenter,
} from "../../lib/agentlab/training-center";
const REMOTE_AGENTLAB_DASHBOARD_URL =
  "https://ampwhwqbtuwxpgnzsxau.functions.supabase.co/agentLabDashboardProbe";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAgent(agent) {
  const capabilities = Array.isArray(agent.capacidades)
    ? agent.capacidades
    : Array.isArray(agent.config?.capacidades)
      ? agent.config.capacidades
      : [];

  return {
    id: agent.id,
    workspace_id: agent.workspace_id,
    name: agent.name || agent.nome || "Agente sem nome",
    slug: agent.agent_slug || null,
    type: agent.tipo || "geral",
    status: agent.status || (agent.active || agent.ativo ? "ativo" : "inativo"),
    active: Boolean(agent.active ?? agent.ativo ?? false),
    usage_count: Number(agent.usage_count || 0),
    total_credits_used: Number(agent.total_credits_used || 0),
    provider_id: agent.provider_id || null,
    description: agent.descricao || null,
    instructions: agent.instructions || null,
    capabilities,
    capabilities_count: capabilities.length,
    updated_at: agent.updated_at || agent.created_at || null,
  };
}

function summarizeSnapshots(rows) {
  const coverageMap = new Map();

  for (const row of rows) {
    const key = row.entity || "unknown";
    const current = coverageMap.get(key) || {
      entity: key,
      total: 0,
      last_synced_at: row.synced_at || null,
      sample_records: [],
    };

    current.total += 1;

    if (!current.last_synced_at || new Date(row.synced_at) > new Date(current.last_synced_at)) {
      current.last_synced_at = row.synced_at || current.last_synced_at;
    }

    if (current.sample_records.length < 3) {
      current.sample_records.push({
        source_id: row.source_id,
        display_name: row.display_name || row.source_id,
        status: row.status || null,
        filter_name: row.source_filter_name || null,
      });
    }

    coverageMap.set(key, current);
  }

  return Array.from(coverageMap.values()).sort((left, right) => right.total - left.total);
}

function summarizeConversations(rows) {
  const channelMap = new Map();

  for (const row of rows) {
    const key = row.canal || "desconhecido";
    const current = channelMap.get(key) || { channel: key, total: 0, statuses: {} };
    current.total += 1;
    current.statuses[row.status || "sem_status"] = (current.statuses[row.status || "sem_status"] || 0) + 1;
    channelMap.set(key, current);
  }

  return Array.from(channelMap.values()).sort((left, right) => right.total - left.total);
}

function summarizeImprovementQueue(rows) {
  const byCategory = new Map();
  const bySprint = new Map();

  for (const row of rows) {
    const category = row.category || "geral";
    const sprint = row.sprint_bucket || "Sem sprint";
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
    bySprint.set(sprint, (bySprint.get(sprint) || 0) + 1);
  }

  return {
    by_category: Array.from(byCategory.entries()).map(([category, total]) => ({ category, total })),
    by_sprint: Array.from(bySprint.entries()).map(([sprint, total]) => ({ sprint, total })),
  };
}

function isMissingSourceError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("PGRST205") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

async function safeFetchSupabaseAdmin(path, fallbackValue, warnings, label) {
  try {
    return await fetchSupabaseAdmin(path);
  } catch (error) {
    if (isMissingSourceError(error)) {
      warnings.push({
        source: label,
        level: "warning",
        message: `Fonte ${label} indisponivel neste ambiente. O painel seguira com dados parciais.`,
      });
      return fallbackValue;
    }

    throw error;
  }
}

async function fetchAgentsWithFallback(warnings) {
  const workspaceAgentParams = new URLSearchParams();
  workspaceAgentParams.set(
    "select",
    "id,workspace_id,agent_slug,name,nome,tipo,status,active,ativo,usage_count,total_credits_used,created_at,updated_at,descricao,capacidades,provider_id,instructions,config"
  );
  workspaceAgentParams.set("order", "created_at.asc");

  try {
    const rows = await fetchSupabaseAdmin(`workspace_ai_agents?${workspaceAgentParams.toString()}`);
    return asArray(rows);
  } catch (error) {
    if (!isMissingSourceError(error)) {
      throw error;
    }

    warnings.push({
      source: "workspace_ai_agents",
      level: "warning",
      message: "Fonte workspace_ai_agents indisponivel neste ambiente. Tentando fallback em ai_agents.",
    });
  }

  const aiAgentsParams = new URLSearchParams();
  aiAgentsParams.set("select", "id,tenant_id,nome,tipo,provider_id,config,ativo,created_at");
  aiAgentsParams.set("order", "created_at.asc");

  try {
    const rows = await fetchSupabaseAdmin(`ai_agents?${aiAgentsParams.toString()}`);
    warnings.push({
      source: "ai_agents",
      level: "warning",
      message: "Catalogo de agentes carregado via fallback em ai_agents.",
    });
    return asArray(rows).map((row) => ({
      ...row,
      workspace_id: row.tenant_id || null,
      name: row.nome || null,
      active: row.ativo,
      config: row.config || {},
    }));
  } catch (error) {
    if (isMissingSourceError(error)) {
      warnings.push({
        source: "ai_agents",
        level: "warning",
        message: "Fonte ai_agents tambem nao esta disponivel neste ambiente. O painel seguira sem catalogo de agentes.",
      });
      return [];
    }

    throw error;
  }
}
>>>>>>> codex/hmadv-tpu-fase53

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

<<<<<<< HEAD
  const auth = await requireAdminNode(req);
=======
  const auth = await requireAdminApiAccess(req);
>>>>>>> codex/hmadv-tpu-fase53
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
<<<<<<< HEAD
    const data = await getAgentLabDashboard(process.env);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar AgentLab." });
=======
    const warnings = [];

    const runParams = new URLSearchParams();
    runParams.set("select", "id,entity,filter_name,status,records_synced,started_at,completed_at,source_total");
    runParams.set("order", "started_at.desc");
    runParams.set("limit", "12");

    const snapshotParams = new URLSearchParams();
    snapshotParams.set("select", "entity,source_id,display_name,status,source_filter_name,synced_at");
    snapshotParams.set("order", "synced_at.desc");
    snapshotParams.set("limit", "60");

    const conversationParams = new URLSearchParams();
    conversationParams.set("select", "id,canal,status,assunto,ultima_mensagem,updated_at");
    conversationParams.set("order", "updated_at.desc");
    conversationParams.set("limit", "30");

    const intelligenceThreadParams = new URLSearchParams();
    intelligenceThreadParams.set(
      "select",
      "id,source_system,source_conversation_id,workspace_id,contact_id,process_id,channel,status,subject,last_message,started_at,last_message_at,assigned_to,sentiment_label,urgency_label,intent_label,handoff_required,metadata,raw_payload,created_at,updated_at"
    );
    intelligenceThreadParams.set("order", "last_message_at.desc");
    intelligenceThreadParams.set("limit", "100");

    const intelligenceIncidentParams = new URLSearchParams();
    intelligenceIncidentParams.set(
      "select",
      "id,source_system,category,severity,status,title,description,agent_ref,conversation_id,internal_user_id,internal_user_email,metadata,occurred_at,created_at,updated_at"
    );
    intelligenceIncidentParams.set("order", "occurred_at.desc");
    intelligenceIncidentParams.set("limit", "100");

    const profileParams = new URLSearchParams();
    profileParams.set(
      "select",
      "id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at"
    );
    profileParams.set("order", "updated_at.desc");

    const queueParams = new URLSearchParams();
    queueParams.set(
      "select",
      "id,agent_ref,category,title,description,priority,status,source_channel,sprint_bucket,metadata,updated_at"
    );
    queueParams.set("order", "updated_at.desc");
    queueParams.set("limit", "100");

    const trainingScenarioParams = new URLSearchParams();
    trainingScenarioParams.set(
      "select",
      "id,agent_ref,scenario_name,category,user_message,expected_intent,expected_outcome,expected_workflow,expected_knowledge_pack,expected_handoff,difficulty,score_threshold,tags,metadata,status,created_at,updated_at"
    );
    trainingScenarioParams.set("order", "scenario_name.asc");

    const trainingRunParams = new URLSearchParams();
    trainingRunParams.set(
      "select",
      "id,scenario_id,agent_ref,provider,model,prompt_version,generated_response,evaluator_summary,intent_detected,handoff_recommended,scores,recommendations,raw_result,status,created_at"
    );
    trainingRunParams.set("order", "created_at.desc");
    trainingRunParams.set("limit", "30");

    const sourceSyncRunParams = new URLSearchParams();
    sourceSyncRunParams.set("select", "id,source_name,sync_scope,status,records_synced,notes,metadata,created_at");
    sourceSyncRunParams.set("order", "created_at.desc");
    sourceSyncRunParams.set("limit", "20");

    const [agentsRaw, runsRaw, snapshotsRaw, conversationsRaw, intelligenceThreadsRaw, intelligenceIncidentsRaw, sourceSyncRunsRaw, profilesRaw, queueRaw, trainingScenariosRaw, trainingRunsRaw] = await Promise.all([
      fetchAgentsWithFallback(warnings),
      safeFetchSupabaseAdmin(`freshsales_sync_runs?${runParams.toString()}`, [], warnings, "freshsales_sync_runs"),
      safeFetchSupabaseAdmin(`freshsales_sync_snapshots?${snapshotParams.toString()}`, [], warnings, "freshsales_sync_snapshots"),
      safeFetchSupabaseAdmin(`conversas?${conversationParams.toString()}`, [], warnings, "conversas"),
      safeFetchSupabaseAdmin(`agentlab_conversation_threads?${intelligenceThreadParams.toString()}`, [], warnings, "agentlab_conversation_threads"),
      safeFetchSupabaseAdmin(`agentlab_incidents?${intelligenceIncidentParams.toString()}`, [], warnings, "agentlab_incidents"),
      safeFetchSupabaseAdmin(`agentlab_source_sync_runs?${sourceSyncRunParams.toString()}`, [], warnings, "agentlab_source_sync_runs"),
      safeFetchSupabaseAdmin(`agentlab_agent_profiles?${profileParams.toString()}`, [], warnings, "agentlab_agent_profiles"),
      safeFetchSupabaseAdmin(`agentlab_improvement_queue?${queueParams.toString()}`, [], warnings, "agentlab_improvement_queue"),
      safeFetchSupabaseAdmin(`agentlab_training_scenarios?${trainingScenarioParams.toString()}`, [], warnings, "agentlab_training_scenarios"),
      safeFetchSupabaseAdmin(`agentlab_training_runs?${trainingRunParams.toString()}`, [], warnings, "agentlab_training_runs"),
    ]);

    const agents = asArray(agentsRaw).map(normalizeAgent);
    const runs = asArray(runsRaw);
    const snapshots = asArray(snapshotsRaw);
    const conversations = asArray(conversationsRaw);
    const intelligenceThreads = asArray(intelligenceThreadsRaw);
    const intelligenceIncidents = asArray(intelligenceIncidentsRaw);
    const sourceSyncRuns = asArray(sourceSyncRunsRaw);
    const profiles = asArray(profilesRaw);
    const queue = asArray(queueRaw);
    const trainingScenarios = asArray(trainingScenariosRaw).map(normalizeTrainingScenario);
    const trainingRuns = asArray(trainingRunsRaw).map(normalizeTrainingRun);
    const coverage = summarizeSnapshots(snapshots);
    const channels = summarizeConversations(conversations);
    const conversationIntelligence = buildConversationIntelligencePayload(
      intelligenceThreads.length ? intelligenceThreads : conversations,
      intelligenceIncidents
    );
    const queueSummary = summarizeImprovementQueue(queue);
    const trainingSummary = summarizeTrainingCenter(trainingScenarios, trainingRuns);

    const totalSnapshots = coverage.reduce((sum, item) => sum + item.total, 0);
    const lastSyncAt = runs.length ? runs[0].completed_at || runs[0].started_at : null;
    const noPrimaryData =
      agents.length === 0 &&
      runs.length === 0 &&
      snapshots.length === 0 &&
      conversations.length === 0 &&
      warnings.length > 0;

    if (noPrimaryData) {
      try {
        const response = await fetch(process.env.AGENTLAB_REMOTE_DASHBOARD_URL || REMOTE_AGENTLAB_DASHBOARD_URL, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (response.ok) {
          const payload = await response.json();
          if (payload?.success) {
            return res.status(200).json({
              ok: true,
              generated_at: new Date().toISOString(),
              profile: {
                id: auth.profile.id,
                email: auth.profile.email,
                role: auth.profile.role,
              },
              ...payload,
              warnings: payload.warnings || [],
              planning: {
                workflow_backlog: AGENTLAB_WORKFLOW_BACKLOG,
                knowledge_packs: AGENTLAB_KNOWLEDGE_PACKS,
                response_playbooks: AGENTLAB_RESPONSE_PLAYBOOKS,
                dashboard_modules: AGENTLAB_DASHBOARD_MODULES,
                evaluation_backlog: AGENTLAB_EVALUATION_BACKLOG,
                weekly_sprints: AGENTLAB_WEEKLY_SPRINTS,
                rollout_phases: AGENTLAB_ROLLOUT_PHASES,
              },
            });
          }
        }
      } catch (_error) {
        warnings.push({
          source: "remote_fallback",
          level: "warning",
          message: "Falha ao consultar o fallback remoto do AgentLab.",
        });
      }
    }

    return res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      profile: {
        id: auth.profile.id,
        email: auth.profile.email,
        role: auth.profile.role,
      },
      overview: {
        total_agents: agents.length,
        active_agents: agents.filter((agent) => agent.active).length,
        crm_entities_synced: coverage.length,
        total_snapshots: totalSnapshots,
        recent_sync_runs: runs.length,
        recent_conversations: conversationIntelligence.summary.total_threads || conversations.length,
        conversation_channels: conversationIntelligence.summary.by_channel?.length || channels.length,
        last_sync_at: lastSyncAt,
        configured_agent_profiles: profiles.length,
        improvement_queue_items: queue.length,
        training_scenarios: trainingSummary.total_scenarios,
        training_runs: trainingSummary.total_runs,
        training_average_score: trainingSummary.average_score,
        imported_conversations: conversationIntelligence.summary.total_threads || 0,
        open_incidents: conversationIntelligence.summary.open_incidents || 0,
        source_sync_runs: sourceSyncRuns.length,
      },
      agents,
      crm_sync: {
        recent_runs: runs,
        coverage,
      },
      conversations: {
        channels: conversationIntelligence.summary.by_channel?.length
          ? conversationIntelligence.summary.by_channel.map((item) => ({
              channel: item.channel,
              total: item.total,
              statuses: {},
            }))
          : channels,
        recent: conversationIntelligence.threads.length ? conversationIntelligence.threads : conversations,
      },
      intelligence: {
        summary: conversationIntelligence.summary,
        threads: conversationIntelligence.threads,
        incidents: conversationIntelligence.incidents,
        sync_runs: sourceSyncRuns,
      },
      governance: {
        profiles,
        queue,
        queue_summary: queueSummary,
      },
      training: {
        summary: trainingSummary,
        scenarios: trainingScenarios,
        recent_runs: trainingRuns,
      },
      warnings,
      planning: {
        workflow_backlog: AGENTLAB_WORKFLOW_BACKLOG,
        knowledge_packs: AGENTLAB_KNOWLEDGE_PACKS,
        response_playbooks: AGENTLAB_RESPONSE_PLAYBOOKS,
        dashboard_modules: AGENTLAB_DASHBOARD_MODULES,
        evaluation_backlog: AGENTLAB_EVALUATION_BACKLOG,
        weekly_sprints: AGENTLAB_WEEKLY_SPRINTS,
        rollout_phases: AGENTLAB_ROLLOUT_PHASES,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao carregar o AgentLab.",
    });
>>>>>>> codex/hmadv-tpu-fase53
  }
}
