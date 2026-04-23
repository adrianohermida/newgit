/**
 * publicacoes-prazos — Cálculo automático de prazos processuais
 * 
 * Regras de negócio implementadas:
 * 1. Criação automática de prazo_calculado para cada nova publicação
 * 2. Identificação do prazo via prazo_regra_alias (texto → regra)
 * 3. Se não há prazo expresso: 5 dias úteis padrão + 3 dias corridos internos
 * 4. Início da contagem: dia útil seguinte à data da publicação
 * 5. Consideração de feriados nacionais e locais (feriado_forense)
 * 6. Consideração de suspensões de expediente (suspensao_expediente)
 * 7. Memória de cálculo detalhada (lista de dias contados)
 * 8. Alertas preventivos (2 dias úteis antes) e de decurso
 * 9. Criação de Activity no Freshsales com descrição completa
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_NOTIFY_URL = `${SUPABASE_URL}/functions/v1/dotobot-slack`;
const FS_DOMAIN_RAW = Deno.env.get("FRESHSALES_DOMAIN") || "";
const FS_API_KEY = Deno.env.get("FRESHSALES_API_KEY") || "";
const FS_OWNER_ID = Number(Deno.env.get("FRESHSALES_OWNER_ID") || Deno.env.get("FS_OWNER_ID") || "31000147944");
const DOMAIN_MAP: Record<string, string> = {
  "hmadv-7b725ea101eff55.freshsales.io": "hmadv-org.myfreshworks.com",
};

function fsDomain(): string {
  const domain = FS_DOMAIN_RAW.trim();
  if (domain.includes("myfreshworks.com")) return domain;
  return DOMAIN_MAP[domain] ?? domain.replace(/\.freshsales\.io$/, ".myfreshworks.com");
}

function authHeader(): string {
  const k = FS_API_KEY.trim();
  return (k.startsWith("Token ") || k.startsWith("Bearer ")) ? k : `Token token=${k}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fsPost(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: "POST",
      headers: { "Authorization": authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status >= 500) {
      await sleep(i * 2000);
      continue;
    }
    return { status: r.status, data };
  }
  return { status: 500, data: {} };
}

async function criarTaskFreshsales(
  titulo: string,
  descricao: string,
  dataVencimento: string,
  accountId: string | null
): Promise<string | null> {
  if (!FS_API_KEY || !accountId) return null;
  try {
    const { status, data } = await fsPost("tasks", {
      task: {
        title: titulo.substring(0, 255),
        description: descricao.substring(0, 4000),
        due_date: dataVencimento,
        targetable_type: "SalesAccount",
        targetable_id: Number(accountId),
        owner_id: FS_OWNER_ID,
      },
    });
    if (status === 200 || status === 201) {
      const taskData = data as Record<string, Record<string, unknown>>;
      return String(taskData.task?.id ?? "") || null;
    }
    console.warn("criarTaskFreshsales: status", status);
    return null;
  } catch (e) {
    console.error("criarTaskFreshsales error:", e);
    return null;
  }
}

// ============================================================
// MOTOR DE CÁLCULO DE PRAZOS
// ============================================================

interface Feriado {
  data_feriado: string;
  nome: string;
  tipo: string;
  estado_uf: string | null;
  tribunal_sigla: string | null;
}

interface SuspensaoExpediente {
  data_inicio: string;
  data_fim: string;
  tribunal_sigla: string | null;
  motivo: string;
}

interface ResultadoCalculo {
  data_base: string;
  data_inicio_contagem: string;
  data_vencimento: string;
  prazo_dias: number;
  tipo_contagem: "dias_uteis" | "dias_corridos";
  dias_contados: string[];
  dias_excluidos: Array<{ data: string; motivo: string }>;
  memoria_calculo: string;
  // Novos campos: memória extensiva e confiabilidade
  tabela_dias: Array<{ contagem: number | null; data: string; dia_semana: string; motivo_exclusao: string | null }>;
  score_confiabilidade: "alta" | "media" | "baixa";
  motivo_confiabilidade: string;
  total_dias_corridos: number;
  total_feriados_excluidos: number;
  tem_feriados_locais: boolean;
}

/**
 * Verifica se uma data é final de semana
 */
function isFimDeSemana(date: Date): boolean {
  const dia = date.getDay();
  return dia === 0 || dia === 6;
}

/**
 * Formata data como YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Converte string YYYY-MM-DD para Date (sem fuso horário)
 */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Adiciona dias a uma data
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Verifica se uma data é feriado ou suspensão
 */
function isDiaImpedido(
  date: Date,
  feriados: Set<string>,
  suspensoes: Array<{ inicio: Date; fim: Date; motivo: string }>
): { impedido: boolean; motivo: string } {
  const dateStr = formatDate(date);

  if (feriados.has(dateStr)) {
    return { impedido: true, motivo: "feriado" };
  }

  for (const s of suspensoes) {
    if (date >= s.inicio && date <= s.fim) {
      return { impedido: true, motivo: `suspensão: ${s.motivo}` };
    }
  }

  return { impedido: false, motivo: "" };
}

/**
 * Calcula o próximo dia útil a partir de uma data
 */
