/**
 * HMADV ai-core — Multi-Provider Router v2.0
 *
 * Ordem de prioridade:
 *   1. OpenAI-compatible (gpt-4.1-mini via OPENAI_API_KEY)
 *   2. LLM Custom (ai-core Python — LLM_CUSTOM_URL)
 *   3. HuggingFace Router (novo endpoint 2025 — router.huggingface.co)
 *   4. Cloudflare Workers AI — cascata de modelos premium (55 modelos)
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
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
  provider_info?: { provider: string; model: string; latency_ms?: number };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ProviderStatus {
  name: string;
  available: boolean;
  models: string[];
  latency_ms?: number;
  error?: string;
  credits?: string;
}

export interface Env {
  AI: Ai;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  HUGGINGFACE_API_KEY?: string;
  LLM_CUSTOM_URL?: string;
  LLM_CUSTOM_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  HMADV_GATEWAY_SECRET?: string;
}

// ─── Provider 1: OpenAI-compatible ───────────────────────────────────────────
async function callOpenAI(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const t0 = Date.now();
  const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = req.model || "gpt-4.1-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages: req.messages, max_tokens: req.max_tokens || 2048, temperature: req.temperature ?? 0.7 }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 200)}`); }
  const data = await response.json() as any;
  return { content: data.choices?.[0]?.message?.content || "", model: data.model || model, provider: "openai", provider_info: { provider: "openai", model: data.model || model, latency_ms: Date.now() - t0 }, usage: data.usage };
}

// ─── Provider 2: LLM Custom (ai-core Python) ─────────────────────────────────
async function callLlmCustom(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const t0 = Date.now();
  const baseUrl = env.LLM_CUSTOM_URL!;
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.LLM_CUSTOM_KEY ? { "Authorization": `Bearer ${env.LLM_CUSTOM_KEY}` } : {}) },
    body: JSON.stringify({ model: req.model || "default", messages: req.messages, max_tokens: req.max_tokens || 2048, temperature: req.temperature ?? 0.7 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`LLM Custom error ${response.status}: ${err.slice(0, 200)}`); }
  const data = await response.json() as any;
  return { content: data.choices?.[0]?.message?.content || data.content || "", model: data.model || "llm_custom", provider: "llm_custom", provider_info: { provider: "llm_custom", model: data.model || "llm_custom", latency_ms: Date.now() - t0 }, usage: data.usage };
}

// ─── Provider 3: HuggingFace Router (novo endpoint 2025) ─────────────────────
// Conta adrianohermida: prepaid/Free — providers gratuitos via router.huggingface.co
const HF_ROUTER_CONFIGS = [
  { provider: "cerebras", model: "meta-llama/Llama-3.1-8B-Instruct", url: "https://router.huggingface.co/cerebras/v1/chat/completions" },
  { provider: "cerebras", model: "Qwen/Qwen3-235B-A22B-Instruct-2507", url: "https://router.huggingface.co/cerebras/v1/chat/completions" },
  { provider: "together", model: "Qwen/Qwen2.5-7B-Instruct", url: "https://router.huggingface.co/together/v1/chat/completions" },
  { provider: "novita", model: "meta-llama/Llama-3.1-8B-Instruct", url: "https://router.huggingface.co/novita/v1/chat/completions" },
];

async function callHuggingFaceRouter(env: Env, req: CompletionRequest, configIndex = 0): Promise<CompletionResponse> {
  const t0 = Date.now();
  const config = HF_ROUTER_CONFIGS[configIndex];
  if (!config) throw new Error("HuggingFace: todos os providers falharam");
  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}` },
    body: JSON.stringify({ model: config.model, messages: req.messages, max_tokens: req.max_tokens || 1024, temperature: req.temperature ?? 0.7, stream: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.text();
    if (configIndex + 1 < HF_ROUTER_CONFIGS.length) {
      console.warn(`HF [${config.provider}/${config.model}] failed (${response.status}) — trying next...`);
      return callHuggingFaceRouter(env, req, configIndex + 1);
    }
    throw new Error(`HuggingFace Router error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json() as any;
  return { content: data.choices?.[0]?.message?.content || "", model: config.model, provider: `huggingface/${config.provider}`, provider_info: { provider: `huggingface/${config.provider}`, model: config.model, latency_ms: Date.now() - t0 }, usage: data.usage };
}

// ─── Provider 4: Cloudflare Workers AI — cascata de modelos premium ───────────
// 55 modelos disponíveis via binding nativo — sem custo adicional
export const CF_MODEL_CASCADE = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/moonshotai/kimi-k2.5",
  "@cf/qwen/qwq-32b",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.1-8b-instruct",
];

async function callCloudflareAI(env: Env, req: CompletionRequest, modelIndex = 0): Promise<CompletionResponse> {
  const t0 = Date.now();
  const model = CF_MODEL_CASCADE[modelIndex] || CF_MODEL_CASCADE[CF_MODEL_CASCADE.length - 1];
  try {
    const result = await env.AI.run(model as any, { messages: req.messages, max_tokens: req.max_tokens || 1024 } as any) as any;
    const content = result?.response || result?.choices?.[0]?.message?.content || "";
    if (!content && modelIndex + 1 < CF_MODEL_CASCADE.length) {
      console.warn(`CF AI [${model}] returned empty — trying next...`);
      return callCloudflareAI(env, req, modelIndex + 1);
    }
    return { content, model, provider: "cloudflare", provider_info: { provider: "cloudflare", model, latency_ms: Date.now() - t0 } };
  } catch (e: any) {
    if (modelIndex + 1 < CF_MODEL_CASCADE.length) {
      console.warn(`CF AI [${model}] failed: ${e.message} — trying next...`);
      return callCloudflareAI(env, req, modelIndex + 1);
    }
    throw new Error(`Cloudflare AI all models failed: ${e.message}`);
  }
}

// ─── Router principal ─────────────────────────────────────────────────────────
export async function routeCompletion(env: Env, req: CompletionRequest): Promise<CompletionResponse> {
  const errors: string[] = [];
  if (env.OPENAI_API_KEY) {
    try { return await callOpenAI(env, req); } catch (e: any) { errors.push(`OpenAI: ${e.message}`); }
  }
  if (env.LLM_CUSTOM_URL) {
    try { return await callLlmCustom(env, req); } catch (e: any) { errors.push(`LLM Custom: ${e.message}`); }
  }
  if (env.HUGGINGFACE_API_KEY) {
    try { return await callHuggingFaceRouter(env, req); } catch (e: any) { errors.push(`HuggingFace: ${e.message}`); }
  }
  try { return await callCloudflareAI(env, req); } catch (e: any) { errors.push(`Cloudflare AI: ${e.message}`); }
  throw new Error(`All providers failed: ${errors.join(" | ")}`);
}

// ─── Status detalhado dos providers ──────────────────────────────────────────
export async function getProvidersStatus(env: Env): Promise<{
  providers: ProviderStatus[];
  summary: string;
  best_available: string;
  cf_models: string[];
  hf_router_models: string[];
}> {
  const statuses: ProviderStatus[] = [];
  statuses.push({ name: "openai", available: !!env.OPENAI_API_KEY, models: ["gpt-4.1-mini", "gpt-4.1-nano"], credits: env.OPENAI_API_KEY ? "Configurado" : "Nao configurado" });
  statuses.push({ name: "llm_custom", available: !!env.LLM_CUSTOM_URL, models: ["custom"], credits: env.LLM_CUSTOM_URL ? `URL: ${env.LLM_CUSTOM_URL}` : "Nao configurado" });

  let hfStatus: ProviderStatus = { name: "huggingface", available: false, models: HF_ROUTER_CONFIGS.map(c => `${c.provider}/${c.model}`), credits: "Nao configurado" };
  if (env.HUGGINGFACE_API_KEY) {
    try {
      const t0 = Date.now();
      const r = await fetch("https://huggingface.co/api/whoami-v2", { headers: { "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}` }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const d = await r.json() as any;
        const periodEnd = d.periodEnd ? new Date(d.periodEnd * 1000).toLocaleDateString("pt-BR") : null;
        hfStatus = { name: "huggingface", available: true, models: HF_ROUTER_CONFIGS.map(c => `${c.provider}/${c.model}`), latency_ms: Date.now() - t0, credits: `${d.billingMode}${d.isPro ? " (Pro)" : " (Free)"}${periodEnd ? ` — periodo ate ${periodEnd}` : ""}` };
      } else { hfStatus.credits = `Erro ${r.status}`; }
    } catch (e: any) { hfStatus.credits = `Timeout: ${e.message}`; }
  }
  statuses.push(hfStatus);

  const cfStatus: ProviderStatus = { name: "cloudflare_workers_ai", available: true, models: CF_MODEL_CASCADE, credits: "Binding nativo — 55 modelos disponíveis" };
  try {
    const t0 = Date.now();
    await env.AI.run("@cf/meta/llama-3.1-8b-instruct" as any, { messages: [{ role: "user", content: "ping" }], max_tokens: 5 } as any);
    cfStatus.latency_ms = Date.now() - t0;
  } catch (e: any) { cfStatus.available = false; cfStatus.error = e.message; }
  statuses.push(cfStatus);

  const available = statuses.filter(s => s.available).map(s => s.name);
  const best = available[0] || "nenhum";
  return { providers: statuses, summary: `${available.length}/${statuses.length} providers disponíveis: ${available.join(", ")}`, best_available: best, cf_models: CF_MODEL_CASCADE, hf_router_models: HF_ROUTER_CONFIGS.map(c => `${c.provider}/${c.model}`) };
}
