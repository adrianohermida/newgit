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
const REGISTROS_POR_PAGINA = 100;
const PAGINAS_POR_EXECUCAO = 25;

serve(async () => {
  try {
    console.log("Iniciando sincronizacao Advise");

    let { data: sync } = await supabase
      .from("advise_sync_status")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (sync?.total_paginas && sync?.ultima_pagina >= sync?.total_paginas) {
      console.log("Backfill finalizado");
      return new Response(
        JSON.stringify({
          status: "concluido",
          paginas_importadas: sync.total_paginas,
          total_registros_api: sync.total_registros ?? 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (!sync) {
      console.log("Criando registro inicial de sincronizacao");

      const { data: novo, error } = await supabase
        .from("advise_sync_status")
        .insert({
          fonte: "ADVISE",
          ultima_pagina: 1,
          total_paginas: null,
          total_registros: 0,
          status: "idle",
        })
        .select()
        .single();

      if (error) throw error;
      sync = novo;
    }

    const paginaInicial = Math.max(1, Number(sync.pagina_atual ?? sync.ultima_pagina ?? 1));
    let totalPaginas = Number(sync.total_paginas ?? 0) || null;
    let totalRegistrosApi = Number(sync.total_registros ?? 0) || 0;
    let registrosImportados = 0;
    let paginasProcessadas = 0;
    let ultimaPaginaProcessada = paginaInicial - 1;

    for (let i = 0; i < PAGINAS_POR_EXECUCAO; i += 1) {
      const pagina = paginaInicial + i;

      if (totalPaginas && pagina > totalPaginas) break;

      console.log("Importando pagina:", pagina);

      const response = await fetch(
        `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=${REGISTROS_POR_PAGINA}`,
        {
          headers: {
            Authorization: `Bearer ${ADVISE_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const erro = await response.text();
        throw new Error(`Erro API Advise (${response.status}): ${erro}`);
      }

      const api = await response.json();
      totalPaginas = Number(api?.paginacao?.paginaTotal ?? totalPaginas ?? 0) || totalPaginas;
      totalRegistrosApi = Number(api?.paginacao?.totalRegistros ?? api?.totalRegistros ?? totalRegistrosApi ?? 0) || totalRegistrosApi;

      const itens = Array.isArray(api?.itens) ? api.itens : [];
      console.log("Publicacoes recebidas:", itens.length);

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
        raw_payload: item,
      }));

      if (publicacoes.length > 0) {
        const { error } = await supabase
          .from("publicacoes")
          .upsert(publicacoes, { onConflict: "advise_id_publicacao_cliente" });

        if (error) throw error;
        registrosImportados += publicacoes.length;
      }

      paginasProcessadas += 1;
      ultimaPaginaProcessada = pagina;
    }

    const concluiu = Boolean(totalPaginas && ultimaPaginaProcessada >= totalPaginas);
    const execucaoParcial = !concluiu && Boolean(totalPaginas && ultimaPaginaProcessada >= paginaInicial);
    const proximaPagina = concluiu
      ? 1
      : Math.max(paginaInicial, ultimaPaginaProcessada + 1);

    const { error: updateError } = await supabase
      .from("advise_sync_status")
      .update({
        pagina_atual: proximaPagina,
        ultima_pagina: ultimaPaginaProcessada >= paginaInicial ? ultimaPaginaProcessada : sync.ultima_pagina ?? null,
        total_paginas: totalPaginas,
        total_registros: totalRegistrosApi,
        ultima_execucao: new Date(),
        status: concluiu ? "concluido" : "running",
      })
      .eq("id", sync.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        status: concluiu ? "concluido" : "parcial",
        execucao_parcial: execucaoParcial,
        pagina_inicial: paginaInicial,
        paginas_processadas: paginasProcessadas,
        ultima_pagina_processada: ultimaPaginaProcessada >= paginaInicial ? ultimaPaginaProcessada : null,
        registros_importados: registrosImportados,
        total_paginas: totalPaginas,
        total_registros_api: totalRegistrosApi,
        proxima_pagina: proximaPagina,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro na sincronizacao:", error);

    return new Response(
      JSON.stringify({
        status: "erro",
        mensagem: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