function proximoDiaUtil(
  date: Date,
  feriados: Set<string>,
  suspensoes: Array<{ inicio: Date; fim: Date; motivo: string }>
): Date {
  let current = addDays(date, 1);
  let maxIterations = 60;

  while (maxIterations-- > 0) {
    if (!isFimDeSemana(current)) {
      const impedido = isDiaImpedido(current, feriados, suspensoes);
      if (!impedido.impedido) {
        return current;
      }
    }
    current = addDays(current, 1);
  }

  return current;
}

/**
 * Retorna o nome do dia da semana em português
 */
function nomeDiaSemana(date: Date): string {
  const nomes = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return nomes[date.getDay()];
}

/**
 * Gera a tabela extensiva dia-a-dia no formato PrazoFácil.
 * Cobre no mínimo 15 dias úteis ou até o vencimento (o que for maior).
 */
function gerarTabelaDias(
  dataInicio: Date,
  dataVencimento: Date,
  prazoDias: number,
  feriados: Set<string>,
  suspensoes: Array<{ inicio: Date; fim: Date; motivo: string }>,
  feriadosDetalhados: Map<string, string>,
  tipoContagem: "dias_uteis" | "dias_corridos"
): Array<{ contagem: number | null; data: string; dia_semana: string; motivo_exclusao: string | null }> {
  const tabela: Array<{ contagem: number | null; data: string; dia_semana: string; motivo_exclusao: string | null }> = [];

  // Cobertura mínima: 15 dias úteis a partir do início, ou até o vencimento (o que for maior)
  const diasUteisMinimos = Math.max(prazoDias, 15);
  let current = new Date(dataInicio);
  let contagem = 0;
  let maxIter = diasUteisMinimos * 4 + 30; // margem para fins de semana e feriados

  while (maxIter-- > 0) {
    const dateStr = formatDate(current);
    const diaSemana = nomeDiaSemana(current);

    if (tipoContagem === "dias_corridos") {
      contagem++;
      tabela.push({ contagem, data: dateStr, dia_semana: diaSemana, motivo_exclusao: null });
      if (current >= dataVencimento) break;
    } else {
      if (isFimDeSemana(current)) {
        const motivo = current.getDay() === 0 ? "Final de Semana (Domingo)" : "Final de Semana (Sábado)";
        tabela.push({ contagem: null, data: dateStr, dia_semana: diaSemana, motivo_exclusao: motivo });
      } else {
        const impedido = isDiaImpedido(current, feriados, suspensoes);
        if (impedido.impedido) {
          const nome = feriadosDetalhados.get(dateStr) || impedido.motivo;
          tabela.push({ contagem: null, data: dateStr, dia_semana: diaSemana, motivo_exclusao: nome });
        } else {
          contagem++;
          tabela.push({ contagem, data: dateStr, dia_semana: diaSemana, motivo_exclusao: null });
        }
      }
      // Parar quando atingir o mínimo de dias úteis E já passou do vencimento
      if (contagem >= diasUteisMinimos && current >= dataVencimento) break;
    }

    current = addDays(current, 1);
  }

  return tabela;
}

/**
 * Calcula o score de confiabilidade do cálculo de prazo.
 * É usado para orientar a validação manual no Freshsales.
 *
 * 🟢 Alta: alias identificado com precisão, sem feriados locais/municipais no período
 * 🟡 Média: alias identificado, mas há feriados estaduais/locais no período que podem variar
 * 🔴 Baixa: prazo padrão (sem alias), ou há suspensões de expediente no período
 */
function calcularScoreConfiabilidade(
  prazoRegra: boolean,
  diasExcluidos: Array<{ data: string; motivo: string }>,
  temSuspensoes: boolean
): { score: "alta" | "media" | "baixa"; motivo: string } {
  if (!prazoRegra) {
    return {
      score: "baixa",
      motivo: "A IA não identificou a regra de prazo específica pelo texto da publicação. Foi aplicado o prazo padrão de 5 dias úteis. Exige leitura da publicação e ajuste manual imediato."
    };
  }

  if (temSuspensoes) {
    return {
      score: "media",
      motivo: "Há suspensões de expediente registradas no período. Verifique se a portaria do Tribunal confirma a suspensão para este processo."
    };
  }

  const feriadosLocais = diasExcluidos.filter(d => {
    const m = d.motivo.toLowerCase();
    return !m.includes("sábado") && !m.includes("domingo") &&
           (m.includes("municipal") || m.includes("estadual") || m.includes("local") || m.includes("comarca"));
  });

  if (feriadosLocais.length > 0) {
    return {
      score: "media",
      motivo: `Há ${feriadosLocais.length} feriado(s) estadual/municipal no período (${feriadosLocais.map(d => formatDateBR(d.data)).join(", ")}). Confirme se o Tribunal observa esses feriados para este processo.`
    };
  }

  return {
    score: "alta",
    motivo: "Prazo identificado com precisão pelo texto da publicação. Período sem feriados locais ambíguos. Cálculo de alta confiabilidade."
  };
}

/**
 * Gera a memória de cálculo extensiva no formato PrazoFácil para a descrição da task.
 */
