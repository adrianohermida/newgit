/**
 * dotobot-slack — Central de Comandos e Notificações do Pipeline HMADV no Slack
 *
 * Funcionalidades:
 * 1. Recebe comandos slash do Slack (/dotobot) e aciona edge functions
 * 2. Envia notificações ricas (publicações, andamentos, audiências, status)
 * 3. Painel de status do pipeline com métricas em tempo real
 * 4. Relatório de pendências de desenvolvimento
 * 5. Gestão financeira: Deals, Faturas e Assinaturas
 *
 * Comandos disponíveis:
 *   PAINEL E STATUS
 *   /dotobot status              — Painel completo do pipeline
 *   /dotobot pendencias          — Pendências de desenvolvimento
 *
 *   CONSULTAS
 *   /dotobot publicacoes         — Últimas publicações recebidas
 *   /dotobot andamentos          — Últimos andamentos do DataJud
 *   /dotobot audiencias          — Próximas audiências
 *   /dotobot prazos              — Prazos processuais pendentes
 *   /dotobot deals-status        — Resumo financeiro (faturas em aberto)
 *
 *   SINCRONIZAÇÃO E ENRIQUECIMENTO
 *   /dotobot drain-advise        — Drenar publicações do Advise agora
 *   /dotobot datajud             — Processar fila DataJud agora
 *   /dotobot backfill            — Rodar próxima semana do backfill Advise
 *   /dotobot importar-planilhas  — Importar publicações das planilhas exportadas
 *   /dotobot sync-publicacoes    — Sync publicações → Freshsales (activities)
 *   /dotobot extrair-audiencias  — Extrair audiências → appointments Freshsales
 *   /dotobot extrair-partes      — Extrair partes → contacts Freshsales
 *   /dotobot criar-processos     — Criar processos ausentes + vincular órfãos
 *   /dotobot processo-sync       — Sync processos → Freshsales (lote 20)
 *   /dotobot deals-sync          — Sync faturas/assinaturas → Freshsales Deals
 *   /dotobot tipo-processo       — Atualizar tipo físico/eletrônico via Datajud
 *   /dotobot prazo-fim           — Atualizar campo Prazo Fim nos Accounts
 *
 *   CÁLCULO DE PRAZOS
 *   /dotobot calcular-prazos     — Calcular prazos das publicações recentes
 *   /dotobot tpu-enrich          — Enriquecer processos via TPU/CNJ local
 *
 *   HIGIENIZAÇÃO
 *   /dotobot fix-activities      — Corrigir activities pendentes (lote 50)
 *   /dotobot repair-orphans      — Corrigir campos órfãos (instância, partes, status)
 *   /dotobot repair-instancia    — Corrigir apenas campo instância
 *   /dotobot repair-partes       — Corrigir apenas polo ativo/passivo
 *   /dotobot repair-fs           — Sincronizar campos corrigidos com Freshsales
 *   /dotobot reset-datajud       — Resetar processos presos em "processando"
 *   /dotobot higienizar-contatos — Detectar e mesclar contatos duplicados
 *
 *   RELATÓRIOS
 *   /dotobot relatorio-financeiro — Relatório de honorários com atualização monetária
 *   /dotobot backfill-status      — Ver estado do backfill (fila + sync)
 *   /dotobot help                 — Esta ajuda
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ─── LLM Hub (injetado da cida-slack) ───────────────────────────────────────
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



const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_API_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  SVC_KEY;
const FUNCTIONS_BEARER_KEY = String(FUNCTIONS_API_KEY || "").startsWith("eyJ")
  ? FUNCTIONS_API_KEY
  : SVC_KEY;
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") || "";
const SLACK_CHANNEL = Deno.env.get("SLACK_NOTIFY_CHANNEL") || "C09E59J77EU";
const SLACK_USER_TOKEN = Deno.env.get("SLACK_USER_TOKEN") || "";
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SELF_URL = `${SUPABASE_URL}/functions/v1`;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: "judiciario" } });
const dbPublic = createClient(SUPABASE_URL, SVC_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function slackToken(): string {
  // SLACK_BOT_TOKEN tem prioridade — é o token do app Dotobot
  // SLACK_USER_TOKEN é fallback apenas se o bot token não estiver configurado
  const token = SLACK_BOT_TOKEN || SLACK_USER_TOKEN;
  if (!token) console.error("[dotobot] ERRO: nenhum token Slack configurado");
  console.log("[dotobot] token usado:", SLACK_BOT_TOKEN ? "SLACK_BOT_TOKEN" : SLACK_USER_TOKEN ? "SLACK_USER_TOKEN" : "NENHUM");
  return token;
}

async function callSlackApi(method: string, payload: Record<string, unknown>, token = slackToken()) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text().catch(() => "");
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Slack API ${method} falhou (${response.status})`);
  }

  return data as Record<string, unknown>;
}

async function postSlack(channel: string, text: string, blocks?: unknown[], thread_ts?: string): Promise<void> {
  const payload: Record<string, unknown> = { channel, text, unfurl_links: false };
  if (blocks) payload.blocks = blocks;
  if (thread_ts) payload.thread_ts = thread_ts;
  try {
    await callSlackApi("chat.postMessage", payload);
    console.log("[dotobot] postSlack ok:", { channel, chars: text.length, thread_ts: thread_ts || null });
  } catch (err) {
    console.error("[dotobot] postSlack ERRO:", { channel, error: String(err) });
    throw err;
  }
}

async function postSlackEphemeral(channel: string, user: string, text: string, blocks?: unknown[]): Promise<void> {
  const payload: Record<string, unknown> = { channel, user, text };
  if (blocks) payload.blocks = blocks;
  await callSlackApi("chat.postEphemeral", payload);
}

function divider() {
  return { type: "divider" };
}

function section(text: string) {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function header(text: string) {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function context(elements: string[]) {
  return {
    type: "context",
    elements: elements.map((e) => ({ type: "mrkdwn", text: e })),
  };
}

function actions(btns: Array<{ text: string; value: string; style?: string }>) {
  return {
    type: "actions",
    elements: btns.map((b) => ({
      type: "button",
      text: { type: "plain_text", text: b.text, emoji: true },
      value: b.value,
      action_id: `action_${b.value.replace(/[^a-z0-9]/gi, "_")}`,
      ...(b.style ? { style: b.style } : {}),
    })),
  };
}

function homeNavButton(label: string, tab: string, active: boolean) {
  return {
    type: "button",
    text: { type: "plain_text", text: label, emoji: true },
    value: tab,
    action_id: "home_nav",
    ...(active ? { style: "primary" } : {}),
  };
}

function chunkList(items: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function openSlackDm(userId: string): Promise<string> {
  const data = await callSlackApi("conversations.open", { users: userId });
  const channelId = String((data.channel as Record<string, unknown> | undefined)?.id || "");
  if (!channelId) throw new Error("Nao foi possivel abrir DM com o usuario.");
  return channelId;
}

type HomeTab = "inicio" | "mensagens" | "sobre";

function buildHomeBlocks(tab: HomeTab) {
  const nav = {
    type: "actions",
    elements: [
      homeNavButton("Início", "inicio", tab === "inicio"),
      homeNavButton("Mensagens", "mensagens", tab === "mensagens"),
      homeNavButton("Sobre", "sobre", tab === "sobre"),
    ],
  };

  const blocks: unknown[] = [
    header("DotoBot"),
    context([
      "*Assistente operacional do HMADV no Slack*",
      "_App Home ativa com atalhos reais, status do pipeline e catálogo de comandos_",
    ]),
    nav,
    divider(),
  ];

  if (tab === "inicio") {
    blocks.push(
      section(
        "*Painel rápido*\n" +
        "Use os botões abaixo para abrir uma conversa, atualizar a Home ou disparar consultas operacionais sem depender de slash command."
      ),
    );
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Nova conversa", emoji: true },
          value: "new_conversation",
          action_id: "home_quick_action",
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Status do pipeline", emoji: true },
          value: "status",
          action_id: "home_quick_action",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Pendências", emoji: true },
          value: "pendencias",
          action_id: "home_quick_action",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Atualizar Home", emoji: true },
          value: "refresh_inicio",
          action_id: "home_quick_action",
        },
      ],
    });
    blocks.push(divider());
    blocks.push(
      section(
        "*Saúde funcional*\n" +
        "• App Home: *ativa*\n" +
        "• Slash commands: *ativos via* `/dotobot`\n" +
        "• Botões da Home: *tratados pela edge function*\n" +
        "• Catálogo de comandos: *disponível na seção Sobre*"
      ),
    );
    blocks.push(
      context([
        "_Se os botões pararem de responder, valide Interactivity + Request URL apontando para esta edge function._",
      ]),
    );
  }

  if (tab === "mensagens") {
    blocks.push(
      section(
        "*Mensagens*\n" +
        "O botão abaixo inicia uma DM operacional com o DotoBot. Isso cobre o fluxo de abertura rápida enquanto o cabeçalho nativo da aba `Mensagens` depende da configuração do app no Slack."
      ),
    );
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Nova conversa", emoji: true },
          value: "new_conversation",
          action_id: "home_quick_action",
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Enviar ajuda na DM", emoji: true },
          value: "help_dm",
          action_id: "home_quick_action",
        },
      ],
    });
    blocks.push(divider());
    blocks.push(
      section(
        "*Sugestões para iniciar*\n" +
        "• `status`\n" +
        "• `pendencias`\n" +
        "• `publicacoes`\n" +
        "• `resumir 0000000-00.0000.0.00.0000`\n" +
        "• `perguntar quais integrações estão ativas hoje?`"
      ),
    );
    blocks.push(
      context([
        "_Para colocar `Nova conversa` no cabeçalho nativo da aba Mensagens, o app manifest também precisa estar alinhado no Slack._",
      ]),
    );
  }

  if (tab === "sobre") {
    const commandGroups = [
      "*Painel e status*",
      "`/dotobot status`",
      "`/dotobot pendencias`",
      "`/dotobot publicacoes`",
      "`/dotobot andamentos`",
      "`/dotobot audiencias`",
      "`/dotobot prazos`",
      "`/dotobot deals-status`",
      "*Sincronização e enriquecimento*",
      "`/dotobot drain-advise`",
      "`/dotobot backfill`",
      "`/dotobot backfill-status`",
      "`/dotobot importar-planilhas`",
      "`/dotobot sync-publicacoes`",
      "`/dotobot extrair-audiencias`",
      "`/dotobot extrair-partes`",
      "`/dotobot criar-processos`",
      "`/dotobot processo-sync`",
      "`/dotobot deals-sync`",
      "`/dotobot tipo-processo`",
      "`/dotobot prazo-fim`",
      "*IA e higienização*",
      "`/dotobot perguntar ...`",
      "`/dotobot resumir ...`",
      "`/dotobot enriquecer-ia`",
      "`/dotobot ia-status`",
      "`/dotobot fix-activities`",
      "`/dotobot repair-orphans`",
      "`/dotobot repair-instancia`",
      "`/dotobot repair-partes`",
      "`/dotobot repair-fs`",
      "`/dotobot reset-datajud`",
      "`/dotobot higienizar-contatos`",
    ];

    blocks.push(
      section(
        "*Sobre o DotoBot*\n" +
        "O backend ativo hoje concentra Slack, Advise, DataJud, Freshsales, TPU, relatórios operacionais e enriquecimento com IA."
      ),
    );
    blocks.push(divider());

    for (const group of chunkList(commandGroups, 8)) {
      blocks.push(section(group.join("\n")));
      blocks.push(divider());
    }

    blocks.push(
      section(
        "*Integrações mapeadas no backend atual*\n" +
        "• Slack\n" +
        "• Supabase\n" +
        "• Advise\n" +
        "• DataJud\n" +
        "• Freshsales\n" +
        "• TPU/CNJ local"
      ),
    );
  }

  return blocks;
}

async function publishHomeView(userId: string, tab: HomeTab = "inicio") {
  await callSlackApi("views.publish", {
    user_id: userId,
    view: {
      type: "home",
      callback_id: "dotobot_home",
      private_metadata: JSON.stringify({ tab }),
      blocks: buildHomeBlocks(tab),
    },
  });
}

async function handleHomeQuickAction(userId: string, action: string) {
  if (action.startsWith("refresh_")) {
    const tab = action.replace("refresh_", "") as HomeTab;
    await publishHomeView(userId, tab);
    return;
  }

  const dmChannel = await openSlackDm(userId);

  if (action === "new_conversation") {
    await postSlack(
      dmChannel,
      "Nova conversa iniciada. Posso ajudar com status, publicações, andamentos, audiências, prazos, IA e integrações do escritório.",
    );
    return;
  }

  if (action === "help_dm") {
    await handleHelp(dmChannel);
    return;
  }

  if (action === "status") {
    await handleStatus(dmChannel, userId);
    return;
  }

  if (action === "pendencias") {
    await handlePendencias(dmChannel);
    return;
  }
}

async function verifySlackSignature(req: Request, rawBody: string) {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (!SLACK_SIGNING_SECRET || !timestamp || !signature) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const expected = `v0=${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return expected === signature;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function normalizeTemporalText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSlackConversationText(text: string): string {
  return String(text || "")
    .replace(/<@[A-Z0-9]+>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNowInSaoPaulo() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now);
  return { now, dateLabel, timeLabel, isoDate };
}

function isoDateInSaoPaulo(offsetDays = 0): string {
  const target = new Date();
  target.setDate(target.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(target);
}

function offsetDateLabel(days: number): string {
  const target = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(target);
}

function monthLabel(offsetMonths = 0): string {
  const target = new Date();
  target.setMonth(target.getMonth() + offsetMonths);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(target);
}

function weekRangeLabel(offsetWeeks = 0): string {
  const now = new Date();
  const localNow = new Date(now);
  const day = localNow.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(localNow);
  start.setDate(localNow.getDate() + mondayOffset + (offsetWeeks * 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  return `${fmt.format(start)} até ${fmt.format(end)}`;
}

function resolveTemporalAnswer(query: string): string | null {
  const normalized = normalizeTemporalText(query);
  const { dateLabel, timeLabel } = getNowInSaoPaulo();

  if (
    normalized.includes("que dia e hoje") ||
    normalized.includes("que dia eh hoje") ||
    normalized.includes("data de hoje") ||
    normalized.includes("hoje e que dia")
  ) {
    return `Hoje é ${dateLabel}.`;
  }

  if (
    normalized.includes("que horas sao") ||
    normalized.includes("qual a hora agora") ||
    normalized.includes("hora atual") ||
    normalized.includes("agora sao que horas")
  ) {
    return `Agora são ${timeLabel} em ${dateLabel}.`;
  }

  if (normalized.includes("que dia foi ontem") || normalized.includes("ontem foi que dia")) {
    return `Ontem foi ${offsetDateLabel(-1)}.`;
  }

  if (normalized.includes("que dia sera amanha") || normalized.includes("amanha sera que dia") || normalized.includes("que dia e amanha")) {
    return `Amanhã será ${offsetDateLabel(1)}.`;
  }

  if (normalized.includes("esta semana") || normalized.includes("essa semana")) {
    return `Esta semana corresponde ao período de ${weekRangeLabel(0)}.`;
  }

  if (normalized.includes("proxima semana")) {
    return `A próxima semana corresponde ao período de ${weekRangeLabel(1)}.`;
  }

  if (normalized.includes("este mes") || normalized.includes("esse mes")) {
    return `Estamos em ${monthLabel(0)}.`;
  }

  if (normalized.includes("mes passado") || normalized.includes("ultimo mes")) {
    return `O mês passado foi ${monthLabel(-1)}.`;
  }

  return null;
}

async function invokeFunction(name: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: FUNCTIONS_API_KEY,
  };
  if (FUNCTIONS_BEARER_KEY) {
    headers.Authorization = `Bearer ${FUNCTIONS_BEARER_KEY}`;
  }
  const r = await fetch(`${SELF_URL}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });
  return r.json().catch(() => ({ error: "timeout ou resposta inválida" }));
}

async function invokeFunctionRequest(
  name: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }

  const url = `${SELF_URL}/${name}${query.size ? `?${query.toString()}` : ""}`;
  const method = options.method || (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: FUNCTIONS_API_KEY,
  };
  if (FUNCTIONS_BEARER_KEY) {
    headers.Authorization = `Bearer ${FUNCTIONS_BEARER_KEY}`;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(options.body || {}) : undefined,
    signal: AbortSignal.timeout(55000),
  });

  return response.json().catch(() => ({ error: "timeout ou resposta inválida" }));
}

function extractCnjFromQuestion(text: string): string | null {
  const match = String(text || "").match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}|\d{20}/);
  return match ? match[0] : null;
}

function extractUuidFromQuestion(text: string): string | null {
  const match = String(text || "").match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  return match ? match[0] : null;
}

function extractIntegerFromQuestion(text: string): number | null {
  const match = String(text || "").match(/\b\d+\b/);
  return match ? Number(match[0]) : null;
}

function extractIsoDates(text: string): string[] {
  return String(text || "").match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
}

function summarizeDeterministicQuestionResult(
  route: string,
  data: Record<string, unknown>,
  context: Record<string, unknown> = {},
): string {
  const rawError = typeof data.error === "string"
    ? data.error
    : typeof data.message === "string" && String(data.code || "").toUpperCase().startsWith("UNAUTHORIZED")
      ? data.message
      : "";
  if (rawError) {
    switch (route) {
      case "advise_sync":
        return `Tive um problema ao sincronizar o Advise agora: ${rawError}`;
      case "datajud_search":
        return `Não consegui consultar o DataJud agora: ${rawError}`;
      case "processo_sync":
        return `Tive um problema ao executar a rotina de processos: ${rawError}`;
      case "publicacoes_prazos":
        return `Não consegui executar o cálculo de prazos agora: ${rawError}`;
      case "publicacoes_audiencias":
        return `Não consegui processar a rotina de audiências agora: ${rawError}`;
      case "fc_last_conversation":
        return `Não encontrei uma conversa para o contato informado: ${rawError}`;
      case "fc_update_conversation":
        return `Não consegui atualizar a conversa informada: ${rawError}`;
      default:
        return `Tive um problema ao executar essa ação: ${rawError}`;
    }
  }
  switch (route) {
    case "advise_sync":
      return context.action === "status"
        ? "Status do sincronismo do Advise consultado com sucesso."
        : context.action === "sync_range"
          ? `Sincronização do Advise executada para o período ${context.data_inicio} até ${context.data_fim}.`
          : "Sincronização incremental de publicações do Advise executada com sucesso.";
    case "datajud_search":
      return `Consulta DataJud concluída para ${data.numero_cnj || context.numeroProcesso || "o processo informado"}.`;
    case "processo_sync":
      return context.action === "pipeline"
        ? "Pipeline de sincronização de processos executado com sucesso."
        : context.action === "sync_bidirectional"
          ? "Sincronização bidirecional de processos executada com sucesso."
          : "Rotina de processos executada com sucesso.";
    case "publicacoes_prazos":
      return context.action === "status"
        ? "Status do cálculo de prazos consultado com sucesso."
        : context.action === "alertas"
          ? "Verificação de alertas de prazos executada com sucesso."
          : "Cálculo de prazos executado com sucesso.";
    case "publicacoes_audiencias":
      return context.action === "status"
        ? "Status da extração de audiências consultado com sucesso."
        : context.action === "sync_fs"
          ? "Sincronização de audiências com o Freshsales executada com sucesso."
          : "Extração de audiências executada com sucesso.";
    case "fc_last_conversation":
      return `A última conversa encontrada foi ${data.conversation_id || "n/d"}, com status ${data.status || "n/d"}.`;
    case "fc_update_conversation":
      return `Conversa ${data.conversation_id || context.conversation_id || "informada"} atualizada com sucesso.`;
    default:
      return "A ação foi realizada com sucesso.";
  }
}

async function tryDeterministicQuestionRoute(query: string): Promise<{ route: string; answer: string; data: unknown } | null> {
  const normalized = normalizeTemporalText(query);
  const cnj = extractCnjFromQuestion(query);
  const uuid = extractUuidFromQuestion(query);
  const numericId = extractIntegerFromQuestion(query);
  const isoDates = extractIsoDates(query);

  if (normalized.includes("sincronizar advise") || normalized.includes("sync advise")) {
    const action = isoDates.length >= 2 || normalized.includes("sincronizar")
      ? "sync_range"
      : normalized.includes("status")
        ? "status"
        : "sync";
    const dataInicio = isoDates[0] || (action === "sync_range" ? isoDateInSaoPaulo(-1) : undefined);
    const dataFim = isoDates[1] || (action === "sync_range" ? isoDateInSaoPaulo(0) : undefined);
    const data = await invokeFunctionRequest("advise-sync", {
      method: "GET",
      query: {
        action,
        data_inicio: dataInicio,
        data_fim: dataFim,
      },
    }) as Record<string, unknown>;
    return {
      route: "advise_sync",
      answer: summarizeDeterministicQuestionResult("advise_sync", data, { action, data_inicio: dataInicio, data_fim: dataFim }),
      data,
    };
  }

  if ((normalized.includes("datajud") || normalized.includes("consultar cnj") || normalized.includes("buscar processo no datajud")) && cnj) {
    const data = await invokeFunctionRequest("datajud-search", {
      method: "POST",
      body: { numeroProcesso: cnj, persistir: true },
    }) as Record<string, unknown>;
    return {
      route: "datajud_search",
      answer: summarizeDeterministicQuestionResult("datajud_search", data, { numeroProcesso: cnj }),
      data,
    };
  }

  if (normalized.includes("sincronizar processo") || normalized.includes("processo sync") || normalized.includes("pipeline de processos")) {
    const action = normalized.includes("pipeline")
      ? "pipeline"
      : normalized.includes("bidirecional")
        ? "sync_bidirectional"
        : "levantamento";
    const data = await invokeFunctionRequest("processo-sync", {
      method: "GET",
      query: { action },
    }) as Record<string, unknown>;
    return {
      route: "processo_sync",
      answer: summarizeDeterministicQuestionResult("processo_sync", data, { action }),
      data,
    };
  }

  if (normalized.includes("prazo") && (normalized.includes("calcular") || normalized.includes("alerta") || normalized.includes("status"))) {
    const action = normalized.includes("status") ? "status" : normalized.includes("alerta") ? "alertas" : "calcular_batch";
    const data = await invokeFunctionRequest("publicacoes-prazos", {
      method: "POST",
      body: { action, batch_size: 50 },
    }) as Record<string, unknown>;
    return {
      route: "publicacoes_prazos",
      answer: summarizeDeterministicQuestionResult("publicacoes_prazos", data, { action }),
      data,
    };
  }

  if (normalized.includes("audiencia") && (normalized.includes("extrair") || normalized.includes("sincronizar") || normalized.includes("status"))) {
    const action = normalized.includes("status") ? "status" : normalized.includes("freshsales") ? "sync_fs" : "extract_batch";
    const data = await invokeFunctionRequest("publicacoes-audiencias", {
      method: "POST",
      body: { action, ...(numericId ? { publicacao_id: String(numericId) } : {}) },
    }) as Record<string, unknown>;
    return {
      route: "publicacoes_audiencias",
      answer: summarizeDeterministicQuestionResult("publicacoes_audiencias", data, { action, publicacao_id: numericId }),
      data,
    };
  }

  if ((normalized.includes("ultima conversa") || normalized.includes("last conversation")) && uuid) {
    const data = await invokeFunctionRequest("fc-last-conversation", {
      method: "GET",
      query: { contact_id: uuid },
    }) as Record<string, unknown>;
    return {
      route: "fc_last_conversation",
      answer: summarizeDeterministicQuestionResult("fc_last_conversation", data, { contact_id: uuid }),
      data,
    };
  }

  if ((normalized.includes("atualizar conversa") || normalized.includes("mudar status da conversa")) && uuid) {
    const status =
      normalized.includes("resolvid") ? "resolved" :
      normalized.includes("fechad") ? "closed" :
      normalized.includes("penden") ? "pending" :
      normalized.includes("abert") ? "open" : null;
    const data = await invokeFunctionRequest("fc-update-conversation", {
      method: "POST",
      body: {
        conversation_id: uuid,
        ...(status ? { status } : {}),
      },
    }) as Record<string, unknown>;
    return {
      route: "fc_update_conversation",
      answer: summarizeDeterministicQuestionResult("fc_update_conversation", data, { conversation_id: uuid, status }),
      data,
    };
  }

  return null;
}

// ── Diagnóstico de Banco de Dados (CRUD) ──────────────────────────────────
async function handleTestData(channel: string): Promise<void> {
  const blocks = [
    header("🔍 Diagnóstico Completo de Banco de Dados (CRUD)"),
    section("Iniciando testes de conectividade e permissões no Supabase...")
  ];
  
  await postSlack(channel, "Diagnóstico CRUD iniciado", blocks);
  
  const results = {
    read: { success: false, msg: "" },
    write: { success: false, msg: "", id: "" },
    update: { success: false, msg: "" },
    delete: { success: false, msg: "" }
  };
  
  try {
    // 1. READ: Buscar um registro qualquer
    const { data: readData, error: readErr } = await db.from("publicacoes").select("id").limit(1);
    if (readErr) throw new Error(`READ error: ${readErr.message}`);
    results.read = { success: true, msg: `✅ Sucesso (encontrado ${readData?.length || 0} registros)` };
    
    // 2. WRITE: Inserir um registro na fila de monitoramento
    const testPayload = {
      tipo: "diagnostico_dotobot",
      status: "concluido",
      payload: { teste: "crud_operations", ts: Date.now() }
    };
    
    const { data: writeData, error: writeErr } = await db.from("monitoramento_queue")
      .insert(testPayload)
      .select("id")
      .single();
      
    if (writeErr) throw new Error(`WRITE error: ${writeErr.message}`);
    results.write = { success: true, msg: `✅ Sucesso (ID: ${writeData.id})`, id: writeData.id };
    
    // 3. UPDATE: Atualizar o registro inserido
    if (writeData?.id) {
      const { error: updateErr } = await db.from("monitoramento_queue")
        .update({ status: "erro", erro: "teste_update_dotobot" })
        .eq("id", writeData.id);
        
      if (updateErr) throw new Error(`UPDATE error: ${updateErr.message}`);
      results.update = { success: true, msg: `✅ Sucesso (ID atualizado: ${writeData.id})` };
      
      // 4. DELETE: Remover o registro de teste
      const { error: deleteErr } = await db.from("monitoramento_queue")
        .delete()
        .eq("id", writeData.id);
        
      if (deleteErr) throw new Error(`DELETE error: ${deleteErr.message}`);
      results.delete = { success: true, msg: `✅ Sucesso (ID removido: ${writeData.id})` };
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (!results.read.success) results.read.msg = `❌ Falha: ${errMsg}`;
    else if (!results.write.success) results.write.msg = `❌ Falha: ${errMsg}`;
    else if (!results.update.success) results.update.msg = `❌ Falha: ${errMsg}`;
    else if (!results.delete.success) results.delete.msg = `❌ Falha: ${errMsg}`;
  }
  
  const finalBlocks = [
    header("🔍 Diagnóstico Completo de Banco de Dados (CRUD)"),
    divider(),
    section(
      `*1. READ (Leitura)*
${results.read.msg}

` +
      `*2. WRITE (Gravação)*
${results.write.msg}

` +
      `*3. UPDATE (Atualização)*
${results.update.msg}

` +
      `*4. DELETE (Exclusão)*
${results.delete.msg}`
    ),
    divider(),
    context([`_Diagnóstico executado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`])
  ];
  
  await postSlack(channel, "Resultado do Diagnóstico CRUD", finalBlocks);
}

// ── Handlers de Comandos ──────────────────────────────────────────────────────

async function handleStatus(channel: string, userId: string): Promise<void> {
  // Coletar métricas em paralelo
  const [
    pubTotal,
    pubSemActivity,
    pubUltimas,
    queuePendente,
    queueErro,
    processos,
    movimentos,
    audiencias,
  ] = await Promise.all([
    db.from("publicacoes").select("id", { count: "exact", head: true }),
    db.from("publicacoes").select("id", { count: "exact", head: true }).is("freshsales_activity_id", null),
    db.from("publicacoes").select("id,data_publicacao,numero_processo_api").order("data_publicacao", { ascending: false }).limit(1),
    db.from("monitoramento_queue").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    db.from("monitoramento_queue").select("id", { count: "exact", head: true }).eq("status", "erro"),
    db.from("processos").select("id", { count: "exact", head: true }),
    db.from("movimentos").select("id", { count: "exact", head: true }),
    db.from("audiencias").select("id", { count: "exact", head: true }),
  ]);

  const totalPub = pubTotal.count ?? 0;
  const semActivity = pubSemActivity.count ?? 0;
  const comActivity = totalPub - semActivity;
  const pctActivity = totalPub > 0 ? Math.round((comActivity / totalPub) * 100) : 0;
  const ultimaPub = pubUltimas.data?.[0];
  const qPend = queuePendente.count ?? 0;
  const qErro = queueErro.count ?? 0;
  const totalProc = processos.count ?? 0;
  const totalMov = movimentos.count ?? 0;
  const totalAud = audiencias.count ?? 0;

  const statusEmoji = pctActivity >= 90 ? "🟢" : pctActivity >= 60 ? "🟡" : "🔴";
  const queueEmoji = qPend === 0 ? "✅" : qPend < 100 ? "🟡" : "🔴";

  const blocks = [
    header("📊 Pipeline HMADV — Status em Tempo Real"),
    divider(),
    section(
      `*📋 Publicações Advise*\n` +
      `• Total no banco: *${totalPub.toLocaleString("pt-BR")}*\n` +
      `• Com activity no Freshsales: *${comActivity.toLocaleString("pt-BR")}* (${pctActivity}%) ${statusEmoji}\n` +
      `• Sem activity (pendentes): *${semActivity.toLocaleString("pt-BR")}*\n` +
      `• Última publicação: *${ultimaPub ? `${fmtDate(ultimaPub.data_publicacao)} — ${ultimaPub.numero_processo_api || "s/nº"}` : "—"}*`
    ),
    divider(),
    section(
      `*⚙️ Fila DataJud (monitoramento_queue)*\n` +
      `• Pendentes: *${qPend.toLocaleString("pt-BR")}* ${queueEmoji}\n` +
      `• Com erro: *${qErro.toLocaleString("pt-BR")}* ${qErro > 0 ? "⚠️" : "✅"}`
    ),
    divider(),
    section(
      `*🗂️ Banco de Dados Supabase*\n` +
      `• Processos: *${totalProc.toLocaleString("pt-BR")}*\n` +
      `• Movimentos: *${totalMov.toLocaleString("pt-BR")}*\n` +
      `• Audiências: *${totalAud.toLocaleString("pt-BR")}*`
    ),
    divider(),
    actions([
      { text: "🔄 Drenar Advise", value: "drain_advise" },
      { text: "⚡ Processar DataJud", value: "run_datajud" },
      { text: "🔧 Fix Activities", value: "fix_activities", style: "primary" },
    ]),
    context([`_Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(channel, `📊 Status do Pipeline HMADV`, blocks);
}

async function handlePublicacoes(channel: string): Promise<void> {
  const { data: pubs } = await db
    .from("publicacoes")
    .select("id,data_publicacao,numero_processo_api,conteudo,freshsales_activity_id,account_id_freshsales")
    .order("data_publicacao", { ascending: false })
    .limit(5);

  if (!pubs || pubs.length === 0) {
    await postSlack(channel, "Nenhuma publicação encontrada.");
    return;
  }

  const blocks: unknown[] = [header("📰 Últimas 5 Publicações — Advise")];

  for (const pub of pubs) {
    const conteudo = String(pub.conteudo || "").substring(0, 200).replace(/\n/g, " ");
    const fsLink = pub.account_id_freshsales
      ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${pub.account_id_freshsales}|Ver no Freshsales>`
      : "_Sem vínculo no Freshsales_";
    const actStatus = pub.freshsales_activity_id ? "✅ Activity criada" : "⚠️ Sem activity";

    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(pub.data_publicacao)}* — \`${pub.numero_processo_api || "s/nº"}\`\n` +
        `${conteudo}...\n` +
        `${actStatus} | ${fsLink}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_Exibindo as 5 publicações mais recentes do banco Supabase_`]));

  await postSlack(channel, "📰 Últimas publicações do Advise", blocks);
}

async function handleAndamentos(channel: string): Promise<void> {
  const { data: movs } = await db
    .from("movimentos")
    .select("id,data_movimento,descricao,numero_cnj,processo_id")
    .order("data_movimento", { ascending: false })
    .limit(5);

  if (!movs || movs.length === 0) {
    await postSlack(channel, "Nenhum andamento encontrado.");
    return;
  }

  const blocks: unknown[] = [header("⚖️ Últimos 5 Andamentos — DataJud")];

  for (const mov of movs) {
    const descricao = String(mov.descricao || "").substring(0, 200);
    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(mov.data_movimento)}* — \`${mov.numero_cnj || "s/nº"}\`\n` +
        `${descricao}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_Exibindo os 5 andamentos mais recentes do DataJud_`]));

  await postSlack(channel, "⚖️ Últimos andamentos DataJud", blocks);
}

async function handleAudiencias(channel: string): Promise<void> {
  const hoje = new Date().toISOString().split("T")[0];
  const { data: auds } = await db
    .from("audiencias")
    .select("id,data_audiencia,tipo,descricao,numero_cnj,processo_id,local")
    .gte("data_audiencia", hoje)
    .order("data_audiencia", { ascending: true })
    .limit(10);

  if (!auds || auds.length === 0) {
    await postSlack(channel, "✅ Nenhuma audiência futura encontrada no banco.");
    return;
  }

  const blocks: unknown[] = [header("📅 Próximas Audiências")];

  for (const aud of auds) {
    const tipo = String(aud.tipo || "Audiência").toUpperCase();
    const local = aud.local ? `📍 ${aud.local}` : "";
    const descricao = String(aud.descricao || "").substring(0, 150);

    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(aud.data_audiencia)}* — *${tipo}*\n` +
        `\`${aud.numero_cnj || "s/nº"}\`\n` +
        `${descricao}\n${local}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_${auds.length} audiência(s) futuras encontradas_`]));

  await postSlack(channel, `📅 ${auds.length} audiência(s) próxima(s)`, blocks);
}

async function handlePendencias(channel: string): Promise<void> {
  const blocks = [
    header("🚧 Pendências de Desenvolvimento — Pipeline HMADV"),
    divider(),
    section(
      `*✅ Concluído*\n` +
      `• Ingestão de publicações Advise (cron a cada 15 min)\n` +
      `• Edge function \`publicacoes-freshsales\` (activities com completed_date)\n` +
      `• Edge function \`datajud-worker\` (movimentos e audiências)\n` +
      `• Edge function \`fs-account-repair\` (fix_activities + batch)\n` +
      `• Edge function \`fs-account-enricher\` (regras de negócio centralizadas)\n` +
      `• Edge function \`slack-notify\` (notificações via SLACK_USER_TOKEN)\n` +
      `• Edge function \`dotobot-slack\` (comandos slash + painel)\n` +
      `• Canal #dotobot configurado (ID: C09E59J77EU)\n` +
      `• Secret SLACK_NOTIFY_CHANNEL configurado`
    ),
    divider(),
    section(
      `*⚠️ Em Andamento / Pendente*\n` +
      `• *2.771 activities pendentes* no Freshsales precisam de \`fix_activities\`\n` +
      `  → Rate limit: 1.000 req/hora → lotes de 50 a cada 5 min\n` +
      `• *Ingestão de contacts* pode não ter terminado (~21.700 de 27.134)\n` +
      `  → Token OAuth de contacts expira a cada ~4h\n` +
      `• *Campos órfãos* nos Accounts do Freshsales (status, instância, fase)\n` +
      `  → Usar \`fs-account-repair\` com \`action=batch\`\n` +
      `• *Notificações automáticas* nas edge functions (publicações, andamentos, audiências)\n` +
      `  → Integrar chamada ao \`slack-notify\` em cada função\n` +
      `• *Cron job de status diário* (resumo às 8h todo dia útil)\n` +
      `• *Audiências extraídas* de publicações via regex (hmadv-hearing-utils.js)\n` +
      `  → Salvar na tabela \`audiencias\` e enviar ao Freshsales`
    ),
    divider(),
    section(
      `*🔴 Bloqueios Conhecidos*\n` +
      `• \`SLACK_BOT_TOKEN\` sem scope \`chat:write\` → usando \`SLACK_USER_TOKEN\`\n` +
      `• \`SLACK_ACCESS_TOKEN\` inválido (token OAuth expirado)\n` +
      `• \`publicacoes-freshsales\` com \`verify_jwt=true\` → não pode ser chamada por cron diretamente`
    ),
    divider(),
    section(
      `*📌 Próximos Sprints*\n` +
      `• Sprint: Correção em massa de activities (fix_activities via cron)\n` +
      `• Sprint: Enriquecimento em massa de Accounts (batch repair)\n` +
      `• Sprint: Extração de audiências de publicações\n` +
      `• Sprint: Ingestão completa de contacts (retomar)\n` +
      `• Sprint: Notificações automáticas integradas nas edge functions`
    ),
    divider(),
    actions([
      { text: "🔧 Fix Activities Agora", value: "fix_activities", style: "primary" },
      { text: "🔄 Drenar Advise", value: "drain_advise" },
      { text: "📊 Ver Status", value: "status" },
    ]),
    context([`_Relatório gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(channel, "🚧 Pendências do Pipeline HMADV", blocks);
}

async function handleFixActivities(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔧 <@${userId}> acionou *fix_activities* — processando lote de 50...`);

  try {
    const result = await invokeFunction("fs-account-repair", {
      action: "fix_activities",
      batch_size: 50,
      cursor: 0,
    }) as Record<string, unknown>;

    const corrigidas = result.corrigidas ?? 0;
    const erros = result.erros ?? 0;
    const proximoCursor = result.proximo_cursor ?? 50;

    const emoji = erros === 0 ? "✅" : "⚠️";
    await postSlack(
      channel,
      `${emoji} *fix_activities* concluído\n• Corrigidas: *${corrigidas}*\n• Erros: *${erros}*\n• Próximo cursor: ${proximoCursor}`,
      [
        section(
          `${emoji} *fix_activities* — Lote Processado\n` +
          `• Activities corrigidas: *${corrigidas}*\n` +
          `• Erros: *${erros}*\n` +
          `• Próximo cursor para continuar: \`${proximoCursor}\``
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao executar fix_activities: ${String(e)}`);
  }
}

async function handleDrainAdvise(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔄 <@${userId}> acionou *drain-advise* — drenando publicações...`);

  try {
    const result = await invokeFunction("advise-drain-by-date", {}) as Record<string, unknown>;
    const inseridas = result.inseridas ?? result.total ?? 0;
    const ignoradas = result.ignoradas ?? 0;

    await postSlack(
      channel,
      `✅ *drain-advise* concluído`,
      [
        section(
          `✅ *Drenagem Advise* — Concluída\n` +
          `• Publicações inseridas: *${inseridas}*\n` +
          `• Já existentes (ignoradas): *${ignoradas}*`
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao drenar Advise: ${String(e)}`);
  }
}

async function handleBackfillStatus(channel: string): Promise<void> {
  // Buscar estado da fila de backfill
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/advise_backfill_queue?select=status,publicacoes_importadas,data_inicio,data_fim&order=data_inicio.asc`,
    {
      headers: {
        Authorization: `Bearer ${SVC_KEY}`,
        apikey: SVC_KEY,
        "Accept-Profile": "judiciario",
        "Accept": "application/json",
      },
    }
  );
  const fila = await r.json().catch(() => []) as Array<Record<string, unknown>>;

  const total = fila.length;
  const pendentes = fila.filter(f => f.status === "pendente").length;
  const processando = fila.filter(f => f.status === "processando").length;
  const concluidos = fila.filter(f => f.status === "concluido").length;
  const comPublicacoes = fila.filter(f => Number(f.publicacoes_importadas ?? 0) > 0).length;
  const totalImportadas = fila.reduce((acc, f) => acc + Number(f.publicacoes_importadas ?? 0), 0);

  // Buscar status atual da advise-sync
  const rs = await fetch(
    `${SUPABASE_URL}/rest/v1/advise_sync_status?select=status,ultima_execucao,ultima_data_movimento,ultima_pagina,total_paginas,total_registros&order=updated_at.desc&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${SVC_KEY}`,
        apikey: SVC_KEY,
        "Accept-Profile": "judiciario",
        "Accept": "application/json",
      },
    }
  );
  const syncStatus = await rs.json().catch(() => []) as Array<Record<string, unknown>>;
  const sync = syncStatus[0] ?? {};

  const syncEmoji = sync.status === "running" ? "⚡" : sync.status === "idle" ? "✅" : "⚠️";
  const pctConcluido = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const blocks = [
    header("📥 Backfill Advise — Status"),
    divider(),
    section(
      `*Fila de Backfill (${total} semanas)*\n` +
      `• Pendentes: *${pendentes}* | Processando: *${processando}* | Concluídas: *${concluidos}* (${pctConcluido}%)\n` +
      `• Semanas com publicações importadas: *${comPublicacoes}*\n` +
      `• Total de publicações importadas: *${totalImportadas.toLocaleString("pt-BR")}*`
    ),
    divider(),
    section(
      `*Advise-Sync Status*\n` +
      `• Estado: *${sync.status ?? "desconhecido"}* ${syncEmoji}\n` +
      `• Última execução: *${fmtDate(String(sync.ultima_execucao ?? ""))}*\n` +
      `• Última data processada: *${fmtDate(String(sync.ultima_data_movimento ?? ""))}*\n` +
      `• Página atual: *${sync.ultima_pagina ?? "—"}* de *${sync.total_paginas ?? "—"}*`
    ),
    divider(),
    actions([
      { text: "▶️ Rodar Backfill", value: "run_backfill", style: "primary" },
      { text: "🔄 Drenar Advise", value: "drain_advise" },
    ]),
    context([`_Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(channel, "📥 Status do Backfill Advise", blocks);
}

async function handleRunBackfill(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `📥 <@${userId}> acionou *advise-backfill-runner* — processando próxima semana...`);

  try {
    const result = await invokeFunction("advise-backfill-runner", {}) as Record<string, unknown>;
    const semana = result.semana ?? "—";
    const novas = result.novas_importadas ?? result.novas ?? 0;
    const erros = result.erros ?? 0;
    const status = result.status ?? "concluido";

    const emoji = status === "completo" ? "🎉" : erros === 0 ? "✅" : "⚠️";
    await postSlack(
      channel,
      `${emoji} *advise-backfill-runner* concluído`,
      [
        section(
          `${emoji} *Backfill Advise* — Semana Processada\n` +
          `• Semana: *${semana}*\n` +
          `• Publicações novas: *${novas}*\n` +
          `• Erros: *${erros}*\n` +
          `• Status: \`${status}\``
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao rodar backfill: ${String(e)}`);
  }
}

async function handleRepairOrphans(channel: string, userId: string, subAction = "fix_all"): Promise<void> {
  await postSlack(channel, `🔧 <@${userId}> acionou *fs-repair-orphans/${subAction}* — corrigindo campos órfãos...`);

  try {
    const result = await invokeFunction("fs-repair-orphans", { action: subAction, batch: 100 }) as Record<string, unknown>;

    const blocks: unknown[] = [
      header(`🔧 Reparo de Campos Órfãos — ${subAction}`),
      divider(),
    ];

    if (subAction === "fix_all" && result) {
      const r = result as Record<string, Record<string, number>>;
      blocks.push(section(
        `*Instância:* ${r.instancia?.corrigidos ?? 0} corrigidos\n` +
        `*Partes:* ${r.partes?.corrigidos ?? 0} corrigidos\n` +
        `*Status:* ${r.status?.corrigidos ?? 0} corrigidos\n` +
        `*Freshsales Sync:* ${r.fs_sync?.sincronizados ?? 0} sincronizados`
      ));
    } else {
      blocks.push(section(JSON.stringify(result, null, 2).substring(0, 500)));
    }

    blocks.push(context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]));
    await postSlack(channel, `✅ Reparo concluído`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao reparar campos órfãos: ${String(e)}`);
  }
}

async function handleResetDatajud(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔄 <@${userId}> acionou *reset-datajud* — resetando processos presos em "processando"...`);

  try {
    const result = await invokeFunction("fs-repair-orphans", { action: "reset_datajud" }) as Record<string, unknown>;
    const resetados = result.resetados ?? 0;
    await postSlack(
      channel,
      `✅ *reset-datajud* concluído — *${resetados}* processos resetados para pendente`,
      [
        section(`✅ *Reset DataJud* concluído\n• Processos resetados: *${resetados}*`),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao resetar DataJud: ${String(e)}`);
  }
}

async function handleProcessoSync(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔄 <@${userId}> acionou *processo-sync* — sincronizando processos com Freshsales...`);

  try {
    const result = await invokeFunction("processo-sync", { action: "sync_bidirectional", limite: 20 }) as Record<string, unknown>;
    const sincronizados = result.sincronizados ?? result.total ?? 0;
    const erros = result.erros ?? 0;

    await postSlack(
      channel,
      `✅ *processo-sync* concluído`,
      [
        section(
          `✅ *Processo-Sync* — Concluído\n` +
          `• Processos sincronizados: *${sincronizados}*\n` +
          `• Erros: *${erros}*`
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao sincronizar processos: ${String(e)}`);
  }
}

async function handleDatajud(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `⚡ <@${userId}> acionou *datajud-worker* — processando fila...`);

  try {
    const result = await invokeFunction("datajud-worker", { batch_size: 10 }) as Record<string, unknown>;
    const processados = result.processados ?? result.total ?? 0;
    const erros = result.erros ?? 0;

    await postSlack(
      channel,
      `✅ *datajud-worker* concluído`,
      [
        section(
          `✅ *DataJud Worker* — Concluído\n` +
          `• Processos consultados: *${processados}*\n` +
          `• Erros: *${erros}*`
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao processar DataJud: ${String(e)}`);
  }
}

// ── Handler: Prazos ─────────────────────────────────────────────────────────

async function handlePrazos(channel: string): Promise<void> {
  try {
    // Buscar prazos pendentes
    const { data: prazos } = await db
      .from("prazo_calculado")
      .select(`
        titulo, data_vencimento, status, prioridade, tipo_contagem,
        processo:processo_id(numero_cnj, tribunal)
      `)
      .eq("status", "pendente")
      .order("data_vencimento", { ascending: true })
      .limit(10);

    const { count: totalPendentes } = await db
      .from("prazo_calculado")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente");

    const { count: urgentes } = await db
      .from("prazo_calculado")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente")
      .lte("data_vencimento", new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0]);

    const hoje = new Date().toISOString().split("T")[0];

    const prazoLines = (prazos || []).map((p: Record<string, unknown>) => {
      const proc = (p.processo as Record<string, unknown>)?.numero_cnj || "—";
      const venc = fmtDate(String(p.data_vencimento || ""));
      const titulo = String(p.titulo || "").substring(0, 50);
      const prioridade = String(p.prioridade || "media");
      const diasRestantes = Math.ceil((new Date(String(p.data_vencimento)).getTime() - Date.now()) / 86400000);
      const emoji = diasRestantes < 0 ? "🔴" : diasRestantes <= 1 ? "🚨" : diasRestantes <= 3 ? "⚠️" : prioridade === "alta" ? "🟠" : "🟡";
      return `${emoji} \`${proc}\`\n   ${titulo}\n   Vence: *${venc}* (${diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`})`;
    }).join("\n\n");

    const blocks = [
      header("⏱️ Prazos Processuais Pendentes"),
      section(
        `*Total pendentes:* ${totalPendentes || 0} | *Urgentes (≤3 dias):* ${urgentes || 0}`
      ),
      divider(),
      section(prazoLines || "_Nenhum prazo calculado ainda — aguardando backfill das publicações_"),
      divider(),
      context([`_Calculados via prazo_regra + feriado_forense | Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];

    await postSlack(channel, `⏱️ Prazos pendentes: ${totalPendentes || 0} (${urgentes || 0} urgentes)`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao buscar prazos: ${String(e)}`);
  }
}

// ── Handler: TPU Enricher ────────────────────────────────────────────────────

async function handleTpuEnricher(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, "🔍 Iniciando enriquecimento TPU/CNJ...");
    const resp = await fetch(`${SELF_URL}/tpu-enricher`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SVC_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batch_enrich", batch_size: 50 }),
    });
    const result = await resp.json() as Record<string, unknown>;
    const enriched = Number(result.enriched || 0);
    const errors = Number(result.errors || 0);
    const blocks = [
      header("🔍 TPU Enricher — Enriquecimento Local via CNJ"),
      section(
        `*Processados:* ${enriched} processos enriquecidos\n` +
        `*Erros:* ${errors}\n\n` +
        `_Dados extraídos: tribunal, comarca, vara, instância, segmento — sem chamada à API DataJud_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `🔍 TPU Enricher: ${enriched} processos enriquecidos`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao executar TPU Enricher: ${String(e)}`);
  }
}

// ── Handler: Calcular Prazos ─────────────────────────────────────────────────

async function handleCalcularPrazos(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, "⏱️ Calculando prazos das publicações recentes...");
    const resp = await fetch(`${SELF_URL}/publicacoes-prazos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SVC_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "calcular_batch", batch_size: 50 }),
    });
    const result = await resp.json() as Record<string, unknown>;
    const calculados = Number(result.calculados || 0);
    const criados_fs = Number(result.criados_freshsales || 0);
    const errors = Number(result.errors || 0);
    const blocks = [
      header("⏱️ Cálculo de Prazos Processuais"),
      section(
        `*Prazos calculados:* ${calculados}\n` +
        `*Tasks criadas no Freshsales:* ${criados_fs}\n` +
        `*Erros:* ${errors}\n\n` +
        `_Regras aplicadas: prazo_regra + feriado_forense + suspensao_expediente_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `⏱️ Prazos: ${calculados} calculados, ${criados_fs} tasks no Freshsales`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao calcular prazos: ${String(e)}`);
  }
}

// ── Novos Handlers v2.0 ─────────────────────────────────────────────────────

async function handleDealsStatus(channel: string): Promise<void> {
  try {
    const [fatAberto, fatTotal, assAberto, assTotal, prazosAberto] = await Promise.all([
      dbPublic.from("faturas").select("saldo_devedor", { count: "exact" }).eq("status", "Em aberto"),
      dbPublic.from("faturas").select("id", { count: "exact", head: true }),
      dbPublic.from("faturas").select("saldo_devedor").eq("status", "Em aberto").eq("tipo", "Assinatura"),
      dbPublic.from("faturas").select("id", { count: "exact", head: true }).eq("tipo", "Assinatura"),
      dbPublic.from("freshsales_deals_registry").select("id", { count: "exact", head: true }).eq("stage", "open"),
    ]);

    const totalFat = fatTotal.count ?? 0;
    const totalAss = assTotal.count ?? 0;
    const emAbertoFat = fatAberto.count ?? 0;
    const emAbertoAss = assAberto.count ?? 0;
    const saldoFat = (fatAberto.data ?? []).reduce((s: number, r: Record<string, unknown>) => s + (Number(r.saldo_devedor) || 0), 0);
    const saldoAss = (assAberto.data ?? []).reduce((s: number, r: Record<string, unknown>) => s + (Number(r.saldo_devedor) || 0), 0);
    const dealsAbertos = prazosAberto.count ?? 0;

    const blocks = [
      header("💰 Resumo Financeiro — HMADV"),
      divider(),
      section(
        `*📄 Faturas*\n` +
        `• Total: *${totalFat.toLocaleString("pt-BR")}*\n` +
        `• Em aberto: *${emAbertoFat.toLocaleString("pt-BR")}* — Saldo: *R$ ${saldoFat.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`
      ),
      section(
        `*🔄 Assinaturas*\n` +
        `• Total: *${totalAss.toLocaleString("pt-BR")}*\n` +
        `• Em aberto: *${emAbertoAss.toLocaleString("pt-BR")}* — Saldo: *R$ ${saldoAss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`
      ),
      section(
        `*💼 Deals Freshsales*\n` +
        `• Deals em aberto: *${dealsAbertos.toLocaleString("pt-BR")}*\n` +
        `• Saldo total em aberto: *R$ ${(saldoFat + saldoAss).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`
      ),
      divider(),
      actions([
        { text: "🔄 Sync Deals", value: "deals_sync" },
        { text: "📊 Relatório Financeiro", value: "relatorio_financeiro" },
      ]),
      context([`_Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
    ];
    await postSlack(channel, `💰 Resumo Financeiro: R$ ${(saldoFat + saldoAss).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em aberto`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao obter resumo financeiro: ${String(e)}`);
  }
}

async function handleDealsSync(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Iniciando sync de Deals (faturas/assinaturas) → Freshsales...`);
    const result = await invokeFunction("deals-sync", { action: "sync_batch", batch_size: 50 }) as Record<string, unknown>;
    const criados = Number(result.criados || 0);
    const atualizados = Number(result.atualizados || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("💼 Sync Deals — Freshsales"),
      section(
        `*Deals criados:* ${criados}\n` +
        `*Deals atualizados:* ${atualizados}\n` +
        `*Erros:* ${erros}\n\n` +
        `_Faturas e assinaturas sincronizadas com contatos e processos vinculados_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `💼 Deals: ${criados} criados, ${atualizados} atualizados`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao sincronizar Deals: ${String(e)}`);
  }
}

async function handleImportarPlanilhas(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Importando publicações das planilhas Advise exportadas...`);
    const result = await invokeFunction("advise-import-planilha", { action: "import_batch", batch_size: 200 }) as Record<string, unknown>;
    const inseridas = Number(result.inseridas || 0);
    const ignoradas = Number(result.ignoradas || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("📥 Importação de Planilhas Advise"),
      section(
        `*Publicações inseridas:* ${inseridas}\n` +
        `*Já existentes (ignoradas):* ${ignoradas}\n` +
        `*Erros:* ${erros}`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `📥 Planilhas: ${inseridas} publicações importadas`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao importar planilhas: ${String(e)}`);
  }
}

async function handleSyncPublicacoes(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Sincronizando publicações → Freshsales (activities)...`);
    const result = await invokeFunction("publicacoes-freshsales", { action: "sync", batch_size: 50 }) as Record<string, unknown>;
    const criados = Number(result.criados || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("📋 Sync Publicações → Freshsales"),
      section(
        `*Activities criadas:* ${criados}\n` +
        `*Erros:* ${erros}`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `📋 Publicações: ${criados} activities criadas no Freshsales`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao sincronizar publicações: ${String(e)}`);
  }
}

async function handleExtrairAudiencias(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Extraindo audiências das publicações → appointments Freshsales...`);
    const result = await invokeFunction("publicacoes-audiencias", { action: "extract_batch", batch_size: 50 }) as Record<string, unknown>;
    const extraidas = Number(result.extraidas || 0);
    const criadas_fs = Number(result.criadas_freshsales || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("📅 Extração de Audiências"),
      section(
        `*Audiências extraídas:* ${extraidas}\n` +
        `*Appointments criados no Freshsales:* ${criadas_fs}\n` +
        `*Erros:* ${erros}`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `📅 Audiências: ${extraidas} extraídas, ${criadas_fs} appointments criados`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao extrair audiências: ${String(e)}`);
  }
}

async function handleExtrairPartes(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Extraindo partes das publicações → contacts Freshsales...`);
    const result = await invokeFunction("publicacoes-partes", { action: "extrair_batch", batch_size: 50 }) as Record<string, unknown>;
    const extraidas = Number(result.extraidas || 0);
    const criados_fs = Number(result.criados_freshsales || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("👥 Extração de Partes"),
      section(
        `*Partes extraídas:* ${extraidas}\n` +
        `*Contacts criados/atualizados no Freshsales:* ${criados_fs}\n` +
        `*Erros:* ${erros}\n\n` +
        `_Polo ativo e passivo vinculados aos processos_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `👥 Partes: ${extraidas} extraídas, ${criados_fs} contacts no Freshsales`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao extrair partes: ${String(e)}`);
  }
}

async function handleCriarProcessos(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Criando processos ausentes e vinculando publicações órfãs...`);
    const result = await invokeFunction("fs-repair-orphans", { action: "criar_processos_ausentes", batch_size: 20 }) as Record<string, unknown>;
    const criados = Number(result.criados || 0);
    const vinculados = Number(result.vinculados || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("🔗 Criação de Processos Ausentes"),
      section(
        `*Processos criados no Freshsales:* ${criados}\n` +
        `*Publicações órfãs vinculadas:* ${vinculados}\n` +
        `*Erros:* ${erros}`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `🔗 Processos: ${criados} criados, ${vinculados} publicações vinculadas`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao criar processos: ${String(e)}`);
  }
}

async function handleTipoProcesso(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Atualizando tipo físico/eletrônico dos processos via Datajud...`);
    const result = await invokeFunction("datajud-worker", { action: "enrich_formato", batch_size: 50 }) as Record<string, unknown>;
    const atualizados = Number(result.atualizados || 0);
    const fisicos = Number(result.fisicos || 0);
    const eletronicos = Number(result.eletronicos || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("⚖️ Tipo de Processo — Físico/Eletrônico"),
      section(
        `*Processos atualizados:* ${atualizados}\n` +
        `• Eletrônicos: *${eletronicos}*\n` +
        `• Físicos: *${fisicos}*\n` +
        `*Erros:* ${erros}\n\n` +
        `_Campo cf_tipo_processo atualizado no Freshsales_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `⚖️ Tipo de processo: ${atualizados} atualizados (${eletronicos} eletrônicos, ${fisicos} físicos)`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao atualizar tipo de processo: ${String(e)}`);
  }
}

async function handlePrazoFim(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Atualizando campo Prazo Fim nos Accounts do Freshsales...`);
    const result = await invokeFunction("publicacoes-prazos", { action: "atualizar_prazo_fim", batch_size: 100 }) as Record<string, unknown>;
    const atualizados = Number(result.atualizados || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("📅 Atualização de Prazo Fim — Freshsales"),
      section(
        `*Accounts atualizados:* ${atualizados}\n` +
        `*Erros:* ${erros}\n\n` +
        `_Campo cf_prazo_fim atualizado com o próximo prazo em aberto_`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `📅 Prazo Fim: ${atualizados} accounts atualizados`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao atualizar Prazo Fim: ${String(e)}`);
  }
}

async function handleHigienizarContatos(channel: string, userId: string): Promise<void> {
  try {
    await postSlack(channel, `⏳ Detectando e mesclando contatos duplicados no Freshsales...`);
    const result = await invokeFunction("fs-contacts-sync", { action: "find_duplicates", batch_size: 50 }) as Record<string, unknown>;
    const duplicados = Number(result.duplicados || 0);
    const mesclados = Number(result.mesclados || 0);
    const erros = Number(result.errors || 0);
    const blocks = [
      header("🧹 Higienização de Contatos"),
      section(
        `*Duplicados detectados:* ${duplicados}\n` +
        `*Registros mesclados:* ${mesclados}\n` +
        `*Erros:* ${erros}`
      ),
      context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
    ];
    await postSlack(channel, `🧹 Contatos: ${duplicados} duplicados, ${mesclados} mesclados`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao higienizar contatos: ${String(e)}`);
  }
}

async function handleRelatorioFinanceiro(channel: string): Promise<void> {
  try {
    const hoje = new Date();
    const { data: faturas } = await dbPublic
      .from("faturas")
      .select("saldo_devedor,vencimento,cliente_nome,numero_fatura,categoria,multa_atraso,juros_mora")
      .eq("status", "Em aberto")
      .order("vencimento", { ascending: true })
      .limit(10);

    if (!faturas || faturas.length === 0) {
      await postSlack(channel, "✅ Nenhuma fatura em aberto no momento.");
      return;
    }

    const linhas = faturas.map((f: Record<string, unknown>) => {
      const venc = f.vencimento ? new Date(String(f.vencimento)) : null;
      const atrasado = venc && venc < hoje ? `⚠️ *VENCIDA* (${Math.floor((hoje.getTime() - venc.getTime()) / 86400000)}d)` : "";
      const saldo = Number(f.saldo_devedor || 0);
      const multa = Number(f.multa_atraso || 0);
      const juros = Number(f.juros_mora || 0);
      return `• *${f.numero_fatura || "s/nº"}* — ${f.cliente_nome || "s/nome"} — R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${atrasado}${multa > 0 ? ` | Multa: R$ ${multa.toFixed(2)}` : ""}${juros > 0 ? ` | Juros: R$ ${juros.toFixed(2)}` : ""}`;
    }).join("\n");

    const blocks = [
      header("📊 Relatório Financeiro — Faturas em Aberto"),
      divider(),
      section(`*Top 10 faturas em aberto (por vencimento):*\n${linhas}`),
      divider(),
      actions([{ text: "💼 Sync Deals", value: "deals_sync" }]),
      context([`_Gerado em ${hoje.toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
    ];
    await postSlack(channel, `📊 Relatório Financeiro — ${faturas.length} faturas em aberto`, blocks);
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao gerar relatório financeiro: ${String(e)}`);
  }
}

// ─── Handlers de IA Conversacional v3.0 ─────────────────────────────────────

async function handleIaPerguntar(
  channel: string,
  userId: string,
  question: string,
  supabaseUrl: string = SUPABASE_URL,
  serviceRoleKey: string = SVC_KEY,
  thread_ts?: string
) {
  try {
    // ── Resposta temporal determinística (sem LLM) ────────────────────────────
    const temporalAnswer = resolveTemporalAnswer(question);
    if (temporalAnswer) {
      await postSlack(channel, temporalAnswer);
      return;
    }

    // ── Buscar perfil do usuário para persona ─────────────────────────────────
    let personaBlock = "";
    try {
      const userRes = await fetch(
        `${supabaseUrl}/rest/v1/users?slack_id=eq.${encodeURIComponent(userId)}&limit=1`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      if (userRes.ok) {
        const users = await userRes.json();
        if (users && users.length > 0) {
          const u = users[0];
          const role = u.role || "cliente";
          const name = u.name || userId;
          if (role === "owner") {
            personaBlock = `USUÁRIO: ${name} (Dr. Adriano — dono do escritório)\nPERMISSÕES: TOTAIS — sem restrições, sem triagem, responda diretamente o que for solicitado.`;
          } else if (role === "interno") {
            personaBlock = `USUÁRIO: ${name} (equipe interna do escritório)\nPERMISSÕES: Acesso amplo a processos, prazos e dados internos. Linguagem profissional e direta.`;
          } else {
            personaBlock = `USUÁRIO: ${name} (cliente externo)\nPERMISSÕES: Acesso restrito às informações do próprio cliente. Linguagem acessível, humanizada e empática.`;
          }
        }
      }
    } catch (_) { /* silencioso */ }

    // ── Reality Context Engine ────────────────────────────────────────────────
    const { dateLabel, timeLabel } = getNowInSaoPaulo();
    const rce = `CONTEXTO DE REALIDADE (use SEMPRE):\n- Horário atual: ${timeLabel} (Brasília/São Paulo)\n- Data: ${dateLabel}\nNUNCA invente horário ou data. Use SEMPRE os valores acima.`;
    console.log("[dotobot][rce]", timeLabel, dateLabel);

    // ── Buscar contexto RAG da base de conhecimento ───────────────────────────
    let context = "";
    try {
      const ragResp = await fetch(`${supabaseUrl}/functions/v1/dotobot-rag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: question, top_k: 5 }),
      });
      if (ragResp.ok) {
        const ragData = await ragResp.json();
        if (ragData.chunks && ragData.chunks.length > 0) {
          context = ragData.chunks.map((c: any) => c.content).slice(0, 800).join("\n\n");
        }
      }
    } catch (ragErr) {
      console.log("[dotobot] RAG erro:", ragErr?.message);
    }

    const systemPrompt = [
      `Você é o Dotobot, assistente jurídico especializado em processos e legislação brasileira.`,
      `Responda SEMPRE em português (PT-BR). Seja claro, objetivo e profissional.`,
      `REGRAS ABSOLUTAS:\n- Responda APENAS ao que foi perguntado.\n- NUNCA invente dados de processos ou prazos.\n- NUNCA use palavras em inglês.`,
      rce,
      personaBlock,
      context ? `Base de conhecimento relevante:\n${context}` : "",
    ].filter(Boolean).join("\n\n");

    // ── Histórico de conversa (últimas 6 mensagens do canal) ──────────────────
    let historyMessages: ChatMessage[] = [];
    try {
      const histRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?channel=eq.${encodeURIComponent(channel)}&select=role,content,created_at&order=created_at.desc.nullslast&limit=12`,
        { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
      );
      if (histRes.ok) {
        const rows: { role: string; content: string }[] = await histRes.json();
        historyMessages = rows.reverse().slice(-6).map(r => ({
          role: r.role as 'user' | 'assistant',
          content: r.content.slice(0, 400),
        }));
        if (historyMessages.length > 0) console.log('[dotobot] histórico:', historyMessages.length, 'msgs');
      }
    } catch (_) { /* silencioso */ }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: question },
    ];

    const llm = llmFactory(supabaseUrl, serviceRoleKey);
    const answer = await llm.runLLM(messages);

    // Salvar mensagem do usuário e resposta no histórico
    try {
      await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify([
          { channel, role: 'user', content: question },
          { channel, role: 'assistant', content: answer },
        ]),
      });
    } catch (_) { /* silencioso */ }

    await postSlack(channel, answer, undefined, thread_ts);
  } catch (err) {
    console.error("[dotobot] handleIaPerguntar erro:", String(err));
    try {
      await postSlack(channel, "⚠️ Não consegui processar sua pergunta. Tente novamente.", undefined, thread_ts);
    } catch (postErr) {
      console.error("[dotobot] postSlack fallback erro:", String(postErr));
    }
  }
}
async function handleIaResumirProcesso(channel: string, userId: string, cnj: string): Promise<void> {
  if (!cnj.trim()) {
    await postSlack(channel, "❓ Use: `/dotobot resumir [CNJ do processo]`\nExemplo: `/dotobot resumir 0001234-56.2023.8.04.0001`");
    return;
  }
  await postSlack(channel, `🔍 Buscando dados do processo _${cnj}_...`);

  try {
    const cnj_digits = cnj.replace(/[^0-9]/g, "").substring(0, 20);
    const { data: processos } = await dbPublic
      .from("processos")
      .select("id, numero_cnj, tipo_processo, instancia, polo_ativo, polo_passivo, freshsales_account_id")
      .ilike("numero_cnj", `%${cnj_digits.substring(0, 15)}%`)
      .limit(1);

    const processo = processos?.[0];
    if (!processo) {
      await postSlack(channel, `⚠️ Processo _${cnj}_ não encontrado no banco de dados.`);
      return;
    }

    const [pubsResult, prazosResult] = await Promise.all([
      db.from("publicacoes")
        .select("data_publicacao, ai_resumo, ai_tipo_ato, ai_urgencia, conteudo")
        .eq("processo_id", processo.id)
        .order("data_publicacao", { ascending: false })
        .limit(5),
      db.from("prazo_calculado")
        .select("data_prazo, tipo_prazo, status")
        .eq("processo_id", processo.id)
        .order("data_prazo", { ascending: false })
        .limit(3),
    ]);

    const blocos: unknown[] = [
      header(`📋 Processo ${processo.numero_cnj}`),
      section(
        `*Tipo:* ${processo.tipo_processo || "N/D"} | *Instância:* ${processo.instancia || "N/D"}\n` +
        `*Polo Ativo:* ${processo.polo_ativo || "N/D"}\n` +
        `*Polo Passivo:* ${processo.polo_passivo || "N/D"}`
      ),
    ];

    if (pubsResult.data && pubsResult.data.length > 0) {
      const pubTexto = pubsResult.data.map(p => {
        const urgEmoji = p.ai_urgencia === "critica" ? "🔴" : p.ai_urgencia === "alta" ? "🟠" : "";
        return `• ${p.data_publicacao?.split("T")[0] || ""} ${urgEmoji} — ${p.ai_resumo || p.conteudo?.substring(0, 120) || ""}`;
      }).join("\n");
      blocos.push(divider());
      blocos.push(section(`*📢 Últimas Publicações:*\n${pubTexto}`));
    }

    if (prazosResult.data && prazosResult.data.length > 0) {
      const prazoTexto = prazosResult.data.map(p =>
        `• ${p.data_prazo} — ${p.tipo_prazo} _(${p.status})_`
      ).join("\n");
      blocos.push(divider());
      blocos.push(section(`*⏱️ Prazos:*\n${prazoTexto}`));
    }

    if (processo.freshsales_account_id) {
      blocos.push(divider());
      blocos.push(section(`*🔗 CRM:* <https://hmadv-org.myfreshworks.com/crm/sales/accounts/${processo.freshsales_account_id}|Ver no Freshsales>`));
    }

    blocos.push(context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]));
    await postSlack(channel, `📋 Resumo: ${processo.numero_cnj}`, blocos);
  } catch (e) {
    await postSlack(channel, `❌ Erro ao resumir processo: ${String(e)}`);
  }
}

