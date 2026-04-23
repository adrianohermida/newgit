const ADVISE_URL = 'https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada';
const TOKEN = Deno.env.get('ADVISE_TOKEN') ?? '';

Deno.serve(async () => {
  const start = Date.now();
  try {
    const r = await fetch(`${ADVISE_URL}?paginaAtual=1&registrosPorPagina=1&Lido=false`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - start;
    const body = await r.text();
    return new Response(JSON.stringify({
      status: r.status,
      ok: r.ok,
      elapsed_ms: elapsed,
      token_present: TOKEN.length > 10,
      token_prefix: TOKEN.slice(0, 20),
      body_preview: body.slice(0, 300),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch(e) {
    const elapsed = Date.now() - start;
    return new Response(JSON.stringify({
      error: String(e),
      elapsed_ms: elapsed,
      token_present: TOKEN.length > 10,
    }), { status: 500 });
  }
});
