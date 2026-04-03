import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';

type Json = Record<string, unknown>;

type AiResponse = { response?: string } & Json;
type AiBinding = {
  run(model: string, payload: Json): Promise<AiResponse>;
};

type VectorizeVector = {
  id: string;
  values: number[];
  metadata?: Json;
};

type VectorizeQueryResult = {
  matches?: Array<{
    id: string;
    score: number;
    values?: number[];
    metadata?: Json;
  }>;
};

type VectorizeBinding = {
  insert(vectors: VectorizeVector[]): Promise<{ mutationId?: string } & Json>;
  query(vector: number[], options?: { topK?: number; returnValues?: boolean; returnMetadata?: boolean | "all" }): Promise<VectorizeQueryResult>;
};

type AnalyticsEngineBinding = {
  writeDataPoint(data: {
    indexes?: string[];
    blobs?: string[];
    doubles?: number[];
  }): void | Promise<unknown>;
};

type R2BucketBinding = {
  put(
    key: string,
    value: BodyInit | ReadableStream | ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
};

type KvNamespaceBinding = {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string, type?: "text"): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
};

export interface Env {
  AI: AiBinding;
  VECTORIZE: VectorizeBinding;
  ANALYTICS_ENGINE?: AnalyticsEngineBinding;
  CLOUDFLARE_KV_NAMESPACE?: KvNamespaceBinding;
  hmadv_process_ai: D1Database;
  hmadv_process_ai_logs?: R2BucketBinding;
  CLOUDFLARE_WORKERS_AI_MODEL?: string;
  CLOUDFLARE_WORKERS_AI_EMBEDDING_MODEL?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_S3_API?: string;
  HMDAV_AI_SHARED_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FRESHSALES_API_BASE?: string;
  FRESHSALES_API_KEY?: string;
  FRESHSALES_OWNER_ID?: string;
  FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL?: string;
  FRESHSALES_ACTIVITY_TYPE_AUDIENCIA?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function assertSecret(req: Request, env: Env) {
  if (!env.HMDAV_AI_SHARED_SECRET) return null;
  const sharedSecret =
    req.headers.get('x-shared-secret')?.trim() ||
    req.headers.get('x-dotobot-embed-secret')?.trim() ||
    bearer(req);
  return sharedSecret === env.HMDAV_AI_SHARED_SECRET
    ? null
    : json({ ok: false, error: 'unauthorized' }, 401);
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryVectorizeError(error: unknown) {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('temporar') ||
    message.includes('rate') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('network') ||
    message.includes('fetch')
  );
}

async function withVectorizeRetry<T>(operation: () => Promise<T>, maxRetries = 2) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetryVectorizeError(error)) {
        throw error;
      }
      await sleep(Math.pow(2, attempt) * 250);
    }
  }
  throw lastError;
}

async function runJson(env: Env, prompt: string) {
  const model = env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1400,
  });
  return JSON.parse(String(result.response ?? '{}'));
}

