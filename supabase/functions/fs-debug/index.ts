// ⚠️  FUNÇÃO ARQUIVADA — removida do Supabase em 2026-04-24 por limite de 100 funções no plano Free.
// Para reimplantar: supabase functions deploy fs-debug --project-ref sspvizogbcyigquqycsz

/**
 * fs-debug  v2
 * Testa autenticação e paths corretos para Freshsales Classic (.freshsales.io)
 */

const FS_DOMAIN  = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY')!;

// Freshsales Classic usa: Token token=API_KEY  (não Bearer)
function authToken(): string {
  const k = (FS_API_KEY ?? '').trim();
  // Remove qualquer prefix existente e reconstrói
  const raw = k.replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
  return `Token token=${raw}`;
}

async function testRequest(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = `https://${FS_DOMAIN}${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: { Authorization: authToken(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    return { method, path, status: r.status, ok: r.ok, data: parsed };
  } catch(e) {
    return { method, path, status: 'ERROR', erro: String(e) };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'test_all';

  if (action === 'test_auth') {
    // Testa apenas autenticação com múltiplos formatos de key
    const key = (FS_API_KEY ?? '').trim();
    const raw = key.replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
    const tests = await Promise.all([
      // 1. Token token=KEY (Freshsales Classic padrão)
      fetch(`https://${FS_DOMAIN}/api/sales_accounts?per_page=1`, {
        headers: { 'Authorization': `Token token=${raw}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(async r => ({ format: 'Token token=', status: r.status, body: (await r.text()).slice(0,200) })),
      // 2. Bearer KEY
      fetch(`https://${FS_DOMAIN}/api/sales_accounts?per_page=1`, {
        headers: { 'Authorization': `Bearer ${raw}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(async r => ({ format: 'Bearer', status: r.status, body: (await r.text()).slice(0,200) })),
      // 3. Endpoint /api/contacts (menos restrito)
      fetch(`https://${FS_DOMAIN}/api/contacts?per_page=1`, {
        headers: { 'Authorization': `Token token=${raw}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(async r => ({ format: 'Token contacts', status: r.status, body: (await r.text()).slice(0,200) })),
      // 4. Endpoint /api/leads
      fetch(`https://${FS_DOMAIN}/api/leads?per_page=1`, {
        headers: { 'Authorization': `Token token=${raw}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(async r => ({ format: 'Token leads', status: r.status, body: (await r.text()).slice(0,200) })),
      // 5. GET /api/selector/deal_stages (leve, sem dados sensíveis)
      fetch(`https://${FS_DOMAIN}/api/selector/deal_stages`, {
        headers: { 'Authorization': `Token token=${raw}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(async r => ({ format: 'Token deal_stages', status: r.status, body: (await r.text()).slice(0,200) })),
    ]).catch(e => ([{ format: 'ERRO', status: 'ERR', body: String(e) }]));

    return new Response(JSON.stringify({
      domain: FS_DOMAIN,
      key_raw_preview: raw.slice(0,15) + '...',
      key_length: raw.length,
      tests,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }

  // test_all: testa criação de um account com dados mínimos
  if (action === 'test_criar_account') {
    const key = (FS_API_KEY ?? '').trim().replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
    const r = await fetch(`https://${FS_DOMAIN}/api/sales_accounts`, {
      method: 'POST',
      headers: { 'Authorization': `Token token=${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sales_account: {
          name: '1094872-15.2022.8.26.0100 (TESTE)',
          custom_field: { cf_numero_cnj: '1094872-15.2022.8.26.0100' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    return new Response(JSON.stringify({ status: r.status, body: text.slice(0,500) }, null, 2),
      { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    domain: FS_DOMAIN,
    key_preview: (FS_API_KEY??'').slice(0,15)+'...',
    actions: ['test_auth','test_criar_account'],
  }), { headers: { 'Content-Type': 'application/json' } });
});
