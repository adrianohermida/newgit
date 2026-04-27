
import { handleRequest } from './routes';

import { DurableObject } from "cloudflare:workers";

type CopilotRoomMessage = {
  id: string;
  role: string;
  text: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type RoomSnapshot = {
  conversationId: string;
  messages: CopilotRoomMessage[];
  updatedAt: string | null;
};

class CopilotConversationRoomV2 extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async appendMessage(message) {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      )`
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, role, text, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         role = excluded.role,
         text = excluded.text,
         metadata_json = excluded.metadata_json,
         created_at = excluded.created_at`,
      message.id,
      message.role,
      message.text,
      JSON.stringify(message.metadata || {}),
      message.created_at
    );
    return this.getState();
  }

  async listMessages(limit = 100) {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      )`
    );
    return this.ctx.storage.sql
      .exec(
        `SELECT id, role, text, metadata_json, created_at
           FROM messages
       ORDER BY created_at ASC
          LIMIT ?`,
        Math.max(1, Math.min(Number(limit || 100), 200))
      )
      .toArray()
      .map((row) => ({
        id: String(row.id),
        role: String(row.role),
        text: String(row.text),
        created_at: String(row.created_at),
        metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : {},
      }));
  }

  async listMessagesSince(createdAt, limit = 100) {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      )`
    );
    const since = String(createdAt || "").trim();
    if (!since) return this.listMessages(limit);
    return this.ctx.storage.sql
      .exec(
        `SELECT id, role, text, metadata_json, created_at
           FROM messages
          WHERE created_at > ?
       ORDER BY created_at ASC
          LIMIT ?`,
        since,
        Math.max(1, Math.min(Number(limit || 100), 200))
      )
      .toArray()
      .map((row) => ({
        id: String(row.id),
        role: String(row.role),
        text: String(row.text),
        created_at: String(row.created_at),
        metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : {},
      }));
  }

  async getState() {
    const messages = await this.listMessages(100);
    return {
      conversationId: this.ctx.id.toString(),
      messages,
      updatedAt: messages.length ? messages[messages.length - 1].created_at : null,
    };
  }
}

export default {
  fetch: handleRequest,
  CopilotConversationRoomV2,
};