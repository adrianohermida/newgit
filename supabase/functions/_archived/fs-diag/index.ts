/**
 * fs-diag v3: testa todos os paths possíveis da API Freshsales
 * Freshsales clássico (.freshsales.io) usa /api/
 * Freshsales Suite (.myfreshworks.com) usa /crm/sales/api/
 */
const FS_DOMAIN  = Deno.env.get('FRESHSALES_DOMAIN') ?? '';
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY') ?? '';

function authHdr() {
  const k = FS_API_KEY.trim();
  return (k.startsWith('Token ') || k.startsWith('Bearer ')) ? k : `Token token=${k}`;
}

async function t(url: string): Promise<{s:number; b:string}> {
  try {
    const r = await fetch(url, {
      headers: { Authorization: authHdr(), 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    return { s: r.status, b: text.substring(0, 400) };
  } catch(e) { return { s: -1, b: String(e).substring(0, 200) }; }
}

Deno.serve(async () => {
  const d = FS_DOMAIN;
  const results: Record<string, unknown> = {
    dominio: d,
    auth_header_tipo: authHdr().substring(0, 20) + '...',
  };

  // Testa todos os paths possíveis
  const paths = [
    // Freshsales clássico
    `https://${d}/api/sales_accounts`,
    `https://${d}/api/contacts`,
    `https://${d}/api/leads`,
    // Freshsales Suite
    `https://${d}/crm/sales/api/sales_accounts`,
    `https://${d}/crm/sales/api/contacts`,
    // Sem /crm
    `https://${d}/sales/api/sales_accounts`,
    // Root check
    `https://${d}/`,
    `https://${d}/api`,
  ];

  for (const url of paths) {
    const key = url.replace(`https://${d}`, '');
    results[key] = await t(url);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
