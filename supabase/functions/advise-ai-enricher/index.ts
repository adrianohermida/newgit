/**
 * advise-ai-enricher — Edge Function
 * Enriquece publicações do Advise com análise semântica via LLM (OpenAI/Gemini).
 *
 * Para cada publicação sem ai_resumo:
 * 1. Lê o campo `conteudo` da publicação
 * 2. Envia ao LLM com prompt especializado em direito processual
 * 3. Extrai: resumo, tipo de ato, prazo sugerido (dias úteis), urgência
 * 4. Atualiza os campos ai_* na tabela judiciario.publicacoes
 * 5. Atualiza a descrição da activity no Freshsales (se existir freshsales_activity_id)
 * 6. Atualiza as anotações da task de prazo (se existir freshsales_task_id)
 *
 * Rate limit LLM: máximo 50 publicações por execução (tokens controlados)
 * Cron: a cada 10 minutos via pg_cron
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("HMADV_OPENAI_KEY") || "";
const FS_DOMAIN_RAW = Deno.env.get("FRESHSALES_DOMAIN") || "";
const FS_API_KEY    = Deno.env.get("FRESHSALES_API_KEY") || "";

const BATCH_SIZE   = 20; // publicações por execução
const MAX_CONTEUDO = 3000; // chars máximos do conteúdo enviado ao LLM

const db = createClient(SUPABASE_URL, SVC_KEY, {
  auth: { persistSession: false },
  db: { schema: "judiciario" },
});
const dbPublic = createClient(SUPABASE_URL, SVC_KEY, {
  auth: { persistSession: false },
});

function fsDomain(): string {
  const d = FS_DOMAIN_RAW.trim();
  if (d.includes("myfreshworks.com")) return d;
  return d.replace(/\.freshsales\.io$/, ".myfreshworks.com") || "hmadv-org.myfreshworks.com";
}

function fsHeaders(): HeadersInit {
  return {
    "Authorization": `Token token=${FS_API_KEY.trim()}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

// ─── Prompt especializado em direito processual ───────────────────────────────
function buildPrompt(conteudo: string, nomeCliente: string, nomeDiario: string): string {
  return `Você é um assistente jurídico especializado em direito processual brasileiro.
Analise a publicação judicial abaixo e retorne um JSON com os seguintes campos:

- resumo: string (máx 300 chars) — resumo objetivo do ato processual, sem mencionar o escritório
- tipo_ato: string — classificação do ato (ex: "Intimação", "Sentença", "Despacho", "Decisão Interlocutória", "Acórdão", "Edital de Citação", "Audiência Designada", "Penhora", "Arrematação", "Alvará", "Outro")
- prazo_dias_uteis: number | null — prazo em dias úteis para manifestação (null se não houver prazo ou se não for possível identificar)
- urgencia: "critica" | "alta" | "normal" | "baixa" — nível de urgência processual
- requer_manifestacao: boolean — se o ato requer manifestação/petição do advogado
- palavras_chave: string[] — até 5 palavras-chave relevantes do ato

Publicação:
Diário: ${nomeDiario}
Cliente: ${nomeCliente}
Conteúdo: ${conteudo.substring(0, MAX_CONTEUDO)}

Responda APENAS com o JSON válido, sem markdown, sem explicações.`;
}

// ─── Chamar OpenAI/Gemini ─────────────────────────────────────────────────────
async function enrichWithLLM(conteudo: string, nomeCliente: string, nomeDiario: string): Promise<{
  resumo: string;
  tipo_ato: string;
  prazo_dias_uteis: number | null;
  urgencia: string;
  requer_manifestacao: boolean;
  palavras_chave: string[];
  tokens: number;
} | null> {
  if (!OPENAI_KEY || !conteudo?.trim()) return null;

  const prompt = buildPrompt(conteudo, nomeCliente, nomeDiario);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI error:", res.status, errText.substring(0, 200));
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const tokens  = data?.usage?.total_tokens || 0;

    const parsed = JSON.parse(content);
    return {
      resumo:              String(parsed.resumo || "").substring(0, 500),
      tipo_ato:            String(parsed.tipo_ato || "Outro"),
      prazo_dias_uteis:    typeof parsed.prazo_dias_uteis === "number" ? parsed.prazo_dias_uteis : null,
      urgencia:            ["critica", "alta", "normal", "baixa"].includes(parsed.urgencia) ? parsed.urgencia : "normal",
      requer_manifestacao: Boolean(parsed.requer_manifestacao),
      palavras_chave:      Array.isArray(parsed.palavras_chave) ? parsed.palavras_chave.slice(0, 5) : [],
      tokens,
    };
  } catch (e) {
    console.error("Erro ao chamar LLM:", String(e));
    return null;
  }
}

// ─── Atualizar activity no Freshsales com resumo IA ──────────────────────────
async function atualizarActivityFreshsales(activityId: string, resumo: string, tipoAto: string): Promise<void> {
  if (!FS_API_KEY || !activityId) return;
  const domain = fsDomain();

  try {
    await fetch(
      `https://${domain}/crm/sales/api/activities/${activityId}`,
      {
        method: "PUT",
        headers: fsHeaders(),
        body: JSON.stringify({
          activity: {
            note: `[IA] ${tipoAto}: ${resumo}`,
          },
        }),
      }
    );
  } catch (_) { /* não bloquear por falha no Freshsales */ }
}

