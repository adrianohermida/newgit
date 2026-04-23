/**
 * HMADV ai-core — CopilotConversationRoom Durable Object
 * Sala de conversa persistente com SQLite via Durable Objects
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './providers';

export interface ConversationMessage {
  id: string;
  role: string;
  text: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ConversationState {
  conversationId: string;
  messages: ConversationMessage[];
  updatedAt: string | null;
}

export class CopilotConversationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Inicializar tabela na primeira vez
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      )`
    );
  }

  async appendMessage(message: ConversationMessage): Promise<ConversationState> {
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

  async listMessages(limit = 100): Promise<ConversationMessage[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 200));
    return this.ctx.storage.sql
      .exec(
        `SELECT id, role, text, metadata_json, created_at
           FROM messages
       ORDER BY created_at ASC
          LIMIT ?`,
        safeLimit
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

  async listMessagesSince(createdAt: string, limit = 100): Promise<ConversationMessage[]> {
    const since = String(createdAt || '').trim();
    if (!since) return this.listMessages(limit);
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 200));
    return this.ctx.storage.sql
      .exec(
        `SELECT id, role, text, metadata_json, created_at
           FROM messages
          WHERE created_at > ?
       ORDER BY created_at ASC
          LIMIT ?`,
        since,
        safeLimit
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

  async getState(): Promise<ConversationState> {
    const messages = await this.listMessages(100);
    return {
      conversationId: this.ctx.id.toString(),
      messages,
      updatedAt: messages.length ? messages[messages.length - 1].created_at : null,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const suffix = url.pathname.split('/').pop() || '';

    if (request.method === 'GET') {
      if (suffix === 'messages') {
        const limit = Number(url.searchParams.get('limit') || 100);
        const since = url.searchParams.get('since') || '';
        const messages = since
          ? await this.listMessagesSince(since, limit)
          : await this.listMessages(limit);
        return new Response(JSON.stringify({ ok: true, messages }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      const state = await this.getState();
      return new Response(JSON.stringify(state), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (request.method === 'POST' && suffix === 'messages') {
      const body = await request.json() as Record<string, unknown>;
      const message: ConversationMessage = {
        id: String(body?.id || crypto.randomUUID()),
        role: String(body?.role || 'user'),
        text: String(body?.text || body?.content || ''),
        metadata: (body?.metadata as Record<string, unknown>) || {},
        created_at: String(body?.created_at || new Date().toISOString()),
      };
      const state = await this.appendMessage(message);
      return new Response(JSON.stringify({ ok: true, state }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }
}
