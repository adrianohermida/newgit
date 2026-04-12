import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sync-advise-realtime  v7
 *
 * Melhorias vs v6:
 *  1. Filtro de leilão: exclui publicações cuja palavrasChave do Advise
 *     contenha "leilão" ou "leilões" (quase 200k, pertencem a outro projeto).
 *     Filtro aplicado na resposta da API ANTES do upsert — não persiste lixo.
 *  2. Salva raw_payload completo (já existia em v6, mantido).
 *  3. Atualiza ultima_data_movimento com a data mais recente dos itens filtrados.
 *  4. Log com contagem de filtrados para auditoria.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'judiciario' } }
);

const ADVISE_TOKEN = Deno.env.get('ADVISE_TOKEN')!;
const ADVISE_URL  = 'https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada';

// Retorna true se a publicação deve ser EXCLUÍDA (pertence ao projeto de leilões)
function ehLeilao(item: Record<string, unknown>): boolean {
  const palavras = (item.palavrasChave ?? []) as unknown[];
  return (palavras as string[]).some(
    p => typeof p === 'string' && /leil[ãõa][oe]?s?/i.test(p)
  );
}

Deno.serve(async () => {
  try {
    const { data: sync } = await supabase
      .from('advise_sync_status')
      .select('*').limit(1).maybeSingle();

    const ultimaDataMovimento = sync?.ultima_data_movimento ?? '2000-01-01';

    const response = await fetch(
      `${ADVISE_URL}?paginaAtual=1&registrosPorPagina=100&Lido=false&dataMovimentoInicial=${ultimaDataMovimento}`,
      { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` } }
    );
    if (!response.ok) throw new Error(`Erro API Advise: ${await response.text()}`);

    const api   = await response.json();
    const itens = (api?.itens ?? []) as Record<string, unknown>[];

    // ── Filtro leilão ──────────────────────────────────────────────────
    const itensFiltrados  = itens.filter(i => !ehLeilao(i));
    const filtradosLeilao = itens.length - itensFiltrados.length;

    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'advise_realtime',
      total_recebidos: itens.length,
      filtrados_leilao: filtradosLeilao,
      a_inserir: itensFiltrados.length,
    }));

    const publicacoes = itensFiltrados.map(item => ({
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
      data_publicacao:               item.dataPublicacao     ? new Date(item.dataPublicacao as string)     : null,
      data_hora_movimento:           item.dataHoraMovimento  ? new Date(item.dataHoraMovimento as string)  : null,
      data_hora_cadastro:            item.dataHoraCadastro   ? new Date(item.dataHoraCadastro as string)   : null,
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

    if (publicacoes.length > 0) {
      const { error } = await supabase
        .from('publicacoes')
        .upsert(publicacoes, { onConflict: 'advise_id_publicacao_cliente' });
      if (error) throw error;
    }

    // Atualiza cursor com a data mais recente dos itens FILTRADOS
    // (usa todos os itens para não perder o cursor por causa de leilões)
    const ultimaMov = itens.length
      ? (itens[0].dataHoraMovimento as string | null)
      : sync?.ultima_data_movimento;

    if (sync?.id) {
      await supabase.from('advise_sync_status').update({
        ultima_data_movimento: ultimaMov,
        ultima_execucao:       new Date(),
      }).eq('id', sync.id);
    }

    return new Response(JSON.stringify({
      novas_publicacoes:   publicacoes.length,
      filtrados_leilao:    filtradosLeilao,
      total_api:           itens.length,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error(JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }));
    return new Response(JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }), { status: 500 });
  }
});
