import { fetchSupabaseAdmin } from "./supabase-rest.js";

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

async function safeFetchSupabaseAdmin(env, path, fallbackValue, warnings, label) {
  try {
    return await fetchSupabaseAdmin(env, path);
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

async function fetchAgentsWithFallback(env, warnings) {
  const workspaceAgentParams = new URLSearchParams();
  workspaceAgentParams.set(
    "select",
    "id,workspace_id,agent_slug,name,nome,tipo,status,active,ativo,usage_count,total_credits_used,created_at,updated_at,descricao,capacidades,provider_id,instructions,config"
  );
  workspaceAgentParams.set("order", "created_at.asc");

  try {
    const rows = await fetchSupabaseAdmin(env, `workspace_ai_agents?${workspaceAgentParams.toString()}`);
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
    const rows = await fetchSupabaseAdmin(env, `ai_agents?${aiAgentsParams.toString()}`);
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

export async function getAgentLabDashboard(env) {
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

  const [agentsRaw, runsRaw, snapshotsRaw, conversationsRaw] = await Promise.all([
    fetchAgentsWithFallback(env, warnings),
    safeFetchSupabaseAdmin(env, `freshsales_sync_runs?${runParams.toString()}`, [], warnings, "freshsales_sync_runs"),
    safeFetchSupabaseAdmin(env, `freshsales_sync_snapshots?${snapshotParams.toString()}`, [], warnings, "freshsales_sync_snapshots"),
    safeFetchSupabaseAdmin(env, `conversas?${conversationParams.toString()}`, [], warnings, "conversas"),
  ]);

  const agents = asArray(agentsRaw).map(normalizeAgent);
  const runs = asArray(runsRaw);
  const snapshots = asArray(snapshotsRaw);
  const conversations = asArray(conversationsRaw);
  const coverage = summarizeSnapshots(snapshots);
  const channels = summarizeConversations(conversations);

  const totalSnapshots = coverage.reduce((sum, item) => sum + item.total, 0);
  const lastSyncAt = runs.length ? runs[0].completed_at || runs[0].started_at : null;

  return {
    overview: {
      total_agents: agents.length,
      active_agents: agents.filter((agent) => agent.active).length,
      crm_entities_synced: coverage.length,
      total_snapshots: totalSnapshots,
      recent_sync_runs: runs.length,
      recent_conversations: conversations.length,
      conversation_channels: channels.length,
      last_sync_at: lastSyncAt,
    },
    agents,
    crm_sync: {
      recent_runs: runs,
      coverage,
    },
    conversations: {
      channels,
      recent: conversations,
    },
    warnings,
  };
}
