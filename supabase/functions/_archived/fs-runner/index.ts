/**
 * fs-runner  v1
 *
 * Executa os passos da fs-populate usando as secrets do próprio ambiente Deno.
 * Não precisa de service key externa — lê SUPABASE_SERVICE_ROLE_KEY de Deno.env.
 *
 * Uso:
 *   POST /fs-runner?action=status
 *   POST /fs-runner?action=resolver_accounts&limite=100
 *   POST /fs-runner?action=sync_campos
 *   POST /fs-runner?action=sync_publicacoes&batch=25
 *   POST /fs-runner?action=sync_andamentos
 *   POST /fs-runner?action=pipeline_completo
 */

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN            = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY           = Deno.env.get('FRESHSALES_API_KEY')!;

function log(nivel: 'info'|'warn'|'error', msg: string, extra: Record<string,unknown> = {}) {
  console[nivel](JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));
}

// Verifica se as secrets críticas estão configuradas
function checkSecrets(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL)         missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!FS_DOMAIN)            missing.push('FRESHSALES_DOMAIN');
  if (!FS_API_KEY)           missing.push('FRESHSALES_API_KEY');
  return missing;
}

async function callPopulate(action: string, params: Record<string,string> = {}): Promise<unknown> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/fs-populate`);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const r = await fetch(url.toString(), {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: '{}',
    signal: AbortSignal.timeout(55000),
  });

  const data = await r.json().catch(() => ({ error: 'parse_error', status: r.status }));
  log(r.ok ? 'info' : 'warn', `populate_${action}`, { status: r.status });
  return data;
}

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';
  const limite = url.searchParams.get('limite') ?? '200';
  const batch  = url.searchParams.get('batch')  ?? '25';

  // Verifica secrets antes de qualquer coisa
  const missing = checkSecrets();
  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: 'Secrets não configuradas', missing }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  log('info', 'runner_inicio', { action, limite, batch });

  try {
    let result: unknown;

    switch (action) {
      case 'status':
        result = await callPopulate('status');
        break;

      case 'vincular_processos':
        result = await callPopulate('vincular_processos', { limite });
        break;

      case 'resolver_accounts':
        result = await callPopulate('resolver_accounts', { limite });
        break;

      case 'sync_campos':
        result = await callPopulate('sync_campos', { limite });
        break;

      case 'sync_publicacoes':
        result = await callPopulate('sync_publicacoes', { batch });
        break;

      case 'sync_andamentos':
        result = await callPopulate('sync_andamentos', { limite });
        break;

      case 'pipeline_completo': {
        // Executa todos os passos em sequência com logs intermediários
        log('info', 'pipeline_iniciado');

        const p1 = await callPopulate('vincular_processos', { limite: '3000' });
        log('info', 'p1_concluido', p1 as Record<string,unknown>);

        const p2 = await callPopulate('resolver_accounts', { limite });
        log('info', 'p2_concluido', p2 as Record<string,unknown>);

        const p3 = await callPopulate('sync_campos', { limite });
        log('info', 'p3_concluido', p3 as Record<string,unknown>);

        const p4 = await callPopulate('sync_publicacoes', { batch });
        log('info', 'p4_concluido', p4 as Record<string,unknown>);

        const p5 = await callPopulate('sync_andamentos', { limite });
        log('info', 'p5_concluido', p5 as Record<string,unknown>);

        const st = await callPopulate('status');

        result = {
          pipeline: 'completo',
          passo_1_vincular:    p1,
          passo_2_accounts:    p2,
          passo_3_campos:      p3,
          passo_4_publicacoes: p4,
          passo_5_andamentos:  p5,
          status_final:        st,
        };
        log('info', 'pipeline_concluido');
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `action desconhecida: "${action}"` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', 'runner_erro', { action, erro: msg });
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
