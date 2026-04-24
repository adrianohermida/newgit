/**
 * HMADV ai-core — RAG (Retrieval-Augmented Generation)
 * Integração com Supabase pgvector para memória persistente do agente
 */

import type { Env } from './providers';

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity?: number;
}

// ─── Gerar embedding via HuggingFace (gratuito) ou Cloudflare AI ─────────────
async function generateEmbedding(env: Env, text: string): Promise<number[]> {
  // Tenta Cloudflare Workers AI primeiro (mais rápido, sem custo)
  try {
    const result = await env.AI.run('@cf/baai/bge-small-en-v1.5' as any, {
      text: [text],
    } as any) as any;
    if (result?.data?.[0]) return result.data[0];
  } catch (e) {
    console.warn('Cloudflare embedding failed, trying HuggingFace...');
  }

  // Fallback: HuggingFace Inference API
  if (env.HUGGINGFACE_API_KEY) {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      }
    );
    if (response.ok) {
      const data = await response.json() as any;
      if (Array.isArray(data)) return data;
    }
  }

  // Fallback final: vetor zerado (sem RAG)
  return new Array(384).fill(0);
}

// ─── Buscar memórias relevantes no Supabase ───────────────────────────────────
export async function searchMemory(
  env: Env,
  query: string,
  options: { limit?: number; threshold?: number; contactId?: string } = {}
): Promise<MemoryEntry[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];

  const { limit = 5, threshold = 0.7, contactId } = options;

  try {
    const embedding = await generateEmbedding(env, query);

    const filter = contactId
      ? `AND metadata->>'contact_id' = '${contactId}'`
      : '';

    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_dotobot_memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        filter_contact_id: contactId || null,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json() as any[];
    return (data || []).map((row: any) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata || {},
      similarity: row.similarity,
    }));
  } catch (e) {
    console.error('RAG search error:', e);
    return [];
  }
}

// ─── Salvar memória no Supabase ───────────────────────────────────────────────
export async function saveMemory(
  env: Env,
  content: string,
  metadata: Record<string, any> = {}
): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const embedding = await generateEmbedding(env, content);

    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/dotobot_memory_embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        content,
        embedding,
        metadata: { ...metadata, saved_at: new Date().toISOString() },
      }),
    });

    return response.ok;
  } catch (e) {
    console.error('RAG save error:', e);
    return false;
  }
}

// ─── Construir contexto RAG para o prompt ─────────────────────────────────────
export function buildRagContext(memories: MemoryEntry[]): string {
  if (!memories.length) return '';

  const items = memories
    .map((m, i) => `[${i + 1}] ${m.content.slice(0, 300)}`)
    .join('\n');

  return `\n\n## Memória Relevante do Sistema\n${items}\n`;
}
