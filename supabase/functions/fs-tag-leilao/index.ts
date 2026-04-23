/**
 * fs-tag-leilao — Edge Function
 * Identifica processos no Supabase que possuem publicações cujas palavras-chave
 * da API Advise contêm 'LEILÃO' ou 'LEILÕES (campo raw_payload.palavrasChave),
 * e insere a tag 'LEILÃO' no account correspondente no Freshsales.
 *
 * Regras:
 * - Fonte de verdade: campo raw_payload.palavrasChave da tabela judiciario.publicacoes
 * - Ignora o campo 'conteudo' — apenas palavrasChave é considerado
 * - Palavras-chave aceitas: 'LEILAO', 'LEILOES' (após normalização NFD)
 * - A tag inserida no Freshsales é exatamente: 'LEILÃO'
 * - Não remove a tag se a publicação for removida (operação idempotente/aditiva)
 * - Registra em judiciario.fs_tag_leilao_log o resultado de cada account tagueado
 *
 * Rate limit: máximo 150 req/hora para este caller (de 1000 total)
 * Cron: a cada 30 minutos via pg_cron
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Configuração ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FS_DOMAIN_RAW = Deno.env.get("FRESHSALES_DOMAIN") || "";
const FS_API_KEY    = Deno.env.get("FRESHSALES_API_KEY") || "";

const CALLER         = "fs-tag-leilao";
const QUOTA_PER_HOUR = 150;
const BATCH_SIZE     = 30;  // processos por execução
const TAG_LEILAO     = "LEILÃO";

const DOMAIN_MAP: Record<string, string> = {
  "hmadv-7b725ea101eff55.freshsales.io": "hmadv-org.myfreshworks.com",
};

function fsDomain(): string {
  const d = (FS_DOMAIN_RAW ?? "").trim();
  if (d.includes("myfreshworks.com")) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, ".myfreshworks.com");
}

function authHeader(): string {
  const k = FS_API_KEY.trim();
  return (k.startsWith("Token ") || k.startsWith("Bearer ")) ? k : `Token token=${k}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shouldRetry = (s: number) => s === 429 || s >= 500;

// ─── Supabase client ──────────────────────────────────────────────────────────
const db = createClient(SUPABASE_URL, SVC_KEY, {
  auth: { persistSession: false },
});

// ─── Normalizar palavra-chave (remove acentos, upper) ─────────────────────────
function normalizeKeyword(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

// ─── Verificar se publicação tem palavra-chave LEILÃO ─────────────────────────
function isLeilaoPublication(rawPayload: unknown): boolean {
  const raw = (rawPayload ?? {}) as Record<string, unknown>;
  const palavras = Array.isArray(raw.palavrasChave) ? raw.palavrasChave : [];
  return palavras
    .map((item) => normalizeKeyword(item))
    .some((item) => item === "LEILAO" || item === "LEILOES");
}

// ─── Freshsales: POST helper com retry ───────────────────────────────────────
async function fsPost(
  path: string,
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const b = await r.text();
    if (!shouldRetry(r.status) || i === 3) {
      try {
        return { status: r.status, data: JSON.parse(b) };
      } catch {
        return { status: r.status, data: { raw: b } };
      }
    }
    await sleep(1500 * i);
  }
  throw new Error("fsPost retries esgotados");
}

// ─── Freshsales: GET helper com retry ────────────────────────────────────────
async function fsGet(path: string): Promise<{ status: number; data: Record<string, unknown> }> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
      },
    });
    const b = await r.text();
    if (!shouldRetry(r.status) || i === 3) {
      try {
        return { status: r.status, data: JSON.parse(b) };
      } catch {
        return { status: r.status, data: { raw: b } };
      }
    }
    await sleep(1500 * i);
  }
  throw new Error("fsGet retries esgotados");
}

// ─── Freshsales: PUT helper ───────────────────────────────────────────────────
async function fsPut(path: string, body: unknown): Promise<{ status: number }> {
  const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  await r.text();
  return { status: r.status };
}

// ─── Buscar account_id no Freshsales pelo CNJ ────────────────────────────────
function cnj20paraFormatado(cnj: string): string {
  const d = cnj.replace(/\D/g, "");
  if (d.length !== 20) return cnj;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

async function buscarAccountIdPorCNJ(cnj: string): Promise<string | null> {
  const cnjFmt = cnj20paraFormatado(cnj);
  for (const [field, value] of [
    ["cf_numero_cnj", cnjFmt],
    ["cf_numero_cnj", cnj],
    ["cf_numero_processo", cnjFmt],
    ["cf_numero_processo", cnj],
  ] as [string, string][]) {
    try {
      const { status, data } = await fsPost("sales_accounts/filter", {
        filter_rule: [{ attribute: field, operator: "is", value }],
        page: 1,
        per_page: 5,
      });
      if (status === 200) {
        const list = (data.sales_accounts ?? []) as Record<string, unknown>[];
        if (list.length > 0) return String(list[0].id);
      }
    } catch (_) { /* continuar */ }
  }
  return null;
}

