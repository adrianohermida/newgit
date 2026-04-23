import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN = 'hmadv-org.myfreshworks.com';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('account_id') ?? '31013995663';
  const action = url.searchParams.get('action') ?? 'account';
  
  const authHdr = `Token token=${FS_API_KEY.replace(/^Token token=/i,'').trim()}`;
  
  let path = `sales_accounts/${accountId}`;
  if (action === 'fields') path = 'sales_accounts/fields';
  if (action === 'contacts') path = `sales_accounts/${accountId}/contacts`;
  
  const r = await fetch(`https://${FS_DOMAIN}/crm/sales/api/${path}`, {
    headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  return new Response(JSON.stringify({ status: r.status, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
