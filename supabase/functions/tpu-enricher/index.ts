/**
 * tpu-enricher — Enriquecimento local de processos via parseCNJ + tabelas TPU
 * 
 * Enriquece processos usando APENAS dados locais do Supabase:
 * - parseCNJ: extrai tribunal, grau, sistema, foro, vara do número CNJ
 * - tpu_classe: resolve classe processual pelo código CNJ
 * - tpu_assunto: resolve assunto pelo código CNJ
 * - juizo_cnj: resolve órgão julgador pelo código CNJ
 * - serventia_cnj: resolve serventia pelo código CNJ
 * 
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
 * - NNNNNNN: número do processo (7 dígitos)
 * - DD: dígito verificador (2 dígitos)
 * - AAAA: ano de ajuizamento (4 dígitos)
 * - J: segmento de justiça (1 dígito)
 * - TT: tribunal (2 dígitos)
 * - OOOO: origem/foro (4 dígitos)
 * 
 * Segmentos de Justiça:
 * 1 = STF, 2 = CNJ, 3 = STJ, 4 = Justiça Federal, 5 = Trabalhista,
 * 6 = Eleitoral, 7 = Militar da União, 8 = Estadual/DF, 9 = Militar Estadual
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_NOTIFY_URL = `${SUPABASE_URL}/functions/v1/dotobot-slack`;

// Mapa de segmentos de justiça
const SEGMENTOS: Record<string, { ramo: string; prefixo: string }> = {
  "1": { ramo: "STF", prefixo: "STF" },
  "2": { ramo: "CNJ", prefixo: "CNJ" },
  "3": { ramo: "STJ", prefixo: "STJ" },
  "4": { ramo: "federal", prefixo: "TRF" },
  "5": { ramo: "trabalho", prefixo: "TRT" },
  "6": { ramo: "eleitoral", prefixo: "TRE" },
  "7": { ramo: "militar_uniao", prefixo: "STM" },
  "8": { ramo: "estadual", prefixo: "TJ" },
  "9": { ramo: "militar_estadual", prefixo: "TJM" },
};

// Mapa de tribunais estaduais (segmento 8)
const TRIBUNAIS_ESTADUAIS: Record<string, string> = {
  "01": "TJAC", "02": "TJAL", "03": "TJAP", "04": "TJAM", "05": "TJBA",
  "06": "TJCE", "07": "TJDF", "08": "TJES", "09": "TJGO", "10": "TJMA",
  "11": "TJMT", "12": "TJMS", "13": "TJMG", "14": "TJPA", "15": "TJPB",
  "16": "TJPR", "17": "TJPE", "18": "TJPI", "19": "TJRJ", "20": "TJRN",
  "21": "TJRS", "22": "TJRO", "23": "TJRR", "24": "TJSC", "25": "TJSP",
  "26": "TJSE", "27": "TJTO",
};

// Mapa de tribunais do trabalho (segmento 5)
const TRIBUNAIS_TRABALHO: Record<string, string> = {
  "00": "TST", "01": "TRT1", "02": "TRT2", "03": "TRT3", "04": "TRT4",
  "05": "TRT5", "06": "TRT6", "07": "TRT7", "08": "TRT8", "09": "TRT9",
  "10": "TRT10", "11": "TRT11", "12": "TRT12", "13": "TRT13", "14": "TRT14",
  "15": "TRT15", "16": "TRT16", "17": "TRT17", "18": "TRT18", "19": "TRT19",
  "20": "TRT20", "21": "TRT21", "22": "TRT22", "23": "TRT23", "24": "TRT24",
};

// Mapa de tribunais federais (segmento 4)
const TRIBUNAIS_FEDERAIS: Record<string, string> = {
  "01": "TRF1", "02": "TRF2", "03": "TRF3", "04": "TRF4", "05": "TRF5",
  "06": "TRF6",
};

// Mapa de UFs por código de tribunal estadual
const UF_POR_TRIBUNAL: Record<string, string> = {
  "TJAC": "AC", "TJAL": "AL", "TJAP": "AP", "TJAM": "AM", "TJBA": "BA",
  "TJCE": "CE", "TJDF": "DF", "TJES": "ES", "TJGO": "GO", "TJMA": "MA",
  "TJMT": "MT", "TJMS": "MS", "TJMG": "MG", "TJPA": "PA", "TJPB": "PB",
  "TJPR": "PR", "TJPE": "PE", "TJPI": "PI", "TJRJ": "RJ", "TJRN": "RN",
  "TJRS": "RS", "TJRO": "RO", "TJRR": "RR", "TJSC": "SC", "TJSP": "SP",
  "TJSE": "SE", "TJTO": "TO",
};

interface ParsedCNJ {
  numero_processo: string;
  digito_verificador: string;
  ano: number;
  segmento: string;
  tribunal_codigo: string;
  origem_codigo: string;
  tribunal_sigla: string;
  ramo: string;
  grau: number;
  uf: string | null;
  valido: boolean;
}

/**
 * Parseia o número CNJ e extrai informações estruturais
 */
