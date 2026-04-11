import { fetchSupabaseAdmin } from "./supabase-rest.js";
import {
  buildConversationIntelligencePayload,
  normalizeImportedIncident,
  normalizeImportedThread,
} from "../../lib/agentlab/conversation-intelligence.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function getAgentLabIntelligence(env) {
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

  const [threadsRaw, incidentsRaw] = await Promise.all([
    fetchSupabaseAdmin(env, `agentlab_conversation_threads?${threadParams.toString()}`),
    fetchSupabaseAdmin(env, `agentlab_incidents?${incidentParams.toString()}`),
  ]);

  return buildConversationIntelligencePayload(asArray(threadsRaw), asArray(incidentsRaw));
}

export async function ingestAgentLabIntelligence(env, payload = {}) {
  const threads = asArray(payload.threads).map(normalizeImportedThread);
  const incidents = asArray(payload.incidents).map(normalizeImportedIncident);
  const results = {};

  if (threads.length) {
    const insertedThreads = await fetchSupabaseAdmin(env, "agentlab_conversation_threads?on_conflict=source_system,source_conversation_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(threads),
    });
    results.threads = asArray(insertedThreads);
  } else {
    results.threads = [];
  }

  if (incidents.length) {
    const insertedIncidents = await fetchSupabaseAdmin(env, "agentlab_incidents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(incidents),
    });
    results.incidents = asArray(insertedIncidents);
  } else {
    results.incidents = [];
  }

  return results;
}
