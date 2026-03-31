import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildConversationIntelligencePayload } from "../../../lib/agentlab/conversation-intelligence.js";
import {
  normalizeTrainingRun,
  normalizeTrainingScenario,
  summarizeTrainingCenter,
} from "../../../lib/agentlab/training-center.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizeAgent(agent: Record<string, unknown>) {
  const config = (agent.config as Record<string, unknown> | null) || {};
  const rawCapabilities =
    (agent.capacidades as unknown[]) ||
    (Array.isArray(config.capacidades) ? (config.capacidades as unknown[]) : []);

  return {
    id: agent.id,
    workspace_id: agent.workspace_id ?? agent.tenant_id ?? null,
    name: agent.name || agent.nome || "Agente sem nome",
    slug: agent.agent_slug || null,
    type: agent.tipo || "geral",
    status: agent.status || ((agent.active ?? agent.ativo) ? "ativo" : "inativo"),
    active: Boolean(agent.active ?? agent.ativo ?? false),
    usage_count: Number(agent.usage_count || 0),
    total_credits_used: Number(agent.total_credits_used || 0),
    provider_id: agent.provider_id || null,
    description: agent.descricao || null,
    instructions: agent.instructions || null,
    capabilities: rawCapabilities,
    capabilities_count: rawCapabilities.length,
    updated_at: agent.updated_at || agent.created_at || null,
  };
}