function parseCNJ(numeroCNJ: string): ParsedCNJ | null {
  // Normalizar: remover pontos, traços e espaços
  const raw = numeroCNJ.replace(/[\.\-\s]/g, "");
  
  // Validar comprimento (20 dígitos)
  if (raw.length !== 20) return null;
  if (!/^\d{20}$/.test(raw)) return null;

  const numero_processo = raw.substring(0, 7);
  const digito_verificador = raw.substring(7, 9);
  const ano = parseInt(raw.substring(9, 13));
  const segmento = raw.substring(13, 14);
  const tribunal_codigo = raw.substring(14, 16);
  const origem_codigo = raw.substring(16, 20);

  const seg = SEGMENTOS[segmento];
  if (!seg) return null;

  let tribunal_sigla = "";
  let uf: string | null = null;

  if (segmento === "8") {
    tribunal_sigla = TRIBUNAIS_ESTADUAIS[tribunal_codigo] || `TJ${tribunal_codigo}`;
    uf = UF_POR_TRIBUNAL[tribunal_sigla] || null;
  } else if (segmento === "5") {
    tribunal_sigla = TRIBUNAIS_TRABALHO[tribunal_codigo] || `TRT${parseInt(tribunal_codigo)}`;
  } else if (segmento === "4") {
    tribunal_sigla = TRIBUNAIS_FEDERAIS[tribunal_codigo] || `TRF${tribunal_codigo}`;
  } else if (segmento === "1") {
    tribunal_sigla = "STF";
  } else if (segmento === "3") {
    tribunal_sigla = "STJ";
  } else {
    tribunal_sigla = `${seg.prefixo}${tribunal_codigo}`;
  }

  // Grau: derivado do código de origem
  // 0000 = 2ª instância, outros = 1ª instância (simplificado)
  const grau = origem_codigo === "0000" ? 2 : 1;

  return {
    numero_processo,
    digito_verificador,
    ano,
    segmento,
    tribunal_codigo,
    origem_codigo,
    tribunal_sigla,
    ramo: seg.ramo,
    grau,
    uf,
    valido: true,
  };
}

/**
 * Enriquece um processo usando dados locais do TPU
 */