async function handleIaEnriquecer(channel: string, userId: string): Promise<void> {
  await postSlack(channel, "🧠 Iniciando enriquecimento IA das publicações pendentes...");
  try {
    const result = await invokeFunction("advise-ai-enricher", { batch_size: 20 }) as Record<string, unknown>;
    if (result?.status === "queue_empty") {
      await postSlack(channel, "✅ Todas as publicações com conteúdo já foram enriquecidas com IA!");
    } else {
      const blocks = [
        header("🧠 Enriquecimento IA — Resultado"),
        section(
          `• Enriquecidas: *${result?.enriquecidas ?? 0}*\n` +
          `• Erros: ${result?.erros ?? 0}\n` +
          `• Tokens usados: ${result?.tokens_total ?? 0}\n` +
          `• Tempo: ${result?.elapsed_ms ?? 0}ms`
        ),
        context([`_Acionado por <@${userId}>_`]),
      ];
      await postSlack(channel, `🧠 Enriquecimento IA: ${result?.enriquecidas ?? 0} publicações processadas`, blocks);
    }
  } catch (e) {
    await postSlack(channel, `❌ Erro: ${String(e)}`);
  }
}

async function handleIaStatus(channel: string): Promise<void> {
  try {
    const [total, enriquecidas, criticas, altas] = await Promise.all([
      db.from("publicacoes").select("id", { count: "exact", head: true }).not("conteudo", "is", null).neq("conteudo", ""),
      db.from("publicacoes").select("id", { count: "exact", head: true }).not("ai_enriquecido_at", "is", null),
      db.from("publicacoes").select("id", { count: "exact", head: true }).eq("ai_urgencia", "critica"),
      db.from("publicacoes").select("id", { count: "exact", head: true }).eq("ai_urgencia", "alta"),
    ]);

    const tot = total.count ?? 0;
    const enr = enriquecidas.count ?? 0;
    const pend = tot - enr;
    const pct = tot > 0 ? Math.round((enr / tot) * 100) : 0;
    const barra = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));

    const blocks = [
      header("🧠 Status do Enriquecimento IA"),
      section(
        `\`${barra}\` *${pct}%*\n` +
        `• Total com conteúdo: *${tot.toLocaleString("pt-BR")}*\n` +
        `• Enriquecidas: *${enr.toLocaleString("pt-BR")}*\n` +
        `• Pendentes: *${pend.toLocaleString("pt-BR")}*\n` +
        `• 🔴 Urgência Crítica: ${criticas.count ?? 0}\n` +
        `• 🟠 Urgência Alta: ${altas.count ?? 0}`
      ),
      context([`_Cron: a cada 10 min | Modelo: gpt-4.1-mini | Batch: 20 publicações_`]),
    ];
    await postSlack(channel, `🧠 Status IA: ${pct}% enriquecido`, blocks);
  } catch (e) {
    await postSlack(channel, `❌ Erro: ${String(e)}`);
  }
}

