/**
 * HMADV ai-core — Multi-Provider Router
 * Ordem de prioridade:
 *   1. OpenAI-compatible (gpt-4.1-mini via OPENAI_API_KEY)
 *   2. HuggingFace Inference API (gratuito — Qwen2.5-72B, Mistral-7B, Llama-3.1-8B)
 *   3. Cloudflare Workers AI (fallback final — @cf/meta/llama-3.1-8b-instruct)
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface Env {
  AI: Ai;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  HUGGINGFACE_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  HMADV_GATEWAY_SECRET?: string;
}

// ─── Provider 1: OpenAI-compatible ───────────────────────────────────────────
async function callOpenAI(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = req.model || 'gpt-4.1-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.max_tokens || 2048,
      temperature: req.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    provider: 'openai',
    usage: data.usage,
  };
}

// ─── Provider 2: HuggingFace Inference API (gratuito) ────────────────────────
const HF_MODELS = [
  'Qwen/Qwen2.5-72B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'meta-llama/Llama-3.1-8B-Instruct',
];

async function callHuggingFace(env: Env, req: CompletionRequest, modelIndex = 0): Promise<CompletionResponse> {
  const model = HF_MODELS[modelIndex] || HF_MODELS[0];
  const url = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.max_tokens || 1024,
      temperature: req.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    // Tenta o próximo modelo se disponível
    if (modelIndex + 1 < HF_MODELS.length) {
      console.warn(`HuggingFace model ${model} failed (${response.status}), trying next...`);
      return callHuggingFace(env, req, modelIndex + 1);
    }
    throw new Error(`HuggingFace error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  return {
    content: data.choices?.[0]?.message?.content || '',
    model,
    provider: 'huggingface',
    usage: data.usage,
  };
}

// ─── Provider 3: Cloudflare Workers AI ───────────────────────────────────────
async function callCloudflareAI(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const model = '@cf/meta/llama-3.1-8b-instruct';

  const result = await env.AI.run(model as any, {
    messages: req.messages,
    max_tokens: req.max_tokens || 1024,
  } as any) as any;

  const content = result?.response || result?.choices?.[0]?.message?.content || '';
  return {
    content,
    model,
    provider: 'cloudflare',
  };
}

// ─── Router principal ─────────────────────────────────────────────────────────
export async function routeCompletion(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const errors: string[] = [];

  // Provider 1: OpenAI
  if (env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(env, req);
    } catch (e: any) {
      errors.push(`OpenAI: ${e.message}`);
      console.warn('OpenAI failed, trying HuggingFace...', e.message);
    }
  }

  // Provider 2: HuggingFace
  if (env.HUGGINGFACE_API_KEY) {
    try {
      return await callHuggingFace(env, req);
    } catch (e: any) {
      errors.push(`HuggingFace: ${e.message}`);
      console.warn('HuggingFace failed, trying Cloudflare AI...', e.message);
    }
  }

  // Provider 3: Cloudflare Workers AI (sempre disponível)
  try {
    return await callCloudflareAI(env, req);
  } catch (e: any) {
    errors.push(`Cloudflare AI: ${e.message}`);
  }

  throw new Error(`All providers failed: ${errors.join(' | ')}`);
}
