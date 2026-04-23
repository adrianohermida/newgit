/**
 * advise-backfill-lido v3
 * 
 * Processa 1 semana da fila advise_backfill_queue por execução.
 * Busca publicações com Lido=true E Lido=false para cobertura total.
 * Máximo de 5 páginas por chamada para caber no timeout de 50s.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const ADVISE_TOKEN = Deno.env.get("ADVISE_TOKEN")!;
const ADVISE_URL = "https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada";

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

async function buscarPaginas(ini: string, fim: string, lido: string, maxPag = 5): Promise<Record<string, unknown>[]> {
  const todos: Record<string, unknown>[] = [];
  let pagina = 1;
  let totalPaginas = 1;
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
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) { console.error(`API ${resp.status} ${ini}-${fim} Lido=${lido}`); break; }
    const data = await resp.json();
    totalPaginas = Number(data?.paginacao?.paginaTotal ?? 1);
    const itens = Array.isArray(data?.itens) ? data.itens as Record<string, unknown>[] : [];
    todos.push(...itens);
    if (!itens.length) break;
    pagina++;
    if (pagina <= totalPaginas) await new Promise(r => setTimeout(r, 200));
  }
  return todos;
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const maxPag = Number(body.maxPaginas ?? 5);

  // Buscar próxima semana pendente
  const { data: pendentes } = await supabase
    .from("advise_backfill_queue")
    .select("id, data_inicio, data_fim")
    .eq("status", "pendente")
    .order("data_inicio", { ascending: true })
    .limit(1);

  if (!pendentes || pendentes.length === 0) {
    // Verificar travados (processando há mais de 15 min)
    const { data: travados } = await supabase
      .from("advise_backfill_queue")
      .select("id, data_inicio, data_fim")
      .eq("status", "processando")
      .lt("executado_em", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(1);
    if (!travados || !travados.length) {
      return new Response(JSON.stringify({ status: "completo", mensagem: "✅ Backfill concluído!" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    await supabase.from("advise_backfill_queue").update({ status: "pendente" }).eq("id", travados[0].id);
    pendentes?.push(travados[0]);
  }

  const item = pendentes![0];
  const { id, data_inicio: ini, data_fim: fim } = item;

  // Marcar como processando
  await supabase.from("advise_backfill_queue")
    .update({ status: "processando", executado_em: new Date().toISOString() })
    .eq("id", id);

  console.log(`Processando semana ${ini} → ${fim} (maxPag=${maxPag})`);

  try {
    // Buscar lidas e não lidas em sequência (não paralelo para economizar tempo)
    const lidas = await buscarPaginas(ini, fim, "true", maxPag);
    const naoLidas = await buscarPaginas(ini, fim, "false", maxPag);

    // Deduplicar
    const mapa = new Map<unknown, Record<string, unknown>>();
    for (const item of [...lidas, ...naoLidas]) mapa.set(item.id, item);
    const records = Array.from(mapa.values()).map(buildRecord);

    // Upsert em chunks
    let inseridas = 0;
    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      const { error } = await supabase.from("publicacoes").upsert(chunk, { onConflict: "advise_id_publicacao_cliente" });
      if (!error) inseridas += chunk.length;
      else console.error("upsert:", error.message);
      await new Promise(r => setTimeout(r, 100));
    }

    // Marcar como concluído
    await supabase.from("advise_backfill_queue")
      .update({ status: "concluido", publicacoes_importadas: inseridas, executado_em: new Date().toISOString() })
      .eq("id", id);

    // Disparar sync-worker se houve novas
    if (inseridas > 0) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-worker`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(8_000),
      }).catch(e => console.warn("sync-worker:", String(e)));
    }

    return new Response(JSON.stringify({
      status: "ok",
      semana: `${ini} → ${fim}`,
      lidas: lidas.length,
      nao_lidas: naoLidas.length,
      total_unicas: mapa.size,
      inseridas,
    }, null, 2), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error(`Erro semana ${ini}-${fim}:`, String(e));
    await supabase.from("advise_backfill_queue").update({ status: "pendente" }).eq("id", id);
    return new Response(JSON.stringify({ status: "erro", semana: `${ini} → ${fim}`, erro: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
