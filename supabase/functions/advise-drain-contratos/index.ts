/**
 * advise-drain-contratos v1
 *
 * Drena a API Advise com throughput máximo para os contratos do escritório
 * (ADRIANO MENEZES HERMIDA MAIA + HERMIDA MAIA SOCIEDADE INDIVIDUAL DE ADVOCACIA).
 *
 * Estratégia:
 *   - Processa 1 semana da fila advise_backfill_queue por execução
 *   - Busca Lido=false E Lido=true (cobertura total)
 *   - Até 20 páginas × 100 registros = 2.000 publicações por chamada
 *   - Prioridade: semanas mais recentes primeiro (DESC)
 *   - Identifica publicações dos contratos pelo campo idUsuarioCliente
 *
 * IDs dos contratos:
 *   - ADRIANO MENEZES HERMIDA MAIA: idUsuarioCliente = 372004
 *   - HERMIDA MAIA SOCIEDADE INDIVIDUAL DE ADVOCACIA: idCliente = 142894 (variações)
 *
 * Rate limit: respeita 1.000 req/hora do Advise (máx ~20 req por execução)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";

// IDs dos contratos do escritório
const CONTRATO_ADRIANO_ID_USUARIO = 372004;
const CONTRATO_CLIENTE_ID = 142894;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "judiciario" } });
const dbPublic = createClient(SUPABASE_URL, SERVICE_KEY);

function parseISO(s: unknown): string | null {
  if (!s) return null;
  try { return new Date(String(s)).toISOString(); } catch { return String(s); }
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
    data_publicacao: parseISO(item.dataPublicacao),
    data_hora_movimento: parseISO(item.dataHoraMovimento),
    data_hora_cadastro: parseISO(item.dataHoraCadastro),
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

async function buscarPaginas(
  ini: string,
  fim: string,
  lido: string,
  maxPag = 20
): Promise<{ itens: Record<string, unknown>[]; totalPaginas: number; totalRegistros: number }> {
  const todos: Record<string, unknown>[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let totalRegistros = 0;

  while (pagina <= totalPaginas && pagina <= maxPag) {
    const params = new URLSearchParams({
      paginaAtual: String(pagina),
      registrosPorPagina: "100",
      dataMovimentoInicial: ini,
      dataMovimentoFinal: fim,
      Lido: lido,
    });

    const resp = await fetch(`${ADVISE_URL}?${params}`, {
      headers: { Authorization: `Bearer ${ADVISE_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (resp.status === 429) {
      console.warn(`Rate limit Advise (429) para ${ini}-${fim} Lido=${lido}`);
      break;
    }
    if (!resp.ok) {
      console.error(`API ${resp.status} para ${ini}-${fim} Lido=${lido}`);
      break;
    }

    const data = await resp.json();
    const pag = data?.paginacao ?? {};
    totalPaginas = Number(pag.paginaTotal ?? 1);
    totalRegistros = Number(pag.totalRegistros ?? todos.length);
    const itens = Array.isArray(data?.itens) ? data.itens : [];
    todos.push(...itens);

    if (itens.length === 0) break;
    pagina++;

    if (pagina <= totalPaginas && pagina <= maxPag) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return { itens: todos, totalPaginas, totalRegistros };
}

async function salvarPublicacoes(publicacoes: Record<string, unknown>[]): Promise<{
  novas: number; duplicadas: number; erros: number;
  contratos: { adriano: number; hermida_maia: number; outros: number };
}> {
  if (publicacoes.length === 0) return {
    novas: 0, duplicadas: 0, erros: 0,
    contratos: { adriano: 0, hermida_maia: 0, outros: 0 }
  };

  let novas = 0, duplicadas = 0, erros = 0;
  let adriano = 0, hermida_maia = 0, outros = 0;
  const CHUNK = 50;

  for (let i = 0; i < publicacoes.length; i += CHUNK) {
    const chunk = publicacoes.slice(i, i + CHUNK);
    const ids = chunk.map(r => r.advise_id_publicacao_cliente).filter(Boolean);

    try {
      const { data: existing } = await db
        .from("publicacoes")
        .select("advise_id_publicacao_cliente")
        .in("advise_id_publicacao_cliente", ids as number[]);

      const existingSet = new Set((existing ?? []).map((r: Record<string, unknown>) => r.advise_id_publicacao_cliente));
      const novasChunk = chunk.filter(r => !existingSet.has(r.advise_id_publicacao_cliente));
      duplicadas += chunk.length - novasChunk.length;

      // Contabilizar por contrato
      for (const pub of novasChunk) {
        const idUsuario = Number(pub.advise_id_usuario_cliente);
        const idCliente = Number(pub.advise_id_cliente);
        if (idUsuario === CONTRATO_ADRIANO_ID_USUARIO) adriano++;
        else if (idCliente === CONTRATO_CLIENTE_ID) hermida_maia++;
        else outros++;
      }

      if (novasChunk.length > 0) {
        const { error } = await db.from("publicacoes").upsert(novasChunk, {
          onConflict: "advise_id_publicacao_cliente",
          ignoreDuplicates: true,
        });
        if (error) {
          erros += novasChunk.length;
          console.error("Erro upsert:", error.message);
        } else {
          novas += novasChunk.length;
        }
      }
    } catch (e) {
      erros += chunk.length;
      console.error("Erro chunk:", String(e));
    }
  }

  return { novas, duplicadas, erros, contratos: { adriano, hermida_maia, outros } };
}

async function notificarSlack(msg: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/dotobot-slack`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "notify", message: msg }),
    });
  } catch { /* ignora erros de notificação */ }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const maxPaginas = Number(body.maxPaginas ?? 20);
  const forceDate = body.data_inicio as string | undefined;

  // 1. Buscar próxima semana pendente (mais recente primeiro)
  let item: { id: number; data_inicio: string; data_fim: string } | null = null;

  if (forceDate) {
    const { data } = await db
      .from("advise_backfill_queue")
      .select("id, data_inicio, data_fim")
      .eq("data_inicio", forceDate)
      .limit(1)
      .maybeSingle();
    item = data ?? null;
  } else {
    const { data } = await db
      .from("advise_backfill_queue")
      .select("id, data_inicio, data_fim")
      .eq("status", "pendente")
      .order("data_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    item = data ?? null;
  }

  if (!item) {
    // Verificar se há semanas em erro para retry
    const { data: erroItem } = await db
      .from("advise_backfill_queue")
      .select("id, data_inicio, data_fim")
      .eq("status", "erro")
      .order("data_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroItem) {
      item = erroItem;
      await db.from("advise_backfill_queue")
        .update({ status: "pendente", tentativas: 0, erro: null })
        .eq("id", item.id);
    } else {
      return new Response(JSON.stringify({
        status: "completo",
        mensagem: "✅ Todas as semanas do backfill foram processadas!",
      }), { headers: { "Content-Type": "application/json" } });
    }
  }

  // 2. Marcar como processando
  await db.from("advise_backfill_queue")
    .update({ status: "processando", executado_em: new Date().toISOString() })
    .eq("id", item.id);

  const ini = item.data_inicio;
  const fim = item.data_fim;
  console.log(`Processando semana ${ini} → ${fim} (maxPaginas=${maxPaginas})`);

  let totalNovas = 0;
  let totalDuplicadas = 0;
  let totalErros = 0;
  const contratosTotal = { adriano: 0, hermida_maia: 0, outros: 0 };
  let totalRegistrosAPI = 0;

  // 3. Buscar Lido=false e Lido=true para cobertura total
  for (const lido of ["false", "true"]) {
    try {
      const { itens, totalRegistros } = await buscarPaginas(ini, fim, lido, maxPaginas);
      totalRegistrosAPI += totalRegistros;

      const publicacoes = itens.map(buildRecord);
      const { novas, duplicadas, erros, contratos } = await salvarPublicacoes(publicacoes);

      totalNovas += novas;
      totalDuplicadas += duplicadas;
      totalErros += erros;
      contratosTotal.adriano += contratos.adriano;
      contratosTotal.hermida_maia += contratos.hermida_maia;
      contratosTotal.outros += contratos.outros;

      console.log(`Lido=${lido}: API=${itens.length}/${totalRegistros}, novas=${novas}, dup=${duplicadas}`);

      // Pausa entre as duas chamadas
      if (lido === "false") {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.error(`Erro Lido=${lido}:`, String(e));
      totalErros++;
    }
  }

  // 4. Atualizar status da semana
  const statusFinal = totalErros > 0 && totalNovas === 0 && totalDuplicadas === 0 ? "erro" : "concluido";
  await db.from("advise_backfill_queue")
    .update({
      status: statusFinal,
      publicacoes_importadas: totalNovas,
      executado_em: new Date().toISOString(),
      erro: totalErros > 0 ? `${totalErros} erros` : null,
    })
    .eq("id", item.id);

  // 5. Contar semanas restantes
  const { count: pendentes } = await db
    .from("advise_backfill_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");

  // 6. Notificar Slack se importou publicações dos contratos do escritório
  if (contratosTotal.adriano > 0 || contratosTotal.hermida_maia > 0) {
    const icon = totalNovas > 0 ? "✅" : "⚠️";
    const msg = `${icon} *Drain Contratos Advise* | Semana ${ini} → ${fim}\n` +
      `📥 Novas: ${totalNovas} | Duplicadas: ${totalDuplicadas} | Erros: ${totalErros}\n` +
      `👤 ADRIANO: ${contratosTotal.adriano} | 🏢 HERMIDA MAIA: ${contratosTotal.hermida_maia} | Outros: ${contratosTotal.outros}\n` +
      `📋 Semanas restantes: ${pendentes ?? "?"}`;
    await notificarSlack(msg);
  }

  // 7. Disparar sync-worker se houve novas publicações dos contratos do escritório
  if (contratosTotal.adriano > 0 || contratosTotal.hermida_maia > 0) {
    fetch(`${SUPABASE_URL}/functions/v1/sync-worker`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: "advise-drain-contratos", semana: `${ini}/${fim}` }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({
    semana: `${ini} → ${fim}`,
    api_total_registros: totalRegistrosAPI,
    novas_importadas: totalNovas,
    duplicadas: totalDuplicadas,
    erros: totalErros,
    contratos: contratosTotal,
    status: statusFinal,
    semanas_restantes: pendentes ?? 0,
  }), { headers: { "Content-Type": "application/json" } });
});
