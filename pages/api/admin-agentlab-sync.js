import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchLegacyConversations(limit = 200) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,workspace_id,contato_id,processo_id,canal,status,assunto,ultima_mensagem,ultima_mensagem_at,assigned_to,metadata,created_at,updated_at,last_message_at,created_date,updated_date"
  );
  params.set("order", "updated_at.desc");
  params.set("limit", String(limit));
  return fetchSupabaseAdmin(`conversas?${params.toString()}`);
}

function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getFreshsalesConfig() {
  const baseUrl =
    cleanEnvValue(process.env.FRESHSALES_API_BASE) ||
    cleanEnvValue(process.env.FRESHSALES_BASE_URL) ||
    (cleanEnvValue(process.env.FRESHSALES_DOMAIN) ? `https://${cleanEnvValue(process.env.FRESHSALES_DOMAIN)}` : null);
  const apiKey = cleanEnvValue(process.env.FRESHSALES_API_KEY) || null;
  return {
    baseUrl: baseUrl?.replace(/\/+$/, "") || null,
    apiKey,
  };
}

async function fetchFreshsalesJson(path) {
  const { baseUrl, apiKey } = getFreshsalesConfig();
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

function normalizeImportedThread(row = {}) {
  return {
    source_system: "workspace_conversas",
    source_conversation_id: row.id,
    workspace_id: row.workspace_id,
    contact_id: row.contato_id,
    process_id: row.processo_id,
    channel: row.canal || "desconhecido",
    status: row.status || "open",
    subject: row.assunto || "Sem assunto",
    last_message: row.ultima_mensagem || null,
    started_at: row.created_date || row.created_at || null,
    last_message_at: row.last_message_at || row.ultima_mensagem_at || row.updated_date || row.updated_at || null,
    assigned_to: row.assigned_to || null,
    metadata: row.metadata || {},
    raw_payload: row,
  };
}

async function createSyncRun(payload) {
  const inserted = await fetchSupabaseAdmin("agentlab_source_sync_runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return asArray(inserted)[0] || payload;
}

async function ensureClassificationGapIncident() {
  const threads = await fetchSupabaseAdmin("agentlab_conversation_threads?select=id&or=(intent_label.is.null,intent_label.eq.)");
  const total = asArray(threads).length;

  if (!total) {
    return { created: false, total_unclassified: 0 };
  }

  const payload = {
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
  };

  const existing = await fetchSupabaseAdmin(
    "agentlab_incidents?select=id&source_system=eq.agentlab-sync&category=eq.classification_gap&status=eq.open&limit=1"
  );

  if (asArray(existing).length) {
    const updated = await fetchSupabaseAdmin(`agentlab_incidents?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    return {
      created: false,
      updated: true,
      incident: asArray(updated)[0] || payload,
      total_unclassified: total,
    };
  }

  const inserted = await fetchSupabaseAdmin("agentlab_incidents", {
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

async function syncLegacyConversations(body = {}) {
  const legacyRows = asArray(await fetchLegacyConversations(Number(body.limit || 200)));
  const threads = legacyRows.map(normalizeImportedThread);

  const syncedThreads = await fetchSupabaseAdmin("agentlab_conversation_threads?on_conflict=source_system,source_conversation_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(threads),
  });

  const incident = await ensureClassificationGapIncident();
  const run = await createSyncRun({
    source_name: "workspace_conversas",
    sync_scope: "conversation_intelligence",
    status: "completed",
    records_synced: asArray(syncedThreads).length,
    notes: "Conversas legadas sincronizadas para a camada de inteligencia do AgentLab.",
    metadata: {
      imported_threads: asArray(syncedThreads).length,
      unclassified_threads: incident.total_unclassified,
      auto_incident_created: Boolean(incident.created),
      auto_incident_updated: Boolean(incident.updated),
    },
  });

  return {
    source: "workspace_conversas",
    synced_threads: asArray(syncedThreads).length,
    sync_run: run,
    classification_gap: incident,
  };
}

async function syncFreshsalesActivities(body = {}) {
  const limit = Number(body.limit || 100);
  const payload = await fetchFreshsalesJson(`/api/sales_activities?page=1&per_page=${limit}`);
  const activityRows = asArray(payload?.sales_activities || payload?.activities || []);

  const threads = activityRows.map((activity) => ({
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
  }));

  const syncedThreads = await fetchSupabaseAdmin("agentlab_conversation_threads?on_conflict=source_system,source_conversation_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(threads),
  });

  const run = await createSyncRun({
    source_name: "freshsales_activities",
    sync_scope: "conversation_intelligence",
    status: "completed",
    records_synced: asArray(syncedThreads).length,
    notes: "Atividades do Freshsales sincronizadas para a camada de inteligencia do AgentLab.",
    metadata: {
      imported_threads: asArray(syncedThreads).length,
      per_page: limit,
    },
  });

  return {
    source: "freshsales_activities",
    synced_threads: asArray(syncedThreads).length,
    sync_run: run,
  };
}

async function getSyncRuns(limit = 20) {
  const params = new URLSearchParams();
  params.set("select", "id,source_name,sync_scope,status,records_synced,notes,metadata,created_at");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  return fetchSupabaseAdmin(`agentlab_source_sync_runs?${params.toString()}`);
}

export default async function handler(req, res) {
  const auth = await requireAdminApiAccess(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const runs = await getSyncRuns();
      return res.status(200).json({ ok: true, runs });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar sync runs." });
    }
  }

  if (req.method === "POST") {
    try {
      const action = req.body?.action || "sync_legacy_conversations";
      if (action === "sync_legacy_conversations") {
        const result = await syncLegacyConversations(req.body || {});
        return res.status(200).json({ ok: true, result });
      }

      if (action === "sync_freshsales_activities") {
        const result = await syncFreshsalesActivities(req.body || {});
        return res.status(200).json({ ok: true, result });
      }

      return res.status(400).json({ ok: false, error: "Acao de sync nao suportada." });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao executar sync." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
