import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getCleanEnvValue } from "./env.js";
import { normalizeImportedIncident, normalizeImportedThread } from "../../lib/agentlab/conversation-intelligence.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchLegacyConversations(env, limit = 200) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,workspace_id,contato_id,processo_id,canal,status,assunto,ultima_mensagem,ultima_mensagem_at,assigned_to,metadata,created_at,updated_at,last_message_at,created_date,updated_date"
  );
  params.set("order", "coalesce(updated_date,updated_at).desc");
  params.set("limit", String(limit));
  return fetchSupabaseAdmin(env, `conversas?${params.toString()}`);
}

function getFreshsalesConfig(env) {
  const baseUrl =
    getCleanEnvValue(env.FRESHSALES_API_BASE) ||
    getCleanEnvValue(env.FRESHSALES_BASE_URL) ||
    getCleanEnvValue(env.FRESHSALES_DOMAIN && `https://${env.FRESHSALES_DOMAIN}`) ||
    null;
  const apiKey = getCleanEnvValue(env.FRESHSALES_API_KEY) || null;
  return { baseUrl: baseUrl?.replace(/\/+$/, ""), apiKey };
}

async function fetchFreshsalesJson(env, path) {
  const { baseUrl, apiKey } = getFreshsalesConfig(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Freshsales incompleta no ambiente.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Freshsales request failed with status ${response.status}`);
  }

  return response.json();
}

async function upsertThreads(env, threads) {
  if (!threads.length) return [];

  return fetchSupabaseAdmin(env, "agentlab_conversation_threads?on_conflict=source_system,source_conversation_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(threads),
  });
}

async function createSyncRun(env, payload) {
  const inserted = await fetchSupabaseAdmin(env, "agentlab_source_sync_runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return asArray(inserted)[0] || payload;
}

async function ensureClassificationGapIncident(env) {
  const threads = await fetchSupabaseAdmin(
    env,
    "agentlab_conversation_threads?select=id&or=(intent_label.is.null,intent_label.eq.)"
  );
  const total = asArray(threads).length;

  if (!total) {
    return { created: false, total_unclassified: 0 };
  }

  const existing = await fetchSupabaseAdmin(
    env,
    "agentlab_incidents?select=id,metadata&source_system=eq.agentlab-sync&category=eq.classification_gap&status=eq.open&limit=1"
  );

  const payload = normalizeImportedIncident({
    source_system: "agentlab-sync",
    category: "classification_gap",
    severity: total >= 20 ? "alta" : "media",
    status: "open",
    title: "Conversas sem intent_label classificadas",
    description: `${total} conversas no espelho do AgentLab ainda nao possuem intent_label. Isso prejudica roteamento, predição de comportamento e treinamento do agente.`,
    agent_ref: "dotobot-ai",
    metadata: {
      unclassified_threads: total,
      recommended_action: "classificar intents, criar backlog de workflow e knowledge, revisar handoff",
    },
  });

  if (asArray(existing).length) {
    const updated = await fetchSupabaseAdmin(
      env,
      `agentlab_incidents?id=eq.${encodeURIComponent(existing[0].id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    return {
      created: false,
      updated: true,
      incident: asArray(updated)[0] || payload,
      total_unclassified: total,
    };
  }

  const inserted = await fetchSupabaseAdmin(env, "agentlab_incidents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return {
    created: true,
    incident: asArray(inserted)[0] || payload,
    total_unclassified: total,
  };
}

export async function syncLegacyConversationIntelligence(env, options = {}) {
  const limit = Number(options.limit || 200);
  const legacyRows = asArray(await fetchLegacyConversations(env, limit));
  const normalizedThreads = legacyRows.map((row) =>
    normalizeImportedThread({
      source_system: "workspace_conversas",
      source_conversation_id: row.id,
      workspace_id: row.workspace_id,
      contact_id: row.contato_id,
      process_id: row.processo_id,
      channel: row.canal,
      status: row.status,
      subject: row.assunto,
      last_message: row.ultima_mensagem,
      started_at: row.created_date || row.created_at,
      last_message_at: row.last_message_at || row.ultima_mensagem_at || row.updated_date || row.updated_at,
      assigned_to: row.assigned_to,
      metadata: row.metadata || {},
      raw_payload: row,
    })
  );

  const syncedThreads = asArray(await upsertThreads(env, normalizedThreads));
  const incidentResult = await ensureClassificationGapIncident(env);

  const run = await createSyncRun(env, {
    source_name: "workspace_conversas",
    sync_scope: "conversation_intelligence",
    status: "completed",
    records_synced: syncedThreads.length,
    notes: "Conversas legadas sincronizadas para a camada de inteligencia do AgentLab.",
    metadata: {
      imported_threads: syncedThreads.length,
      unclassified_threads: incidentResult.total_unclassified,
      auto_incident_created: Boolean(incidentResult.created),
      auto_incident_updated: Boolean(incidentResult.updated),
    },
  });

  return {
    source: "workspace_conversas",
    synced_threads: syncedThreads.length,
    sync_run: run,
    classification_gap: incidentResult,
  };
}

export async function syncFreshsalesActivities(env, options = {}) {
  const limit = Number(options.limit || 100);
  const payload = await fetchFreshsalesJson(env, `/api/sales_activities?page=1&per_page=${limit}`);
  const activityRows = asArray(payload?.sales_activities || payload?.activities || []);

  const normalizedThreads = activityRows.map((activity) =>
    normalizeImportedThread({
      source_system: "freshsales_activity",
      source_conversation_id: activity.id,
      channel: activity.sales_activity_type?.name || activity.sales_activity_type_name || activity.medium || "crm_activity",
      status: activity.status || "logged",
      subject: activity.title || activity.display_name || activity.name || "Atividade do Freshsales",
      last_message: activity.description || activity.notes || activity.outcome || null,
      started_at: activity.created_at || activity.start_date || null,
      last_message_at: activity.updated_at || activity.end_date || activity.created_at || null,
      assigned_to: activity.owner_id || null,
      intent_label: activity.sales_activity_type?.name || activity.sales_activity_type_name || null,
      metadata: {
        owner_id: activity.owner_id || null,
        targetable_id: activity.targetable_id || null,
        targetable_type: activity.targetable_type || null,
        activity_type_id: activity.sales_activity_type_id || null,
      },
      raw_payload: activity,
    })
  );

  const syncedThreads = asArray(await upsertThreads(env, normalizedThreads));
  const run = await createSyncRun(env, {
    source_name: "freshsales_activities",
    sync_scope: "conversation_intelligence",
    status: "completed",
    records_synced: syncedThreads.length,
    notes: "Atividades do Freshsales sincronizadas para a camada de inteligencia do AgentLab.",
    metadata: {
      imported_threads: syncedThreads.length,
      per_page: limit,
    },
  });

  return {
    source: "freshsales_activities",
    synced_threads: syncedThreads.length,
    sync_run: run,
  };
}

export async function getConversationSyncRuns(env, limit = 20) {
  const params = new URLSearchParams();
  params.set("select", "id,source_name,sync_scope,status,records_synced,notes,metadata,created_at");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  return fetchSupabaseAdmin(env, `agentlab_source_sync_runs?${params.toString()}`);
}
