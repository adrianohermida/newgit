/**
 * advise-drain-by-date  v2
 * 
 * Drena a API Advise usando filtros de data (janelas de N dias),
 * priorizando os últimos 120 dias. Mais eficiente que paginação reversa.
 * 
 * v2 changes:
 *   - Janela padrão reduzida de 7 para 2 dias (evita timeout)
 *   - Timeout da API aumentado de 20s para 45s
 *   - maxPaginas por janela reduzido de 20 para 10
 *   - Retry automático com backoff em caso de timeout
 *   - Vinculação de processos para novas publicações
 * 
 * Parâmetros:
 *   - dataInicio: data de início (YYYY-MM-DD), padrão: hoje - 120 dias
 *   - dataFim: data de fim (YYYY-MM-DD), padrão: hoje
 *   - janelaDias: tamanho da janela em dias (padrão: 2)
 *   - maxJanelas: máximo de janelas por execução (padrão: 3)
 *   - lido: filtro de lido (padrão: "false")
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

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

async function fetchComRetry(url: string, opts: RequestInit, maxRetries = 2): Promise<Response> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(45_000), // 45s timeout
      });
      return resp;
    } catch (e) {
      if (i === maxRetries) throw e;
      const wait = 2000 * (i + 1);
      console.warn(`Retry ${i + 1}/${maxRetries} após ${wait}ms:`, String(e));
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error("fetchComRetry esgotado");
}

async function buscarJanela(dataIni: string, dataFim: string, lido: string): Promise<{
  itens: Record<string, unknown>[];
  total: number;
  paginas: number;
}> {
  const allItens: Record<string, unknown>[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  
  while (pagina <= totalPaginas && pagina <= 10) { // máx 10 páginas por janela
    const params = new URLSearchParams({
      paginaAtual: String(pagina),
      registrosPorPagina: '100',
      dataMovimentoInicial: dataIni,
      dataMovimentoFinal: dataFim,
      Lido: lido,
    });
    
    const resp = await fetchComRetry(`${ADVISE_URL}?${params}`, {
      headers: { Authorization: `Bearer ${ADVISE_TOKEN}` },
    });
    
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error(`API erro ${resp.status} para ${dataIni}-${dataFim} Lido=${lido}:`, err.slice(0, 200));
      break;
    }
    
    const api = await resp.json();
    const pag = api?.paginacao ?? {};
    totalPaginas = Number(pag.paginaTotal ?? 1);
    const itens = Array.isArray(api?.itens) ? api.itens : [];
    allItens.push(...itens);
    
    if (itens.length === 0) break;
    pagina++;
    
    if (pagina <= totalPaginas) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  return { itens: allItens, total: allItens.length, paginas: totalPaginas };
}

async function salvarPublicacoes(publicacoes: Record<string, unknown>[]): Promise<{
  novas: number; duplicadas: number; erros: number;
}> {
  if (publicacoes.length === 0) return { novas: 0, duplicadas: 0, erros: 0 };
  
  let novas = 0, duplicadas = 0, erros = 0;
  const CHUNK = 25;
  
  for (let i = 0; i < publicacoes.length; i += CHUNK) {
    const chunk = publicacoes.slice(i, i + CHUNK);
    const ids = chunk.map(r => r.advise_id_publicacao_cliente).filter(Boolean);
    
    try {
      const { data: existing } = await supabase
        .from("publicacoes")
        .select("advise_id_publicacao_cliente")
        .in("advise_id_publicacao_cliente", ids as number[]);
      
      const existingSet = new Set((existing ?? []).map((r: Record<string, unknown>) => r.advise_id_publicacao_cliente));
      const novasChunk = chunk.filter(r => !existingSet.has(r.advise_id_publicacao_cliente));
      duplicadas += chunk.length - novasChunk.length;
      
      if (novasChunk.length > 0) {
        const { error } = await supabase.from("publicacoes").insert(novasChunk);
        if (error) {
          // Tentar upsert se insert falhar
          const { error: e2 } = await supabase.from("publicacoes")
            .upsert(novasChunk, { onConflict: "advise_id_publicacao_cliente", ignoreDuplicates: true });
          if (e2) { erros += novasChunk.length; console.error("Erro upsert:", e2.message); }
          else novas += novasChunk.length;
        } else {
          novas += novasChunk.length;
        }
      }
    } catch (e) {
      erros += chunk.length;
      console.error("Erro chunk:", String(e));
    }
  }
  
  return { novas, duplicadas, erros };
}

async function vincularProcessos(publicacoes: Record<string, unknown>[]): Promise<number> {
  let vinculados = 0;
  const comNumero = publicacoes.filter(p => p.numero_processo_api);
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  
  const hoje = new Date();
  const dataFimParam = String(body.dataFim ?? url.searchParams.get("dataFim") ?? formatDate(hoje));
  const dataInicioParam = String(body.dataInicio ?? url.searchParams.get("dataInicio") ?? formatDate(addDays(hoje, -120)));
  const janelaDias = Number(body.janelaDias ?? url.searchParams.get("janelaDias") ?? 2);
  const maxJanelas = Number(body.maxJanelas ?? url.searchParams.get("maxJanelas") ?? 3);
  const lidoParam = String(body.lido ?? url.searchParams.get("lido") ?? "false");
  
  const dataFim = new Date(dataFimParam);
  const dataInicio = new Date(dataInicioParam);
  
  // Gerar janelas de data (mais recente primeiro)
  const janelas: Array<{ini: string; fim: string}> = [];
  let cursor = new Date(dataFim);
  
  while (cursor > dataInicio && janelas.length < maxJanelas) {
    const fim = new Date(cursor);
    const ini = addDays(cursor, -janelaDias);
    const iniReal = ini < dataInicio ? dataInicio : ini;
    janelas.push({ ini: formatDate(iniReal), fim: formatDate(fim) });
    cursor = addDays(cursor, -(janelaDias + 1));
  }
  
  const resultado = {
    janelas_processadas: 0,
    total_novas: 0,
    total_duplicadas: 0,
    total_erros: 0,
    total_vinculados: 0,
    detalhes: [] as Record<string, unknown>[],
  };
  
  for (const janela of janelas) {
    console.log(`Processando janela ${janela.ini} a ${janela.fim} (Lido=${lidoParam})`);
    
    try {
      const { itens, total, paginas } = await buscarJanela(janela.ini, janela.fim, lidoParam);
      const publicacoes = itens.map(buildRecord);
      const { novas, duplicadas, erros } = await salvarPublicacoes(publicacoes);
      
      // Vincular processos para novas publicações
      let vinculados = 0;
      if (novas > 0) {
        vinculados = await vincularProcessos(publicacoes);
      }
      
      resultado.janelas_processadas++;
      resultado.total_novas += novas;
      resultado.total_duplicadas += duplicadas;
      resultado.total_erros += erros;
      resultado.total_vinculados += vinculados;
      resultado.detalhes.push({
        janela: `${janela.ini} a ${janela.fim}`,
        api_total: total,
        api_paginas: paginas,
        novas,
        duplicadas,
        erros,
        vinculados,
      });
      
      // Disparar sync-worker se houve novas publicações
      if (novas > 0) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-worker`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(8_000),
        }).catch(e => console.warn("sync-worker:", String(e)));
      }
    } catch (e) {
      console.error(`Erro na janela ${janela.ini}-${janela.fim}:`, String(e));
      resultado.detalhes.push({ janela: `${janela.ini} a ${janela.fim}`, erro: String(e) });
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Notificar Slack se houve novas publicações ou erros
  if (resultado.total_novas > 0 || resultado.total_erros > 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dotobot-slack`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "notify_cron_status",
        job: "advise-drain",
        status: resultado.total_erros === 0 ? "ok" : "aviso",
        inseridas: resultado.total_novas,
        erros: resultado.total_erros,
        detalhes: `${resultado.janelas_processadas} janela(s), ${resultado.total_duplicadas} duplicadas, ${resultado.total_vinculados} vinculados`,
      }),
      signal: AbortSignal.timeout(8_000),
    }).catch(e => console.warn("dotobot-slack:", String(e)));
  }

  return new Response(JSON.stringify(resultado, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