function buildConversationPrompt(query: string, context: Json, retrievedContext: Json[]) {
  const assistant = (context as Record<string, any>)?.assistant || {};
  const rag = (context as Record<string, any>)?.rag || {};
  return [
    CONVERSATION_SYSTEM_PROMPT.trim(),
    assistant.system_prompt ? `Instrucoes adicionais do workspace:\n${String(assistant.system_prompt).trim()}` : null,
    `Modo: ${String((assistant as Record<string, any>).mode || context?.mode || 'chat')}`,
    `Idioma: ${String((context as Record<string, any>).locale || 'pt-BR')}`,
    rag?.matches?.length
      ? `Contexto RAG recuperado:\n${JSON.stringify(rag.matches.slice(0, 6), null, 2)}`
      : null,
    retrievedContext.length
      ? `Memorias relacionadas:\n${JSON.stringify(retrievedContext.slice(0, 6), null, 2)}`
      : null,
    `Pedido do usuario:\n${query}`,
    'Responda em texto natural e estruturado. Se houver passos, mostre-os em bullets curtos.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function runConversation(env: Env, query: string, context: Json) {
  const runId = crypto.randomUUID();
  const retrievedContext = await queryRelatedMemory(env, `conversation\n${query}\n${JSON.stringify(context).slice(0, 1200)}`, 6).catch(() => []);

  await recordRun(env, {
    id: runId,
    kind: 'conversation',
    route: '/execute',
    mission: query.slice(0, 120),
    mode: String((context as Record<string, any>)?.assistant?.mode || context?.mode || 'chat'),
    provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    status: 'running',
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);

  const prompt = buildConversationPrompt(query, context, retrievedContext);
  const model = env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1200,
  });

  const resultText = String((result as Json)?.response || '').trim() || 'Sem resposta do Dotobot.';

  await recordRun(env, {
    id: runId,
    kind: 'conversation',
    route: '/execute',
    mission: query.slice(0, 120),
    mode: String((context as Record<string, any>)?.assistant?.mode || context?.mode || 'chat'),
    provider: model,
    status: 'done',
    result: resultText,
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await recordEvent(env, {
    run_id: runId,
    type: 'reporter',
    action: 'conversation_completed',
    result: 'conversation reply ready',
    payload_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await writeAnalyticsEvent(env, 'conversation', 'conversation_completed', 'done', {
    retrieved_context_count: retrievedContext.length,
  });
  await persistR2Snapshot(env, 'conversation', runId, {
    run_id: runId,
    kind: 'conversation',
    query,
    context,
    resultText,
    retrieved_context: retrievedContext,
    created_at: nowIso(),
  }).catch(() => null);
  await persistKvSnapshot(env, 'conversation', runId, {
    run_id: runId,
    kind: 'conversation',
    mission: query.slice(0, 120),
    summary: resultText.slice(0, 240),
    retrieved_context_count: retrievedContext.length,
  }).catch(() => null);

  return {
    ok: true,
    status: 'ok',
    resultText,
    steps: [
      { title: 'Contexto recuperado', count: retrievedContext.length },
      { title: 'Resposta gerada', provider: model },
    ],
    logs: [
      `retrieved_context_count=${retrievedContext.length}`,
      `mode=${String((context as Record<string, any>)?.assistant?.mode || context?.mode || 'chat')}`,
    ],
    session_id: runId,
    rag: {
      retrieved_context: retrievedContext,
    },
  };
}

function getEmbeddingModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5';
}

async function runEmbedding(env: Env, text: string) {
  const result = await env.AI.run(getEmbeddingModel(env), {
    text: [text],
  });
  const vector =
    (result as Json)?.data?.[0] ||
    (result as Json)?.result?.data?.[0] ||
    (result as Json)?.result?.[0] ||
    (result as Json)?.result ||
    (result as Json)?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error('embedding_failed');
  }
  return vector.map((value) => Number(value));
}

function summarizePayload(kind: string, payload: Json, analysis?: Json) {
  return [
    `kind: ${kind}`,
    `payload: ${JSON.stringify(payload)}`,
    analysis ? `analysis: ${JSON.stringify(analysis)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSearchText(kind: string, payload: Json) {
  const data = payload as Record<string, any>;
  return [
    `kind: ${kind}`,
    `processo: ${String(data.processo?.numero_cnj ?? data.numero_cnj ?? data.processo_id ?? '')}`,
    `account: ${String(data.processo?.account_id_freshsales ?? data.account_id_freshsales ?? '')}`,
    `summary: ${JSON.stringify(payload)}`,
  ]
    .filter((part) => !part.endsWith(': '))
    .join('\n');
}

async function queryRelatedMemory(env: Env, text: string, topK = 5) {
  if (!env.VECTORIZE) return [];
  const vector = await runEmbedding(env, text);
  const matches = await withVectorizeRetry(() =>
    env.VECTORIZE.query(vector, {
      topK,
      returnValues: false,
      returnMetadata: 'all',
    })
  );
  return matches.matches || [];
}

async function writeAnalyticsEvent(
  env: Env,
  kind: string,
  action: string,
  status: string,
  metadata: Record<string, unknown> = {}
) {
  if (!env.ANALYTICS_ENGINE) return;
  await Promise.resolve(
    env.ANALYTICS_ENGINE.writeDataPoint({
      indexes: [kind],
      blobs: [action, status, JSON.stringify(metadata)],
      doubles: [
        Number(metadata.retrieved_context_count ?? 0),
        Number(metadata.result_count ?? 0),
      ],
    })
  ).catch(() => null);
}

async function persistR2Snapshot(
  env: Env,
  kind: string,
  runId: string,
  payload: Record<string, unknown>
) {
  if (!env.hmadv_process_ai_logs) return null;
  const datePrefix = new Date().toISOString().slice(0, 10);
  const key = `runs/${kind}/${datePrefix}/${runId}.json`;
  await env.hmadv_process_ai_logs.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  return key;
}

async function persistKvSnapshot(
  env: Env,
  kind: string,
  runId: string,
  payload: Record<string, unknown>
) {
  if (!env.CLOUDFLARE_KV_NAMESPACE) return null;
  const key = `runs/${kind}/${runId}`;
  await env.CLOUDFLARE_KV_NAMESPACE.put(
    key,
    JSON.stringify(
      {
        ...payload,
        stored_at: nowIso(),
      },
      null,
      2
    ),
    { expirationTtl: 60 * 60 * 24 * 30 }
  );
  return key;
}

let d1SchemaReady = false;

async function ensureD1Schema(env: Env) {
  if (d1SchemaReady) return;
  await env.hmadv_process_ai.exec(`
    CREATE TABLE IF NOT EXISTS ai_orchestration_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      route TEXT,
      mission TEXT,
      mode TEXT,
      provider TEXT,
      status TEXT NOT NULL,
      result TEXT,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_orchestration_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_orchestration_runs_created_at
      ON ai_orchestration_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_orchestration_events_run_id_created_at
      ON ai_orchestration_events(run_id, created_at DESC);
  `);
  d1SchemaReady = true;
}

async function recordRun(env: Env, run: Json) {
  await ensureD1Schema(env);
  await env.hmadv_process_ai
    .prepare(
      `INSERT INTO ai_orchestration_runs
        (id, created_at, updated_at, kind, route, mission, mode, provider, status, result, metadata_json)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        kind = excluded.kind,
        route = excluded.route,
        mission = excluded.mission,
        mode = excluded.mode,
        provider = excluded.provider,
        status = excluded.status,
        result = excluded.result,
        metadata_json = excluded.metadata_json`
    )
    .bind(
      String(run.id || crypto.randomUUID()),
      String(run.created_at || nowIso()),
      String(run.updated_at || nowIso()),
      String(run.kind || 'unknown'),
      run.route ? String(run.route) : null,
      run.mission ? String(run.mission) : null,
      run.mode ? String(run.mode) : null,
      run.provider ? String(run.provider) : null,
      String(run.status || 'running'),
      run.result ? String(run.result) : null,
      run.metadata_json ? String(run.metadata_json) : null
    )
    .run();
}

async function recordEvent(env: Env, event: Json) {
  await ensureD1Schema(env);
  await env.hmadv_process_ai
    .prepare(
      `INSERT INTO ai_orchestration_events
        (id, run_id, created_at, type, action, result, payload_json)
       VALUES
        (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(event.id || crypto.randomUUID()),
      String(event.run_id || ''),
      String(event.created_at || nowIso()),
      String(event.type || 'info'),
      String(event.action || 'event'),
      String(event.result || ''),
      event.payload_json ? String(event.payload_json) : null
    )
    .run();
}

async function persistMemoryVector(env: Env, id: string, kind: string, payload: Json, analysis: Json) {
  if (!env.VECTORIZE) return null;
  const values = await runEmbedding(env, summarizePayload(kind, payload, analysis));
  const data = payload as Record<string, any>;
  return withVectorizeRetry(() =>
    env.VECTORIZE.insert([
      {
        id,
        values,
        metadata: {
          kind,
          created_at: nowIso(),
          payload_kind: String(data?.kind || data?.type || kind),
          route: String(data?.route || data?.route_path || ''),
          process_id: String(data?.processo?.id || data?.processo_id || ''),
        },
      },
    ])
  );
}

function supabaseHeaders(env: Env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('supabase_service_role_missing');
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Accept-Profile': 'judiciario',
    'Content-Profile': 'judiciario',
    Prefer: 'return=representation',
  };
}

async function supabaseGet(env: Env, path: string) {
  if (!env.SUPABASE_URL) throw new Error('supabase_url_missing');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseHeaders(env),
  });
  if (!res.ok) throw new Error(`supabase_get_failed:${res.status}:${await res.text()}`);
  return res.json();
}

