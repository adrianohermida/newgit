import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;

const ADVISE_URL =
  "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";

const PAGINAS_POR_EXECUCAO = 25;

serve(async () => {

  try {

    console.log("Iniciando sincronização Advise");

    let { data: sync } = await supabase
      .from("advise_sync_status")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (sync?.total_paginas && sync?.ultima_pagina >= sync?.total_paginas) {

      console.log("Backfill finalizado");

      return new Response(JSON.stringify({
        status: "concluido",
        paginas_importadas: sync.total_paginas
      }), {
        headers: { "Content-Type": "application/json" }
      });

    }  

    if (!sync) {

      console.log("Criando registro inicial de sincronização");

      const { data: novo, error } = await supabase
        .from("advise_sync_status")
        .insert({
          fonte: "ADVISE",
          ultima_pagina: 1,
          total_paginas: null,
          total_registros: 0,
          status: "idle"
        })
        .select()
        .single();

      if (error) throw error;

      sync = novo;
    }

    const paginaAtual = sync.ultima_pagina ?? 1;

    let totalPaginas = sync.total_paginas ?? null;

    let registrosImportados = 0;

    for (let i = 0; i < PAGINAS_POR_EXECUCAO; i++) {

      const pagina = paginaAtual + i;

      if (totalPaginas && pagina > totalPaginas) break;

      console.log("Importando página:", pagina);

      const response = await fetch(
        `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=100&Lido=false`,
        {
          headers: {
            Authorization: `Bearer ${ADVISE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {

        const erro = await response.text();

        throw new Error(`Erro API Advise (${response.status}): ${erro}`);

      }

      const api = await response.json();

      totalPaginas = api?.paginacao?.paginaTotal ?? totalPaginas;

      const itens = api?.itens ?? [];

      console.log("Publicações recebidas:", itens.length);

      const publicacoes = itens.map((item: any) => ({

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

        data_publicacao: item.dataPublicacao ? new Date(item.dataPublicacao) : null,
        data_hora_movimento: item.dataHoraMovimento ? new Date(item.dataHoraMovimento) : null,
        data_hora_cadastro: item.dataHoraCadastro ? new Date(item.dataHoraCadastro) : null,

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

        numero_processo_api: item.numero?.trim(),

        raw_payload: item

      }));

      if (publicacoes.length > 0) {

        const { error } = await supabase
          .from("publicacoes")
          .upsert(publicacoes, {
            onConflict: "advise_id_publicacao_cliente"
          });

        if (error) throw error;

        registrosImportados += publicacoes.length;
      }
    }

    const novaPagina = Math.min(
      paginaAtual + PAGINAS_POR_EXECUCAO,
      totalPaginas ?? paginaAtual + PAGINAS_POR_EXECUCAO
    );

    const { error: updateError } = await supabase
      .from("advise_sync_status")
      .update({
        ultima_pagina: novaPagina,
        total_paginas: totalPaginas,
        total_registros:
          (sync.total_registros ?? 0) + registrosImportados,
        ultima_execucao: new Date()
      })
      .eq("id", sync.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({

      pagina_inicial: paginaAtual,
      paginas_processadas: PAGINAS_POR_EXECUCAO,
      registros_importados: registrosImportados,
      total_paginas: totalPaginas

    }), {
      headers: { "Content-Type": "application/json" }
    });

  }

  catch (error: any) {

    console.error("Erro na sincronização:", error);

    return new Response(
      JSON.stringify({
        status: "erro",
        mensagem: error.message
      }),
      { status: 500 }
    );
  }

});