function gerarMemoriaExtensiva(
  dataBase: string,
  dataInicio: string,
  dataVencimento: string,
  prazoDias: number,
  tipoContagem: "dias_uteis" | "dias_corridos",
  tabela: Array<{ contagem: number | null; data: string; dia_semana: string; motivo_exclusao: string | null }>,
  score: "alta" | "media" | "baixa",
  motivoScore: string,
  atoPraticado: string,
  baseLegal: string
): string {
  const tipoStr = tipoContagem === "dias_uteis" ? "dias úteis" : "dias corridos";
  const scoreEmoji = score === "alta" ? "🟢" : score === "media" ? "🟡" : "🔴";
  const scoreLabel = score === "alta" ? "ALTA" : score === "media" ? "MÉDIA" : "BAIXA";

  const linhas: string[] = [];

  // Cabeçalho de confiabilidade
  linhas.push(`${scoreEmoji} CONFIABILIDADE DO CÁLCULO: ${scoreLabel}`);
  linhas.push(`${motivoScore}`);
  linhas.push(``);

  // Resumo do prazo
  linhas.push(`⏱️ PRAZO DE ${prazoDias} ${tipoStr.toUpperCase()}`);
  linhas.push(`📌 Fundamento legal: ${atoPraticado} (${baseLegal})`);
  linhas.push(`📅 Data da publicação: ${formatDateBR(dataBase)}`);
  linhas.push(`▶️ Início da contagem: ${formatDateBR(dataInicio)} (dia útil subsequente à publicação)`);
  linhas.push(`🛑 Data final: ${formatDateBR(dataVencimento)}`);
  linhas.push(``);

  // Tabela dia a dia
  linhas.push(`🗓️ MEMÓRIA DETALHADA DO CÁLCULO (formato PrazoFácil):`);
  linhas.push(``);
  linhas.push(`CONTAGEM | DATA                          | OBSERVAÇÃO`);
  linhas.push(`---------|-------------------------------|----------------------------------`);

  for (const dia of tabela) {
    const dataFormatada = formatDateBR(dia.data);
    const diaStr = `${dataFormatada} - ${dia.dia_semana}`;
    if (dia.contagem !== null) {
      const isFinal = dia.data === dataVencimento;
      const marcador = isFinal ? `${dia.contagem} (VENCIMENTO)` : String(dia.contagem);
      linhas.push(`${marcador.padEnd(8)} | ${diaStr.padEnd(29)} | Dia útil contado`);
    } else {
      linhas.push(`X        | ${diaStr.padEnd(29)} | ${dia.motivo_exclusao || "Excluído"}`);
    }
  }

  linhas.push(``);
  linhas.push(`⚠️ IMPORTANTE: Este cálculo foi gerado automaticamente pela IA do sistema HMADV.`);
  linhas.push(`Confirme o prazo no PrazoFácil (www.prazofacil.com.br) antes de protocolar.`);

  return linhas.join("\n");
}

/**
 * Motor principal de cálculo de prazos — versão com memória extensiva e score de confiabilidade
 */
function calcularPrazo(
  dataBase: string,
  prazoDias: number,
  tipoContagem: "dias_uteis" | "dias_corridos",
  feriados: Set<string>,
  suspensoes: Array<{ inicio: Date; fim: Date; motivo: string }>,
  feriadosDetalhados: Map<string, string>,
  prazoRegraEncontrada: boolean = true,
  atoPraticado: string = "Prazo processual",
  baseLegal: string = "CPC"
): ResultadoCalculo {
  const dataBaseDate = parseDate(dataBase);

  // Início da contagem: dia útil seguinte à data da publicação
  const dataInicioContagem = proximoDiaUtil(dataBaseDate, feriados, suspensoes);

  const diasContados: string[] = [];
  const diasExcluidos: Array<{ data: string; motivo: string }> = [];

  let dataVencimento: Date;

  if (tipoContagem === "dias_corridos") {
    // Dias corridos: contar todos os dias incluindo fins de semana
    dataVencimento = addDays(dataInicioContagem, prazoDias - 1);
    
    let current = new Date(dataInicioContagem);
    for (let i = 0; i < prazoDias; i++) {
      diasContados.push(formatDate(current));
      current = addDays(current, 1);
    }
  } else {
    // Dias úteis: pular fins de semana, feriados e suspensões
    let current = new Date(dataInicioContagem);
    let contados = 0;
    let maxIterations = prazoDias * 3 + 30;

    while (contados < prazoDias && maxIterations-- > 0) {
      if (isFimDeSemana(current)) {
        const motivo = current.getDay() === 0 ? "domingo" : "sábado";
        diasExcluidos.push({ data: formatDate(current), motivo });
      } else {
        const impedido = isDiaImpedido(current, feriados, suspensoes);
        if (impedido.impedido) {
          const nomeHoliday = feriadosDetalhados.get(formatDate(current)) || impedido.motivo;
          diasExcluidos.push({ data: formatDate(current), motivo: nomeHoliday });
        } else {
          contados++;
          diasContados.push(formatDate(current));
          if (contados === prazoDias) {
            dataVencimento = new Date(current);
          }
        }
      }
      current = addDays(current, 1);
    }

    dataVencimento = dataVencimento! || addDays(dataInicioContagem, prazoDias * 2);
  }

  // Gerar tabela extensiva dia-a-dia (mínimo 15 dias úteis)
  const tabela = gerarTabelaDias(
    dataInicioContagem,
    dataVencimento!,
    prazoDias,
    feriados,
    suspensoes,
    feriadosDetalhados,
    tipoContagem
  );

  // Calcular score de confiabilidade
  const temSuspensoes = suspensoes.length > 0;
  const { score, motivo: motivoScore } = calcularScoreConfiabilidade(
    prazoRegraEncontrada,
    diasExcluidos,
    temSuspensoes
  );

  // Estatísticas
  const feriadosExcluidos = diasExcluidos.filter(d => !d.motivo.includes("sábado") && !d.motivo.includes("domingo"));
  const temFeriadosLocais = feriadosExcluidos.some(d => {
    const m = d.motivo.toLowerCase();
    return m.includes("municipal") || m.includes("estadual") || m.includes("local") || m.includes("comarca");
  });
  const totalDiasCorridos = tabela.length;

  // Gerar memória extensiva (para a descrição da task no Freshsales)
  const memoriaExtensiva = gerarMemoriaExtensiva(
    dataBase,
    formatDate(dataInicioContagem),
    formatDate(dataVencimento!),
    prazoDias,
    tipoContagem,
    tabela,
    score,
    motivoScore,
    atoPraticado,
    baseLegal
  );

  return {
    data_base: dataBase,
    data_inicio_contagem: formatDate(dataInicioContagem),
    data_vencimento: formatDate(dataVencimento!),
    prazo_dias: prazoDias,
    tipo_contagem: tipoContagem,
    dias_contados: diasContados,
    dias_excluidos: diasExcluidos,
    memoria_calculo: memoriaExtensiva,
    tabela_dias: tabela,
    score_confiabilidade: score,
    motivo_confiabilidade: motivoScore,
    total_dias_corridos: totalDiasCorridos,
    total_feriados_excluidos: feriadosExcluidos.length,
    tem_feriados_locais: temFeriadosLocais,
  };
}

