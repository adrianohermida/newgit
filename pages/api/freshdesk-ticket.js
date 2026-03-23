export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  return res.status(410).json({
    ok: false,
    error: 'Endpoint legado desativado. Use a implementação canônica em Cloudflare Pages Functions.',
    route: '/api/freshdesk-ticket',
    canonical_runtime: 'functions/api/freshdesk-ticket.js',
    hint: 'Para desenvolvimento local, execute `npm run dev:pages` e teste a rota via Wrangler Pages.',
  });
}
