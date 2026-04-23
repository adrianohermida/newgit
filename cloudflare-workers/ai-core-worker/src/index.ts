/**
 * HMADV ai-core — Cloudflare Worker
 * LLM custom cloud próprio com roteamento multi-provider
 *
 * Endpoints:
 *   POST /v1/messages        — Chat completion (OpenAI-compatible)
 *   POST /v1/chat/completions — Alias OpenAI
 *   POST /v1/embeddings      — Geração de embeddings
 *   POST /v1/rag/search      — Busca RAG na memória
 *   POST /v1/rag/save        — Salvar memória RAG
 *   GET  /v1/health          — Health check
 *   GET  /v1/models          — Listar modelos disponíveis
 */

import { routeCompletion, getProvidersStatus, CF_MODEL_CASCADE, type Env, type ChatMessage } from './providers';
import { searchMemory, saveMemory, buildRagContext } from './rag';
import { CopilotConversationRoom } from './copilot-room';

// Re-exportar o Durable Object (obrigatório para o Cloudflare Workers)
export { CopilotConversationRoom };

// ─── CORS Headers ─────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-HMADV-Secret',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message, status }, status);
}

// ─── Autenticação ─────────────────────────────────────────────────────────────
function authenticate(request: Request, env: Env): boolean {
  if (!env.HMADV_GATEWAY_SECRET) return true; // sem secret = público (dev)

  const authHeader = request.headers.get('Authorization') || '';
  const secretHeader = request.headers.get('X-HMADV-Secret') || '';

  const token = authHeader.replace('Bearer ', '').trim();
  return token === env.HMADV_GATEWAY_SECRET || secretHeader === env.HMADV_GATEWAY_SECRET;
}

// ─── System Prompt HMADV ──────────────────────────────────────────────────────
const HMADV_SYSTEM_PROMPT = `Você é o assistente de IA do escritório Hermida Maia Advocacia, coordenado pelo Dr. Adriano Menezes Hermida Maia (OAB 8894AM | 476963SP | 107048RS | 75394DF).

Suas responsabilidades incluem:
- Suporte jurídico: andamento processual, prazos, publicações, audiências
- Gestão de clientes: agendamentos, consultas, comunicação
- Financeiro: débitos, honorários, faturas
- Operacional: tarefas, CRM, documentos

Sempre responda em português brasileiro, de forma profissional e objetiva.
Quando não tiver certeza sobre dados específicos, indique claramente e sugira como obter a informação correta.`;