/**
 * Formata data para exibição brasileira
 */
function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ============================================================
// IDENTIFICAÇÃO DE PRAZOS VIA ALIASES
// ============================================================

interface PrazoRegra {
  id: string;
  ato_praticado: string;
  base_legal: string;
  prazo_dias: number;
  tipo_contagem: string;
  ramo: string;
  rito: string | null;
  instancia: string | null;
}

/**
 * Identifica a regra de prazo mais adequada para o texto da publicação
 */
async function identificarPrazoRegra(
  supabase: ReturnType<typeof createClient>,
  textoPublicacao: string,
  ramo: string | null
): Promise<PrazoRegra | null> {
  // Buscar aliases que correspondam ao texto
  const { data: aliases } = await supabase
    .schema("judiciario")
    .from("prazo_regra_alias")
    .select("alias, prazo_regra_id")
    .limit(200);

  if (!aliases) return null;

  const textoLower = textoPublicacao.toLowerCase();

  // Encontrar o alias com maior correspondência
  let melhorAlias: { alias: string; prazo_regra_id: string } | null = null;
  let melhorScore = 0;

  for (const alias of aliases) {
    const aliasLower = alias.alias.toLowerCase();
    if (textoLower.includes(aliasLower)) {
      const score = aliasLower.length;
      if (score > melhorScore) {
        melhorScore = score;
        melhorAlias = alias;
      }
    }
  }

  if (!melhorAlias) return null;

  // Buscar a regra correspondente
  const { data: regra } = await supabase
    .schema("judiciario")
    .from("prazo_regra")
    .select("id, ato_praticado, base_legal, prazo_dias, tipo_contagem, ramo, rito, instancia")
    .eq("id", melhorAlias.prazo_regra_id)
    .single();

  return regra || null;
}

// ============================================================
// IDENTIFICAÇÃO LOCAL (sem queries adicionais)
// ============================================================