// ─── Atualizar task de prazo no Freshsales com memória de cálculo ─────────────
async function atualizarTaskFreshsales(
  taskId: string,
  resumo: string,
  tipoAto: string,
  prazoDiasUteis: number | null,
  urgencia: string,
): Promise<void> {
  if (!FS_API_KEY || !taskId) return;
  const domain = fsDomain();

  const urgenciaLabel: Record<string, string> = {
    critica: "🔴 CRÍTICA",
    alta:    "🟠 ALTA",
    normal:  "🟡 NORMAL",
    baixa:   "🟢 BAIXA",
  };

  const nota = [
    `[Análise IA — ${new Date().toLocaleDateString("pt-BR")}]`,
    `Tipo de ato: ${tipoAto}`,
    `Urgência: ${urgenciaLabel[urgencia] || urgencia}`,
    prazoDiasUteis ? `Prazo sugerido: ${prazoDiasUteis} dias úteis` : "",
    "",
    `Resumo: ${resumo}`,
  ].filter(Boolean).join("\n");

  try {
    await fetch(
      `https://${domain}/crm/sales/api/tasks/${taskId}`,
      {
        method: "PUT",
        headers: fsHeaders(),
        body: JSON.stringify({
          task: { note: nota },
        }),
      }
    );
  } catch (_) { /* não bloquear */ }
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const startTime = Date.now();

  // Verificar credenciais LLM
  if (!OPENAI_KEY) {
    return Response.json({
      error: "OPENAI_API_KEY não configurada — enriquecimento IA indisponível",
    }, { status: 500 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* usar defaults */ }

  const batchSize = Number(body.batch_size ?? BATCH_SIZE);
  const forceId   = body.publicacao_id as string | undefined;

  // Buscar publicações sem enriquecimento IA (com conteúdo disponível)
  let query = db
    .from("publicacoes")
    .select("id, conteudo, nome_cliente, nome_diario, freshsales_activity_id, freshsales_task_id, processo_id")
    .is("ai_enriquecido_at", null)
    .not("conteudo", "is", null)
    .neq("conteudo", "")
    .order("data_publicacao", { ascending: false });

  if (forceId) {
    query = db
      .from("publicacoes")
      .select("id, conteudo, nome_cliente, nome_diario, freshsales_activity_id, freshsales_task_id, processo_id")
      .eq("id", forceId);
  } else {
    query = query.limit(batchSize);
  }

  const { data: publicacoes, error: qErr } = await query;

  if (qErr) {
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  if (!publicacoes || publicacoes.length === 0) {
    return Response.json({
      status:    "queue_empty",
      message:   "Nenhuma publicação pendente de enriquecimento IA",
      elapsed_ms: Date.now() - startTime,
    });
  }

  let enriquecidas  = 0;
  let erros         = 0;
  let tokensTotal   = 0;
  const resultados: Array<{ id: string; status: string; tipo_ato?: string; urgencia?: string }> = [];

  for (const pub of publicacoes) {
    try {
      const resultado = await enrichWithLLM(
        pub.conteudo || "",
        pub.nome_cliente || "Cliente",
        pub.nome_diario  || "Diário Oficial",
      );

      if (!resultado) {
        erros++;
        resultados.push({ id: pub.id, status: "llm_error" });
        continue;
      }

      // Atualizar publicação com dados de IA
      const { error: upErr } = await db
        .from("publicacoes")
        .update({
          ai_resumo:         resultado.resumo,
          ai_tipo_ato:       resultado.tipo_ato,
          ai_prazo_sugerido: resultado.prazo_dias_uteis,
          ai_urgencia:       resultado.urgencia,
          ai_enriquecido_at: new Date().toISOString(),
          ai_tokens_usados:  resultado.tokens,
        })
        .eq("id", pub.id);

      if (upErr) {
        console.error("Erro ao atualizar publicação:", upErr.message);
        erros++;
        resultados.push({ id: pub.id, status: "db_error" });
        continue;
      }

      tokensTotal += resultado.tokens;
      enriquecidas++;
      resultados.push({ id: pub.id, status: "ok", tipo_ato: resultado.tipo_ato, urgencia: resultado.urgencia });

      // Atualizar Freshsales (assíncrono, não bloqueia)
      if (pub.freshsales_activity_id) {
        await atualizarActivityFreshsales(
          String(pub.freshsales_activity_id),
          resultado.resumo,
          resultado.tipo_ato,
        );
      }
      if (pub.freshsales_task_id) {
        await atualizarTaskFreshsales(
          String(pub.freshsales_task_id),
          resultado.resumo,
          resultado.tipo_ato,
          resultado.prazo_dias_uteis,
          resultado.urgencia,
        );
      }

    } catch (e) {
      console.error("Erro ao processar publicação", pub.id, String(e));
      erros++;
      resultados.push({ id: pub.id, status: "exception" });
    }
  }

  return Response.json({
    status:      "ok",
    enriquecidas,
    erros,
    total:       publicacoes.length,
    tokens_total: tokensTotal,
    elapsed_ms:  Date.now() - startTime,
    resultados,
  });
});
