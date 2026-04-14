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
const REGISTROS_POR_PAGINA_PADRAO = 100;
const PAGINAS_POR_EXECUCAO_PADRAO = 5;
const UPSERT_CHUNK_SIZE = 25;

function buildPublicacaoRecord(item: any) {
  return {
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
    data_publicacao: item.dataPublicacao ? new Date(item.dataPublicacao).toISOString() : null,
    data_hora_movimento: item.dataHoraMovimento ? new Date(item.dataHoraMovimento).toISOString() : null,
    data_hora_cadastro: item.dataHoraCadastro ? new Date(item.dataHoraCadastro).toISOString() : null,
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
  };
}

async function checkpointSync(syncId: string, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("advise_sync_status")
    .update(values)
    .eq("id", syncId);
  if (error) throw error;
}

async function upsertChunk(rows: any[]) {
  const { error } = await supabase
    .from("publicacoes")
    .upsert(rows, { onConflict: "advise_id_publicacao_cliente" });
  if (error) throw error;
}

async function upsertPublicacoesResilient(publicacoes: any[], pagina: number) {
  let inseridas = 0;
  let erros = 0;

  for (let index = 0; index < publicacoes.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = publicacoes.slice(index, index + UPSERT_CHUNK_SIZE);
    try {
      await upsertChunk(chunk);
      inseridas += chunk.length;
    } catch (chunkError) {
      console.error("Falha em lote do backfill; tentando item a item", {
        pagina,
        index,
        size: chunk.length,
        error: chunkError instanceof Error ? chunkError.message : String(chunkError),
      });
      for (const row of chunk) {
        try {
          await upsertChunk([row]);
          inseridas += 1;
        } catch (rowError) {
          erros += 1;
          console.error("Falha ao persistir publicacao individual do backfill", {
            pagina,
            advise_id_publicacao_cliente: row?.advise_id_publicacao_cliente,
            error: rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }
    }
  }

  return { inseridas, erros };
}

serve(async (req) => {
  try {
    console.log("Iniciando sincronizacao Advise");
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method !== "GET") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    const paginasPorExecucao = Math.max(
      1,
      Math.min(
        Number(
          body.maxPaginas ??
          body.limit ??
          url.searchParams.get("maxPaginas") ??
          url.searchParams.get("limit") ??
          PAGINAS_POR_EXECUCAO_PADRAO
        ) || PAGINAS_POR_EXECUCAO_PADRAO,
        25
      )
    );
    const registrosPorPagina = Math.max(
      1,
      Math.min(
        Number(
          body.porPagina ??
          url.searchParams.get("porPagina") ??
          REGISTROS_POR_PAGINA_PADRAO
        ) || REGISTROS_POR_PAGINA_PADRAO,
        100
      )
    );

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
    let registrosComErro = 0;
    let paginasProcessadas = 0;
    let ultimaPaginaProcessada = paginaInicial - 1;

    for (let i = 0; i < paginasPorExecucao; i += 1) {
      const pagina = paginaInicial + i;

      if (totalPaginas && pagina > totalPaginas) break;

      console.log("Importando pagina:", pagina);

      const response = await fetch(
        `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=${registrosPorPagina}`,
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

      const publicacoes = itens.map((item: any) => buildPublicacaoRecord(item));

      if (publicacoes.length > 0) {
        const persistencia = await upsertPublicacoesResilient(publicacoes, pagina);
        registrosImportados += persistencia.inseridas;
        registrosComErro += persistencia.erros;
      }

      paginasProcessadas += 1;
      ultimaPaginaProcessada = pagina;
      await checkpointSync(sync.id, {
        pagina_atual: pagina + 1,
        ultima_pagina: pagina,
        total_paginas: totalPaginas,
        total_registros: totalRegistrosApi,
        ultima_execucao: new Date().toISOString(),
        status: "running",
      });
    }

    const concluiu = Boolean(totalPaginas && ultimaPaginaProcessada >= totalPaginas);
    const execucaoParcial = !concluiu && Boolean(totalPaginas && ultimaPaginaProcessada >= paginaInicial);
    const proximaPagina = concluiu
      ? 1
      : Math.max(paginaInicial, ultimaPaginaProcessada + 1);

    await checkpointSync(sync.id, {
        pagina_atual: proximaPagina,
        ultima_pagina: ultimaPaginaProcessada >= paginaInicial ? ultimaPaginaProcessada : sync.ultima_pagina ?? null,
        total_paginas: totalPaginas,
        total_registros: totalRegistrosApi,
        ultima_execucao: new Date().toISOString(),
        status: concluiu ? "concluido" : "running",
      });

    return new Response(
      JSON.stringify({
        status: concluiu ? "concluido" : "parcial",
        execucao_parcial: execucaoParcial,
        pagina_inicial: paginaInicial,
        paginas_planejadas: paginasPorExecucao,
        paginas_processadas: paginasProcessadas,
        ultima_pagina_processada: ultimaPaginaProcessada >= paginaInicial ? ultimaPaginaProcessada : null,
        registros_importados: registrosImportados,
        registros_com_erro: registrosComErro,
        total_paginas: totalPaginas,
        total_registros_api: totalRegistrosApi,
        proxima_pagina: proximaPagina,
        por_pagina: registrosPorPagina,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro na sincronizacao:", error);

    try {
      const { data: sync } = await supabase
        .from("advise_sync_status")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (sync?.id) {
        await checkpointSync(sync.id, {
          status: "erro",
          ultima_execucao: new Date().toISOString(),
        });
      }
    } catch (checkpointError) {
      console.error("Falha ao registrar erro no cursor do backfill", checkpointError);
    }

    return new Response(
      JSON.stringify({
        status: "erro",
        mensagem: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
