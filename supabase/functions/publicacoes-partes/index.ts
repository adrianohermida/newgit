import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * publicacoes-partes  v1
 *
 * Responsabilidades:
 *   1. Ler lote de processos que possuem polo_ativo/polo_passivo mas ainda não têm partes
 *      cadastradas na tabela judiciario.partes.
 *   2. Extrair partes do texto das publicações vinculadas ao processo (via parsePartiesFromText).
 *   3. Persistir partes na tabela judiciario.partes (upsert por processo_id+nome+polo).
 *   4. Para cada parte sem contact_id_freshsales, buscar/criar Contact no Freshsales e
 *      atualizar o campo contact_id_freshsales na tabela partes.
 *
 * Actions:
 *   extrair_batch   — Extrai partes de publicações e cria contacts no Freshsales (padrão)
 *   status          — Retorna contagens de partes pendentes e sincronizadas
 *
 * Retorno do extrair_batch:
 *   { extraidas, criados_freshsales, erros, restantes }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const FS_DOMAIN_RAW        = Deno.env.get("FRESHSALES_DOMAIN") ?? "";
const FS_API_KEY           = Deno.env.get("FRESHSALES_API_KEY") ?? "";
const FS_OWNER_ID          = Number(Deno.env.get("FRESHSALES_OWNER_ID") ?? Deno.env.get("FS_OWNER_ID") ?? "31000147944");