async function handleHelp(channel: string): Promise<void> {
  const blocks = [
    header("🤖 DotoBot v2.0 — Comandos Disponíveis"),
    divider(),
    section(
      `*📊 Painel e Status*\n` +
      `• \`/dotobot status\` — Painel completo do pipeline em tempo real\n` +
      `• \`/dotobot pendencias\` — Relatório de pendências de desenvolvimento`
    ),
    divider(),
    section(
      `*🔍 Consultas*\n` +
      `• \`/dotobot publicacoes\` — Últimas 5 publicações recebidas do Advise\n` +
      `• \`/dotobot andamentos\` — Últimos 5 andamentos do DataJud\n` +
      `• \`/dotobot audiencias\` — Próximas audiências agendadas\n` +
      `• \`/dotobot prazos\` — Prazos processuais pendentes\n` +
      `• \`/dotobot deals-status\` — Resumo financeiro (faturas em aberto)\n` +
      `• \`/dotobot relatorio-financeiro\` — Top 10 faturas vencidas com multa e juros`
    ),
    divider(),
    section(
      `*🔄 Sincronização e Enriquecimento*\n` +
      `• \`/dotobot drain-advise\` — Drenar publicações do Advise agora\n` +
      `• \`/dotobot importar-planilhas\` — Importar publicações das planilhas exportadas\n` +
      `• \`/dotobot sync-publicacoes\` — Sync publicações → Freshsales (activities)\n` +
      `• \`/dotobot extrair-audiencias\` — Extrair audiências → appointments Freshsales\n` +
      `• \`/dotobot extrair-partes\` — Extrair partes → contacts Freshsales\n` +
      `• \`/dotobot criar-processos\` — Criar processos ausentes + vincular órfãos\n` +
      `• \`/dotobot processo-sync\` — Sync processos → Freshsales (lote 20)\n` +
      `• \`/dotobot deals-sync\` — Sync faturas/assinaturas → Freshsales Deals\n` +
      `• \`/dotobot tipo-processo\` — Atualizar tipo físico/eletrônico via Datajud\n` +
      `• \`/dotobot prazo-fim\` — Atualizar campo Prazo Fim nos Accounts`
    ),
    divider(),
    section(
      `*⏱️ Cálculo de Prazos*\n` +
      `• \`/dotobot calcular-prazos\` — Calcular prazos (memória extensiva PrazoFácil)\n` +
      `• \`/dotobot tpu-enrich\` — Enriquecer processos via TPU/CNJ local`
    ),
    divider(),
    section(
      `*🧠 Inteligência Artificial (v3.0)*\n` +
      `• \`/dotobot perguntar [consulta]\` — Consulta conversacional com IA sobre o escritório\n` +
      `• \`/dotobot resumir [CNJ]\` — Resumo completo do processo com publicações e prazos\n` +
      `• \`/dotobot enriquecer-ia\` — Enriquecer publicações pendentes com análise IA\n` +
      `• \`/dotobot ia-status\` — Status do enriquecimento IA das publicações`
    ),
    divider(),
    section(
      `*🧹 Higienização*\n` +
      `• \`/dotobot fix-activities\` — Corrigir 50 activities pendentes\n` +
      `• \`/dotobot repair-orphans\` — Corrigir campos órfãos (instância, partes, status)\n` +
      `• \`/dotobot repair-instancia\` — Corrigir apenas campo instância\n` +
      `• \`/dotobot repair-partes\` — Corrigir apenas polo ativo/passivo\n` +
      `• \`/dotobot repair-fs\` — Sincronizar campos corrigidos com Freshsales\n` +
      `• \`/dotobot reset-datajud\` — Resetar processos presos em "processando"\n` +
      `• \`/dotobot higienizar-contatos\` — Detectar e mesclar contatos duplicados\n` +
      `• \`/dotobot datajud\` — Processar fila DataJud agora\n` +
      `• \`/dotobot backfill\` — Rodar próxima semana do backfill Advise\n` +
      `• \`/dotobot backfill-status\` — Ver estado do backfill`
    ),
    divider(),
    context([
      `_Pipeline HMADV v2.0 — Hermida Maia Advocacia_`,
      `_Supabase: sspvizogbcyigquqycsz | Freshsales: hmadv-org_`,
    ]),
  ];

  await postSlack(channel, "🤖 DotoBot v2.0 — Ajuda", blocks);
}

