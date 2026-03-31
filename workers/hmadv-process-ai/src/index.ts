import { buildActivityPrompt, buildProcessPrompt, SYSTEM_PROMPT } from './prompts';

type Json = Record<string, unknown>;

type AiResponse = { response?: string } & Json;
type AiBinding = {
  run(model: string, payload: Json): Promise<AiResponse>;
};

export interface Env {
  AI: AiBinding;
  CLOUDFLARE_WORKERS_AI_MODEL?: string;
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
  return bearer(req) === env.HMDAV_AI_SHARED_SECRET
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
  return json({ ok: true, analysis: await runJson(env, buildActivityPrompt(payload)) });
}

async function analyzeProcess(req: Request, env: Env) {
  const payload = await parseBody(req);
  if (!payload) return json({ ok: false, error: 'invalid_json' }, 400);
  return json({ ok: true, analysis: await runJson(env, buildProcessPrompt(payload)) });
}

async function reconcile(env: Env, limit = 20) {
  const processos = await supabaseGet(
    env,
    `processos?select=id,numero_cnj,account_id_freshsales,status_atual_processo,instancia,data_ultimo_movimento,data_ultima_movimentacao&account_id_freshsales=not.is.null&limit=${limit}&order=updated_at.desc`
  );

  const results: Json[] = [];
  for (const processo of processos as Json[]) {
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

    const analysis = await runJson(env, buildProcessPrompt({ processo, movimentos, publicacoes, audiencias }));
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
      return json({ ok: true, service: 'hmadv-process-ai', now: new Date().toISOString() });
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
    return json({ ok: false, error: 'not_found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await reconcile(env, 20);
  },
};

