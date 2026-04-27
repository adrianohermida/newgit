type StructuredToolResult =
  | { ok: true; tool: string; data: any; summary: string }
  | { ok: false; tool: string; error: string; details?: any };

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT = `
Você é a Cida, assistente executiva do escritório Hermida Maia. Responda SEMPRE em português (PT-BR).

REGRAS ABSOLUTAS:
- Responda APENAS ao que foi perguntado. Não invente contexto, não faça suposições sobre conversas anteriores.
- Para saudações simples (oi, olá, bom dia), responda com uma saudação curta e objetiva. NADA MAIS.
- NUNCA use palavras em inglês (again, hey, etc).
- NUNCA invente informações sobre processos, prazos ou dados que não foram fornecidos.
- NUNCA faça questionários longos. Se precisar de informação, faça UMA pergunta curta.
- Seja direta e concisa. Máximo 3 frases para respostas simples.
`.trim();

const CIDA_LEARNING_MODE_PROMPT = `
====================================
🧠 MODO APRENDIZADO (ATIVO)
====================================

Você está em modo de aprendizado ativo. Além de responder normalmente, você deve:

1. OBSERVAR: Identificar padrões e informações relevantes na conversa
2. CLASSIFICAR: Categorizar automaticamente tipo de usuário, demanda, urgência e estágio
3. ESTRUTURAR: Transformar informações em dados organizados (contatos, atendimentos, tarefas, pendências)
4. IDENTIFICAR DEFICIÊNCIAS: Quando não tiver informação suficiente, faça UMA pergunta objetiva
5. APRENDER COM ERROS: Se detectar inconsistência, ajuste seu entendimento
6. EVOLUIR PADRÕES: Melhore forma de atendimento e antecipe necessidades

MEMÓRIA INTELIGENTE:
- Salve informações relevantes e atualize dados existentes
- Evite duplicidade e conecte dados entre conversas

APRENDIZADO OPERACIONAL:
- Identifique gargalos recorrentes, falhas de processo e atrasos frequentes
- Sugira melhorias de forma objetiva

REGRAS DE SEGURANÇA:
- Não aprenda informações incertas como verdade
- Não sobrescreva dados confiáveis sem confirmação
- Não invente padrões

Relação com Dr. Adriano: quando aprender algo relevante para o escritório, resuma de forma objetiva, destaque impacto e sugira ação.
`.trim();

const CIDA_LEARNING_VALIDATED_PROMPT = `
====================================
🧠 APRENDIZADO COM VALIDAÇÃO HUMANA (ATIVO)
====================================

Você aprende continuamente, mas NÃO confia automaticamente em tudo.

Todo aprendizado segue o ciclo: CAPTURAR → CLASSIFICAR → ATRIBUIR CONFIANÇA → VALIDAR → CONSOLIDAR → USAR

SCORE DE CONFIANÇA (0 a 100):
- Alta confiança: informação vinda do Dr. Adriano, dados estruturados, informações repetidas
- Média confiança: inferências com contexto parcial
- Baixa confiança: informações vagas, interpretações incertas

ESTADOS DO APRENDIZADO:
- pending: aguardando validação do Dr. Adriano
- approved: validado (pode ser usado)
- rejected: descartado

VALIDAÇÃO HUMANA: Quando o aprendizado for relevante, apresente ao Dr. Adriano: resumo, contexto, score de confiança e impacto potencial.

USO DO CONHECIMENTO:
- Só utilize automaticamente o que estiver "approved"
- Pode usar "pending" com cautela (indicando incerteza)
- Nunca use "rejected"

SEGURANÇA:
- Nunca trate hipótese como fato
- Nunca sobrescreva dados validados sem confirmação
- Nunca aprenda padrões com base em poucos exemplos
`.trim();

// Estado do modo aprendizado persistido no Supabase (não usa Map em memória pois Edge Functions são stateless)
async function getLearningMode(supabaseUrl: string, serviceRoleKey: string, channelId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/channel_settings?channel_id=eq.${encodeURIComponent(channelId)}&limit=1`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      return rows?.[0]?.learning_mode === true;
    }
  } catch (e) {
    console.error('[learning] getLearningMode error:', e);
  }
  return false;
}

async function setLearningMode(supabaseUrl: string, serviceRoleKey: string, channelId: string, enabled: boolean): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/channel_settings`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ channel_id: channelId, learning_mode: enabled, updated_at: new Date().toISOString() }]),
    });
  } catch (e) {
    console.error('[learning] setLearningMode error:', e);
  }
}

function calculateConfidence(input: {
  sourceIsOwner: boolean;
  repeated: boolean;
  structured: boolean;
  contextClear: boolean;
}): number {
  let score = 0;
  if (input.sourceIsOwner) score += 50;
  if (input.repeated) score += 20;
  if (input.structured) score += 15;
  if (input.contextClear) score += 15;
  return Math.min(score, 100);
}