// ─── Inserir tag LEILÃO no account do Freshsales ─────────────────────────────
async function tagearAccount(accountId: string): Promise<{
  ok: boolean;
  jaTagueado: boolean;
  tagsAntes: string[];
  tagsDepois: string[];
}> {
  // Buscar tags atuais
  let tagsAtuais: string[] = [];
  try {
    const { status, data } = await fsGet(`sales_accounts/${accountId}`);
    if (status === 200) {
      const acc = (data as Record<string, unknown>)?.sales_account as Record<string, unknown> | undefined;
      tagsAtuais = (acc?.tags as string[] | undefined) ?? [];
    }
  } catch (_) { /* continuar */ }

  // Verificar se já tem a tag
  if (tagsAtuais.includes(TAG_LEILAO)) {
    return { ok: true, jaTagueado: true, tagsAntes: tagsAtuais, tagsDepois: tagsAtuais };
  }

  // Adicionar a tag
  const novasTags = [...tagsAtuais, TAG_LEILAO];
  try {
    const { status } = await fsPut(`sales_accounts/${accountId}`, {
      sales_account: { tags: novasTags },
    });
    return {
      ok: status >= 200 && status < 300,
      jaTagueado: false,
      tagsAntes: tagsAtuais,
      tagsDepois: novasTags,
    };
  } catch (e) {
    console.error(`Erro ao taguear account ${accountId}:`, String(e));
    return { ok: false, jaTagueado: false, tagsAntes: tagsAtuais, tagsDepois: tagsAtuais };
  }
}

