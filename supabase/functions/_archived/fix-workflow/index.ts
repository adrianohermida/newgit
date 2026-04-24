/**
 * fix-workflow  v2
 * GET + PATCH automatico no workflow 31000233607.
 * Chamada: POST /fix-workflow  -> executa tudo e retorna resultado.
 * Nao precisa de parametros.
 */
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;

const DOMAIN_MAP: Record<string,string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};
function fsDomain(): string {
  const d = (FS_DOMAIN_RAW ?? '').trim();
  if (d.includes('myfreshworks.com')) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com');
}
function auth(): Record<string,string> {
  const k = (FS_API_KEY ?? '').trim()
    .replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
  return { Authorization: `Token token=${k}`, 'Content-Type': 'application/json' };
}

const WF_ID        = '31000233607';
const NEW_URL      = 'https://sspvizogbcyigquqycsz.supabase.co/functions/v1/fs-webhook';
const NEW_BODY     = '{"numeroProcesso": "{{sales_account.cf_processo}}", "account_id": "{{sales_account.id}}"}'
const BASE         = `https://${fsDomain()}/crm/sales/api/workflow_automations/${WF_ID}`;

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'auto';

  // ---- GET: inspeciona estrutura ----------------------------------------
  if (action === 'get' || action === 'auto') {
    const r = await fetch(BASE, { headers: auth(), signal: AbortSignal.timeout(20_000) });
    const raw = await r.text();
    let wf: Record<string,unknown>;
    try { wf = JSON.parse(raw); } catch { wf = { parse_error: raw.slice(0,500) }; }

    if (action === 'get') {
      return new Response(JSON.stringify({ status: r.status, wf }, null, 2),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // ---- AUTO: GET + analisa + PATCH ------------------------------------
    if (!r.ok) {
      return new Response(JSON.stringify({ erro: `GET ${r.status}`, body: raw.slice(0,300) }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // Identifica onde fica a URL do webhook na estrutura
    const report = analisar(wf);

    // Aplica as alteracoes
    const { modificado, detalhes } = aplicarAlteracoes(wf);

    if (!modificado) {
      return new Response(JSON.stringify({
        aviso: 'Nenhum campo de URL de webhook encontrado para alterar',
        estrutura_resumo: report,
        wf_keys: Object.keys(wf),
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    // PUT com o wf modificado
    const putR = await fetch(BASE, {
      method:  'PUT',
      headers: auth(),
      body:    JSON.stringify(wf),
      signal:  AbortSignal.timeout(20_000),
    });
    const putRaw = await putR.text();
    let putData: unknown;
    try { putData = JSON.parse(putRaw); } catch { putData = putRaw.slice(0,300); }

    return new Response(JSON.stringify({
      get_status: r.status,
      put_status: putR.status,
      put_ok:     putR.ok,
      alteracoes: detalhes,
      resultado:  putData,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }

  // ---- TEST: enfileira o processo de teste ------------------------------
  if (action === 'test') {
    const testR = await fetch(
      'https://sspvizogbcyigquqycsz.supabase.co/functions/v1/fs-webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroProcesso: '0000770-53.2024.8.26.0292',
          account_id: url.searchParams.get('account_id') ?? '',
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    const data = await testR.json();
    return new Response(JSON.stringify({ status: testR.status, resposta: data }, null, 2),
      { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ uso: '?action=get|auto|test' }),
    { headers: { 'Content-Type': 'application/json' } });
});

// --------------------------------------------------------------------------
function analisar(obj: unknown, path = ''): string[] {
  const linhas: string[] = [];
  if (typeof obj !== 'object' || obj === null) return linhas;
  for (const [k, v] of Object.entries(obj as Record<string,unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string' && (
      v.includes('supabase') || v.includes('datajud') || v.includes('freshworks') ||
      k.toLowerCase().includes('url') || k.toLowerCase().includes('endpoint') ||
      k.toLowerCase().includes('callback') || k.toLowerCase().includes('body')
    )) {
      linhas.push(`${p} = ${v.slice(0,120)}`);
    }
    if (typeof v === 'object') linhas.push(...analisar(v, p));
  }
  return linhas;
}

function aplicarAlteracoes(
  obj: unknown,
  path = '',
  detalhes: string[] = [],
): { modificado: boolean; detalhes: string[] } {
  let modificado = false;
  if (typeof obj !== 'object' || obj === null)
    return { modificado, detalhes };

  const rec = obj as Record<string,unknown>;
  const URL_KEYS  = ['url', 'endpoint_url', 'callback_url', 'request_url',
                     'webhook_url', 'request_endpoint', 'end_point'];
  const BODY_KEYS = ['body', 'request_body', 'body_content', 'params',
                     'payload', 'content', 'request_params'];

  for (const k of URL_KEYS) {
    if (typeof rec[k] === 'string' && (
      (rec[k] as string).includes('supabase') ||
      (rec[k] as string).includes('datajud')
    )) {
      detalhes.push(`alterou ${path}.${k}: "${(rec[k] as string).slice(0,60)}" -> "${NEW_URL}"`);
      rec[k] = NEW_URL;
      modificado = true;
    }
  }
  for (const k of BODY_KEYS) {
    if (typeof rec[k] === 'string' && (
      (rec[k] as string).includes('numeroProcesso') ||
      (rec[k] as string).includes('cf_processo')
    )) {
      detalhes.push(`alterou ${path}.${k} -> body com account_id`);
      rec[k] = NEW_BODY;
      modificado = true;
    }
  }

  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'object') {
      const sub = aplicarAlteracoes(v, path ? `${path}.${k}` : k, detalhes);
      if (sub.modificado) modificado = true;
    }
  }
  return { modificado, detalhes };
}