async function saveLearningItem(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  type: string;
  content: any;
  source: string;
  confidence: number;
  channelId: string;
  userSlackId?: string;
}) {
  try {
    const res = await fetch(`${params.supabaseUrl}/rest/v1/learning_items`, {
      method: 'POST',
      headers: {
        'apikey': params.serviceRoleKey,
        'Authorization': `Bearer ${params.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify([{
        type: params.type,
        content: params.content,
        source: params.source,
        confidence: params.confidence,
        status: 'pending',
        channel_id: params.channelId,
        user_slack_id: params.userSlackId || null,
      }]),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.[0] || null;
    }
    console.error('[learning] save error:', await res.text());
  } catch (e) {
    console.error('[learning] save exception:', e);
  }
  return null;
}

async function notifyOwnerAboutLearning(item: any, ownerSlackId: string) {
  const token = Deno.env.get('CIDA_BOT_TOKEN');
  if (!token || !ownerSlackId) return;
  const confidenceEmoji = item.confidence >= 70 ? '🟢' : item.confidence >= 40 ? '🟡' : '🔴';
  const text = [
    `🧠 *Novo aprendizado detectado*`,
    ``,
    `*Tipo:* ${item.type}`,
    `*Confiança:* ${confidenceEmoji} ${item.confidence}%`,
    `*Origem:* ${item.source}`,
    ``,
    `*Resumo:*`,
    typeof item.content === 'object' ? JSON.stringify(item.content, null, 2) : String(item.content),
    ``,
    'ID: ' + item.id,
    `Para validar, diga: *aprovar aprendizado ${item.id?.slice(0, 8)}* ou *rejeitar aprendizado ${item.id?.slice(0, 8)}*`,
  ].join('\n');
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: ownerSlackId, text }),
    });
  } catch (e) {
    console.error('[learning] notify owner error:', e);
  }
}

function jsonResponse(result: StructuredToolResult) {
  return result;
}


async function getSlackUserInfo(userId: string) {
  const token = Deno.env.get("CIDA_BOT_TOKEN");
  if (!token || !userId) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) return data.user;
  } catch (e) {
    console.error("Error fetching slack user info:", e);
  }
  return null;
}


// ─── Geração de embedding: Cloudflare AI (primário) + HuggingFace (fallback) ──
// Lê as chaves do app_config do Supabase para evitar dependência de secrets externos
let _embedConfigCache: { cfAccountId: string; cfApiToken: string; hfApiKey: string } | null = null;

async function getEmbedConfig(supabaseUrl: string, serviceRoleKey: string) {
  if (_embedConfigCache) return _embedConfigCache;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN,HUGGINGFACE_API_KEY)&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const m: Record<string, string> = {};
      for (const r of rows) m[r.key] = r.value;
      _embedConfigCache = {
        cfAccountId: m['CLOUDFLARE_ACCOUNT_ID'] || Deno.env.get('CF_ACCOUNT_ID') || '',
        cfApiToken:  m['CLOUDFLARE_API_TOKEN']  || Deno.env.get('CF_API_TOKEN')  || '',
        hfApiKey:    m['HUGGINGFACE_API_KEY']   || Deno.env.get('HUGGINGFACE_API_KEY') || '',
      };
    }
  } catch (e: any) {
    console.error('[embed] getEmbedConfig error:', e?.message);
  }
  return _embedConfigCache || { cfAccountId: '', cfApiToken: '', hfApiKey: '' };
}

async function generateQueryEmbedding(
  text: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<number[] | null> {
  const { cfAccountId, cfApiToken, hfApiKey } = await getEmbedConfig(supabaseUrl, serviceRoleKey);

  // Tentativa 1: Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5 — 768 dims)
  if (cfAccountId && cfApiToken) {
    try {
      const cfResp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cfApiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [text.slice(0, 512)] }),
        }
      );
      if (cfResp.ok) {
        const cfData = await cfResp.json() as any;
        const vec = cfData?.result?.data?.[0];
        if (Array.isArray(vec) && vec.length === 768) {
          console.log('[embed] Cloudflare AI OK, dims:', vec.length);
          return vec;
        }
        console.log('[embed] Cloudflare AI resposta inesperada:', JSON.stringify(cfData).slice(0, 100));
      } else {
        const errText = await cfResp.text();
        console.log('[embed] Cloudflare AI HTTP', cfResp.status, errText.slice(0, 100));
      }
    } catch (e: any) {
      console.log('[embed] Cloudflare AI erro:', e?.message);
    }
  }

  // Tentativa 2: HuggingFace (fallback — paraphrase-multilingual-mpnet-base-v2 — 768 dims, PT nativo)
  if (hfApiKey) {
    try {
      const hfResp = await fetch(
        'https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-mpnet-base-v2/pipeline/feature-extraction',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
        }
      );
      if (hfResp.ok) {
        const hfData = await hfResp.json() as any;
        const vec = Array.isArray(hfData) && typeof hfData[0] === 'number' ? hfData
                  : Array.isArray(hfData) && Array.isArray(hfData[0]) ? hfData[0]
                  : null;
        if (vec && vec.length === 768) {
          console.log('[embed] HuggingFace OK, dims:', vec.length);
          return vec;
        }
        console.log('[embed] HuggingFace resposta inesperada, dims:', Array.isArray(hfData) ? hfData.length : 'N/A');
      } else {
        const errText = await hfResp.text();
        console.log('[embed] HuggingFace HTTP', hfResp.status, errText.slice(0, 100));
      }
    } catch (e: any) {
      console.log('[embed] HuggingFace erro:', e?.message);
    }
  }

  console.log('[embed] Ambos os providers falharam — usando busca textual como fallback');
  return null;
}

function toolsFactory(supabase: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const { supabaseUrl, serviceRoleKey } = supabase;

  const supabaseFetch = async (path: string, method: string, body?: any) => {
    const res = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse errors
    }

    if (!res.ok) {
      return {
        ok: false as const,
        status: res.status,
        raw: text,
        data,
      };
    }

    return { ok: true as const, status: res.status, data };
  };

  return {
    async buscar_conhecimento(query: string): Promise<StructuredToolResult> {
      try {
        console.log('[tool] buscar_conhecimento input:', query);
        // Gerar embedding da query (Cloudflare primário, HuggingFace fallback)
        const queryEmbedding = await generateQueryEmbedding(query, supabaseUrl, serviceRoleKey);
        const rpcBody: any = { query };
        if (queryEmbedding) {
          rpcBody.query_embedding = queryEmbedding;
          console.log('[tool] buscar_conhecimento usando busca vetorial (768 dims)');
        } else {
          console.log('[tool] buscar_conhecimento usando busca textual (fallback)');
        }
        const rpcResult = await supabaseFetch('/rest/v1/rpc/buscar_conhecimento', 'POST', rpcBody);

        if (!rpcResult.ok) {
          return jsonResponse({
            ok: false,
            tool: 'buscar_conhecimento',
            error: 'Falha ao buscar conhecimento (RPC).',
            details: rpcResult,
          });
        }

        const data = rpcResult.data;
        const summary =
          typeof data === 'string'
            ? data
            : Array.isArray(data)
              ? String(data?.[0]?.content ?? data?.[0]?.texto ?? JSON.stringify(data?.[0] ?? data))
              : String(data?.content ?? data?.texto ?? JSON.stringify(data));

        return jsonResponse({
          ok: true,
          tool: 'buscar_conhecimento',
          data,
          summary: `Conhecimento recuperado para: "${query}"`,
        });
      } catch (e: any) {
        return jsonResponse({
          ok: false,
          tool: 'buscar_conhecimento',
          error: 'Erro inesperado em buscar_conhecimento.',
          details: String(e?.message ?? e),
        });
      }
    },

    async criar_contato(data: {
      nome?: string;
      telefone?: string;
      email?: string;
      canal?: string;
      observacao?: string;
      origem?: string;
    }): Promise<StructuredToolResult> {
      try {
        console.log('[tool] criar_contato input:', data);

        // mock (preparado para CRM real)
        return jsonResponse({
          ok: true,
          tool: 'criar_contato',
          data: { id_mock: `lead_${Date.now()}`, ...data },
          summary: 'Contato registrado (mock).',
        });
      } catch (e: any) {
        return jsonResponse({
          ok: false,
          tool: 'criar_contato',
          error: 'Erro inesperado em criar_contato.',
          details: String(e?.message ?? e),
        });
      }
    },

    async consultar_processo(cnj: string): Promise<StructuredToolResult> {
      try {
        console.log('[tool] consultar_processo input:', cnj);

        // mock (preparado para DataJud real)
        return jsonResponse({
          ok: true,
          tool: 'consultar_processo',
          data: {
            cnj,
            tribunal_mock: 'TRIBUNAL (mock)',
            status_mock: 'PROCESSO EM TRAMITAÇÃO (mock)',
            ultima_movimentacao_mock: 'MOVIMENTAÇÃO (mock)',
            link_mock: null,
          },
          summary: 'Consulta do processo retornada (mock).',
        });
      } catch (e: any) {
        return jsonResponse({
          ok: false,
          tool: 'consultar_processo',
          error: 'Erro inesperado em consultar_processo.',
          details: String(e?.message ?? e),
        });
      }
    },

    async criar_agendamento(data: {
      nome?: string;
      telefone?: string;
      email?: string;
      proposta?: string;
      data?: string;
      horario?: string;
      canal?: string;
      observacao?: string;
    }): Promise<StructuredToolResult> {
      try {
        console.log('[tool] criar_agendamento input:', data);

        // mock: pronto para migrar para agenda real
        return jsonResponse({
          ok: true,
          tool: 'criar_agendamento',
          data: { id_agendamento_mock: `ag_${Date.now()}`, ...data, status: 'PENDENTE' },
          summary: 'Agendamento criado (mock). Próximo passo: confirmar com o cliente.',
        });
      } catch (e: any) {
        return jsonResponse({
          ok: false,
          tool: 'criar_agendamento',
          error: 'Erro inesperado em criar_agendamento.',
          details: String(e?.message ?? e),
        });
      }
    },
  };
}

function memoryFactory(supabase: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const { supabaseUrl, serviceRoleKey } = supabase;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  type MessageRow = {
    channel: string;
    role: string;
    content: string;
    created_at?: string;
    id?: string;
  };

  const getMemory = async (channel: string): Promise<MessageRow[]> => {
    try {
      console.log('[memory] getMemory channel:', channel);

      const url =
        `${supabaseUrl}/rest/v1/messages` +
        `?channel=eq.${encodeURIComponent(channel)}` +
        `&select=role,content,created_at,channel` +
        `&order=created_at.desc.nullslast,id.desc.nullslast` +
        `&limit=20`;

      const res = await fetch(url, { headers, method: 'GET' });
      const text = await res.text();

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        throw new Error(`getMemory HTTP ${res.status}: ${text}`);
      }

      const rows = (Array.isArray(data) ? data : []) as MessageRow[];
      return rows.reverse();
    } catch (e: any) {
      console.log('[memory] getMemory error:', e?.message ?? e);
      return [];
    }
  };

  const saveMemory = async (channel: string, role: string, content: string) => {
    try {
      console.log('[memory] saveMemory:', {
        channel,
        role,
        contentPreview: content.slice(0, 80),
      });

      const res = await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ channel, role, content }]),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`saveMemory HTTP ${res.status}: ${text}`);
      }

      return { ok: true as const };
    } catch (e: any) {
      console.log('[memory] saveMemory error:', e?.message ?? e);
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  };

  return { getMemory, saveMemory };
}

function ragFactory(tools: { buscar_conhecimento: (query: string) => Promise<any> }) {
  const getKnowledge = async (query: string): Promise<string> => {
    console.log('[rag] getKnowledge query:', query);

    const result = await tools.buscar_conhecimento(query);
    if (!result?.ok) {
      console.log('[rag] getKnowledge failed:', result?.error);
      return '';
    }

    const data = result.data;

    if (typeof data === 'string') return data;

    if (Array.isArray(data)) {
      const parts: string[] = [];
      for (const item of data) {
        const candidate = item?.content ?? item?.texto ?? item?.chunk ?? item?.result ?? null;
        if (candidate) parts.push(String(candidate));
      }
      return parts.join('\n\n');
    }

    return result.summary || data?.content || data?.texto || (data ? JSON.stringify(data) : '');
  };

  return { getKnowledge };
}

type Intent =
  | { type: 'processo' }
  | { type: 'agendamento' }
  | { type: 'lead' }
  | { type: 'geral' };

function extractCNJ(text: string): string | null {
  const cleaned = text.trim();

  const m1 = cleaned.match(/\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/);
  if (m1?.[1]) return m1[1];

  const digits = cleaned.replace(/[^\d]/g, '');
  if (digits.length === 20) {
    const a = digits.slice(0, 7);
    const b = digits.slice(7, 9);
    const c = digits.slice(9, 13);
    const d = digits.slice(13, 14);
    const e = digits.slice(14, 16);
    const f = digits.slice(16, 20);
    return `${a}-${b}.${c}.${d}.${e}.${f}`;
  }

  return null;
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  const cnjPresent = extractCNJ(text) !== null;

  if (cnjPresent) return { type: 'processo' };
  if (/(processo|andamento|petição|decisão|sentença|audi[eê]ncia|movimenta)/i.test(t)) return { type: 'processo' };
  if (/(agendar|agendamento|hor[aá]rio|consulta|reuni[aã]o|marcar)/i.test(t)) return { type: 'agendamento' };
  if (/(telefone|whats|e-?mail|contato|ligar|mandar mensagem)/i.test(t)) return { type: 'lead' };
  return { type: 'geral' };
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM HUB — Roteamento inteligente entre provedores de IA
// Ordem: Cloudflare Workers AI (primário) → Ollama Cloud (fallback)
// Circuit breaker por provedor: pausa automaticamente provedores com falhas
// consecutivas para evitar latência desnecessária.
// ═══════════════════════════════════════════════════════════════════════════

interface LLMProvider {
  name: string;
  call: (messages: ChatMessage[]) => Promise<string>;
}

interface CircuitState {
  failures: number;
  openUntil: number; // timestamp ms — 0 = fechado (disponível)
}

// Estado do circuit breaker (em memória — reseta a cada cold start da Edge Function)
const _circuitState: Record<string, CircuitState> = {};
const CIRCUIT_THRESHOLD  = 3;      // falhas consecutivas para abrir o circuito
const CIRCUIT_TIMEOUT_MS = 60_000; // 60s de pausa após abertura

function isCircuitOpen(name: string): boolean {
  const s = _circuitState[name];
  if (!s) return false;
  if (s.openUntil > 0 && Date.now() < s.openUntil) {
    console.log(`[llm-hub] circuit OPEN para ${name} — pausa até ${new Date(s.openUntil).toISOString()}`);
    return true;
  }
  if (s.openUntil > 0 && Date.now() >= s.openUntil) {
    // Half-open: deixar uma tentativa passar
    s.openUntil = 0;
    console.log(`[llm-hub] circuit HALF-OPEN para ${name} — tentando recuperar`);
  }
  return false;
}

let _lastProviderUsed = 'unknown';
function recordSuccess(name: string) {
  _circuitState[name] = { failures: 0, openUntil: 0 };
  _lastProviderUsed = name;
}

function recordFailure(name: string) {
  const s = _circuitState[name] ?? { failures: 0, openUntil: 0 };
  s.failures += 1;
  if (s.failures >= CIRCUIT_THRESHOLD) {
    s.openUntil = Date.now() + CIRCUIT_TIMEOUT_MS;
    console.warn(`[llm-hub] circuit ABERTO para ${name} após ${s.failures} falhas`);
  }
  _circuitState[name] = s;
}

// Cache de configuração do app_config (evita query a cada chamada)
let _llmConfigCache: Record<string, string> | null = null;

async function getLLMConfig(supabaseUrl: string, serviceRoleKey: string): Promise<Record<string, string>> {
  if (_llmConfigCache) return _llmConfigCache;
  try {
    const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'OLLAMA_API_KEY', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(${keys.join(',')})&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const m: Record<string, string> = {};
      for (const r of rows) m[r.key] = r.value;
      _llmConfigCache = m;
      return m;
    }
  } catch (e: any) {
    console.error('[llm-hub] getLLMConfig error:', e?.message);
  }
  return {};
}

function llmFactory(supabaseUrl?: string, serviceRoleKey?: string) {
  // ── Provedor 1: Cloudflare Workers AI ────────────────────────────────────
  const makeCloudflareProvider = (cfAccountId: string, cfApiToken: string): LLMProvider => ({
    name: 'cloudflare',
    call: async (messages: ChatMessage[]) => {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccountId)}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
      console.log('[llm-hub][cloudflare] chamando Cloudflare Workers AI, msgs:', messages.length);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000); // 12s timeout

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfApiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            repetition_penalty: 1.3,
            max_tokens: 512,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = JSON.parse(text);
        const output = data?.result?.response ?? data?.result?.output ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);
        console.log('[llm-hub][cloudflare] ✓ resposta recebida, chars:', output.length);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  });

  // ── Provedor 2: Ollama Cloud ──────────────────────────────────────────────
  const makeOllamaProvider = (apiKey: string, baseUrl: string, model: string): LLMProvider => ({
    name: 'ollama',
    call: async (messages: ChatMessage[]) => {
      const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
      console.log(`[llm-hub][ollama] chamando Ollama Cloud, modelo: ${model}, msgs: ${messages.length}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000); // 20s timeout

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
            options: { temperature: 0.7, num_predict: 512 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = JSON.parse(text);
        const output = data?.message?.content ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);
        console.log('[llm-hub][ollama] ✓ resposta recebida, chars:', output.length);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  });

  // ── Orquestrador principal ────────────────────────────────────────────────
  const runLLM = async (messages: ChatMessage[]): Promise<string> => {
    // Carregar configuração do app_config (com fallback para env vars)
    const cfg = supabaseUrl && serviceRoleKey
      ? await getLLMConfig(supabaseUrl, serviceRoleKey)
      : {};

    const cfAccountId = cfg['CLOUDFLARE_ACCOUNT_ID'] || Deno.env.get('CF_ACCOUNT_ID') || '';
    const cfApiToken  = cfg['CLOUDFLARE_API_TOKEN']  || Deno.env.get('CF_API_TOKEN')  || '';
    const ollamaKey   = cfg['OLLAMA_API_KEY']        || Deno.env.get('OLLAMA_API_KEY') || '';
    const ollamaBase  = cfg['OLLAMA_BASE_URL']       || Deno.env.get('OLLAMA_BASE_URL') || 'https://ollama.com';
    const ollamaModel = cfg['OLLAMA_MODEL']          || Deno.env.get('OLLAMA_MODEL')    || 'gemma3:4b';

    // Construir lista de provedores disponíveis (em ordem de prioridade)
    const providers: LLMProvider[] = [];
    if (cfAccountId && cfApiToken) providers.push(makeCloudflareProvider(cfAccountId, cfApiToken));
    if (ollamaKey)                  providers.push(makeOllamaProvider(ollamaKey, ollamaBase, ollamaModel));

    if (providers.length === 0) {
      throw new Error('[llm-hub] Nenhum provedor configurado (CF_ACCOUNT_ID/CF_API_TOKEN ou OLLAMA_API_KEY ausentes)');
    }

    const errors: string[] = [];

    for (const provider of providers) {
      if (isCircuitOpen(provider.name)) {
        errors.push(`${provider.name}: circuit aberto`);
        continue;
      }

      try {
        const result = await provider.call(messages);
        recordSuccess(provider.name);
        if (provider.name !== 'cloudflare') {
          console.log(`[llm-hub] ⚠️ usando fallback: ${provider.name}`);
        }
        return result;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        console.warn(`[llm-hub] ❌ ${provider.name} falhou: ${msg}`);
        recordFailure(provider.name);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    throw new Error(`[llm-hub] Todos os provedores falharam: ${errors.join(' | ')}`);
  };

  return { runLLM, get _lastProvider() { return _lastProviderUsed; } };
}

function orchestratorFactory(deps: {
  tools: ReturnType<typeof toolsFactory>;
  memory: ReturnType<typeof memoryFactory>;
  rag: ReturnType<typeof ragFactory>;
  llm: ReturnType<typeof llmFactory>;
  systemPrompt: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const agent = async (inputText: string, channel: string, userId?: string) => {
    console.log('[agent] start:', { channel });

    // ── Detecção de comandos de modo aprendizado ──
    const lowerInput = inputText.toLowerCase().trim();
    if (lowerInput.includes('ativar modo aprendizado')) {
      await setLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel, true);
      console.log('[learning] mode ACTIVATED for channel:', channel);
      return { response: '🧠 Modo aprendizado ativado! Agora vou observar, classificar e estruturar as informações desta conversa. Pode continuar normalmente.' };
    }
    if (lowerInput.includes('desativar modo aprendizado')) {
      await setLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel, false);
      console.log('[learning] mode DEACTIVATED for channel:', channel);
      return { response: '✅ Modo aprendizado desativado. Voltei ao modo normal, mantendo todo o conhecimento adquirido.' };
    }

    // ── Detecção de validação de aprendizado ──
    const approveMatch = lowerInput.match(/aprovar aprendizado ([a-f0-9-]{8,})/);
    const rejectMatch = lowerInput.match(/rejeitar aprendizado ([a-f0-9-]{8,})/);
    if (approveMatch || rejectMatch) {
      const itemIdPrefix = (approveMatch || rejectMatch)![1];
      const newStatus = approveMatch ? 'approved' : 'rejected';
      try {
        const searchRes = await fetch(
          `${deps.supabaseUrl}/rest/v1/learning_items?id=like.${encodeURIComponent(itemIdPrefix + '%')}&limit=1`,
          { headers: { 'apikey': deps.serviceRoleKey, 'Authorization': `Bearer ${deps.serviceRoleKey}` } }
        );
        const items = searchRes.ok ? await searchRes.json() : [];
        if (items.length > 0) {
          const item = items[0];
          await fetch(
            `${deps.supabaseUrl}/rest/v1/learning_items?id=eq.${item.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': deps.serviceRoleKey,
                'Authorization': `Bearer ${deps.serviceRoleKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ status: newStatus, validated_at: new Date().toISOString() }),
            }
          );
          const emoji = newStatus === 'approved' ? '✅' : '❌';
          return { response: `${emoji} Aprendizado ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso! ID: ${item.id.slice(0, 8)}` };
        } else {
          return { response: `⚠️ Não encontrei nenhum aprendizado com o ID ${itemIdPrefix}. Verifique o ID e tente novamente.` };
        }
      } catch (e) {
        console.error('[learning] validate error:', e);
        return { response: 'Ocorreu um erro ao validar o aprendizado. Tente novamente.' };
      }
    }

    const isLearningMode = await getLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel);

    const history = await deps.memory.getMemory(channel);

    
    let personaContext = "Usuário não identificado. Trate como cliente externo padrão.";
    
    if (userId) {
      const userInfo = await getSlackUserInfo(userId);
      console.log("[persona] slack user info:", JSON.stringify(userInfo));
      const email = userInfo?.profile?.email || '';
      const realName = userInfo?.real_name || userInfo?.name || 'Usuário';
      
      let isOwner = false;
      if (email === 'adrianohermida@gmail.com' || email.includes('adriano')) {
        isOwner = true;
      }
      
      // Buscar ou criar na tabela contacts
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      
      let contacts = null;
      let fetchErr = null;
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/users?slack_id=eq.${encodeURIComponent(userId)}&limit=1`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        if (res.ok) {
          contacts = await res.json();
        } else {
          fetchErr = await res.text();
        }
      } catch(e) {
        fetchErr = String(e);
      }
      console.log("[persona] db fetch result:", JSON.stringify(contacts), "err:", fetchErr, "userId:", userId);
      
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const displayName = contact.name || realName;
        const isDbOwner = contact.role === 'owner';
        personaContext = `Você está falando com ${displayName} (Email: ${contact.email || email || 'N/A'}).
Role: ${contact.role || (isOwner ? 'owner' : 'cliente')}
Lembre-se do contexto dessa pessoa e adapte sua linguagem.`;
        if (isDbOwner) {
          isOwner = true;
        }
        
        // Atualizar last_interaction
        try {
          await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${contact.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ last_interaction: new Date().toISOString() })
          });
        } catch(e) {
          console.error("Error updating user:", e);
        }
      } else {
        // Criar novo
        const type = isOwner ? 'owner' : 'cliente';
        try {
          await fetch(`${supabaseUrl}/rest/v1/users`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify([{
              name: realName, email: email, slack_id: userId, role: type
            }])
          });
        } catch(e) {
          console.error("Error creating user:", e);
        }
        
        personaContext = `Você está falando com ${realName} (Email: ${email || 'N/A'}).
Tipo: ${type}
Este é um novo contato. Trate-o de acordo com seu tipo.`;
      }
      
      if (isOwner) {
        personaContext += "\n\nATENÇÃO: VOCÊ ESTÁ FALANDO COM O DR. ADRIANO (O DONO DO ESCRITÓRIO). SEJA EXTREMAMENTE DIRETA, CONCISA E NÃO FAÇA PERGUNTAS DE TRIAGEM. APENAS RESPONDA O QUE ELE PEDIR DE FORMA OBJETIVA.";
      }
    }

    console.log("[persona] final context:", personaContext);
    const intent = detectIntent(inputText);
    const cnj = extractCNJ(inputText);

    console.log('[agent] intent:', intent, 'cnj:', cnj);

    const toolContext: string[] = [];

    if (intent.type === 'processo') {
      if (cnj) {
        const proc = await deps.tools.consultar_processo(cnj);
        toolContext.push(proc.ok ? `Consulta do processo (mock): ${JSON.stringify(proc.data)}` : `Erro: ${proc.error}`);
      } else {
        toolContext.push('O cliente solicitou consulta de processo, mas não informou o CNJ.');
      }
    }

    if (intent.type === 'agendamento') {
      const ag = await deps.tools.criar_agendamento({
        proposta: 'Triagem para agendamento',
        canal: channel,
        observacao: 'Dados a confirmar com o cliente.',
      });
      toolContext.push(ag.ok ? `Agendamento (mock): ${JSON.stringify(ag.data)}` : `Erro: ${ag.error}`);
    }

    if (intent.type === 'lead') {
      const lead = await deps.tools.criar_contato({
        canal: channel,
        origem: 'Slack',
        observacao: `Lead detectado. Mensagem: "${inputText.slice(0, 140)}"`,
      });
      toolContext.push(lead.ok ? `Contato (mock): ${JSON.stringify(lead.data)}` : `Erro: ${lead.error}`);
    }

    // ── Decidir se o RAG é necessário ──────────────────────────────────────
    // Pular RAG para: saudações, mensagens curtas (<15 chars), owner sem intenção específica
    const isOwnerContext = personaContext.includes('DR. ADRIANO') || personaContext.includes('owner');
    const isSimpleGreeting = /^(oi|olá|ola|hey|hi|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e aí|e ai|ok|okay|certo|entendi|obrigad|valeu|vlw|👋|😊|🙂)[\.!?\s]*$/i.test(inputText.trim());
    const isShortMessage = inputText.trim().length < 15;
    const skipRag = isSimpleGreeting || (isOwnerContext && isShortMessage && intent.type === 'geral');

    const knowledgeQuery = [
      inputText,
      cnj ? `CNJ: ${cnj}` : '',
      `Intenção: ${intent.type}`,
      toolContext.length ? `Contexto ferramentas: ${toolContext.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    const knowledgeText = skipRag ? '' : await deps.rag.getKnowledge(knowledgeQuery);
    if (skipRag) console.log('[rag] pulando RAG — mensagem simples ou saudação');;

    // Montar system prompt com modo aprendizado se ativo
    let activeSystemPrompt = deps.systemPrompt + "\n\nCONTEXTO DO USUÁRIO ATUAL:\n" + personaContext;
    if (isLearningMode) {
      activeSystemPrompt += "\n\n" + CIDA_LEARNING_MODE_PROMPT + "\n\n" + CIDA_LEARNING_VALIDATED_PROMPT;
    }

    // ── Montar mensagens com histórico individual (melhor para o LLM) ────────
    const messages: ChatMessage[] = [{ role: 'system', content: activeSystemPrompt }];

    // Histórico como mensagens individuais (últimas 6 para economizar tokens)
    const recentHistory = history.slice(-6);
    for (const m of recentHistory) {
      messages.push({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 400) });
    }

    // RAG comprimido (max 800 chars para economizar tokens)
    const ragCompressed = knowledgeText ? knowledgeText.slice(0, 800) : '';

    const assembledUser = [
      inputText,
      cnj ? `[CNJ: ${cnj}]` : '',
      ragCompressed ? `[Base de conhecimento]\n${ragCompressed}` : '',
      toolContext.length ? `[Contexto]\n${toolContext.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    messages.push({ role: 'user', content: assembledUser });

    const llmAnswer = await deps.llm.runLLM(messages);
    
    // ── Estimar tokens (aprox 4 chars = 1 token) ──────────────────────────
    const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0) + llmAnswer.length;
    const estimatedTokens = Math.round(totalChars / 4);
    const llmProviderUsed = (deps.llm as any)._lastProvider || 'ollama';

    await deps.memory.saveMemory(channel, 'user', inputText);
    await deps.memory.saveMemory(channel, 'assistant', llmAnswer);

    // ── Rodapé de status (modelo, memória, tokens) ────────────────────────
    const providerLabel = llmProviderUsed === 'cloudflare' ? '☁️ Cloudflare AI' :
                          llmProviderUsed === 'ollama' ? '🦙 Ollama' :
                          llmProviderUsed === 'huggingface' ? '🤗 HuggingFace' : llmProviderUsed;
    const memCount = recentHistory.length + 1; // +1 pela mensagem atual
    const footer = `\n\n_${providerLabel} · 💬 ${memCount} msgs · ⚡ ~${estimatedTokens} tokens_`;
    const responseWithFooter = llmAnswer + footer;

    // ── Captura de aprendizado em modo ativo ──
    if (isLearningMode) {
      const isOwnerForLearning = personaContext.includes('owner') || personaContext.includes('DR. ADRIANO');
      const confidence = calculateConfidence({
        sourceIsOwner: isOwnerForLearning,
        repeated: false,
        structured: intent.type !== 'geral',
        contextClear: inputText.length > 20,
      });

      const learningContent = {
        message: inputText.slice(0, 500),
        intent: intent.type,
        channel,
        response_preview: llmAnswer.slice(0, 200),
      };

      const savedItem = await saveLearningItem({
        supabaseUrl: deps.supabaseUrl,
        serviceRoleKey: deps.serviceRoleKey,
        type: intent.type || 'conversa',
        content: learningContent,
        source: isOwnerForLearning ? 'DrAdriano' : (userId || 'unknown'),
        confidence,
        channelId: channel,
        userSlackId: userId,
      });

      // Notificar o Dr. Adriano se confiança >= 70 e não for ele mesmo enviando
      if (savedItem && confidence >= 70 && userId) {
        const ownerSlackId = 'U01FHTM68AH';
        if (userId !== ownerSlackId) {
          EdgeRuntime.waitUntil(notifyOwnerAboutLearning(savedItem, ownerSlackId));
        }
      }

      console.log('[learning] item saved:', savedItem?.id, 'confidence:', confidence);
    }

    return { response: responseWithFooter };
  };

  return { agent };
}

const LOG_WEBHOOK = 'https://5000-ie9rpsm26pewf6nov5f4e-45bcaec2.us3.manus.computer/webhook';

async function logToWebhook(level: string, message: string, data?: any) {
  try {
    await fetch(LOG_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, data: data ? JSON.stringify(data) : undefined, timestamp: new Date().toISOString() }),
    });
  } catch (_) { /* ignore */ }
}

console.log('cida-agent edge function booting...');

async function postToSlack(channel: string, text: string, thread_ts?: string) {
  const token = Deno.env.get("CIDA_BOT_TOKEN");
  if (!token) {
    console.warn("CIDA_BOT_TOKEN not found, skipping Slack post");
    return;
  }
  
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text, unfurl_links: false, ...(thread_ts ? { thread_ts } : {}) }),
    });
    
    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      console.error("Slack API error:", data?.error || `Status ${response.status}`);
    } else {
      console.log('Message sent to Slack successfully', { channel });
    }
  } catch (e) {
    console.error("Error posting to Slack:", e);
  }
}

// ── Deduplicação de eventos Slack ─────────────────────────────────────────────
async function isEventAlreadyProcessed(supabaseUrl: string, serviceRoleKey: string, eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/processed_events?event_id=eq.${encodeURIComponent(eventId)}&limit=1`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

async function markEventProcessed(supabaseUrl: string, serviceRoleKey: string, eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/processed_events`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event_id: eventId, processed_at: new Date().toISOString() }),
    });
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Deduplicação: ignorar retries do Slack ─────────────────────────────
    const retryNum = req.headers.get('X-Slack-Retry-Num');
    if (retryNum && parseInt(retryNum) > 0) {
      console.log('[handler] ignorando retry do Slack:', retryNum);
      return new Response('OK', { status: 200 });
    }

    const body = await req.json().catch(() => null);
    
    // Tratamento para url_verification do Slack
    if (body?.type === 'url_verification') {
      return new Response(body.challenge, { status: 200 });
    }

    let message = body?.message;
    let channel_id = body?.channel_id;
    let thread_ts = undefined;
    let user_id = undefined;
    let event_id: string | undefined = undefined;

    // Tratamento para eventos brutos do Slack
    if (body?.type === 'event_callback') {
      const event = body.event;
      if (!event) {
        return new Response(JSON.stringify({ error: 'Missing event in event_callback' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      // Ignora mensagens de bots para evitar loop
      if (event.bot_id || event.subtype === 'bot_message') {
        return new Response(JSON.stringify({ status: 'ignored bot message' }), { headers: { 'Content-Type': 'application/json' } });
      }

      const isMessage = event.type === 'message';
      const isMention = event.type === 'app_mention';
      
      if (isMessage || isMention) {
        message = event.text || '';
        channel_id = event.channel || '';
        thread_ts = event.thread_ts || event.ts;
        user_id = event.user;
        event_id = body.event_id || event.ts || undefined;
        
        message = message.replace(/<@[^>]+>/g, '').trim();
        
        if (!message) {
           return new Response(JSON.stringify({ status: 'ignored empty message' }), { headers: { 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({ status: 'ignored event type' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing/invalid body.message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!channel_id || typeof channel_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing/invalid body.channel_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Deduplicação por event_id no banco ────────────────────────────────
    if (event_id && body?.type === 'event_callback') {
      const alreadyProcessed = await isEventAlreadyProcessed(SUPABASE_URL, SERVICE_ROLE_KEY, event_id);
      if (alreadyProcessed) {
        console.log('[handler] evento já processado, ignorando:', event_id);
        return new Response('OK', { status: 200 });
      }
      // Marcar como processado imediatamente para evitar race condition
      await markEventProcessed(SUPABASE_URL, SERVICE_ROLE_KEY, event_id);
    }

    console.log('[handler] input ok:', {
      channel_id,
      messagePreview: message.slice(0, 80),
    });

    const tools = toolsFactory({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY });
    const memory = memoryFactory({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY });
    const rag = ragFactory(tools);
    const llm = llmFactory(SUPABASE_URL, SERVICE_ROLE_KEY);

    const orch = orchestratorFactory({
      tools,
      memory,
      rag,
      llm,
      systemPrompt: SYSTEM_PROMPT,
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
    });

    // ── Para eventos Slack: retornar 200 imediatamente e processar em background
    if (body?.type === 'event_callback') {
      EdgeRuntime.waitUntil((async () => {
        try {
          const result = await orch.agent(message, channel_id, user_id);
          await postToSlack(channel_id, result.response, thread_ts);
        } catch (e: any) {
          console.error('[handler] background error:', e?.message ?? e);
        }
      })());
      return new Response('OK', { status: 200 });
    }

    const result = await orch.agent(message, channel_id, user_id);

    return new Response(JSON.stringify({ response: result.response }), {
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.log('[handler] error:', e?.message ?? e);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(e?.message ?? e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