async function enrichProcess(
  supabase: ReturnType<typeof createClient>,
  processo: { id: string; numero_cnj: string; tribunal?: string; classe_codigo?: number; orgao_julgador_codigo?: number }
): Promise<{ enriched: boolean; fields: Record<string, unknown>; source: string[] }> {
  const fields: Record<string, unknown> = {};
  const source: string[] = [];

  // 1. Parse do número CNJ
  const parsed = parseCNJ(processo.numero_cnj);
  if (!parsed) {
    return { enriched: false, fields: {}, source: ["parse_failed"] };
  }

  // Campos derivados do parseCNJ (sem consulta ao banco)
  if (!processo.tribunal || processo.tribunal !== parsed.tribunal_sigla) {
    fields.tribunal = parsed.tribunal_sigla;
    fields.ramo = parsed.ramo;
    fields.grau = parsed.grau;
    fields.parser_tribunal_schema = parsed.tribunal_sigla;
    fields.parser_grau = `${parsed.grau}`;
    fields.parser_sistema = parsed.ramo;
    source.push("parseCNJ");
  }

  // 2. Resolver instância pelo grau
  if (parsed.grau === 1) {
    fields.instancia = "1ª Instância";
  } else if (parsed.grau === 2) {
    fields.instancia = "2ª Instância";
  }

  // 3. Resolver classe processual via tpu_classe
  if (processo.classe_codigo) {
    const { data: classeData } = await supabase
      .schema("judiciario")
      .from("tpu_classe")
      .select("nome, sigla, natureza, area_direito, just_estadual, just_trabalho, just_federal")
      .eq("codigo_cnj", processo.classe_codigo)
      .single();

    if (classeData) {
      fields.classe = classeData.nome;
      if (classeData.natureza) fields.tipo_acao = classeData.natureza;
      if (classeData.area_direito) fields.area = classeData.area_direito;
      source.push("tpu_classe");
    }
  }

  // 4. Resolver órgão julgador via juizo_cnj
  if (processo.orgao_julgador_codigo) {
    const { data: juizoData } = await supabase
      .schema("judiciario")
      .from("juizo_cnj")
      .select("orgao_julgador, competencia, grau, tribunal, codigo_cnj")
      .eq("codigo_cnj", processo.orgao_julgador_codigo.toString())
      .single();

    if (juizoData) {
      fields.orgao_julgador = juizoData.orgao_julgador;
      if (juizoData.competencia) fields.tipo_processo_geral = juizoData.competencia;
      source.push("juizo_cnj");
    }
  }

  // 5. Marcar como dados completos se tiver os campos essenciais
  const hasEssentials = fields.tribunal && fields.instancia;
  if (hasEssentials) {
    fields.dados_incompletos = false;
  }

  return { enriched: Object.keys(fields).length > 0, fields, source };
}

/**
 * Notifica o Slack sobre o resultado do enriquecimento
 */
async function notifySlack(
  total: number,
  enriched: number,
  skipped: number,
  errors: number,
  elapsed: number
): Promise<void> {
  try {
    const icon = errors > 0 ? "⚠️" : "✅";
    const msg = {
      action: "notify_cron_status",
      job_name: "tpu-enricher",
      icon,
      summary: `${icon} *TPU Enricher* — ${enriched} processos enriquecidos`,
      details: [
        `• Total processado: ${total}`,
        `• Enriquecidos: ${enriched}`,
        `• Sem alteração: ${skipped}`,
        `• Erros: ${errors}`,
        `• Tempo: ${elapsed}ms`,
      ].join("\n"),
    };

    await fetch(SLACK_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify(msg),
    });
  } catch (_) {
    // Silencioso — não bloquear o fluxo principal
  }
}

