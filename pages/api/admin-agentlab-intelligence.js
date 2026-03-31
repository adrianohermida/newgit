import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server.js";
import {
  buildConversationIntelligencePayload,
  normalizeImportedIncident,
  normalizeImportedThread,
} from "../../lib/agentlab/conversation-intelligence.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function getIntelligence() {
  const threadParams = new URLSearchParams();
  threadParams.set(
    "select",
    "id,source_system,source_conversation_id,workspace_id,contact_id,process_id,channel,status,subject,last_message,started_at,last_message_at,assigned_to,sentiment_label,urgency_label,intent_label,handoff_required,metadata,raw_payload,created_at,updated_at"
  );
  threadParams.set("order", "last_message_at.desc");
  threadParams.set("limit", "100");

  const incidentParams = new URLSearchParams();
  incidentParams.set(
    "select",
    "id,source_system,category,severity,status,title,description,agent_ref,conversation_id,internal_user_id,internal_user_email,metadata,occurred_at,created_at,updated_at"
  );
  incidentParams.set("order", "occurred_at.desc");
  incidentParams.set("limit", "100");

  const [threads, incidents] = await Promise.all([
    fetchSupabaseAdmin(`agentlab_conversation_threads?${threadParams.toString()}`),
    fetchSupabaseAdmin(`agentlab_incidents?${incidentParams.toString()}`),
  ]);

  return buildConversationIntelligencePayload(asArray(threads), asArray(incidents));
}

async function ingestIntelligence(body) {
  const threads = asArray(body.threads).map(normalizeImportedThread);
  const incidents = asArray(body.incidents).map(normalizeImportedIncident);
  const result = {};

  if (threads.length) {
    result.threads = await fetchSupabaseAdmin("agentlab_conversation_threads?on_conflict=source_system,source_conversation_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(threads),
    });
  } else {
    result.threads = [];
  }

  if (incidents.length) {
    result.incidents = await fetchSupabaseAdmin("agentlab_incidents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(incidents),
    });
  } else {
    result.incidents = [];
  }

  return result;
}

export default async function handler(req, res) {
  const auth = await requireAdminApiAccess(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const intelligence = await getIntelligence();
      return res.status(200).json({ ok: true, intelligence });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar intelligence." });
    }
  }

  if (req.method === "POST") {
    try {
      const result = await ingestIntelligence(req.body || {});
      return res.status(200).json({ ok: true, result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao ingerir intelligence." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
