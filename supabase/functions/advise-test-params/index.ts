const ADVISE_URL = 'https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada';
const TOKEN = Deno.env.get('ADVISE_TOKEN') ?? '';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const params: Record<string,string> = {};
  url.searchParams.forEach((v,k) => { params[k] = v; });
  
  const qs = new URLSearchParams({
    paginaAtual: params.paginaAtual ?? '1',
    registrosPorPagina: params.registrosPorPagina ?? '3',
    ...params
  }).toString();
  
  const apiUrl = `${ADVISE_URL}?${qs}`;
  
  try {
    const r = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await r.json();
    const pag = body?.paginacao ?? {};
    const itens = body?.itens ?? [];
    return new Response(JSON.stringify({
      status: r.status,
      paginacao: pag,
      total_itens: itens.length,
      primeiro_item: itens[0] ? {
        id: itens[0].id,
        dataHoraMovimento: itens[0].dataHoraMovimento,
        dataPublicacao: itens[0].dataPublicacao,
        lido: itens[0].lido,
      } : null,
      ultimo_item: itens[itens.length-1] ? {
        id: itens[itens.length-1].id,
        dataHoraMovimento: itens[itens.length-1].dataHoraMovimento,
        lido: itens[itens.length-1].lido,
      } : null,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
