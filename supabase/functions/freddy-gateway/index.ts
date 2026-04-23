/**
 * freddy-gateway — Gateway de Contexto 360 e Memória RAG do Freddy AI
 *
 * Extração de freddy-memory-gateway.js para edge function Supabase.
 *
 * Rotas:
 *   POST /contact360       — Perfil completo do contato (Freshsales + processos + deals + RAG)
 *   POST /search-memory    — Busca semântica na memória RAG do Dotobot
 *   POST /save-memory      — Persiste memória com embedding
 *   POST /save-outcome     — Registra resultado de interação no agentlab_incidents
 *   GET  /health           — Health check
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

// ─── Helpers de ambiente ───────────────────────────────────────────────────

function getClean(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function getEnv(key: string): string | null {
  return getClean(Deno.env.get(key));
}

function getFreshsalesApiKey(): string {
  return (
    getEnv("FRESHSALES_API_KEY") ||
    getEnv("FS_API_KEY") ||
    ""
  );
}

function getFreshsalesDomain(): string {
  return (
    getEnv("FRESHSALES_DOMAIN") ||
    getEnv("FS_DOMAIN") ||
    "hmadv-org.myfreshworks.com"
  );
}

function getSupabaseUrl(): string {
  return (
    getEnv("SUPABASE_URL") ||
    getEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    ""
  );
}

function getSupabaseKey(): string {
  return (
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_ANON_KEY") ||
    ""
  );
}

function getAiCoreUrl(): string {
  return getEnv("AI_CORE_URL") || "https://ai.aetherlab.com.br";
}

function getAiCoreSecret(): string {
  return getEnv("HMADV_GATEWAY_SECRET") || getEnv("AI_CORE_SECRET") || "";
}

function getGatewaySecret(): string | null {
  return (
    getEnv("FREDDY_ACTION_SHARED_SECRET") ||
    getEnv("HMDAV_AI_SHARED_SECRET") ||
    getEnv("HMADV_AI_SHARED_SECRET") ||
    getEnv("LAWDESK_AI_SHARED_SECRET")
  );
}

// ─── Autorização ──────────────────────────────────────────────────────────

function authorizeRequest(req: Request): { ok: boolean; status?: number; error?: string } {
  const expected = getGatewaySecret();
  if (!expected) {
    return { ok: false, status: 500, error: "FREDDY_ACTION_SHARED_SECRET ausente no ambiente." };
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided =
    getClean(req.headers.get("x-freddy-secret")) ||
    getClean(req.headers.get("x-hmadv-secret")) ||
    getClean(req.headers.get("x-shared-secret")) ||
    getClean(bearerMatch?.[1]) ||
    null;

  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Nao autorizado para usar o Freddy Gateway." };
  }

  return { ok: true };
}

// ─── Respostas JSON ───────────────────────────────────────────────────────

function jsonOk(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: JSON_HEADERS,
  });
}

function jsonError(message: string, status = 500, code?: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...(code ? { code } : {}) }),
    { status, headers: JSON_HEADERS }
  );
}

// ─── Freshsales helpers ───────────────────────────────────────────────────

async function freshsalesGet(path: string): Promise<unknown> {
  const domain = getFreshsalesDomain();
  const apiKey = getFreshsalesApiKey();
  const url = `https://${domain}/crm/sales/api${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Freshsales ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function lookupContactByEmail(email: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await freshsalesGet(
      `/contacts/filter?include=owner,sales_accounts,deals&q=${encodeURIComponent(email)}`
    ) as Record<string, unknown>;
    const contacts = (data?.contacts ?? data?.data ?? []) as Array<Record<string, unknown>>;
    return contacts[0] || null;
  } catch {
    return null;
  }
}

async function viewContact(contactId: string | number): Promise<Record<string, unknown> | null> {
  try {
    const data = await freshsalesGet(
      `/contacts/${contactId}?include=owner,sales_accounts,deals,tasks,notes`
    ) as Record<string, unknown>;
    return (data?.contact ?? data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function viewSalesAccount(accountId: string | number): Promise<Record<string, unknown> | null> {
  try {
    const data = await freshsalesGet(`/sales_accounts/${accountId}`) as Record<string, unknown>;
    return (data?.sales_account ?? data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function viewDeal(dealId: string | number): Promise<Record<string, unknown> | null> {
  try {
    const data = await freshsalesGet(`/deals/${dealId}`) as Record<string, unknown>;
    return (data?.deal ?? data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────

async function supabaseQuery(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${getSupabaseUrl()}/rest/v1/${path}`;
  const key = getSupabaseKey();
  const resp = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Supabase ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function supabaseInsert(table: string, payload: Record<string, unknown>): Promise<unknown> {
  return supabaseQuery(table, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });
}

// ─── RAG via ai-core ──────────────────────────────────────────────────────

async function searchRag(query: string, topK = 6): Promise<Record<string, unknown>> {
  try {
    const aiUrl = getAiCoreUrl();
    const secret = getAiCoreSecret();
    const resp = await fetch(`${aiUrl}/rag/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-hmadv-secret": secret } : {}),
      },
      body: JSON.stringify({ query, top_k: topK }),
    });
    if (!resp.ok) return { enabled: false, matches: [], error: `ai-core ${resp.status}` };
    return resp.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    return { enabled: false, matches: [], error: String(err) };
  }
}

async function saveRagMemory(
  sessionId: string,
  query: string,
  responseText: string,
  context: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  try {
    const aiUrl = getAiCoreUrl();
    const secret = getAiCoreSecret();
    const resp = await fetch(`${aiUrl}/rag/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-hmadv-secret": secret } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, query, response_text: responseText, context }),
    });
    if (!resp.ok) return { stored: false, error: `ai-core ${resp.status}` };
    return resp.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    return { stored: false, error: String(err) };
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleContact360(req: Request): Promise<Response> {
  const auth = authorizeRequest(req);
  if (!auth.ok) return jsonError(auth.error!, auth.status!);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(body.email || body.contact_email || "").trim().toLowerCase();
  const query = String(body.query || body.user_query || body.message || "").trim();
  const topK = Number(body.top_k || body.topK || 6);

  // Resolver contato no Freshsales
  let contact: Record<string, unknown> | null = null;
  if (email) {
    contact = await lookupContactByEmail(email);
    if (contact?.id) {
      const detail = await viewContact(contact.id as string);
      if (detail) contact = detail;
    }
  } else if (body.contact_id) {
    contact = await viewContact(body.contact_id as string);
  }

  // Resolver account e deals
  const accountId = (contact?.sales_account_id || (contact?.sales_accounts as Array<Record<string, unknown>>)?.[0]?.id) as string | null;
  const dealIds = ((contact?.deals as Array<Record<string, unknown>>) || []).map((d) => d.id).slice(0, 3) as string[];

  const [salesAccount, deals, ragContext] = await Promise.all([
    accountId ? viewSalesAccount(accountId) : Promise.resolve(null),
    Promise.all(dealIds.map((id) => viewDeal(id))).then((rows) => rows.filter(Boolean)),
    query ? searchRag(query, topK) : Promise.resolve({ enabled: false, matches: [] }),
  ]);

  // Processos judiciais via Supabase
  let processos: unknown[] = [];
  let publicacoes: unknown[] = [];
  if (email) {
    try {
      const [pRows, pubRows] = await Promise.all([
        supabaseQuery(
          `processos?select=id,numero_cnj,tribunal,status,ultima_atualizacao&email_cliente=eq.${encodeURIComponent(email)}&order=ultima_atualizacao.desc.nullslast&limit=10`
        ),
        supabaseQuery(
          `publicacoes?select=id,numero_cnj,data_publicacao,conteudo_resumo,tipo&email_cliente=eq.${encodeURIComponent(email)}&order=data_publicacao.desc.nullslast&limit=10`
        ),
      ]);
      processos = Array.isArray(pRows) ? pRows : [];
      publicacoes = Array.isArray(pubRows) ? pubRows : [];
    } catch {
      // Ignorar erros de consulta judicial
    }
  }

  return jsonOk({
    data: {
      contact,
      sales_account: salesAccount,
      deals,
      judicial: {
        processos,
        publicacoes,
      },
      rag: ragContext,
      memory_matches: (Array.isArray((ragContext as Record<string, unknown>)?.matches)
        ? ((ragContext as Record<string, unknown>).matches as unknown[]).slice(0, 5)
        : []),
      identifiers: {
        email,
        contact_id: contact?.id || null,
        account_id: accountId || null,
        deal_ids: dealIds,
      },
    },
  });
}

async function handleSearchMemory(req: Request): Promise<Response> {
  const auth = authorizeRequest(req);
  if (!auth.ok) return jsonError(auth.error!, auth.status!);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const query = String(body.query || body.user_query || body.message || "").trim();
  if (!query) return jsonError("Informe query para buscar memoria.", 400);

  const topK = Number(body.top_k || body.topK || 8);
  const ragContext = await searchRag(query, topK);

  return jsonOk({
    data: {
      query,
      rag: ragContext,
      matches: (ragContext as Record<string, unknown>).matches || [],
      summary: (Array.isArray((ragContext as Record<string, unknown>).matches)
        ? ((ragContext as Record<string, unknown>).matches as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map((m) => m.text)
            .join(" | ")
        : ""),
    },
  });
}

async function handleSaveMemory(req: Request): Promise<Response> {
  const auth = authorizeRequest(req);
  if (!auth.ok) return jsonError(auth.error!, auth.status!);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const query = String(body.query || body.user_query || body.message || "").trim();
  const responseText = String(body.response_text || body.response || body.answer || "").trim();
  if (!query || !responseText) {
    return jsonError("Informe query e response_text para salvar memoria.", 400);
  }

  const sessionId =
    String(body.session_id || body.sessionId || body.contact_id || body.email || "freddy").trim() ||
    "freddy";

  const memory = await saveRagMemory(sessionId, query, responseText, {
    route: "/freddy",
    profile: { role: String(body.agent_ref || body.agentRef || "freddy-ai") },
    crm: {
      contact_id: body.contact_id || null,
      account_id: body.account_id || null,
      deal_id: body.deal_id || null,
      email: body.email || null,
    },
  });

  return jsonOk({ data: { stored: Boolean((memory as Record<string, unknown>)?.stored), memory } });
}

async function handleSaveOutcome(req: Request): Promise<Response> {
  const auth = authorizeRequest(req);
  if (!auth.ok) return jsonError(auth.error!, auth.status!);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const outcome = {
    id: crypto.randomUUID(),
    source_system: "freddy",
    category: String(body.category || "conversation_outcome"),
    severity: String(body.severity || "baixa"),
    status: String(body.status || "open"),
    title: String(body.title || "Outcome de conversa Freddy"),
    description: String(body.description || body.summary || "Resultado operacional registrado pelo Freddy."),
    agent_ref: String(body.agent_ref || body.agentRef || "freddy-ai"),
    conversation_id: body.conversation_id || body.conversationId || null,
    metadata: {
      email: body.email || null,
      contact_id: body.contact_id || null,
      account_id: body.account_id || null,
      deal_id: body.deal_id || null,
      workflow: body.workflow || null,
      intent: body.intent || null,
      raw: body,
    },
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let incident: unknown = null;
  try {
    const rows = await supabaseInsert("agentlab_incidents", outcome);
    incident = Array.isArray(rows) ? rows[0] : rows;
  } catch (err) {
    // Registrar mesmo que o insert falhe
    console.error("Falha ao inserir incident:", err);
  }

  // Salvar memória se houver query + response
  const query = String(body.query || body.user_query || body.message || "").trim();
  const responseText = String(body.response_text || body.response || body.answer || "").trim();
  if (query && responseText) {
    const sessionId = String(body.session_id || body.contact_id || body.email || "freddy").trim();
    await saveRagMemory(sessionId, query, responseText, { route: "/freddy/outcome" }).catch(() => null);
  }

  return jsonOk({ data: { incident } });
}

// ─── Roteador principal ───────────────────────────────────────────────────

serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/freddy-gateway/, "");
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-freddy-secret, x-hmadv-secret, x-shared-secret",
      },
    });
  }

  // Health check
  if (path === "/health" || path === "" || path === "/") {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "freddy-gateway",
        version: "1.0.0",
        routes: ["/contact360", "/search-memory", "/save-memory", "/save-outcome"],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  }

  if (method !== "POST") {
    return jsonError("Metodo nao permitido. Use POST.", 405);
  }

  try {
    switch (path) {
      case "/contact360":
        return await handleContact360(req);
      case "/search-memory":
        return await handleSearchMemory(req);
      case "/save-memory":
        return await handleSaveMemory(req);
      case "/save-outcome":
        return await handleSaveOutcome(req);
      default:
        return jsonError(`Rota ${path} nao encontrada.`, 404);
    }
  } catch (err) {
    console.error("freddy-gateway error:", err);
    return jsonError(String(err), 500);
  }
});