function summarizeSnapshots(rows: Record<string, unknown>[]) {
  const coverageMap = new Map<
    string,
    {
      entity: string;
      total: number;
      last_synced_at: string | null;
      sample_records: Array<{ source_id: unknown; display_name: unknown; status: unknown; filter_name: unknown }>;
    }
  >();

  for (const row of rows) {
    const key = String(row.entity || "unknown");
    const current = coverageMap.get(key) || {
      entity: key,
      total: 0,
      last_synced_at: (row.synced_at as string) || null,
      sample_records: [],
    };

    current.total += 1;

    if (!current.last_synced_at || new Date(String(row.synced_at || 0)) > new Date(current.last_synced_at)) {
      current.last_synced_at = (row.synced_at as string) || current.last_synced_at;
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

function summarizeImprovementQueue(rows: Record<string, unknown>[]) {
  const byCategory = new Map<string, number>();
  const bySprint = new Map<string, number>();

  for (const row of rows) {
    const category = String(row.category || "geral");
    const sprint = String(row.sprint_bucket || "Sem sprint");
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
    bySprint.set(sprint, (bySprint.get(sprint) || 0) + 1);
  }

  return {
    by_category: Array.from(byCategory.entries()).map(([category, total]) => ({ category, total })),
    by_sprint: Array.from(bySprint.entries()).map(([sprint, total]) => ({ sprint, total })),
  };
}

async function fetchAgentsWithFallback(supabase: ReturnType<typeof createClient>, warnings: Array<Record<string, string>>) {
  const { data: workspaceAgents, error: workspaceError } = await supabase
    .from("workspace_ai_agents")
    .select("id,workspace_id,agent_slug,name,nome,tipo,status,active,ativo,usage_count,total_credits_used,created_at,updated_at,descricao,capacidades,provider_id,instructions,config")
    .order("created_at", { ascending: true });

  if (!workspaceError) {
    return asArray(workspaceAgents).map((agent) => normalizeAgent(agent as unknown as Record<string, unknown>));
  }

  warnings.push({
    source: "workspace_ai_agents",
    level: "warning",
    message: "Fonte workspace_ai_agents indisponivel no projeto primario. Tentando fallback em ai_agents.",
  });

  const { data: aiAgents, error: aiAgentsError } = await supabase
    .from("ai_agents")
    .select("id,tenant_id,nome,tipo,provider_id,config,ativo,created_at");

  if (aiAgentsError) {
    warnings.push({
      source: "ai_agents",
      level: "warning",
      message: "Fonte ai_agents tambem nao esta disponivel no projeto primario.",
    });
    return [];
  }

  warnings.push({
    source: "ai_agents",
    level: "warning",
    message: "Catalogo de agentes carregado via fallback em ai_agents.",
  });

  return asArray(aiAgents).map((agent) =>
    normalizeAgent({
      ...(agent as unknown as Record<string, unknown>),
      workspace_id: (agent as Record<string, unknown>).tenant_id || null,
      name: (agent as Record<string, unknown>).nome || null,
      active: (agent as Record<string, unknown>).ativo,
    }),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Supabase env ausente para leitura" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const warnings: Array<Record<string, string>> = [];

  try {
    const [
      agents,
      runsResult,
      snapshotsResult,
      conversationsResult,
      intelligenceThreadsResult,
      intelligenceIncidentsResult,
      profilesResult,
      queueResult,
      trainingScenariosResult,
      trainingRunsResult,
    ] = await Promise.all([
      fetchAgentsWithFallback(supabase, warnings),
      supabase
        .from("freshsales_sync_runs")
        .select("id,entity,filter_name,status,records_synced,started_at,completed_at,source_total")
        .order("started_at", { ascending: false })
        .limit(12),
      supabase
        .from("freshsales_sync_snapshots")
        .select("entity,source_id,display_name,status,source_filter_name,synced_at")
        .order("synced_at", { ascending: false })
        .limit(60),
      supabase
        .from("conversas")
        .select("id,canal,status,assunto,ultima_mensagem,updated_at")
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("agentlab_conversation_threads")
        .select("id,source_system,source_conversation_id,workspace_id,contact_id,process_id,channel,status,subject,last_message,started_at,last_message_at,assigned_to,sentiment_label,urgency_label,intent_label,handoff_required,metadata,raw_payload,created_at,updated_at")
        .order("last_message_at", { ascending: false })
        .limit(100),
      supabase
        .from("agentlab_incidents")
        .select("id,source_system,category,severity,status,title,description,agent_ref,conversation_id,internal_user_id,internal_user_email,metadata,occurred_at,created_at,updated_at")
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("agentlab_agent_profiles")
        .select("id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("agentlab_improvement_queue")
        .select("id,agent_ref,category,title,description,priority,status,source_channel,sprint_bucket,metadata,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("agentlab_training_scenarios")
        .select("id,agent_ref,scenario_name,category,user_message,expected_intent,expected_outcome,expected_workflow,expected_knowledge_pack,expected_handoff,difficulty,score_threshold,tags,metadata,status,created_at,updated_at")
        .order("scenario_name", { ascending: true }),
      supabase
        .from("agentlab_training_runs")
        .select("id,scenario_id,agent_ref,provider,model,prompt_version,generated_response,evaluator_summary,intent_detected,handoff_recommended,scores,recommendations,raw_result,status,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (runsResult.error) {
      warnings.push({
        source: "freshsales_sync_runs",
        level: "warning",
        message: "Fonte freshsales_sync_runs indisponivel no projeto primario.",
      });
    }

    if (snapshotsResult.error) {
      warnings.push({
        source: "freshsales_sync_snapshots",
        level: "warning",
        message: "Fonte freshsales_sync_snapshots indisponivel no projeto primario.",
      });
    }

    if (conversationsResult.error) {
      warnings.push({
        source: "conversas",
        level: "warning",
        message: "Fonte conversas indisponivel no projeto primario.",
      });
    }

    if (intelligenceThreadsResult.error) {
      warnings.push({
        source: "agentlab_conversation_threads",
        level: "warning",
        message: "Fonte agentlab_conversation_threads indisponivel no projeto primario.",
      });
    }

    if (intelligenceIncidentsResult.error) {
      warnings.push({
        source: "agentlab_incidents",
        level: "warning",
        message: "Fonte agentlab_incidents indisponivel no projeto primario.",
      });
    }

    if (profilesResult.error) {
      warnings.push({
        source: "agentlab_agent_profiles",
        level: "warning",
        message: "Fonte agentlab_agent_profiles indisponivel no projeto primario.",
      });
    }

    if (queueResult.error) {
      warnings.push({
        source: "agentlab_improvement_queue",
        level: "warning",
        message: "Fonte agentlab_improvement_queue indisponivel no projeto primario.",
      });
    }

    if (trainingScenariosResult.error) {
      warnings.push({
        source: "agentlab_training_scenarios",
        level: "warning",
        message: "Fonte agentlab_training_scenarios indisponivel no projeto primario.",
      });
    }

    if (trainingRunsResult.error) {
      warnings.push({
        source: "agentlab_training_runs",
        level: "warning",
        message: "Fonte agentlab_training_runs indisponivel no projeto primario.",
      });
    }

    const runs = asArray(runsResult.data as Record<string, unknown>[] | null);
    const snapshots = asArray(snapshotsResult.data as Record<string, unknown>[] | null);
    const conversations = asArray(conversationsResult.data as Record<string, unknown>[] | null);
    const intelligenceThreads = asArray(intelligenceThreadsResult.data as Record<string, unknown>[] | null);
    const intelligenceIncidents = asArray(intelligenceIncidentsResult.data as Record<string, unknown>[] | null);
    const profiles = asArray(profilesResult.data as Record<string, unknown>[] | null);
    const queue = asArray(queueResult.data as Record<string, unknown>[] | null);
    const trainingScenarios = asArray(trainingScenariosResult.data as Record<string, unknown>[] | null).map((row) =>
      normalizeTrainingScenario(row),
    );
    const trainingRuns = asArray(trainingRunsResult.data as Record<string, unknown>[] | null).map((row) =>
      normalizeTrainingRun(row),
    );
    const coverage = summarizeSnapshots(snapshots);
    const conversationIntelligence = buildConversationIntelligencePayload(
      intelligenceThreads.length ? intelligenceThreads : conversations,
      intelligenceIncidents,
    );
    const queueSummary = summarizeImprovementQueue(queue);
    const trainingSummary = summarizeTrainingCenter(trainingScenarios, trainingRuns);
    const totalSnapshots = coverage.reduce((sum, item) => sum + item.total, 0);
    const lastSyncAt = runs.length ? (runs[0].completed_at as string) || (runs[0].started_at as string) : null;

    return jsonResponse({
      success: true,
      overview: {
        total_agents: agents.length,
        active_agents: agents.filter((agent) => agent.active).length,
        crm_entities_synced: coverage.length,
        total_snapshots: totalSnapshots,
        recent_sync_runs: runs.length,
        recent_conversations: conversationIntelligence.summary.total_threads || conversations.length,
        conversation_channels: conversationIntelligence.summary.by_channel?.length || 0,
        last_sync_at: lastSyncAt,
        configured_agent_profiles: profiles.length,
        improvement_queue_items: queue.length,
        training_scenarios: trainingSummary.total_scenarios,
        training_runs: trainingSummary.total_runs,
        training_average_score: trainingSummary.average_score,
        imported_conversations: conversationIntelligence.summary.total_threads || 0,
        open_incidents: conversationIntelligence.summary.open_incidents || 0,
      },
      agents,
      crm_sync: {
        recent_runs: runs,
        coverage,
      },
      conversations: {
        channels: conversationIntelligence.summary.by_channel.map((item) => ({
          channel: item.channel,
          total: item.total,
          statuses: {},
        })),
        recent: conversationIntelligence.threads,
      },
      intelligence: {
        summary: conversationIntelligence.summary,
        threads: conversationIntelligence.threads,
        incidents: conversationIntelligence.incidents,
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
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500,
    );
  }
});
