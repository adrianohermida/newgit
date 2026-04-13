import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * sync-advise-realtime
 *
 * Ingestao incremental legada do Advise.
 *
 * Regras atuais:
 * 1. Persiste todas as publicacoes retornadas pela API.
 * 2. Itens de leilao continuam no estoque bruto e so sao ignorados
 *    operacionalmente no portal/CRM.
 * 3. Atualiza o cursor de movimento com o item mais recente recebido,
 *    sem perder progresso por causa de leiloes.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";
const REGISTROS_POR_PAGINA = 100;
const MAX_PAGINAS_POR_EXECUCAO = Math.max(1, Number(Deno.env.get("ADVISE_REALTIME_MAX_PAGINAS") ?? "20"));

function ehLeilao(item: Record<string, unknown>): boolean {
  const palavras = Array.isArray(item.palavrasChave) ? item.palavrasChave : [];
  return palavras.some((value) => typeof value === "string" && /leil[ãõa][oe]?s?/i.test(value));
}

Deno.serve(async () => {
  try {
    const { data: sync } = await supabase
      .from("advise_sync_status")
      .select("*")
      .limit(1)
      .maybeSingle();

    const ultimaDataMovimento = sync?.ultima_data_movimento ?? "2000-01-01";

    let pagina = 1;
    let totalPaginas = 1;
    let totalRegistros = 0;
    let totalItensRecebidos = 0;
    let publicacoesLeilao = 0;
    let paginasProcessadas = 0;
    let ultimaMov = sync?.ultima_data_movimento ?? null;

    do {
      const response = await fetch(
        `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=${REGISTROS_POR_PAGINA}&dataMovimentoInicial=${ultimaDataMovimento}`,
        { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` } }
      );
      if (!response.ok) throw new Error(`Erro API Advise: ${await response.text()}`);

      const api = await response.json();
      const itens = Array.isArray(api?.itens) ? api.itens : [];
      totalPaginas = Number(api?.paginacao?.paginaTotal ?? totalPaginas ?? 1) || 1;
      totalRegistros = Number(api?.paginacao?.totalRegistros ?? api?.totalRegistros ?? totalRegistros ?? itens.length) || totalRegistros;
      totalItensRecebidos += itens.length;
      publicacoesLeilao += itens.filter((item) => ehLeilao(item)).length;
      paginasProcessadas += 1;

      console.info(JSON.stringify({
        ts: new Date().toISOString(),
        msg: "advise_realtime",
        pagina,
        total_paginas: totalPaginas,
        total_recebidos_pagina: itens.length,
        total_recebidos_acumulado: totalItensRecebidos,
        publicacoes_leilao_acumulado: publicacoesLeilao,
      }));

      const publicacoes = itens.map((item) => ({
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

      if (publicacoes.length > 0) {
        const { error } = await supabase
          .from("publicacoes")
          .upsert(publicacoes, { onConflict: "advise_id_publicacao_cliente" });
        if (error) throw error;
      }

      const movimentosPagina = itens
        .map((item) => String(item?.dataHoraMovimento ?? ""))
        .filter(Boolean)
        .sort()
        .reverse();
      if (movimentosPagina[0]) {
        ultimaMov = movimentosPagina[0];
      }

      pagina += 1;
    } while (pagina <= totalPaginas && paginasProcessadas < MAX_PAGINAS_POR_EXECUCAO);

    if (sync?.id) {
      await supabase
        .from("advise_sync_status")
        .update({
          ultima_data_movimento: ultimaMov,
          ultima_execucao: new Date(),
          total_registros: totalRegistros,
          status: "idle",
        })
        .eq("id", sync.id);
    }

    return new Response(
      JSON.stringify({
        novas_publicacoes: totalItensRecebidos,
        paginas_processadas: paginasProcessadas,
        total_paginas: totalPaginas,
        publicacoes_leilao: publicacoesLeilao,
        total_api: totalItensRecebidos,
        total_registros_api: totalRegistros,
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
