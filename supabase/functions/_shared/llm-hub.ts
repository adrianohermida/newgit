/**
 * llm-hub.ts — Hub de LLM compartilhado para Cida e Dotobot
 *
 * Ordem de prioridade dos provedores:
 *   1. Cloudflare Workers AI  — primário, sem custo por token
 *   2. Ollama Cloud           — fallback, modelos open-source hospedados
 *   3. OpenAI                 — fallback premium, ativado quando há créditos
 *
 * Configuração (lida do app_config do banco, com fallback para Deno.env):
 *   CLOUDFLARE_ACCOUNT_ID     — ID da conta Cloudflare
 *   CLOUDFLARE_API_TOKEN      — Token de API Cloudflare
 *   CLOUDFLARE_WORKERS_AI_MODEL — Modelo a usar (padrão: @cf/meta/llama-3.1-8b-instruct)
 *   OLLAMA_API_KEY            — Chave da API Ollama Cloud
 *   OLLAMA_BASE_URL           — URL base do Ollama Cloud
 *   OLLAMA_MODEL              — Modelo Ollama (padrão: gemma3:4b)
 *   OPENAI_API_KEY            — Chave OpenAI (opcional, fallback de último recurso)
 *   OPENAI_BASE_URL           — URL base OpenAI-compatible (padrão: https://api.openai.com/v1)
 *   OPENAI_MODEL              — Modelo OpenAI (padrão: gpt-4.1-mini)
 *
 * Funcionalidades:
 *   - Circuit breaker por provedor (pausa após 3 falhas consecutivas, retoma em 60s)
 *   - Cache de configuração em memória (evita query ao banco a cada chamada)
 *   - Logs detalhados por provedor para diagnóstico
 *   - Interface ChatMessage compatível com OpenAI
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallResult {
  content: string;
  provider: string;
}

interface LLMProvider {
  name: string;
  call: (messages: ChatMessage[]) => Promise<string>;
}

interface CircuitState {
  failures: number;
  openUntil: number; // timestamp ms — 0 = fechado (disponível)
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const _circuitState: Record<string, CircuitState> = {};
const CIRCUIT_THRESHOLD  = 3;       // falhas consecutivas para abrir o circuito
const CIRCUIT_TIMEOUT_MS = 60_000;  // 60s de pausa após abertura

function isCircuitOpen(name: string): boolean {
  const s = _circuitState[name];
  if (!s) return false;
  if (s.openUntil > 0 && Date.now() < s.openUntil) {
    console.log(`[llm-hub] circuit OPEN para ${name} — pausa até ${new Date(s.openUntil).toISOString()}`);
    return true;
  }
  if (s.openUntil > 0 && Date.now() >= s.openUntil) {
    s.openUntil = 0;
    console.log(`[llm-hub] circuit HALF-OPEN para ${name} — tentando recuperar`);
  }
  return false;
}

let _lastProviderUsed = 'unknown';

function recordSuccess(name: string): void {
  _circuitState[name] = { failures: 0, openUntil: 0 };
  _lastProviderUsed = name;
}

function recordFailure(name: string): void {
  const s = _circuitState[name] ?? { failures: 0, openUntil: 0 };
  s.failures += 1;
  if (s.failures >= CIRCUIT_THRESHOLD) {
    s.openUntil = Date.now() + CIRCUIT_TIMEOUT_MS;
    console.warn(`[llm-hub] circuit ABERTO para ${name} após ${s.failures} falhas`);
  }
  _circuitState[name] = s;
}

// ─── Cache de Configuração ────────────────────────────────────────────────────

let _configCache: Record<string, string> | null = null;

const CONFIG_KEYS = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_WORKERS_AI_MODEL',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
];

async function loadConfig(supabaseUrl: string, serviceRoleKey: string): Promise<Record<string, string>> {
  if (_configCache) return _configCache;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(${CONFIG_KEYS.join(',')})&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const m: Record<string, string> = {};
      for (const r of rows) if (r.value) m[r.key] = r.value;
      _configCache = m;
      console.log(`[llm-hub] config carregada do banco: ${Object.keys(m).join(', ')}`);
      return m;
    }
    console.warn('[llm-hub] falha ao carregar app_config, usando apenas Deno.env');
  } catch (e: any) {
    console.error('[llm-hub] loadConfig erro:', e?.message);
  }
  _configCache = {};
  return _configCache;
}

function cfg(config: Record<string, string>, key: string, envFallback?: string): string {
  return config[key] || Deno.env.get(key) || Deno.env.get(envFallback ?? '') || '';
}

// ─── Provedores ───────────────────────────────────────────────────────────────

function makeCloudflareProvider(accountId: string, apiToken: string, model: string): LLMProvider {
  return {
    name: 'cloudflare',
    call: async (messages: ChatMessage[]) => {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
      console.log(`[llm-hub][cloudflare] chamando ${model}, msgs: ${messages.length}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            repetition_penalty: 1.3,
            max_tokens: 800,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

        const data = JSON.parse(text);
        const output = data?.result?.response ?? data?.result?.output ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);

        console.log(`[llm-hub][cloudflare] ✓ ${output.length} chars`);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  };
}

function makeOllamaProvider(apiKey: string, baseUrl: string, model: string): LLMProvider {
  return {
    name: 'ollama',
    call: async (messages: ChatMessage[]) => {
      const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
      console.log(`[llm-hub][ollama] chamando ${model}, msgs: ${messages.length}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
            options: { temperature: 0.7, num_predict: 800 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

        const data = JSON.parse(text);
        const output = data?.message?.content ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);

        console.log(`[llm-hub][ollama] ✓ ${output.length} chars`);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  };
}

function makeOpenAIProvider(apiKey: string, baseUrl: string, model: string): LLMProvider {
  return {
    name: 'openai',
    call: async (messages: ChatMessage[]) => {
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      console.log(`[llm-hub][openai] chamando ${model}, msgs: ${messages.length}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: 0.3,
            max_tokens: 800,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

        const data = JSON.parse(text);
        const output = data?.choices?.[0]?.message?.content ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);

        console.log(`[llm-hub][openai] ✓ ${output.length} chars`);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  };
}

// ─── Hub Principal ────────────────────────────────────────────────────────────

export function createLLMHub(supabaseUrl?: string, serviceRoleKey?: string) {
  const runLLM = async (messages: ChatMessage[]): Promise<LLMCallResult> => {
    // Carregar configuração do app_config com fallback para Deno.env
    const config = supabaseUrl && serviceRoleKey
      ? await loadConfig(supabaseUrl, serviceRoleKey)
      : {};

    // Resolver credenciais de cada provedor
    const cfAccountId = cfg(config, 'CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID');
    const cfApiToken  = cfg(config, 'CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN');
    const cfModel     = cfg(config, 'CLOUDFLARE_WORKERS_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct';

    const ollamaKey   = cfg(config, 'OLLAMA_API_KEY');
    const ollamaBase  = cfg(config, 'OLLAMA_BASE_URL') || 'https://ollama.com';
    const ollamaModel = cfg(config, 'OLLAMA_MODEL') || 'gemma3:4b';

    const openaiKey   = cfg(config, 'OPENAI_API_KEY');
    const openaiBase  = cfg(config, 'OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const openaiModel = cfg(config, 'OPENAI_MODEL') || 'gpt-4.1-mini';

    // Construir lista de provedores disponíveis em ordem de prioridade
    const providers: LLMProvider[] = [];
    if (cfAccountId && cfApiToken)  providers.push(makeCloudflareProvider(cfAccountId, cfApiToken, cfModel));
    if (ollamaKey)                   providers.push(makeOllamaProvider(ollamaKey, ollamaBase, ollamaModel));
    if (openaiKey)                   providers.push(makeOpenAIProvider(openaiKey, openaiBase, openaiModel));

    if (providers.length === 0) {
      throw new Error('[llm-hub] Nenhum provedor configurado. Configure CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN, OLLAMA_API_KEY ou OPENAI_API_KEY no app_config ou nos secrets do Supabase.');
    }

    const errors: string[] = [];

    for (const provider of providers) {
      if (isCircuitOpen(provider.name)) {
        errors.push(`${provider.name}: circuit aberto`);
        continue;
      }

      try {
        const content = await provider.call(messages);
        recordSuccess(provider.name);
        if (provider.name !== 'cloudflare') {
          console.log(`[llm-hub] ⚠️ usando fallback: ${provider.name}`);
        }
        return { content, provider: provider.name };
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        console.warn(`[llm-hub] ❌ ${provider.name} falhou: ${msg}`);
        recordFailure(provider.name);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    throw new Error(`[llm-hub] Todos os provedores falharam: ${errors.join(' | ')}`);
  };

  return {
    runLLM,
    get lastProvider(): string { return _lastProviderUsed; },
  };
}

// ─── Label amigável para exibição ─────────────────────────────────────────────

export function providerLabel(name: string): string {
  switch (name) {
    case 'cloudflare': return '☁️ Cloudflare AI';
    case 'ollama':     return '🦙 Ollama Cloud';
    case 'openai':     return '🤖 OpenAI';
    default:           return name;
  }
}

export type LLMHub = ReturnType<typeof createLLMHub>;