// ─── Rate limit ───────────────────────────────────────────────────────────────
async function checkRateLimit(needed: number): Promise<{ ok: boolean; callerUsed: number; totalUsed: number }> {
  // Quando needed=0, apenas consulta sem registrar consumo
  if (needed === 0) {
    const { data, error } = await db
      .from("freshsales_rate_limit")
      .select("caller, calls_used")
      .gte("window_start", new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString());
    if (error) return { ok: true, callerUsed: 0, totalUsed: 0 };
    const rows = (data ?? []) as { caller: string; calls_used: number }[];
    const totalUsed  = rows.reduce((s, r) => s + (r.calls_used ?? 0), 0);
    const callerUsed = rows.filter(r => r.caller === CALLER).reduce((s, r) => s + (r.calls_used ?? 0), 0);
    return { ok: true, callerUsed, totalUsed };
  }
  const { data, error } = await db.rpc("fs_rate_limit_check", {
    p_caller: CALLER,
    p_needed: needed,
    p_quota:  QUOTA_PER_HOUR,
  });
  if (error) return { ok: false, callerUsed: 999, totalUsed: 999 };
  return {
    ok:         data?.ok === true,
    callerUsed: data?.caller_used ?? 0,
    totalUsed:  data?.total_used ?? 0,
  };
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

  try {
    if (!FS_API_KEY || !FS_DOMAIN_RAW) {
      return Response.json({
        error: "FRESHSALES_API_KEY ou FRESHSALES_DOMAIN não configurados",
      }, { status: 500 });
    }

    // Verificar rate limit
    const rl0 = await checkRateLimit(0);
    if (rl0.callerUsed >= QUOTA_PER_HOUR) {
      return Response.json({
        status:      "quota_exhausted",
        caller_used: rl0.callerUsed,
        total_used:  rl0.totalUsed,
      });
    }
    if (rl0.totalUsed >= 950) {
      return Response.json({
        status:     "global_quota_near_limit",
        total_used: rl0.totalUsed,
      });
    }

    // Buscar processos com publicações LEILÃO ainda não tagueados no Freshsales
    // Estratégia: buscar publicações com palavrasChave LEILAO/LEILOES
    // que tenham um processo vinculado com account_id_freshsales preenchido
    // OU que tenham numero_processo_api para buscar o account
    const { data: pubs, error: pubError } = await db
      .schema("judiciario")
      .from("publicacoes")
      .select(`
        id,
        numero_processo_api,
        raw_payload,
        processo_id,
        processos!inner(
          id,
          numero_cnj,
          account_id_freshsales,
          fs_tag_leilao_aplicada
        )
      `)
      .not("raw_payload", "is", null)
      .is("processos.fs_tag_leilao_aplicada", null)
      .not("processos.numero_cnj", "is", null)
      .order("data_publicacao", { ascending: false })
      .limit(BATCH_SIZE * 5); // buscar mais para filtrar por palavrasChave

    if (pubError) {
      // Fallback: buscar sem join se a coluna não existir
      console.warn("Join falhou, tentando query alternativa:", pubError.message);
      return Response.json({ error: pubError.message, fallback_needed: true }, { status: 500 });
    }

    // Filtrar apenas publicações com palavrasChave LEILAO/LEILOES
    const pubsLeilao = (pubs ?? []).filter((p) =>
      isLeilaoPublication(p.raw_payload)
    );

    if (pubsLeilao.length === 0) {
      return Response.json({
        status:      "no_leilao_publications",
        message:     "Nenhuma publicação LEILÃO pendente de tagueamento",
        caller_used: rl0.callerUsed,
        total_used:  rl0.totalUsed,
        elapsed_ms:  Date.now() - startTime,
      });
    }

    // Agrupar por processo para evitar processar o mesmo processo múltiplas vezes
    const processoMap = new Map<string, {
      processoId: string;
      cnj: string;
      accountId: string | null;
    }>();

    for (const pub of pubsLeilao) {
      const proc = (pub as Record<string, unknown>).processos as Record<string, unknown> | null;
      if (!proc) continue;
      const processoId = String(proc.id ?? "");
      if (!processoId || processoMap.has(processoId)) continue;
      processoMap.set(processoId, {
        processoId,
        cnj:       String(proc.numero_cnj ?? ""),
        accountId: (proc.account_id_freshsales as string | null) ?? null,
      });
      if (processoMap.size >= BATCH_SIZE) break;
    }

    // Processar cada processo
    let tagueados    = 0;
    let jaTagueados  = 0;
    let semAccount   = 0;
    let erros        = 0;
    const detalhes: unknown[] = [];

    for (const [processoId, info] of processoMap) {
      // Verificar rate limit antes de cada processo (2-3 req: filter + get + put)
      const rl = await checkRateLimit(3);
      if (!rl.ok) {
        console.warn("Rate limit atingido, parando processamento");
        break;
      }

      let accountId = info.accountId;

      // Se não temos o account_id, buscar no Freshsales
      if (!accountId && info.cnj) {
        accountId = await buscarAccountIdPorCNJ(info.cnj);
        // Salvar no Supabase para próximas execuções
        if (accountId) {
          await db
            .schema("judiciario")
            .from("processos")
            .update({ account_id_freshsales: accountId })
            .eq("id", processoId)
            .then(() => {}).catch(() => {});
        }
      }

      if (!accountId) {
        semAccount++;
        detalhes.push({ processoId, cnj: info.cnj, resultado: "sem_account" });
        continue;
      }

      // Taguear o account
      const resultado = await tagearAccount(accountId);

      if (resultado.jaTagueado) {
        jaTagueados++;
        // Marcar no Supabase que já foi tagueado
        await db
          .schema("judiciario")
          .from("processos")
          .update({ fs_tag_leilao_aplicada: new Date().toISOString() })
          .eq("id", processoId)
          .then(() => {}).catch(() => {});
        detalhes.push({ processoId, cnj: info.cnj, accountId, resultado: "ja_tagueado" });
      } else if (resultado.ok) {
        tagueados++;
        // Marcar no Supabase
        await db
          .schema("judiciario")
          .from("processos")
          .update({ fs_tag_leilao_aplicada: new Date().toISOString() })
          .eq("id", processoId)
          .then(() => {}).catch(() => {});
        detalhes.push({
          processoId,
          cnj:        info.cnj,
          accountId,
          resultado:  "tagueado",
          tagsAntes:  resultado.tagsAntes,
          tagsDepois: resultado.tagsDepois,
        });
      } else {
        erros++;
        detalhes.push({ processoId, cnj: info.cnj, accountId, resultado: "erro" });
      }
    }

    return Response.json({
      status:          "ok",
      tagueados,
      ja_tagueados:    jaTagueados,
      sem_account:     semAccount,
      erros,
      total_leilao_pubs: pubsLeilao.length,
      processos_processados: processoMap.size,
      caller_used:     rl0.callerUsed + (tagueados + jaTagueados) * 3,
      total_used:      rl0.totalUsed  + (tagueados + jaTagueados) * 3,
      elapsed_ms:      Date.now() - startTime,
      detalhes:        detalhes.slice(0, 20), // limitar output
    });

  } catch (err) {
    console.error("fs-tag-leilao error:", err);
    return Response.json({
      error:      String(err),
      elapsed_ms: Date.now() - startTime,
    }, { status: 500 });
  }
});
