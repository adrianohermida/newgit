// advise-diag: diagnóstico de parâmetros da API Advise
const ADVISE_URL = 'https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada';
const TOKEN = Deno.env.get('ADVISE_TOKEN') ?? '';
async function testParams(label: string, params: Record<string,string>) {
  const qs = new URLSearchParams(params).toString();
  const url = `${ADVISE_URL}?${qs}`;
  try {
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(12000),
    });
    const body = await r.text();
    return { label, status: r.status, ok: r.ok, body: body.slice(0, 500) };
  } catch(e) {
    return { label, status: 0, ok: false, body: String(e) };
  }
}
Deno.serve(async () => {
  const results = await Promise.all([
    testParams('Lido=false datas recentes out/2025', {
      paginaAtual: '1', registrosPorPagina: '5',
      dataMovimentoInicial: '2025-10-01', dataMovimentoFinal: '2025-10-31',
      Lido: 'false',
    }),
    testParams('Lido=true datas recentes out/2025', {
      paginaAtual: '1', registrosPorPagina: '5',
      dataMovimentoInicial: '2025-10-01', dataMovimentoFinal: '2025-10-31',
      Lido: 'true',
    }),
    testParams('Lido=false datas abr/2026', {
      paginaAtual: '1', registrosPorPagina: '5',
      dataMovimentoInicial: '2026-04-01', dataMovimentoFinal: '2026-04-23',
      Lido: 'false',
    }),
    testParams('Lido=true datas abr/2026', {
      paginaAtual: '1', registrosPorPagina: '5',
      dataMovimentoInicial: '2026-04-01', dataMovimentoFinal: '2026-04-23',
      Lido: 'true',
    }),
    testParams('sem Lido sem datas pagina 1', {
      paginaAtual: '1', registrosPorPagina: '3',
    }),
    testParams('sem Lido sem datas pagina 2034', {
      paginaAtual: '2034', registrosPorPagina: '3',
    }),
  ]);
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
