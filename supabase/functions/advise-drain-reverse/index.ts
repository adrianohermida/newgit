/**
 * advise-drain-reverse
 *
 * Drena a API Advise de forma REVERSA (últimas páginas primeiro),
 * priorizando publicações recentes. Usa a tabela judiciario.advise_drain_cursor
 * para manter o estado entre execuções.
 *
 * Parâmetros (query string ou body JSON):
 *   - maxPaginas: número de páginas por execução (padrão: 5, máx: 15)
 *   - porPagina: registros por página (padrão: 100, máx: 100)
 *   - resetar: "true" para reiniciar o cursor da última página
 *   - totalPaginas: forçar o total de páginas (evita chamada inicial à API)
 *   - paginaInicial: forçar a página de início (override do cursor)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";
const CURSOR_TABLE = "advise_drain_cursor";
const UPSERT_CHUNK = 20;

// Total de páginas padrão (baseado no último sync_status conhecido)
const TOTAL_PAGINAS_DEFAULT = 2034;

function buildRecord(item: Record<string, unknown>) {
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
    data_publicacao: item.dataPublicacao ? new Date(String(item.dataPublicacao)).toISOString() : null,
    data_hora_movimento: item.dataHoraMovimento ? new Date(String(item.dataHoraMovimento)).toISOString() : null,
    data_hora_cadastro: item.dataHoraCadastro ? new Date(String(item.dataHoraCadastro)).toISOString() : null,
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
    numero_processo_api: typeof item.numero === "string" ? item.numero.trim() : null,
    raw_payload: item,
  };
}

async function upsertBatch(publicacoes: Record<string, unknown>[], pagina: number) {
  let inseridas = 0;
  let duplicadas = 0;
  let erros = 0;
  for (let i = 0; i < publicacoes.length; i += UPSERT_CHUNK) {
    const chunk = publicacoes.slice(i, i + UPSERT_CHUNK);
    try {
      const ids = chunk.map((r) => r.advise_id_publicacao_cliente).filter(Boolean);
      const { data: existing } = await supabase
        .from("publicacoes")
        .select("advise_id_publicacao_cliente")
        .in("advise_id_publicacao_cliente", ids as number[]);
      const existingSet = new Set((existing ?? []).map((r: Record<string, unknown>) => r.advise_id_publicacao_cliente));
      const novas = chunk.filter((r) => !existingSet.has(r.advise_id_publicacao_cliente));
      duplicadas += chunk.length - novas.length;
      if (novas.length > 0) {
        const { error } = await supabase
          .from("publicacoes")
          .insert(novas);
        if (error) {
          // Tentar upsert se insert falhar (conflito)
          const { error: e2 } = await supabase
            .from("publicacoes")
            .upsert(novas, { onConflict: "advise_id_publicacao_cliente", ignoreDuplicates: true });
          if (e2) throw e2;
        }
        inseridas += novas.length;
      }
    } catch (e) {
      console.error("Erro no chunk", { pagina, i, erro: String(e) });
      erros += chunk.length;
    }
  }
  return { inseridas, duplicadas, erros };
}

async function vincularProcessos(publicacoes: Record<string, unknown>[]) {
  let vinculados = 0;
  const comNumero = publicacoes.filter((p) => p.numero_processo_api);
  for (const pub of comNumero) {
    const cnj = String(pub.numero_processo_api).trim();
    if (!cnj) continue;
    const { data: proc } = await supabase
      .from("processos")
      .select("id")
      .eq("numero_cnj", cnj)
      .limit(1)
      .maybeSingle();
    if (proc?.id) {
      await supabase
        .from("publicacoes")
        .update({ processo_id: proc.id })
        .eq("advise_id_publicacao_cliente", pub.advise_id_publicacao_cliente)
        .is("processo_id", null);
      vinculados++;
    }
  }
  return vinculados;
}

async function dispararSyncWorker() {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  const maxPaginas = Math.max(1, Math.min(
    Number(body.maxPaginas ?? url.searchParams.get("maxPaginas") ?? 5), 15
  ));
  const porPagina = Math.max(10, Math.min(
    Number(body.porPagina ?? url.searchParams.get("porPagina") ?? 100), 100
  ));
  const resetar = (body.resetar ?? url.searchParams.get("resetar")) === "true";
  const totalPaginasParam = Number(body.totalPaginas ?? url.searchParams.get("totalPaginas") ?? 0);
  const paginaInicialParam = Number(body.paginaInicial ?? url.searchParams.get("paginaInicial") ?? 0);

  // Buscar cursor atual
  let { data: cursor } = await supabase
    .from(CURSOR_TABLE)
    .select("*")
    .limit(1)
    .maybeSingle();

  // Determinar total de páginas
  // Prioridade: parâmetro > cursor existente > default
  let totalPaginas = totalPaginasParam || cursor?.total_paginas || TOTAL_PAGINAS_DEFAULT;

  // Se não temos cursor ou foi solicitado reset, inicializar
  if (!cursor || resetar) {
    // Tentar obter total de páginas da API apenas se não temos referência
    if (!totalPaginasParam && !cursor?.total_paginas) {
      try {
        const primeiraResp = await fetch(
          `${ADVISE_URL}?paginaAtual=1&registrosPorPagina=1`,
          { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` }, signal: AbortSignal.timeout(12_000) }
        );
        if (primeiraResp.ok) {
          const meta = await primeiraResp.json();
          totalPaginas = Number(meta?.paginacao?.paginaTotal ?? TOTAL_PAGINAS_DEFAULT);
        }
      } catch (e) {
        console.warn("Não foi possível obter total de páginas da API, usando default:", TOTAL_PAGINAS_DEFAULT, String(e));
        totalPaginas = TOTAL_PAGINAS_DEFAULT;
      }
    }

    const novoValor = {
      pagina_atual: paginaInicialParam || totalPaginas,
      total_paginas: totalPaginas,
      total_registros: totalPaginas * 100,
      status: "running",
      ultima_execucao: new Date().toISOString(),
      novas_total: 0,
      duplicadas_total: 0,
    };
    if (cursor) {
      await supabase.from(CURSOR_TABLE).update(novoValor).eq("id", cursor.id);
      cursor = { ...cursor, ...novoValor };
    } else {
      const { data: novo } = await supabase.from(CURSOR_TABLE).insert(novoValor).select().single();
      cursor = novo;
    }
    console.log("Cursor inicializado/resetado na página:", novoValor.pagina_atual, "de", totalPaginas);
  }

  let paginaAtual = paginaInicialParam || Number(cursor?.pagina_atual ?? totalPaginas);

  // Se chegou ao início, reiniciar da última página (ciclo contínuo)
  if (paginaAtual < 1) {
    paginaAtual = totalPaginas;
    await supabase.from(CURSOR_TABLE).update({
      pagina_atual: totalPaginas,
      status: "reiniciando",
    }).eq("id", cursor!.id);
    console.log("Cursor chegou ao início, reiniciando da última página:", totalPaginas);
  }

  let totalNovas = 0;
  let totalDuplicadas = 0;
  let totalErros = 0;
  let paginasProcessadas = 0;
  let ultimaPagina = paginaAtual;
  const todasPublicacoesNovas: Record<string, unknown>[] = [];

  for (let i = 0; i < maxPaginas; i++) {
    const pagina = paginaAtual - i;
    if (pagina < 1) break;

    console.log(`Processando página ${pagina}/${totalPaginas} (reversa)`);

    try {
      const resp = await fetch(
        `${ADVISE_URL}?paginaAtual=${pagina}&registrosPorPagina=${porPagina}`,
        { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` }, signal: AbortSignal.timeout(18_000) }
      );
      if (!resp.ok) {
        console.error(`Erro API página ${pagina}: HTTP ${resp.status}`);
        totalErros++;
        continue;
      }
      const api = await resp.json();

      // Atualizar total de páginas se a API retornar um valor maior
      const totalPaginasApi = Number(api?.paginacao?.paginaTotal ?? 0);
      if (totalPaginasApi > totalPaginas) {
        totalPaginas = totalPaginasApi;
        await supabase.from(CURSOR_TABLE).update({ total_paginas: totalPaginas }).eq("id", cursor!.id);
      }

      const itens = Array.isArray(api?.itens) ? api.itens : [];
      const publicacoes = itens.map(buildRecord);

      if (publicacoes.length > 0) {
        const { inseridas, duplicadas, erros } = await upsertBatch(publicacoes, pagina);
        totalNovas += inseridas;
        totalDuplicadas += duplicadas;
        totalErros += erros;

        if (inseridas > 0) {
          todasPublicacoesNovas.push(...publicacoes.filter((p) => p.numero_processo_api));
        }
      }

      paginasProcessadas++;
      ultimaPagina = pagina;

      // Checkpoint após cada página
      await supabase.from(CURSOR_TABLE).update({
        pagina_atual: pagina - 1,
        ultima_execucao: new Date().toISOString(),
        status: "running",
        novas_total: (cursor?.novas_total ?? 0) + totalNovas,
        duplicadas_total: (cursor?.duplicadas_total ?? 0) + totalDuplicadas,
      }).eq("id", cursor!.id);

    } catch (e) {
      console.error(`Exceção na página ${pagina}:`, String(e));
      totalErros++;
    }

    // Pausa entre páginas para não sobrecarregar a API
    if (i < maxPaginas - 1) await new Promise((r) => setTimeout(r, 300));
  }

  // Vincular processos para as novas publicações
  const vinculados = totalNovas > 0 ? await vincularProcessos(todasPublicacoesNovas) : 0;

  // Disparar sync-worker se houve novas publicações
  let fsSync = null;
  if (totalNovas > 0) {
    fsSync = await dispararSyncWorker();
  }

  const proximaPagina = paginaAtual - maxPaginas;
  const concluiuCiclo = proximaPagina < 1;

  await supabase.from(CURSOR_TABLE).update({
    pagina_atual: concluiuCiclo ? totalPaginas : Math.max(1, proximaPagina),
    status: concluiuCiclo ? "reiniciando" : "running",
    ultima_execucao: new Date().toISOString(),
  }).eq("id", cursor!.id);

  return new Response(JSON.stringify({
    ok: true,
    pagina_inicial: paginaAtual,
    pagina_final: ultimaPagina,
    paginas_processadas: paginasProcessadas,
    total_paginas: totalPaginas,
    novas: totalNovas,
    duplicadas: totalDuplicadas,
    erros: totalErros,
    vinculados,
    proxima_pagina: concluiuCiclo ? totalPaginas : Math.max(1, proximaPagina),
    concluiu_ciclo: concluiuCiclo,
    fs_sync: fsSync,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
