/**
 * fs-diagnose v3
 * Diagnostica a estrutura real dos Sales Accounts no Freshsales.
 * Corrige o bug 'Body already consumed' clonando a response antes de ler.
 */

const FS_DOMAIN  = Deno.env.get('FRESHSALES_DOMAIN') ?? '';
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY') ?? '';

function auth() {
  const k = FS_API_KEY.trim();
  return (k.startsWith('Token ') || k.startsWith('Bearer ')) ? k : `Token token=${k}`;
}

/** GET para Freshsales */
async function fsGet(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${FS_DOMAIN}/crm/sales/api/${path}`, {
    method: 'GET',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text.slice(0, 300) }; }
}

/** POST para Freshsales */
async function fsPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${FS_DOMAIN}/crm/sales/api/${path}`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text.slice(0, 300) }; }
}

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const cnj20 = url.searchParams.get('cnj') ?? '10948721520228260100';
  const fmt   = `${cnj20.slice(0,7)}-${cnj20.slice(7,9)}.${cnj20.slice(9,13)}.${cnj20.slice(13,14)}.${cnj20.slice(14,16)}.${cnj20.slice(16)}`;

  const out: Record<string, unknown> = {
    env:   { domain: FS_DOMAIN ? FS_DOMAIN.slice(0, 25) : 'N/D', key_ok: FS_API_KEY.length > 10 },
    cnj20, fmt,
  };

  // 1. Lista 3 accounts com custom_field para ver estrutura real do FS
  out.lista_accounts = await fsGet('sales_accounts?page=1&per_page=3&include=custom_field');

  // 2. Busca textual pelo CNJ formatado
  out.search_fmt = await fsGet(`search?q=${encodeURIComponent(fmt)}&include=sales_account`);

  // 3. Busca textual pelo CNJ 20 dígitos
  out.search_raw = await fsGet(`search?q=${encodeURIComponent(cnj20)}&include=sales_account`);

  // 4. filtered_search por cf_numero_cnj (formatado)
  out.filter_cf_fmt = await fsPost('filtered_search/sales_account', {
    filter_rule: [{ attribute: 'cf_numero_cnj', operator: 'is_in', value: fmt }],
  });

  // 5. filtered_search por name (formatado)
  out.filter_name_fmt = await fsPost('filtered_search/sales_account', {
    filter_rule: [{ attribute: 'name', operator: 'is_in', value: fmt }],
  });

  // 6. filtered_search por name (20 dígitos)
  out.filter_name_raw = await fsPost('filtered_search/sales_account', {
    filter_rule: [{ attribute: 'name', operator: 'is_in', value: cnj20 }],
  });

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