Deno.serve(async (req) => {
  const start = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "enrich_batch";
    const batchSize = body.batch_size || 100;
    const notify = body.notify !== false;

    // ===== STATUS =====
    if (action === "status") {
      const { data: counts } = await supabase.rpc("exec_sql", {
        sql: `SELECT 
          COUNT(*) FILTER (WHERE tribunal IS NULL OR tribunal = '') as sem_tribunal,
          COUNT(*) FILTER (WHERE instancia IS NULL OR instancia = '') as sem_instancia,
          COUNT(*) FILTER (WHERE classe IS NULL OR classe = '') as sem_classe,
          COUNT(*) FILTER (WHERE dados_incompletos = true) as dados_incompletos,
          COUNT(*) as total
        FROM judiciario.processos WHERE deleted_at IS NULL`,
      }).catch(() => ({ data: null }));

      return new Response(JSON.stringify({
        status: "ok",
        stats: counts,
        tpu_tables: {
          tpu_classe: "200 registros",
          tpu_assunto: "200 registros",
          tpu_movimento: "208 registros",
          juizo_cnj: "verificar",
          serventia_cnj: "verificar",
          feriado_forense: "102 registros",
          prazo_regra: "326 regras",
          prazo_regra_alias: "1585 aliases",
        },
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ===== ENRICH_BATCH =====
    if (action === "enrich_batch") {
      // Buscar processos com campos incompletos
      const { data: processos, error: fetchError } = await supabase
        .schema("judiciario")
        .from("processos")
        .select("id, numero_cnj, tribunal, instancia, classe, classe_codigo, orgao_julgador_codigo, dados_incompletos")
        .is("deleted_at", null)
        .not("numero_cnj", "is", null)
        .or("tribunal.is.null,instancia.is.null,dados_incompletos.eq.true")
        .limit(batchSize);

      if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
      }

      if (!processos || processos.length === 0) {
        return new Response(JSON.stringify({ message: "Nenhum processo pendente de enriquecimento", total: 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      let enrichedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const processo of processos) {
        try {
          const result = await enrichProcess(supabase, processo);

          if (result.enriched) {
            const { error: updateError } = await supabase
              .schema("judiciario")
              .from("processos")
              .update({
                ...result.fields,
                updated_at: new Date().toISOString(),
              })
              .eq("id", processo.id);

            if (updateError) {
              errorCount++;
            } else {
              enrichedCount++;
            }
          } else {
            skippedCount++;
          }
        } catch (e) {
          errorCount++;
          console.error(`Erro ao enriquecer processo ${processo.id}:`, e);
        }
      }

      const elapsed = Date.now() - start;

      if (notify && enrichedCount > 0) {
        await notifySlack(processos.length, enrichedCount, skippedCount, errorCount, elapsed);
      }

      return new Response(JSON.stringify({
        total: processos.length,
        enriched: enrichedCount,
        skipped: skippedCount,
        errors: errorCount,
        elapsed_ms: elapsed,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ===== PARSE_CNJ (utilitário) =====
    if (action === "parse_cnj") {
      const numeroCNJ = body.numero_cnj;
      if (!numeroCNJ) {
        return new Response(JSON.stringify({ error: "numero_cnj é obrigatório" }), { status: 400 });
      }
      const parsed = parseCNJ(numeroCNJ);
      return new Response(JSON.stringify(parsed || { error: "Número CNJ inválido" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ===== ENRICH_SINGLE =====
    if (action === "enrich_single") {
      const processoId = body.processo_id;
      if (!processoId) {
        return new Response(JSON.stringify({ error: "processo_id é obrigatório" }), { status: 400 });
      }

      const { data: processo, error } = await supabase
        .schema("judiciario")
        .from("processos")
        .select("id, numero_cnj, tribunal, instancia, classe, classe_codigo, orgao_julgador_codigo")
        .eq("id", processoId)
        .single();

      if (error || !processo) {
        return new Response(JSON.stringify({ error: "Processo não encontrado" }), { status: 404 });
      }

      const result = await enrichProcess(supabase, processo);

      if (result.enriched) {
        await supabase
          .schema("judiciario")
          .from("processos")
          .update({ ...result.fields, updated_at: new Date().toISOString() })
          .eq("id", processoId);
      }

      return new Response(JSON.stringify({
        processo_id: processoId,
        numero_cnj: processo.numero_cnj,
        parsed: parseCNJ(processo.numero_cnj),
        enriched: result.enriched,
        fields_updated: result.fields,
        sources: result.source,
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida", actions: ["enrich_batch", "enrich_single", "parse_cnj", "status"] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("tpu-enricher error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