async function dispatchSlackTextCommand(channelId: string, userId: string, text: string, thread_ts?: string): Promise<void> {
  const normalizedText = (text || "status").trim();
  const lowered = normalizedText.toLowerCase();
  const [cmd] = lowered.split(" ");

  if (cmd === "test_data" || cmd === "test-data" || cmd === "diagnostico") await handleTestData(channelId);
  else if (cmd === "status") await handleStatus(channelId, userId);
  else if (cmd === "publicacoes") await handlePublicacoes(channelId);
  else if (cmd === "andamentos") await handleAndamentos(channelId);
  else if (cmd === "audiencias") await handleAudiencias(channelId);
  else if (cmd === "pendencias") await handlePendencias(channelId);
  else if (cmd === "fix-activities" || cmd === "fix_activities") await handleFixActivities(channelId, userId);
  else if (cmd === "drain-advise" || cmd === "drain_advise") await handleDrainAdvise(channelId, userId);
  else if (cmd === "datajud") await handleDatajud(channelId, userId);
  else if (cmd === "backfill" || cmd === "run-backfill" || cmd === "run_backfill") await handleRunBackfill(channelId, userId);
  else if (cmd === "backfill-status" || cmd === "backfill_status") await handleBackfillStatus(channelId);
  else if (cmd === "repair-orphans" || cmd === "repair_orphans") await handleRepairOrphans(channelId, userId, "fix_all");
  else if (cmd === "repair-instancia" || cmd === "repair_instancia") await handleRepairOrphans(channelId, userId, "fix_instancia");
  else if (cmd === "repair-partes" || cmd === "repair_partes") await handleRepairOrphans(channelId, userId, "fix_partes");
  else if (cmd === "repair-fs" || cmd === "repair_fs") await handleRepairOrphans(channelId, userId, "fix_fs_sync");
  else if (cmd === "reset-datajud" || cmd === "reset_datajud") await handleResetDatajud(channelId, userId);
  else if (cmd === "processo-sync" || cmd === "processo_sync") await handleProcessoSync(channelId, userId);
  else if (cmd === "prazos") await handlePrazos(channelId);
  else if (cmd === "calcular-prazos" || cmd === "calcular_prazos") await handleCalcularPrazos(channelId, userId);
  else if (cmd === "tpu-enrich" || cmd === "tpu_enrich") await handleTpuEnricher(channelId, userId);
  else if (cmd === "deals-status" || cmd === "deals_status") await handleDealsStatus(channelId);
  else if (cmd === "deals-sync" || cmd === "deals_sync") await handleDealsSync(channelId, userId);
  else if (cmd === "importar-planilhas" || cmd === "importar_planilhas") await handleImportarPlanilhas(channelId, userId);
  else if (cmd === "sync-publicacoes" || cmd === "sync_publicacoes") await handleSyncPublicacoes(channelId, userId);
  else if (cmd === "extrair-audiencias" || cmd === "extrair_audiencias") await handleExtrairAudiencias(channelId, userId);
  else if (cmd === "extrair-partes" || cmd === "extrair_partes") await handleExtrairPartes(channelId, userId);
  else if (cmd === "criar-processos" || cmd === "criar_processos") await handleCriarProcessos(channelId, userId);
  else if (cmd === "tipo-processo" || cmd === "tipo_processo") await handleTipoProcesso(channelId, userId);
  else if (cmd === "prazo-fim" || cmd === "prazo_fim") await handlePrazoFim(channelId, userId);
  else if (cmd === "higienizar-contatos" || cmd === "higienizar_contatos") await handleHigienizarContatos(channelId, userId);
  else if (cmd === "relatorio-financeiro" || cmd === "relatorio_financeiro") await handleRelatorioFinanceiro(channelId);
  else if (cmd.startsWith("perguntar")) await handleIaPerguntar(channelId, userId, normalizedText.replace(/^perguntar\s*/i, ""), SUPABASE_URL, SVC_KEY, thread_ts);
  else if (cmd.startsWith("resumir")) await handleIaResumirProcesso(channelId, userId, normalizedText.replace(/^resumir\s*/i, ""));
  else if (cmd === "enriquecer-ia" || cmd === "enriquecer_ia") await handleIaEnriquecer(channelId, userId);
  else if (cmd === "ia-status" || cmd === "ia_status") await handleIaStatus(channelId);
  else await handleIaPerguntar(channelId, userId, normalizedText, SUPABASE_URL, SVC_KEY, thread_ts);
}