async function supabasePatch(env: Env, table: string, filter: string, payload: Json) {
  if (!env.SUPABASE_URL) throw new Error('supabase_url_missing');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      ...supabaseHeaders(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`supabase_patch_failed:${res.status}:${await res.text()}`);
  return res.json();
}

async function freshsales(env: Env, path: string, init?: RequestInit) {
  if (!env.FRESHSALES_API_BASE || !env.FRESHSALES_API_KEY) {
    throw new Error('freshsales_not_configured');
  }
  const res = await fetch(`${env.FRESHSALES_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token token=${env.FRESHSALES_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`freshsales_failed:${res.status}:${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

async function createAccountNote(env: Env, accountId: string, title: string, body: string) {
  if (!env.FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL) {
    return { skipped: true, reason: 'note_activity_type_missing' };
  }
  return freshsales(env, '/api/sales_activities', {
    method: 'POST',
    body: JSON.stringify({
      sales_activity: {
        title,
        description: body,
        sales_activity_type_id: Number(env.FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL),
        owner_id: env.FRESHSALES_OWNER_ID ? Number(env.FRESHSALES_OWNER_ID) : undefined,
        targetable_type: 'SalesAccount',
        targetable_id: Number(accountId),
      },
    }),
  });
}

async function createTask(env: Env, accountId: string, task: Json) {
  return freshsales(env, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      task: {
        title: String(task.title ?? 'Tarefa processual sugerida'),
        description: String(task.note ?? ''),
        due_date: task.due_at ? String(task.due_at) : null,
        owner_id: env.FRESHSALES_OWNER_ID ? Number(env.FRESHSALES_OWNER_ID) : undefined,
        targetable_type: 'SalesAccount',
        targetable_id: Number(accountId),
      },
    }),
  });
}