const DOMAIN_MAP: Record<string, string> = {
  "hmadv-7b725ea101eff55.freshsales.io": "hmadv-org.myfreshworks.com",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fsDomain(): string {
  const d = FS_DOMAIN_RAW.trim();
  if (d.includes("myfreshworks.com")) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, ".myfreshworks.com");
}
function authHeader(): string {
  const k = FS_API_KEY.trim();
  return (k.startsWith("Token ") || k.startsWith("Bearer ")) ? k : `Token token=${k}`;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Advogado { nome: string; oab: string; oab_uf: string; }
interface ParteCanonica {
  nome: string;
  polo: "ativo" | "passivo";
  tipo_pessoa: "FISICA" | "JURIDICA" | "DESCONHECIDA";
  documento?: string;
  tipo?: string;
  advogados: Advogado[];
  fonte: "datajud" | "publicacao";
}

// ─── Parser de partes do texto ───────────────────────────────────────────────
function parsePartiesFromText(texto: string): ParteCanonica[] {
  if (!texto) return [];
  const advBlocoMatch = texto.match(/Advogado\(s\):\s*([^\n]+(?:\n(?!Processo)[^\n]+)*)/);
  const advogados: Advogado[] = [];
  if (advBlocoMatch) {
    for (const entry of advBlocoMatch[1].split(",").map(s => s.trim()).filter(Boolean)) {
      const m = entry.match(/^(.+?)\s*[-–]\s*OAB\s*(?:\/)?([A-Z]{2})[-\s](\d+)/i);
      if (m) advogados.push({ nome: m[1].trim(), oab: m[3].trim(), oab_uf: m[2].trim().toUpperCase() });
      else { const n = entry.replace(/\s*-\s*OAB.*$/i, "").trim(); if (n) advogados.push({ nome: n, oab: "", oab_uf: "" }); }
    }
  }
  const partesMatch = texto.match(/Parte\(s\):\s*([^\n]+(?:\n(?!Advogado|Processo)[^\n]+)*)/);
  if (!partesMatch) return [];
  const partes: ParteCanonica[] = [];
  const parteRegex = /([A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒa-záéíóúàâêôãõç0-9\s\.\-\']+?)\s*\(([AP])\)/g;
  let m;
  while ((m = parteRegex.exec(partesMatch[1])) !== null) {
    const nome = m[1].trim();
    if (!nome || nome.length < 3) continue;
    const siglasJuridicas = /\b(LTDA|S\.A\.|S\.A|ME|EPP|EIRELI|SA|S\/A|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERV[IÇ]|INCORPORA)/i;
    partes.push({
      nome, polo: m[2] === "A" ? "ativo" : "passivo",
      tipo_pessoa: siglasJuridicas.test(nome) ? "JURIDICA" : "FISICA",
      advogados, fonte: "publicacao",
    });
  }
  return partes;
}

// ─── Buscar ou criar Contact no Freshsales ───────────────────────────────────
async function buscarOuCriarContact(
  parte: ParteCanonica,
  accountId: string | null,
): Promise<string | null> {
  if (!FS_API_KEY || !FS_DOMAIN_RAW) return null;
  const domain = fsDomain();
  const auth = authHeader();

  // Buscar por nome
  try {
    const searchRes = await fetch(
      `https://${domain}/crm/sales/api/contacts/filter`,
      {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          filter_rule: [{ attribute: "contact.display_name", operator: "is", value: parte.nome }],
          page: 1, per_page: 1,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (searchRes.ok) {
      const data = await searchRes.json() as Record<string, unknown>;
      const contacts = (data.contacts ?? data.contact ?? []) as Record<string, unknown>[];
      if (contacts.length > 0) return String(contacts[0].id);
    }
  } catch { /* prosseguir para criação */ }

  // Criar contact
  try {
    const payload: Record<string, unknown> = {
      contact: {
        first_name: parte.nome.split(" ")[0],
        last_name: parte.nome.split(" ").slice(1).join(" ") || "-",
        display_name: parte.nome,
        owner_id: FS_OWNER_ID,
        ...(accountId ? { sales_accounts: [{ id: Number(accountId), is_primary: true }] } : {}),
        custom_field: {
          ...(parte.documento ? { cf_cpf_cnpj: parte.documento } : {}),
          cf_polo_processual: parte.polo === "ativo" ? "Ativo" : "Passivo",
          cf_tipo_pessoa: parte.tipo_pessoa,
        },
      },
    };
    const createRes = await fetch(
      `https://${domain}/crm/sales/api/contacts`,
      {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (createRes.ok) {
      const data = await createRes.json() as Record<string, unknown>;
      const contact = (data.contact ?? data) as Record<string, unknown>;
      return contact.id ? String(contact.id) : null;
    }
  } catch { /* ignorar */ }

  return null;
}

// ─── Action: status ──────────────────────────────────────────────────────────
async function actionStatus(db: ReturnType<typeof createClient>): Promise<Response> {
  const [total, semContact] = await Promise.all([
    db.schema("judiciario").from("partes").select("id", { count: "exact", head: true }),
    db.schema("judiciario").from("partes").select("id", { count: "exact", head: true }).is("contact_id_freshsales", null),
  ]);
  const [totalProc, semPartes] = await Promise.all([
    db.schema("judiciario").from("processos").select("id", { count: "exact", head: true }),
    db.schema("judiciario").from("processos").select("id", { count: "exact", head: true })
      .not("polo_ativo", "is", null)
      .filter("id", "not.in", `(SELECT DISTINCT processo_id FROM judiciario.partes WHERE processo_id IS NOT NULL)`),
  ]);
  return Response.json({
    partes_total: total.count ?? 0,
    partes_sem_contact_freshsales: semContact.count ?? 0,
    processos_total: totalProc.count ?? 0,
    processos_sem_partes_estimado: semPartes.count ?? 0,
  });
}

// ─── Action: extrair_batch ───────────────────────────────────────────────────
async function actionExtrairBatch(
  db: ReturnType<typeof createClient>,
  batchSize: number,
): Promise<Response> {
  let extraidas = 0;
  let criadosFreshsales = 0;
  let erros = 0;

  // 1. Buscar partes sem contact_id_freshsales para sincronizar com FS
  const { data: partesPendentes } = await db
    .schema("judiciario")
    .from("partes")
    .select("id, processo_id, nome, polo, tipo_pessoa, documento, contact_id_freshsales")
    .is("contact_id_freshsales", null)
    .not("nome", "is", null)
    .limit(batchSize);

  for (const parte of (partesPendentes ?? [])) {
    // Buscar account_id do processo
    let accountId: string | null = null;
    if (parte.processo_id) {
      const { data: proc } = await db.schema("judiciario").from("processos")
        .select("account_id_freshsales")
        .eq("id", parte.processo_id)
        .single();
      accountId = proc?.account_id_freshsales ?? null;
    }

    const contactId = await buscarOuCriarContact(
      { nome: parte.nome, polo: parte.polo ?? "ativo", tipo_pessoa: parte.tipo_pessoa ?? "DESCONHECIDA",
        documento: parte.documento ?? undefined, advogados: [], fonte: "publicacao" },
      accountId,
    );

    if (contactId) {
      await db.schema("judiciario").from("partes")
        .update({ contact_id_freshsales: contactId })
        .eq("id", parte.id);
      criadosFreshsales++;
    } else {
      erros++;
    }
    await sleep(150);
  }

  // 2. Extrair partes de publicações para processos que ainda não têm partes cadastradas
  const { data: pubsSemPartes } = await db
    .schema("judiciario")
    .from("publicacoes")
    .select("id, processo_id, conteudo, numero_processo_api")
    .not("processo_id", "is", null)
    .not("conteudo", "is", null)
    .filter("processo_id", "not.in",
      `(SELECT DISTINCT processo_id FROM judiciario.partes WHERE processo_id IS NOT NULL)`)
    .limit(Math.floor(batchSize / 2));

  for (const pub of (pubsSemPartes ?? [])) {
    if (!pub.conteudo || !pub.processo_id) continue;
    const partes = parsePartiesFromText(pub.conteudo);
    if (partes.length === 0) continue;

    for (const parte of partes) {
      const { error } = await db.schema("judiciario").from("partes").upsert(
        {
          processo_id: pub.processo_id,
          nome: parte.nome,
          polo: parte.polo,
          tipo: parte.tipo ?? null,
          tipo_pessoa: parte.tipo_pessoa,
          documento: parte.documento ?? null,
          advogados: parte.advogados,
          fonte: parte.fonte,
        },
        { onConflict: "processo_id,nome,polo", ignoreDuplicates: false },
      );
      if (!error) extraidas++;
      else erros++;
    }
    await sleep(50);
  }

  // Contar restantes
  const { count: restantes } = await db
    .schema("judiciario")
    .from("partes")
    .select("id", { count: "exact", head: true })
    .is("contact_id_freshsales", null);

  return Response.json({
    extraidas,
    criados_freshsales: criadosFreshsales,
    errors: erros,
    restantes: restantes ?? 0,
  });
}

// ─── Handler principal ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const action = String(body.action ?? url.searchParams.get("action") ?? "extrair_batch");
    const batchSize = Number(body.batch_size ?? url.searchParams.get("batch_size") ?? 50);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === "status") return await actionStatus(db);
    if (action === "extrair_batch") return await actionExtrairBatch(db, batchSize);

    return Response.json({
      error: "Ação inválida",
      actions: ["extrair_batch", "status"],
    }, { status: 400 });

  } catch (e) {
    console.error("publicacoes-partes error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
