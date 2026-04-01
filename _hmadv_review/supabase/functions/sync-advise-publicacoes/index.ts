/**
 * sync-advise-publicacoes  v13
 *
 * Melhorias vs v12:
 *  1. Filtro de leilão: exclui publicações com palavrasChave contendo
 *     "leilão" / "leilões" ANTES do upsert. Pertence a outro projeto.
 *  2. Salva raw_payload completo em todos os itens (válidos).
 *  3. Log com contagem de filtrados por página.
 *  4. Mantém paginação via advise_sync_status.pagina_atual.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'judiciario' } }
);

const ADVISE_TOKEN = Deno.env.get('ADVISE_TOKEN')!;
const ADVISE_URL  = 'https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada';

function ehLeilao(item: Record<string, unknown>): boolean {
  const palavras = (item.palavrasChave ?? []) as unknown[];
  return (palavras as string[]).some(
    p => typeof p === 'string' && /leil[ãõa][oe]?s?/i.test(p)
  );
}

Deno.serve(async (req) => {
  try {
    // Busca ou cria estado de sync
    let { data: sync } = await supabase
      .from('advise_sync_status')
      .select('*').limit(1).maybeSingle();

    if (!sync) {
      const { data } = await supabase
        .from('advise_sync_status')
        .insert({ pagina_atual: 1, registros_importados: 0 })
        .select().single();
      sync = data;
    }

    const pagina = sync.pagina_atual ?? 1;
    console.info(JSON.stringify({ ts: new Date().toISOString(), msg: 'backfill_pagina', pagina }));

    const response = await fetch(
      `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=100&Lido=false`,
      { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` } }
    );
    if (!response.ok) throw new Error(`Erro API Advise: ${await response.text()}`);

    const api         = await response.json();
    const totalPaginas = api?.paginacao?.paginaTotal ?? 1;
    const itens        = (api?.itens ?? []) as Record<string, unknown>[];

    // ── Filtro leilão ──────────────────────────────────────────────
    const itensFiltrados  = itens.filter(i => !ehLeilao(i));
    const filtradosLeilao = itens.length - itensFiltrados.length;

    console.info(JSON.stringify({
      msg: 'backfill_filtro',
      pagina,
      total_recebidos:  itens.length,
      filtrados_leilao: filtradosLeilao,
      a_inserir:        itensFiltrados.length,
    }));

    const lote = itensFiltrados.map(item => ({
      advise_id_publicacao_cliente:  item.id,
      advise_id_publicacao:          item.idPublicacao,
      advise_id_mov_usuario_cliente: item.idMovUsuarioCliente,
      advise_id_cliente:             item.idCliente,
      advise_id_usuario_cliente:     item.idUsuarioCliente,
      advise_cod_publicacao:         item.codPublicacao,
      advise_cod_diario:             item.codDiario,
      advise_cod_caderno:            item.codCaderno,
      advise_id_municipio:           item.idMunicipio,
      advise_id_caderno_diario_edicao: item.idCadernoDiarioEdicao,
      data_publicacao:               item.dataPublicacao    ? new Date(item.dataPublicacao as string)    : null,
      data_hora_movimento:           item.dataHoraMovimento ? new Date(item.dataHoraMovimento as string) : null,
      data_hora_cadastro:            item.dataHoraCadastro  ? new Date(item.dataHoraCadastro as string)  : null,
      ativo:                         item.ativo,
      ativo_publicacao:              item.ativoPublicacao,
      ano_publicacao:                item.anoPublicacao,
      edicao_diario:                 item.edicaoDiario,
      cidade_comarca_descricao:      item.cidadeComarcaDescricao,
      vara_descricao:                item.varaDescricao,
      pagina_inicial_publicacao:     item.paginaInicialPublicacao,
      pagina_final_publicacao:       item.paginaFinalPublicacao,
      conteudo:                      item.conteudo,
      despacho:                      item.despacho,
      corrigido:                     item.corrigido,
      lido:                          item.lido,
      nome_diario:                   item.nomeDiario,
      descricao_diario:              item.descricaoDiario,
      nome_caderno_diario:           item.nomeCadernoDiario,
      descricao_caderno_diario:      item.descricaoCadernoDiario,
      nome_cliente:                  item.nomeCliente,
      nome_usuario_cliente:          item.nomeUsuarioCliente,
      numero_processo_api:           item.numero,
      raw_payload:                   item,
    }));

    if (lote.length > 0) {
      const { error } = await supabase
        .from('publicacoes')
        .upsert(lote, { onConflict: 'advise_id_publicacao_cliente' });
      if (error) throw error;
    }

    // Avança página (ou reseta se chegou ao fim)
    const proximaPagina = pagina < totalPaginas ? pagina + 1 : 1;

    await supabase.from('advise_sync_status').update({
      pagina_atual:        proximaPagina,
      total_paginas:       totalPaginas,
      ultima_execucao:     new Date(),
      registros_importados: (sync.registros_importados ?? 0) + lote.length,
    }).eq('id', sync.id);

    return new Response(JSON.stringify({
      pagina_processada:   pagina,
      proxima_pagina:      proximaPagina,
      total_paginas:       totalPaginas,
      registros:           lote.length,
      filtrados_leilao:    filtradosLeilao,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error(JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }));
    return new Response(
      JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
