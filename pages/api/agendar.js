export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  return res.status(410).json({
    ok: false,
    error: 'Endpoint legado desativado. Use a implementação canônica em Cloudflare Pages Functions.',
    route: '/api/agendar',
    canonical_runtime: 'functions/api/agendar.js',
    hint: 'Para desenvolvimento local, execute `npm run dev:pages` e teste a rota via Wrangler Pages.',
  });
}
