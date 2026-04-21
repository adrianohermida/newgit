import {
  ensureCopilotSchema,
  normalizeMessage,
  normalizeThread,
} from "./copilot-conversations-db.js";

function utcNow() {
  return new Date().toISOString();
}

function buildId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function listCopilotConversations(database, limit = 50) {
  const db = await ensureCopilotSchema(database);
  const result = await db.prepare(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            COUNT(m.id) AS message_count,
            COALESCE((SELECT text FROM copilot_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), '') AS preview
       FROM copilot_conversations c
  LEFT JOIN copilot_messages m ON m.conversation_id = c.id
   GROUP BY c.id, c.title, c.created_at, c.updated_at
   ORDER BY c.updated_at DESC
      LIMIT ?`
  ).bind(Math.max(1, Number(limit || 50))).run();
  return Array.isArray(result.results) ? result.results.map(normalizeThread) : [];
}

export async function createCopilotConversation(database, { title, text } = {}) {
  const db = await ensureCopilotSchema(database);
  const id = buildId("conv");
  const now = utcNow();
  const cleanText = String(text || "").trim();
  const finalTitle = String(title || "").trim() || cleanText.slice(0, 60) || "Nova conversa";
  await db.prepare(
    "INSERT INTO copilot_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(id, finalTitle, now, now).run();
  if (cleanText) {
    await appendCopilotMessage(db, id, { role: "user", text: cleanText });
  }
  return getCopilotConversation(db, id);
}

export async function getCopilotConversation(database, conversationId) {
  const db = await ensureCopilotSchema(database);
  const row = await db.prepare(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            COUNT(m.id) AS message_count,
            COALESCE((SELECT text FROM copilot_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), '') AS preview
       FROM copilot_conversations c
  LEFT JOIN copilot_messages m ON m.conversation_id = c.id
      WHERE c.id = ?
   GROUP BY c.id, c.title, c.created_at, c.updated_at
      LIMIT 1`
  ).bind(conversationId).first();
  if (!row) throw new Error(`Conversa "${conversationId}" não encontrada.`);
  return normalizeThread(row);
}

export async function listCopilotMessages(database, conversationId, cursor = 0, limit = 50) {
  const db = await ensureCopilotSchema(database);
  const offset = Math.max(0, Number(cursor || 0));
  const size = Math.max(1, Number(limit || 50));
  const result = await db.prepare(
    `SELECT id, conversation_id, role, text, metadata_json, created_at
       FROM copilot_messages WHERE conversation_id = ?
   ORDER BY created_at ASC LIMIT ? OFFSET ?`
  ).bind(conversationId, size, offset).run();
  const totalRow = await db.prepare(
    "SELECT COUNT(*) AS total FROM copilot_messages WHERE conversation_id = ?"
  ).bind(conversationId).first();
  const items = Array.isArray(result.results) ? result.results.map(normalizeMessage) : [];
  const total = Number(totalRow?.total || 0);
  return { items, total, next_cursor: offset + items.length < total ? String(offset + items.length) : null };
}

export async function appendCopilotMessage(database, conversationId, { role, text, metadata } = {}) {
  const db = await ensureCopilotSchema(database);
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Mensagem vazia não pode ser persistida.");
  const now = utcNow();
  const messageId = buildId("msg");
  await db.prepare(
    `INSERT INTO copilot_messages (id, conversation_id, role, text, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(messageId, conversationId, String(role || "user"), cleanText, JSON.stringify(metadata || {}), now).run();
  await db.prepare(
    "UPDATE copilot_conversations SET updated_at = ?, title = CASE WHEN title = 'Nova conversa' THEN ? ELSE title END WHERE id = ?"
  ).bind(now, cleanText.slice(0, 60) || "Nova conversa", conversationId).run();
  const row = await db.prepare(
    "SELECT id, conversation_id, role, text, metadata_json, created_at FROM copilot_messages WHERE id = ? LIMIT 1"
  ).bind(messageId).first();
  return normalizeMessage(row);
}