function identificarPrazoRegraLocal(
  textoPublicacao: string,
  aliases: Array<{ alias: string; prazo_regra_id: string }>,
  regras: Map<string, PrazoRegra>
): PrazoRegra | null {
  const textoLower = textoPublicacao.toLowerCase();
  let melhorAlias: { alias: string; prazo_regra_id: string } | null = null;
  let melhorScore = 0;

  for (const alias of aliases) {
    const aliasLower = alias.alias.toLowerCase();
    if (textoLower.includes(aliasLower)) {
      const score = aliasLower.length;
      if (score > melhorScore) {
        melhorScore = score;
        melhorAlias = alias;
      }
    }
  }

  if (!melhorAlias) return null;
  return regras.get(melhorAlias.prazo_regra_id) || null;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

Deno.serve(async (req) => {
  const start = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "calcular_batch";
    const batchSize = body.batch_size || 50;
    const notify = body.notify !== false;

    // ===== STATUS =====
    if (action === "status") {
      const hoje = formatDate(new Date());
      const em2Dias = formatDate(addDays(new Date(), 2));

      const [r1, r2, r3, r4] = await Promise.all([
        supabase.schema("judiciario").from("prazo_calculado").select("*", { count: "exact", head: true }),
        supabase.schema("judiciario").from("prazo_calculado").select("*", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.schema("judiciario").from("prazo_calculado").select("*", { count: "exact", head: true }).eq("status", "pendente").gte("data_vencimento", hoje).lte("data_vencimento", em2Dias),
        supabase.schema("judiciario").from("prazo_calculado").select("*", { count: "exact", head: true }).eq("status", "pendente").lt("data_vencimento", hoje),
      ]);

      return new Response(JSON.stringify({
        status: "ok",
        prazos: {
          total: r1.count || 0,
          pendentes: r2.count || 0,
          vencendo_2_dias: r3.count || 0,
          vencidos: r4.count || 0,
        },
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ===== CALCULAR_BATCH =====
    if (action === "calcular_batch") {
      // Pré-carregar TODOS os aliases e regras de uma vez (otimização N+1)
      const [aliasesResult, regrasResult] = await Promise.all([
        supabase.schema("judiciario").from("prazo_regra_alias").select("alias, prazo_regra_id").limit(2000),
        supabase.schema("judiciario").from("prazo_regra").select("id, ato_praticado, base_legal, prazo_dias, tipo_contagem, ramo, rito, instancia").limit(500),
      ]);
      const todosAliases = aliasesResult.data || [];
      const todasRegras = new Map((regrasResult.data || []).map(r => [r.id, r]));

      // Buscar publicações sem prazo calculado
      // Usar offset para paginação quando batch_offset é fornecido
      const batchOffset = body.batch_offset || 0;
      const { data: publicacoes, error: fetchError } = await supabase
        .schema("judiciario")
        .from("publicacoes")
        .select(`
          id, numero_processo_api, data_publicacao,
          conteudo, cidade_comarca_descricao, vara_descricao, processo_id,
          processos:processo_id ( formato )
        `)
        .not("data_publicacao", "is", null)
        .not("conteudo", "is", null)
        .range(batchOffset, batchOffset + batchSize - 1);

      if (fetchError || !publicacoes || publicacoes.length === 0) {
        return new Response(JSON.stringify({
          message: "Nenhuma publicação pendente de cálculo de prazo",
          total: 0,
        }), { headers: { "Content-Type": "application/json" } });
      }

      // Verificar quais já têm prazo calculado
      const pubIds = publicacoes.map(p => p.id);
      const { data: prazosExistentes } = await supabase
        .schema("judiciario")
        .from("prazo_calculado")
        .select("publicacao_id")
        .in("publicacao_id", pubIds);

      const idsComPrazo = new Set((prazosExistentes || []).map(p => p.publicacao_id));
      const publicacoesSemPrazo = publicacoes.filter(p => !idsComPrazo.has(p.id));

      if (publicacoesSemPrazo.length === 0) {
        return new Response(JSON.stringify({
          message: "Todas as publicações do lote já têm prazo calculado",
          total: 0,
        }), { headers: { "Content-Type": "application/json" } });
      }

      // Carregar feriados (próximos 90 dias)
      const hoje = new Date();
      const em90Dias = addDays(hoje, 90);
      const { data: feriadosData } = await supabase
        .schema("judiciario")
        .from("feriado_forense")
        .select("data_feriado, nome, tipo, estado_uf, tribunal_sigla, afeta_prazo")
        .eq("afeta_prazo", true)
        .gte("data_feriado", formatDate(hoje))
        .lte("data_feriado", formatDate(em90Dias));

      const feriadosSet = new Set<string>((feriadosData || []).map(f => f.data_feriado));
      const feriadosMap = new Map<string, string>(
        (feriadosData || []).map(f => [f.data_feriado, f.nome])
      );

      // Carregar suspensões de expediente
      const { data: suspensoesData } = await supabase
        .schema("judiciario")
        .from("suspensao_expediente")
        .select("data_inicio, data_fim, tribunal_sigla, motivo")
        .gte("data_fim", formatDate(hoje))
        .lte("data_inicio", formatDate(em90Dias));

      const suspensoes = (suspensoesData || []).map(s => ({
        inicio: parseDate(s.data_inicio),
        fim: parseDate(s.data_fim),
        motivo: s.motivo || "suspensão de expediente",
      }));

      let calculados = 0;
      let erros = 0;
      const prazosInseridos: Array<Record<string, unknown>> = [];

      for (const pub of publicacoesSemPrazo) {
        try {
          const dataBase = pub.data_publicacao;
          if (!dataBase) continue;

          // Identificar regra de prazo pelo texto
          let prazoRegra: PrazoRegra | null = null;
          let prazoDias = 5;
          let tipoContagem: "dias_uteis" | "dias_corridos" = "dias_uteis";
          let atoPraticado = "Prazo padrão";
          let baseLegal = "CPC";
          let prazoRegraId: string | null = null;

          if (pub.conteudo) {
            // Usar aliases pré-carregados em memória (sem queries adicionais)
            prazoRegra = identificarPrazoRegraLocal(pub.conteudo, todosAliases, todasRegras);
          }

          if (prazoRegra) {
            prazoDias = prazoRegra.prazo_dias;
            tipoContagem = prazoRegra.tipo_contagem === "dias_uteis" ? "dias_uteis" : "dias_corridos";
            atoPraticado = prazoRegra.ato_praticado;
            baseLegal = prazoRegra.base_legal;
            prazoRegraId = prazoRegra.id;
          }

          // Determinar tipo de processo (físico ou eletrônico)
          const formatoProcesso = (pub as Record<string, unknown> & { processos?: { formato?: string } }).processos?.formato ?? null;
          const isFisico = formatoProcesso?.toLowerCase().includes('físico') || formatoProcesso?.toLowerCase().includes('fisico');

          // Para processos físicos: o prazo começa a partir da carga dos autos (intimação pessoal)
          // Neste caso, adicionamos uma nota de alerta na memória de cálculo
          const alertaFisico = isFisico
            ? "\n⚠️ ATENÇÃO — PROCESSO FÍSICO: A contagem do prazo para processos físicos inicia-se a partir da carga dos autos (art. 231, VI do CPC), e não da data de publicação. A data de vencimento calculada abaixo é uma ESTIMATIVA baseada na data de publicação. Verifique a data real de intimação/carga dos autos para confirmar o prazo correto."
            : "";

          // Calcular prazo principal (com memória extensiva e score de confiabilidade)
          const resultado = calcularPrazo(
            dataBase,
            prazoDias,
            tipoContagem,
            feriadosSet,
            suspensoes,
            feriadosMap,
            !!prazoRegra,
            atoPraticado,
            baseLegal
          );

          // Incorporar alerta de processo físico na memória de cálculo
          if (alertaFisico) {
            resultado.memoria_calculo = alertaFisico + "\n\n" + resultado.memoria_calculo;
            // Processos físicos nunca podem ter score "alta" pois a data é estimativa
            if (resultado.score_confiabilidade === "alta") {
              resultado.score_confiabilidade = "media";
              resultado.motivo_confiabilidade = "Processo físico: prazo estimado pela data de publicação. Confirmar data real de carga dos autos (art. 231, VI do CPC).";
            }
          }

          // Prefixo de confiabilidade no título para triagem visual no Freshsales
          const scoreEmoji = resultado.score_confiabilidade === "alta" ? "🟢" :
                             resultado.score_confiabilidade === "media" ? "🟡" : "🔴";
          const tipoProcessoLabel = isFisico ? " [FÍSICO]" : (formatoProcesso ? " [ELETR.]" : "");
          const titulo = `${scoreEmoji} PRAZO: ${atoPraticado}${tipoProcessoLabel} — ${pub.numero_processo_api || "Processo"} (${formatDateBR(resultado.data_vencimento)})`;

          const prazoRecord = {
            publicacao_id: pub.id,
            processo_id: pub.processo_id || null,
            prazo_regra_id: prazoRegraId,
            evento_tipo: "publicacao",
            titulo,
            data_base: resultado.data_base,
            data_inicio_contagem: resultado.data_inicio_contagem,
            data_vencimento: resultado.data_vencimento,
            status: "pendente",
            prioridade: prazoDias <= 3 ? "alta" : prazoDias <= 10 ? "media" : "baixa",
            observacoes_ia: resultado.memoria_calculo,
            metadata: {
              ato_praticado: atoPraticado,
              base_legal: baseLegal,
              prazo_dias: resultado.prazo_dias,
              tipo_contagem: resultado.tipo_contagem,
              tribunal: pub.cidade_comarca_descricao,
              numero_processo: pub.numero_processo_api,
              vara: pub.vara_descricao,
              dias_contados: resultado.dias_contados,
              dias_excluidos: resultado.dias_excluidos,
              // Campos de confiabilidade e auditoria
              score_confiabilidade: resultado.score_confiabilidade,
              motivo_confiabilidade: resultado.motivo_confiabilidade,
              total_dias_corridos: resultado.total_dias_corridos,
              total_feriados_excluidos: resultado.total_feriados_excluidos,
              tem_feriados_locais: resultado.tem_feriados_locais,
              tabela_dias: resultado.tabela_dias,
              tipo_processo: formatoProcesso ?? "Não informado",
              processo_fisico: isFisico ?? false,
            },
          };

          prazosInseridos.push(prazoRecord);

          // Prazo interno complementar de 3 dias corridos (se prazo padrão)
          if (!prazoRegra) {
            const prazoInterno = calcularPrazo(
              dataBase,
              3,
              "dias_corridos",
              feriadosSet,
              suspensoes,
              feriadosMap,
              false,
              "Prazo Interno: Providências",
              "Interno"
            );

            prazosInseridos.push({
              ...prazoRecord,
              titulo: `PRAZO INTERNO: Providências — ${pub.numero_processo_api || "Processo"} (${formatDateBR(prazoInterno.data_vencimento)})`,  
              data_vencimento: prazoInterno.data_vencimento,
              prazo_dias: 3,
              tipo_contagem: "dias_corridos",
              prioridade: "alta",
              observacoes_ia: prazoInterno.memoria_calculo + "\n\n[Prazo interno complementar de 3 dias corridos]",
              metadata: {
                ...prazoRecord.metadata,
                tipo_prazo: "interno_complementar",
              },
            });
          }

          calculados++;
        } catch (e) {
          erros++;
          console.error(`Erro ao calcular prazo para publicação ${pub.id}:`, e);
        }
      }

      // Inserir todos os prazos em lote
      if (prazosInseridos.length > 0) {
        const { data: prazosInseridos2, error: insertError } = await supabase
          .schema("judiciario")
          .from("prazo_calculado")
          .insert(prazosInseridos)
          .select("id, titulo, data_base, data_inicio_contagem, data_vencimento, publicacao_id, processo_id, observacoes_ia, metadata");

        if (insertError) {
          console.error("Erro ao inserir prazos:", insertError);
          erros += prazosInseridos.length;
          calculados = 0;
        } else if (prazosInseridos2 && FS_API_KEY) {
          // Criar tasks no Freshsales para cada prazo inserido
          for (const prazo of prazosInseridos2) {
            try {
              // Buscar o freshsales_account_id do processo
              const meta = prazo.metadata as Record<string, unknown>;
              let accountId: string | null = null;
              
              if (prazo.processo_id) {
                const { data: proc } = await supabase
                  .schema("judiciario")
                  .from("processos")
                  .select("freshsales_account_id")
                  .eq("id", prazo.processo_id)
                  .single();
                accountId = proc?.freshsales_account_id ? String(proc.freshsales_account_id) : null;
              }

              // Construir descrição completa da task com memória extensiva e score de confiabilidade
              const numeroProcesso = String(meta?.numero_processo || "");
              const tribunal = String(meta?.tribunal || "");
              const vara = String(meta?.vara || "");
              const baseLegal = String(meta?.base_legal || "CPC");
              const atoPraticado = String(meta?.ato_praticado || "Prazo processual");
              const scoreConf = String(meta?.score_confiabilidade || "baixa");
              const motivoConf = String(meta?.motivo_confiabilidade || "");
              const scoreEmoji = scoreConf === "alta" ? "🟢" : scoreConf === "media" ? "🟡" : "🔴";
              const scoreLabel = scoreConf === "alta" ? "ALTA" : scoreConf === "media" ? "MÉDIA" : "BAIXA";
              const prazoDiasNum = Number(meta?.prazo_dias || 5);
              const tipoContagemStr = String(meta?.tipo_contagem || "dias_uteis") === "dias_uteis" ? "dias úteis" : "dias corridos";

              // Cabeçalho de auditoria
              const linhasDescricao: string[] = [
                `===================================================`,
                `  PRAZO PROCESSUAL — SISTEMA HMADV`,
                `===================================================`,
                ``,
                `${scoreEmoji} CONFIABILIDADE DO CÁLCULO: ${scoreLabel}`,
                motivoConf ? motivoConf : "",
                ``,
                `🔢 PROCESSO: ${numeroProcesso}`,
                tribunal ? `⚖️  TRIBUNAL: ${tribunal}` : "",
                vara ? `🏦 VARA: ${vara}` : "",
                ``,
                `⏱️  PRAZO: ${prazoDiasNum} ${tipoContagemStr}`,
                `📖 FUNDAMENTO: ${atoPraticado} (${baseLegal})`,
                `📅 DATA DA PUBLICAÇÃO: ${formatDateBR(prazo.data_base || prazo.data_vencimento)}`,
                `▶️  INÍCIO DA CONTAGEM: ${formatDateBR(prazo.data_inicio_contagem || prazo.data_base || prazo.data_vencimento)}`,
                `🛑 VENCIMENTO: ${formatDateBR(prazo.data_vencimento)}`,
                ``,
                `---------------------------------------------------`,
                prazo.observacoes_ia || "",
                `---------------------------------------------------`,
                ``,
                `⚠️  ATENÇÃO: Confirme este prazo no PrazoFácil antes de protocolar.`,
                `   www.prazofacil.com.br`,
                `   Estado: AM | Munícipio: Manaus | Tribunal: ${tribunal || "TJ-AM"}`,
              ];

              const descricao = linhasDescricao.filter(l => l !== undefined && l !== null).join("\n").slice(0, 65000);

              const taskId = await criarTaskFreshsales(
                prazo.titulo,
                descricao,
                prazo.data_vencimento,
                accountId
              );

              if (taskId) {
                await supabase
                  .schema("judiciario")
                  .from("prazo_calculado")
                  .update({ freshsales_task_id: taskId })
                  .eq("id", prazo.id);
              }
            } catch (e) {
              console.warn("Erro ao criar task FS para prazo", prazo.id, e);
            }
          }
        }
      }

      const elapsed = Date.now() - start;

      // Notificar Slack se calculou prazos
      if (notify && calculados > 0) {
        await notifySlack(calculados, erros, prazosInseridos.length, elapsed);
      }

      return new Response(JSON.stringify({
        publicacoes_processadas: publicacoesSemPrazo.length,
        prazos_calculados: calculados,
        prazos_inseridos: prazosInseridos.length,
        erros,
        elapsed_ms: elapsed,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ===== ALERTAS =====
    if (action === "alertas") {
      const hoje = formatDate(new Date());
      const em2Dias = formatDate(addDays(new Date(), 2));

      // Prazos vencendo em 2 dias úteis
      const { data: vencendo } = await supabase
        .schema("judiciario")
        .from("prazo_calculado")
        .select("id, titulo, data_vencimento, processo_id, publicacao_id, prioridade")
        .eq("status", "pendente")
        .gte("data_vencimento", hoje)
        .lte("data_vencimento", em2Dias)
        .order("data_vencimento");

      // Prazos já vencidos
      const { data: vencidos } = await supabase
        .schema("judiciario")
        .from("prazo_calculado")
        .select("id, titulo, data_vencimento, processo_id, publicacao_id, prioridade")
        .eq("status", "pendente")
        .lt("data_vencimento", hoje)
        .order("data_vencimento");

      // Enviar alertas ao Slack
      if ((vencendo && vencendo.length > 0) || (vencidos && vencidos.length > 0)) {
        await notifySlackAlertas(vencendo || [], vencidos || []);
      }

      return new Response(JSON.stringify({
        vencendo_2_dias: vencendo?.length || 0,
        vencidos: vencidos?.length || 0,
        alertas_enviados: true,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ===== CALCULAR_SINGLE =====
    if (action === "calcular_single") {
      const publicacaoId = body.publicacao_id;
      if (!publicacaoId) {
        return new Response(JSON.stringify({ error: "publicacao_id é obrigatório" }), { status: 400 });
      }

      const { data: pub } = await supabase
        .schema("judiciario")
        .from("publicacoes")
        .select("id, numero_processo_api, data_publicacao, conteudo, cidade_comarca_descricao, vara_descricao, processo_id")
        .eq("id", publicacaoId)
        .single();

      if (!pub) {
        return new Response(JSON.stringify({ error: "Publicação não encontrada" }), { status: 404 });
      }

      // Carregar feriados
      const hoje = new Date();
      const em90Dias = addDays(hoje, 90);
      const { data: feriadosData } = await supabase
        .schema("judiciario")
        .from("feriado_forense")
        .select("data_feriado, nome, afeta_prazo")
        .eq("afeta_prazo", true)
        .gte("data_feriado", formatDate(hoje))
        .lte("data_feriado", formatDate(em90Dias));

      const feriadosSet = new Set<string>((feriadosData || []).map(f => f.data_feriado));
      const feriadosMap = new Map<string, string>(
        (feriadosData || []).map(f => [f.data_feriado, f.nome])
      );

      const prazoRegra = pub.conteudo
        ? await identificarPrazoRegra(supabase, pub.conteudo, null)
        : null;

      const prazoDias = prazoRegra?.prazo_dias || 5;
      const tipoContagem: "dias_uteis" | "dias_corridos" =
        prazoRegra?.tipo_contagem === "dias_uteis" ? "dias_uteis" : "dias_corridos";

      const resultado = calcularPrazo(
        pub.data_publicacao,
        prazoDias,
        tipoContagem,
        feriadosSet,
        [],
        feriadosMap
      );

      return new Response(JSON.stringify({
        publicacao_id: publicacaoId,
        numero_processo: pub.numero_processo_api,
        regra_identificada: prazoRegra?.ato_praticado || "Prazo padrão (5 dias úteis)",
        base_legal: prazoRegra?.base_legal || "CPC",
        ...resultado,
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      error: "Ação inválida",
      actions: ["calcular_batch", "calcular_single", "alertas", "status"],
    }), { status: 400, headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error("publicacoes-prazos error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// NOTIFICAÇÕES SLACK
// ============================================================

async function notifySlack(calculados: number, erros: number, total: number, elapsed: number): Promise<void> {
  try {
    await fetch(SLACK_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({
        action: "notify_cron_status",
        job_name: "publicacoes-prazos",
        icon: erros > 0 ? "⚠️" : "⚖️",
        summary: `⚖️ *Prazos Calculados* — ${calculados} publicações processadas`,
        details: [
          `• Prazos inseridos: ${total}`,
          `• Publicações processadas: ${calculados}`,
          `• Erros: ${erros}`,
          `• Tempo: ${elapsed}ms`,
        ].join("\n"),
      }),
    });
  } catch (_) {}
}

async function notifySlackAlertas(
  vencendo: Array<{ titulo: string; data_vencimento: string; prioridade: string }>,
  vencidos: Array<{ titulo: string; data_vencimento: string; prioridade: string }>
): Promise<void> {
  try {
    const linhas: string[] = [];

    if (vencidos.length > 0) {
      linhas.push(`🚨 *PRAZOS VENCIDOS (${vencidos.length}):*`);
      vencidos.slice(0, 5).forEach(p => {
        linhas.push(`• ❌ ${p.titulo} — venceu em ${formatDateBR(p.data_vencimento)}`);
      });
    }

    if (vencendo.length > 0) {
      linhas.push(`⚠️ *VENCENDO EM 2 DIAS (${vencendo.length}):*`);
      vencendo.slice(0, 5).forEach(p => {
        linhas.push(`• ⏰ ${p.titulo} — vence em ${formatDateBR(p.data_vencimento)}`);
      });
    }

    await fetch(SLACK_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({
        action: "notify_cron_status",
        job_name: "alertas-prazos",
        icon: vencidos.length > 0 ? "🚨" : "⚠️",
        summary: `${vencidos.length > 0 ? "🚨" : "⚠️"} *Alerta de Prazos* — ${vencidos.length} vencidos, ${vencendo.length} vencendo`,
        details: linhas.join("\n"),
      }),
    });
  } catch (_) {}
}
