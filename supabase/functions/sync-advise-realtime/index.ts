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

    const response = await fetch(
      `${ADVISE_URL}?paginaAtual=1&registrosPorPagina=100&Lido=false&dataMovimentoInicial=${ultimaDataMovimento}`,
      { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` } }
    );
    if (!response.ok) throw new Error(`Erro API Advise: ${await response.text()}`);

    const api = await response.json();
    const itens = Array.isArray(api?.itens) ? api.itens : [];
    const totalRegistros = Number(api?.paginacao?.totalRegistros ?? api?.totalRegistros ?? itens.length) || itens.length;
    const publicacoesLeilao = itens.filter((item) => ehLeilao(item)).length;

    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      msg: "advise_realtime",
      total_recebidos: itens.length,
      publicacoes_leilao: publicacoesLeilao,
      a_persistir: itens.length,
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

    const ultimaMov = itens.length
      ? (itens[0].dataHoraMovimento as string | null)
      : sync?.ultima_data_movimento ?? null;

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
        novas_publicacoes: publicacoes.length,
        publicacoes_leilao: publicacoesLeilao,
        total_api: itens.length,
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
