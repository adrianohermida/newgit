const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS copilot_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS copilot_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_created
   ON copilot_messages(conversation_id, created_at)`,
];

export function getCopilotDb(env) {
  return env.COPILOT_CONVERSATIONS_DB || env.HMADV_COPILOT_DB || null;
}

export function createCopilotSession(env, bookmark = "first-unconstrained") {
  const db = getCopilotDb(env);
  if (!db?.withSession) {
    return db;
  }
  return db.withSession(bookmark);
}

export async function ensureCopilotSchema(database) {
  if (!database) {
    throw new Error("Binding D1 COPILOT_CONVERSATIONS_DB ausente no ambiente.");
  }
  for (const statement of SCHEMA_STATEMENTS) {
    await database.prepare(statement).run();
  }
  return database;
}

export function normalizeThread(row) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count: Number(row.message_count || 0),
    preview: row.preview || "",
  };
}

export function normalizeMessage(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    text: row.text,
    metadata: parseMetadata(row.metadata_json),
    created_at: row.created_at,
  };
}

function parseMetadata(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