// ── Notificações Automáticas (chamadas por outras edge functions) ──────────────

async function handleNotifyPublicacao(body: Record<string, unknown>): Promise<Response> {
  const { numero_processo, data_publicacao, conteudo, account_id, activity_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const conteudoTrunc = String(conteudo || "").substring(0, 300).replace(/\n/g, " ");
  const temNome = String(conteudo || "").toLowerCase().includes("adriano menezes hermida maia");

  const blocks = [
    header("📰 Nova Publicação Recebida"),
    section(
      `*Processo:* \`${numero_processo || "s/nº"}\`\n` +
      `*Data:* ${fmtDate(String(data_publicacao || ""))}\n` +
      `*Menção ao Dr. Adriano:* ${temNome ? "✅ Sim" : "❌ Não"}\n\n` +
      `${conteudoTrunc}...`
    ),
    section(`*Freshsales:* ${fsLink} | Activity: ${activity_id ? `✅ \`${activity_id}\`` : "⚠️ Não criada"}`),
    context([`_Recebido via Advise em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `📰 Nova publicação: ${numero_processo || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyAndamento(body: Record<string, unknown>): Promise<Response> {
  const { numero_cnj, data_movimento, descricao, account_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const blocks = [
    header("⚖️ Novo Andamento — DataJud"),
    section(
      `*Processo:* \`${numero_cnj || "s/nº"}\`\n` +
      `*Data:* ${fmtDate(String(data_movimento || ""))}\n` +
      `*Descrição:* ${String(descricao || "").substring(0, 300)}`
    ),
    section(`*Freshsales:* ${fsLink}`),
    context([`_Recebido via DataJud em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `⚖️ Novo andamento: ${numero_cnj || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyAudiencia(body: Record<string, unknown>): Promise<Response> {
  const { numero_cnj, data_audiencia, tipo, descricao, local, account_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const blocks = [
    header("📅 Nova Audiência Agendada"),
    section(
      `*Processo:* \`${numero_cnj || "s/nº"}\`\n` +
      `*Data:* *${fmtDate(String(data_audiencia || ""))}*\n` +
      `*Tipo:* ${String(tipo || "Audiência").toUpperCase()}\n` +
      `*Local:* ${local || "Não informado"}\n` +
      `*Descrição:* ${String(descricao || "").substring(0, 200)}`
    ),
    section(`*Freshsales:* ${fsLink}`),
    context([`_Extraída de publicação em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `📅 Audiência em ${fmtDate(String(data_audiencia || ""))}: ${numero_cnj || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyCronStatus(body: Record<string, unknown>): Promise<Response> {
  const { job, status, inseridas, erros, duracao_ms, detalhes } = body;

  const emoji = status === "ok" ? "✅" : status === "aviso" ? "⚠️" : "❌";
  const jobName = String(job || "cron");

  const blocks = [
    section(
      `${emoji} *Cron: ${jobName}*\n` +
      (inseridas !== undefined ? `• Inseridas/Processadas: *${inseridas}*\n` : "") +
      (erros !== undefined ? `• Erros: *${erros}*\n` : "") +
      (duracao_ms !== undefined ? `• Duração: ${duracao_ms}ms\n` : "") +
      (detalhes ? `• Detalhes: ${String(detalhes).substring(0, 200)}` : "")
    ),
    context([`_${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(SLACK_CHANNEL, `${emoji} Cron ${jobName}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

// ── Roteador Principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const contentType = req.headers.get("content-type") || "";
  const rawBody = await req.text();
  const isSlackRequest =
    Boolean(req.headers.get("x-slack-signature")) ||
    rawBody.includes("\"type\":\"url_verification\"") ||
    rawBody.includes("\"type\":\"event_callback\"") ||
    rawBody.startsWith("payload=") ||
    rawBody.includes("command=%2Fdotobot") ||
    rawBody.includes("command=/dotobot");

  if (isSlackRequest) {
    const signatureOk = await verifySlackSignature(req, rawBody);
    if (!signatureOk) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Notificações automáticas via POST JSON (chamadas por outras edge functions)
  if (contentType.includes("application/json")) {
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    const action = String(body.action || "");

    if (body.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.type === "event_callback") {
      const event = body.event as Record<string, unknown> | undefined;
      if (event?.type === "app_home_opened" && typeof event.user === "string") {
        await publishHomeView(event.user, "inicio");
      }
      const eventType = String(event?.type || "");
      const eventSubtype = String(event?.subtype || "");
      const eventChannelType = String(event?.channel_type || "");
      const eventUser = typeof event?.user === "string" ? event.user : null;
      const eventChannel = typeof event?.channel === "string" ? event.channel : null;
      const rawEventText = typeof event?.text === "string" ? event.text : "";
      const eventText = normalizeSlackConversationText(rawEventText);
      const isDirectMessage = eventType === "message" && (eventChannelType === "im" || eventChannelType === "mpim");
      const isMention = eventType === "app_mention";
      const isHumanMessage = !eventSubtype && !event?.bot_id;
      console.log("[dotobot] event:", { eventType, eventChannelType, eventChannel, eventUser, isDirectMessage, isMention, isHumanMessage, textLen: eventText.length });

      // Capturar thread_ts da mensagem original (igual à Cida) para responder na mesma conversa
      const eventTs = typeof event?.ts === "string" ? event.ts : undefined;
      const eventThreadTs = typeof event?.thread_ts === "string" ? event.thread_ts : eventTs;

      if ((isDirectMessage || isMention) && isHumanMessage && eventUser && eventChannel && eventText) {
        EdgeRuntime.waitUntil((async () => {
          try {
            await dispatchSlackTextCommand(eventChannel, eventUser, eventText, eventThreadTs);
          } catch (error) {
            await postSlack(eventChannel, `❌ Erro ao processar mensagem: ${String(error)}`, undefined, eventThreadTs);
          }
        })());
      }
      return new Response("OK");
    }

    if (action === "notify_publicacao") return handleNotifyPublicacao(body);
    if (action === "notify_andamento") return handleNotifyAndamento(body);
    if (action === "notify_audiencia") return handleNotifyAudiencia(body);
    if (action === "notify_cron_status") return handleNotifyCronStatus(body);
    if (action === "diagnose_chat") {
      const text = String(body.text || "").trim();
      const temporalAnswer = resolveTemporalAnswer(text);
      if (temporalAnswer) {
        return new Response(JSON.stringify({ ok: true, mode: "temporal", text: temporalAnswer }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const deterministicRoute = await tryDeterministicQuestionRoute(text).catch((error) => ({
        route: "error",
        answer: String(error),
        data: null,
      }));
      return new Response(JSON.stringify({ ok: true, mode: deterministicRoute ? "deterministic" : "llm", result: deterministicRoute }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Comandos diretos via JSON (para testes)
    if (action === "status") {
      await handleStatus(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "pendencias") {
      await handlePendencias(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "publicacoes") {
      await handlePublicacoes(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "andamentos") {
      await handleAndamentos(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "audiencias") {
      await handleAudiencias(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "fix_activities") {
      await handleFixActivities(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "drain_advise") {
      await handleDrainAdvise(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "run_backfill" || action === "backfill") {
      await handleRunBackfill(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "backfill_status") {
      await handleBackfillStatus(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "repair_orphans" || action === "repair_all") {
      await handleRepairOrphans(body.channel as string || SLACK_CHANNEL, "system", "fix_all");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "repair_instancia") {
      await handleRepairOrphans(body.channel as string || SLACK_CHANNEL, "system", "fix_instancia");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "repair_partes") {
      await handleRepairOrphans(body.channel as string || SLACK_CHANNEL, "system", "fix_partes");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "repair_fs_sync") {
      await handleRepairOrphans(body.channel as string || SLACK_CHANNEL, "system", "fix_fs_sync");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "reset_datajud") {
      await handleResetDatajud(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "processo_sync") {
      await handleProcessoSync(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "help") {
      await handleHelp(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "prazos") {
      await handlePrazos(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "calcular_prazos") {
      await handleCalcularPrazos(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "tpu_enrich") {
      await handleTpuEnricher(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    // Novos comandos v2.0
    if (action === "deals_status") {
      await handleDealsStatus(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "deals_sync") {
      await handleDealsSync(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "importar_planilhas") {
      await handleImportarPlanilhas(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "sync_publicacoes") {
      await handleSyncPublicacoes(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "extrair_audiencias") {
      await handleExtrairAudiencias(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "extrair_partes") {
      await handleExtrairPartes(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "criar_processos") {
      await handleCriarProcessos(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "tipo_processo") {
      await handleTipoProcesso(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "prazo_fim") {
      await handlePrazoFim(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "higienizar_contatos") {
      await handleHigienizarContatos(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "relatorio_financeiro") {
      await handleRelatorioFinanceiro(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida", action }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Comandos Slash do Slack (application/x-www-form-urlencoded)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);

    if (params.has("payload")) {
      const payloadRaw = params.get("payload") || "{}";
      const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
      const payloadType = String(payload.type || "");

      if (payloadType === "block_actions") {
        const userId = String((payload.user as Record<string, unknown> | undefined)?.id || "");
        const actionList = Array.isArray(payload.actions) ? payload.actions as Array<Record<string, unknown>> : [];
        const firstAction = actionList[0];
        const actionId = String(firstAction?.action_id || "");
        const value = String(firstAction?.value || "");

        if (actionId === "home_nav" && userId) {
          await publishHomeView(userId, (value || "inicio") as HomeTab);
        }

        if (actionId === "home_quick_action" && userId) {
          await handleHomeQuickAction(userId, value);
          const nextTab: HomeTab = value === "new_conversation" || value === "help_dm" ? "mensagens" : "inicio";
          await publishHomeView(userId, nextTab);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const command = params.get("command") || "";
    const text = (params.get("text") || "").trim().toLowerCase();
    const channelId = params.get("channel_id") || SLACK_CHANNEL;
    const userId = params.get("user_id") || "unknown";
    const responseUrl = params.get("response_url") || "";

    // Resposta imediata ao Slack (obrigatório em <3s)
    const ack = new Response(
      JSON.stringify({ response_type: "ephemeral", text: `⏳ Processando \`${text || "status"}\`...` }),
      { headers: { "Content-Type": "application/json" } }
    );

    // Processar em background
    const [cmd] = (text || "status").split(" ");
    EdgeRuntime.waitUntil((async () => {
      try {
        if (cmd === "status") await handleStatus(channelId, userId);
        else if (cmd === "publicacoes") await handlePublicacoes(channelId);
        else if (cmd === "andamentos") await handleAndamentos(channelId);
        else if (cmd === "audiencias") await handleAudiencias(channelId);
        else if (cmd === "pendencias") await handlePendencias(channelId);
        else if (cmd === "fix-activities" || cmd === "fix_activities") await handleFixActivities(channelId, userId);
        else if (cmd === "drain-advise" || cmd === "drain_advise") await handleDrainAdvise(channelId, userId);
        else if (cmd === "datajud") await handleDatajud(channelId, userId);
        else if (cmd === "backfill" || cmd === "run-backfill" || cmd === "run_backfill") await handleRunBackfill(channelId, userId);
        else if (cmd === "backfill-status" || cmd === "backfill_status") await handleBackfillStatus(channelId);
        else if (cmd === "repair-orphans" || cmd === "repair_orphans") await handleRepairOrphans(channelId, userId, "fix_all");
        else if (cmd === "repair-instancia" || cmd === "repair_instancia") await handleRepairOrphans(channelId, userId, "fix_instancia");
        else if (cmd === "repair-partes" || cmd === "repair_partes") await handleRepairOrphans(channelId, userId, "fix_partes");
        else if (cmd === "repair-fs" || cmd === "repair_fs") await handleRepairOrphans(channelId, userId, "fix_fs_sync");
        else if (cmd === "reset-datajud" || cmd === "reset_datajud") await handleResetDatajud(channelId, userId);
        else if (cmd === "processo-sync" || cmd === "processo_sync") await handleProcessoSync(channelId, userId);
        else if (cmd === "prazos") await handlePrazos(channelId);
        else if (cmd === "calcular-prazos" || cmd === "calcular_prazos") await handleCalcularPrazos(channelId, userId);
        else if (cmd === "tpu-enrich" || cmd === "tpu_enrich") await handleTpuEnricher(channelId, userId);
        // Novos comandos v2.0
        else if (cmd === "deals-status" || cmd === "deals_status") await handleDealsStatus(channelId);
        else if (cmd === "deals-sync" || cmd === "deals_sync") await handleDealsSync(channelId, userId);
        else if (cmd === "importar-planilhas" || cmd === "importar_planilhas") await handleImportarPlanilhas(channelId, userId);
        else if (cmd === "sync-publicacoes" || cmd === "sync_publicacoes") await handleSyncPublicacoes(channelId, userId);
        else if (cmd === "extrair-audiencias" || cmd === "extrair_audiencias") await handleExtrairAudiencias(channelId, userId);
        else if (cmd === "extrair-partes" || cmd === "extrair_partes") await handleExtrairPartes(channelId, userId);
        else if (cmd === "criar-processos" || cmd === "criar_processos") await handleCriarProcessos(channelId, userId);
        else if (cmd === "tipo-processo" || cmd === "tipo_processo") await handleTipoProcesso(channelId, userId);
        else if (cmd === "prazo-fim" || cmd === "prazo_fim") await handlePrazoFim(channelId, userId);
        else if (cmd === "higienizar-contatos" || cmd === "higienizar_contatos") await handleHigienizarContatos(channelId, userId);
        else if (cmd === "relatorio-financeiro" || cmd === "relatorio_financeiro") await handleRelatorioFinanceiro(channelId);
        // Comandos de IA v3.0
        else if (cmd.startsWith("perguntar")) await handleIaPerguntar(channelId, userId, text.replace(/^perguntar\s*/i, ""));
        else if (cmd.startsWith("resumir")) await handleIaResumirProcesso(channelId, userId, text.replace(/^resumir\s*/i, ""));
        else if (cmd === "enriquecer-ia" || cmd === "enriquecer_ia") await handleIaEnriquecer(channelId, userId);
        else if (cmd === "ia-status" || cmd === "ia_status") await handleIaStatus(channelId);
        else await handleHelp(channelId);
      } catch (e) {
        await postSlack(channelId, `❌ Erro ao processar comando \`${cmd}\`: ${String(e)}`);
      }
    })());

    return ack;
  }

  return new Response(JSON.stringify({ ok: true, message: "DotoBot Slack — Pipeline HMADV" }), {
    headers: { "Content-Type": "application/json" },
  });
});
