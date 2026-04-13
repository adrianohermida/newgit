import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * sync-advise-publicacoes
 *
 * Backfill paginado legado do Advise.
 *
 * Regras atuais:
 * 1. Persiste todas as publicacoes em judiciario.publicacoes.
 * 2. Itens com palavras-chave de leilao continuam no banco e so sao
 *    excluidos operacionalmente do portal/CRM.
 * 3. Mantem o raw_payload completo.
 * 4. Atualiza o cursor da pagina e o total reportado pela API para
 *    observabilidade consistente no portal.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";
const REGISTROS_POR_PAGINA = 100;

function ehLeilao(item: Record<string, unknown>): boolean {
  const palavras = Array.isArray(item.palavrasChave) ? item.palavrasChave : [];
  return palavras.some((value) => typeof value === "string" && /leil[ãõa][oe]?s?/i.test(value));
}

Deno.serve(async () => {
  try {
    let { data: sync } = await supabase
      .from("advise_sync_status")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!sync) {
      const { data, error } = await supabase
        .from("advise_sync_status")
        .insert({ pagina_atual: 1, registros_importados: 0, status: "idle" })
        .select()
        .single();
      if (error) throw error;
      sync = data;
    }

    const pagina = Math.max(1, Number(sync.pagina_atual ?? sync.ultima_pagina ?? 1));
    console.info(JSON.stringify({ ts: new Date().toISOString(), msg: "backfill_pagina", pagina }));

    const response = await fetch(
      `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=${REGISTROS_POR_PAGINA}&Lido=false`,
      { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` } }
    );
    if (!response.ok) throw new Error(`Erro API Advise: ${await response.text()}`);

    const api = await response.json();
    const totalPaginas = Number(api?.paginacao?.paginaTotal ?? 1) || 1;
    const totalRegistros = Number(api?.paginacao?.totalRegistros ?? api?.totalRegistros ?? 0) || 0;
    const itens = Array.isArray(api?.itens) ? api.itens : [];
    const publicacoesLeilao = itens.filter((item) => ehLeilao(item)).length;

    console.info(JSON.stringify({
      msg: "backfill_filtro",
      pagina,
      total_recebidos: itens.length,
      publicacoes_leilao: publicacoesLeilao,
      a_persistir: itens.length,
    }));

    const lote = itens.map((item) => ({
      advise_id_publicacao_cliente: item.id,
      advise_id_publicacao: item.idPublicacao,
      advise_id_mov_usuario_cliente: item.idMovUsuarioCliente,
      advise_id_cliente: item.idCliente,
      advise_id_usuario_cliente: item.idUsuarioCliente,
      advise_cod_publicacao: item.codPublicacao,
      advise_cod_diario: item.codDiario,
      advise_cod_caderno: item.codCaderno,
      advise_id_municipio: item.idMunicipio,
      advise_id_caderno_diario_edicao: item.idCadernoDiarioEdicao,
      data_publicacao: item.dataPublicacao ? new Date(item.dataPublicacao as string) : null,
      data_hora_movimento: item.dataHoraMovimento ? new Date(item.dataHoraMovimento as string) : null,
      data_hora_cadastro: item.dataHoraCadastro ? new Date(item.dataHoraCadastro as string) : null,
      ativo: item.ativo,
      ativo_publicacao: item.ativoPublicacao,
      ano_publicacao: item.anoPublicacao,
      edicao_diario: item.edicaoDiario,
      cidade_comarca_descricao: item.cidadeComarcaDescricao,
      vara_descricao: item.varaDescricao,
      pagina_inicial_publicacao: item.paginaInicialPublicacao,
      pagina_final_publicacao: item.paginaFinalPublicacao,
      conteudo: item.conteudo,
      despacho: item.despacho,
      corrigido: item.corrigido,
      lido: item.lido,
      nome_diario: item.nomeDiario,
      descricao_diario: item.descricaoDiario,
      nome_caderno_diario: item.nomeCadernoDiario,
      descricao_caderno_diario: item.descricaoCadernoDiario,
      nome_cliente: item.nomeCliente,
      nome_usuario_cliente: item.nomeUsuarioCliente,
      numero_processo_api: item.numero,
      raw_payload: item,
    }));

    if (lote.length > 0) {
      const { error } = await supabase
        .from("publicacoes")
        .upsert(lote, { onConflict: "advise_id_publicacao_cliente" });
      if (error) throw error;
    }

    const proximaPagina = pagina < totalPaginas ? pagina + 1 : 1;

    await supabase
      .from("advise_sync_status")
      .update({
        pagina_atual: proximaPagina,
        ultima_pagina: pagina,
        total_paginas: totalPaginas,
        total_registros: totalRegistros,
        ultima_execucao: new Date(),
        registros_importados: Number(sync.registros_importados ?? 0) + lote.length,
        status: pagina < totalPaginas ? "idle" : "concluido",
      })
      .eq("id", sync.id);

    return new Response(
      JSON.stringify({
        pagina_processada: pagina,
        proxima_pagina: proximaPagina,
        total_paginas: totalPaginas,
        total_registros_api: totalRegistros,
        registros: lote.length,
        publicacoes_leilao: publicacoesLeilao,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error(JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }));
    return new Response(
      JSON.stringify({ erro: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