// ─── Handler principal ────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Health check ──────────────────────────────────────────────────────────
    if (path === '/v1/health' || path === '/health') {
      return jsonResponse({
        status: 'ok',
        version: '2.0.0',
        providers: {
          openai: !!env.OPENAI_API_KEY,
          huggingface: !!env.HUGGINGFACE_API_KEY,
          cloudflare_ai: true,
        },
        rag: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        timestamp: new Date().toISOString(),
      });
    }


    // ── Status detalhado dos providers (GET /v1/health/providers) ────────────
    if (path === '/v1/health/providers' || path === '/health/providers') {
      try {
        const status = await getProvidersStatus(env);
        return jsonResponse({
          status: 'ok',
          version: '2.0.0',
          ...status,
          timestamp: new Date().toISOString(),
        });
      } catch (e: any) {
        return jsonResponse({ status: 'error', error: e.message }, 500);
      }
    }
    // ── Modelos disponíveis ───────────────────────────────────────────────────
    if (path === '/v1/models') {
      return jsonResponse({
        object: 'list',
        data: [
          // OpenAI (se configurado)
          { id: 'gpt-4.1-mini', object: 'model', provider: 'openai', available: !!env.OPENAI_API_KEY },
          { id: 'gpt-4.1-nano', object: 'model', provider: 'openai', available: !!env.OPENAI_API_KEY },
          // LLM Custom (ai-core Python)
          { id: 'llm_custom', object: 'model', provider: 'llm_custom', available: !!env.LLM_CUSTOM_URL },
          // HuggingFace Router (novo endpoint 2025)
          { id: 'meta-llama/Llama-3.1-8B-Instruct', object: 'model', provider: 'huggingface/cerebras', available: !!env.HUGGINGFACE_API_KEY },
          { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', object: 'model', provider: 'huggingface/cerebras', available: !!env.HUGGINGFACE_API_KEY },
          { id: 'Qwen/Qwen2.5-7B-Instruct', object: 'model', provider: 'huggingface/together', available: !!env.HUGGINGFACE_API_KEY },
          // Cloudflare Workers AI — cascata de modelos premium
          ...CF_MODEL_CASCADE.map(id => ({ id, object: 'model', provider: 'cloudflare', available: true })),
        ],
      });
    }

    // ── Autenticação para endpoints protegidos ────────────────────────────────
    if (request.method !== 'GET' && !authenticate(request, env)) {
      return errorResponse('Unauthorized', 401);
    }

    // ── Chat Completion (POST /v1/messages ou /v1/chat/completions) ───────────
    if (
      request.method === 'POST' &&
      (path === '/v1/messages' || path === '/v1/chat/completions')
    ) {
      try {
        const body = await request.json() as any;
        const messages: ChatMessage[] = body.messages || [];
        const useRag = body.use_rag !== false; // padrão: true
        const contactId = body.contact_id || body.metadata?.contact_id;

        // Injetar system prompt HMADV se não houver
        const hasSystem = messages.some((m) => m.role === 'system');
        if (!hasSystem) {
          messages.unshift({ role: 'system', content: HMADV_SYSTEM_PROMPT });
        }

        // Buscar contexto RAG
        let ragContext = '';
        if (useRag && messages.length > 0) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
          if (lastUserMsg) {
            const memories = await searchMemory(env, lastUserMsg.content, {
              limit: 5,
              threshold: 0.65,
              contactId,
            });
            ragContext = buildRagContext(memories);
          }
        }

        // Injetar contexto RAG no system prompt
        if (ragContext) {
          const sysIdx = messages.findIndex((m) => m.role === 'system');
          if (sysIdx >= 0) {
            messages[sysIdx] = {
              ...messages[sysIdx],
              content: messages[sysIdx].content + ragContext,
            };
          }
        }

        const result = await routeCompletion(env, {
          messages,
          model: body.model,
          max_tokens: body.max_tokens,
          temperature: body.temperature,
        });

        // Salvar interação na memória RAG
        if (useRag && result.content) {
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          if (lastUser) {
            await saveMemory(
              env,
              `Q: ${lastUser.content.slice(0, 200)}\nA: ${result.content.slice(0, 400)}`,
              { contact_id: contactId, provider: result.provider, model: result.model }
            );
          }
        }

        // Resposta compatível com OpenAI
        return jsonResponse({
          id: `hmadv-${Date.now()}`,
          object: 'chat.completion',
          model: result.model,
          provider: result.provider,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: result.content },
              finish_reason: 'stop',
            },
          ],
          usage: result.usage || {},
        });
      } catch (e: any) {
        return errorResponse(e.message || 'Completion failed');
      }
    }

    // ── RAG Search ────────────────────────────────────────────────────────────
    if (request.method === 'POST' && path === '/v1/rag/search') {
      try {
        const body = await request.json() as any;
        const memories = await searchMemory(env, body.query || '', {
          limit: body.limit || 10,
          threshold: body.threshold || 0.65,
          contactId: body.contact_id,
        });
        return jsonResponse({ results: memories, count: memories.length });
      } catch (e: any) {
        return errorResponse(e.message);
      }
    }

    // ── RAG Save ──────────────────────────────────────────────────────────────
    if (request.method === 'POST' && path === '/v1/rag/save') {
      try {
        const body = await request.json() as any;
        const ok = await saveMemory(env, body.content || '', body.metadata || {});
        return jsonResponse({ saved: ok });
      } catch (e: any) {
        return errorResponse(e.message);
      }
    }

    // ── Embeddings ────────────────────────────────────────────────────────────
    if (request.method === 'POST' && path === '/v1/embeddings') {
      try {
        const body = await request.json() as any;
        const input = Array.isArray(body.input) ? body.input : [body.input];

        const result = await env.AI.run('@cf/baai/bge-small-en-v1.5' as any, {
          text: input,
        } as any) as any;

        return jsonResponse({
          object: 'list',
          data: (result?.data || []).map((emb: number[], i: number) => ({
            object: 'embedding',
            index: i,
            embedding: emb,
          })),
          model: '@cf/baai/bge-small-en-v1.5',
        });
      } catch (e: any) {
        return errorResponse(e.message);
      }
    }

    // ── Copilot Rooms (Durable Objects) ─────────────────────────────────────
    if (path.startsWith('/copilot/rooms/')) {
      const roomName = path.replace('/copilot/rooms/', '').split('/')[0]?.trim();
      if (!roomName) return errorResponse('room_name_required', 400);
      const id = (env as any).COPILOT_CONVERSATIONS_DO.idFromName(roomName);
      const stub = (env as any).COPILOT_CONVERSATIONS_DO.get(id);
      return stub.fetch(request);
    }

    return errorResponse('Not found', 404);
  },
};