async function analyzeActivity(req: Request, env: Env) {
  const payload = await parseBody(req);
  if (!payload) return json({ ok: false, error: 'invalid_json' }, 400);
  const runId = crypto.randomUUID();
  const retrievedContext = await queryRelatedMemory(env, buildSearchText('activity', payload), 5).catch(() => []);
  await recordRun(env, {
    id: runId,
    kind: 'activity',
    route: '/analyze/activity',
    mission: String((payload as Record<string, any>).type || 'activity'),
    mode: 'analysis',
    provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    status: 'running',
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await recordEvent(env, {
    run_id: runId,
    type: 'planner',
    action: 'context_retrieval',
    result: `retrieved ${retrievedContext.length} related memories`,
    payload_json: JSON.stringify(retrievedContext.slice(0, 5)),
  }).catch(() => null);
  await writeAnalyticsEvent(env, 'activity', 'context_retrieval', 'running', {
    retrieved_context_count: retrievedContext.length,
  });

  const analysis = await runJson(env, buildActivityPrompt({ ...payload, retrieved_context: retrievedContext }));

  await recordRun(env, {
    id: runId,
    kind: 'activity',
    route: '/analyze/activity',
    mission: String((payload as Record<string, any>).type || 'activity'),
    mode: 'analysis',
    provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    status: 'done',
    result: JSON.stringify(analysis),
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await recordEvent(env, {
    run_id: runId,
    type: 'reporter',
    action: 'analysis_completed',
    result: 'analysis stored and ready',
    payload_json: JSON.stringify({ analysis }),
  }).catch(() => null);
  await writeAnalyticsEvent(env, 'activity', 'analysis_completed', 'done', {
    retrieved_context_count: retrievedContext.length,
    result_count: Array.isArray(analysis?.tasks) ? analysis.tasks.length : 0,
  });
  await persistR2Snapshot(env, 'activity', runId, {
    run_id: runId,
    kind: 'activity',
    payload,
    analysis,
    retrieved_context: retrievedContext,
    created_at: nowIso(),
  }).catch(() => null);
  await persistKvSnapshot(env, 'activity', runId, {
    run_id: runId,
    kind: 'activity',
    mission: String((payload as Record<string, any>).type || 'activity'),
    summary: String(analysis?.summary_title || analysis?.summary_note || 'activity'),
    retrieved_context_count: retrievedContext.length,
  }).catch(() => null);
  await persistMemoryVector(env, runId, 'activity', payload as Json, analysis).catch(() => null);

  return json({ ok: true, analysis, retrieved_context: retrievedContext });
}

async function analyzeProcess(req: Request, env: Env) {
  const payload = await parseBody(req);
  if (!payload) return json({ ok: false, error: 'invalid_json' }, 400);
  const runId = crypto.randomUUID();
  const retrievedContext = await queryRelatedMemory(env, buildSearchText('process', payload), 5).catch(() => []);
  await recordRun(env, {
    id: runId,
    kind: 'process',
    route: '/analyze/process',
    mission: String((payload as Record<string, any>).processo?.numero_cnj || (payload as Record<string, any>).numero_cnj || 'process'),
    mode: 'analysis',
    provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    status: 'running',
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await recordEvent(env, {
    run_id: runId,
    type: 'planner',
    action: 'context_retrieval',
    result: `retrieved ${retrievedContext.length} related memories`,
    payload_json: JSON.stringify(retrievedContext.slice(0, 5)),
  }).catch(() => null);
  await writeAnalyticsEvent(env, 'process', 'context_retrieval', 'running', {
    retrieved_context_count: retrievedContext.length,
  });

  const analysis = await runJson(env, buildProcessPrompt({ ...payload, retrieved_context: retrievedContext }));

  await recordRun(env, {
    id: runId,
    kind: 'process',
    route: '/analyze/process',
    mission: String((payload as Record<string, any>).processo?.numero_cnj || (payload as Record<string, any>).numero_cnj || 'process'),
    mode: 'analysis',
    provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    status: 'done',
    result: JSON.stringify(analysis),
    metadata_json: JSON.stringify({ retrieved_context_count: retrievedContext.length }),
  }).catch(() => null);
  await recordEvent(env, {
    run_id: runId,
    type: 'reporter',
    action: 'analysis_completed',
    result: 'analysis stored and ready',
    payload_json: JSON.stringify({ analysis }),
  }).catch(() => null);
  await writeAnalyticsEvent(env, 'process', 'analysis_completed', 'done', {
    retrieved_context_count: retrievedContext.length,
    result_count: Array.isArray(analysis?.tasks) ? analysis.tasks.length : 0,
  });
  await persistR2Snapshot(env, 'process', runId, {
    run_id: runId,
    kind: 'process',
    payload,
    analysis,
    retrieved_context: retrievedContext,
    created_at: nowIso(),
  }).catch(() => null);
  await persistKvSnapshot(env, 'process', runId, {
    run_id: runId,
    kind: 'process',
    mission: String((payload as Record<string, any>).processo?.numero_cnj || (payload as Record<string, any>).numero_cnj || 'process'),
    summary: String(analysis?.account_note_title || analysis?.account_note_body || 'process'),
    retrieved_context_count: retrievedContext.length,
  }).catch(() => null);
  await persistMemoryVector(env, runId, 'process', payload as Json, analysis).catch(() => null);

  return json({ ok: true, analysis, retrieved_context: retrievedContext });
}

async function reconcile(env: Env, limit = 20) {
  const processos = await supabaseGet(
    env,
    `processos?select=id,numero_cnj,account_id_freshsales,status_atual_processo,instancia,data_ultimo_movimento,data_ultima_movimentacao&account_id_freshsales=not.is.null&limit=${limit}&order=updated_at.desc`
  );
  return reconcileRows(env, processos as Json[]);
}

async function reconcileSingle(env: Env, processoId: string) {
  const processos = await supabaseGet(
    env,
    `processos?select=id,numero_cnj,account_id_freshsales,status_atual_processo,instancia,data_ultimo_movimento,data_ultima_movimentacao&id=eq.${processoId}&limit=1`
  );
  return reconcileRows(env, processos as Json[]);
}

async function reconcileRows(env: Env, processos: Json[]) {
  const results: Json[] = [];
  for (const processo of processos) {
    const processoId = String(processo.id ?? '');
    const accountId = String(processo.account_id_freshsales ?? '');
    if (!processoId || !accountId) continue;

    const movimentos = await supabaseGet(
      env,
      `movimentos?select=id,codigo,descricao,data_movimento&processo_id=eq.${processoId}&order=data_movimento.desc&limit=15`
    );
    const publicacoes = await supabaseGet(
      env,
      `publicacoes?select=id,data_publicacao,conteudo,nome_diario,tem_prazo,prazo_data&processo_id=eq.${processoId}&order=data_publicacao.desc&limit=10`
    );
    const audiencias = await supabaseGet(
      env,
      `audiencias?select=id,data_audiencia,titulo,descricao&processo_id=eq.${processoId}&order=data_audiencia.desc&limit=10`
    ).catch(() => []);

    const runId = `process_${processoId}_${Date.now()}`;
    const retrievedContext = await queryRelatedMemory(
      env,
      buildSearchText('reconcile-process', { processo, movimentos, publicacoes, audiencias }),
      5
    ).catch(() => []);

    await recordRun(env, {
      id: runId,
      kind: 'reconcile',
      route: '/cron/reconcile',
      mission: String(processo.numero_cnj ?? processoId),
      mode: 'analysis',
      provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
      status: 'running',
      metadata_json: JSON.stringify({ account_id: accountId, retrieved_context_count: retrievedContext.length }),
    }).catch(() => null);

    const analysis = await runJson(
      env,
      buildProcessPrompt({ processo, movimentos, publicacoes, audiencias, retrieved_context: retrievedContext })
    );
    const fieldUpdates = (analysis.account_field_updates || {}) as Json;

    await supabasePatch(env, 'processos', `id=eq.${processoId}`, {
      status_atual_processo: fieldUpdates.status ?? processo.status_atual_processo ?? null,
      instancia: fieldUpdates.instancia ?? processo.instancia ?? null,
      data_ultimo_movimento: fieldUpdates.data_ultimo_movimento ?? processo.data_ultimo_movimento ?? null,
    }).catch(() => null);

    await createAccountNote(
      env,
      accountId,
      String(analysis.account_note_title ?? 'Resumo automático do processo'),
      String(analysis.account_note_body ?? 'Sem observações')
    ).catch(() => null);

    const tasks = Array.isArray(analysis.tasks) ? analysis.tasks : [];
    for (const task of tasks.slice(0, 3)) {
      await createTask(env, accountId, task as Json).catch(() => null);
    }

    await persistMemoryVector(env, runId, 'reconcile', { processo, movimentos, publicacoes, audiencias }, analysis).catch(
      () => null
    );
    await recordRun(env, {
      id: runId,
      kind: 'reconcile',
      route: '/cron/reconcile',
      mission: String(processo.numero_cnj ?? processoId),
      mode: 'analysis',
      provider: env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct',
      status: 'done',
      result: JSON.stringify(analysis),
      metadata_json: JSON.stringify({ account_id: accountId, retrieved_context_count: retrievedContext.length }),
    }).catch(() => null);
    await recordEvent(env, {
      run_id: runId,
      type: 'reporter',
      action: 'reconcile_completed',
      result: `updated ${processoId}`,
      payload_json: JSON.stringify({ analysis, accountId }),
    }).catch(() => null);
    await writeAnalyticsEvent(env, 'reconcile', 'reconcile_completed', 'done', {
      retrieved_context_count: retrievedContext.length,
      result_count: Array.isArray(analysis?.tasks) ? analysis.tasks.length : 0,
    });
    await persistR2Snapshot(env, 'reconcile', runId, {
      run_id: runId,
      kind: 'reconcile',
      processo,
      movimentos,
      publicacoes,
      audiencias,
      analysis,
      retrieved_context: retrievedContext,
      created_at: nowIso(),
    }).catch(() => null);
    await persistKvSnapshot(env, 'reconcile', runId, {
      run_id: runId,
      kind: 'reconcile',
      mission: String(processo.numero_cnj ?? processoId),
      summary: String(analysis?.account_note_title || analysis?.account_note_body || 'reconcile'),
      retrieved_context_count: retrievedContext.length,
      account_id: accountId,
    }).catch(() => null);

    results.push({
      processo_id: processoId,
      account_id: accountId,
      current_status: analysis.current_status ?? null,
      current_phase: analysis.current_phase ?? null,
      current_instance: analysis.current_instance ?? null,
      inconsistencies: analysis.inconsistencies ?? [],
      tasks_sugeridas: tasks.length,
    });
  }

  return { ok: true, total: results.length, results };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const denied = assertSecret(req, env);
    if (denied) return denied;

    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'hmadv-process-ai',
        now: new Date().toISOString(),
        vectorize: Boolean(env.VECTORIZE),
        analytics_engine: Boolean(env.ANALYTICS_ENGINE),
        kv: Boolean(env.CLOUDFLARE_KV_NAMESPACE),
        d1: Boolean(env.hmadv_process_ai),
        r2: Boolean(env.hmadv_process_ai_logs),
        embedding_model: getEmbeddingModel(env),
        r2_account_id: Boolean(env.CLOUDFLARE_R2_ACCOUNT_ID),
        s3_api_configured: Boolean(env.CLOUDFLARE_S3_API),
      });
    }
    if (req.method === 'POST' && url.pathname === '/execute') {
      const body = (await parseBody(req)) as Json | null;
      const query = String(body?.query ?? '').trim();
      if (!query) {
        return json({ ok: false, error: 'query_required' }, 400);
      }
      const context = (body?.context && typeof body.context === 'object' ? body.context : {}) as Json;
      return json(await runConversation(env, query, context));
    }
    if (req.method === 'POST' && url.pathname === '/analyze/activity') {
      return analyzeActivity(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/analyze/process') {
      return analyzeProcess(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/cron/reconcile') {
      const body = (await parseBody(req)) as Json | null;
      const limit = Number(body?.limit ?? 20);
      return json(await reconcile(env, Math.max(1, Math.min(limit, 50))));
    }
    if (req.method === 'POST' && url.pathname === '/reconcile/process') {
      const body = (await parseBody(req)) as Json | null;
      const processoId = String(body?.processo_id ?? '').trim();
      if (!processoId) {
        return json({ ok: false, error: 'processo_id_required' }, 400);
      }
      return json(await reconcileSingle(env, processoId));
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await reconcile(env, 20);
  },
};

