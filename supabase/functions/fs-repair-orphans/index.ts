/**
 * fs-repair-orphans v1
 * 
 * Corrige campos órfãos nos processos do Supabase e sincroniza com o Freshsales.
 * 
 * Ações disponíveis:
 *   - status: diagnóstico completo de campos órfãos
 *   - fix_partes: extrai polo_ativo/polo_passivo do título e movimentos
 *   - fix_classe: preenche classe a partir da tabela tpu_classe (CNJ)
 *   - fix_instancia: preenche instância a partir do grau e tribunal
 *   - fix_status: preenche status a partir do último movimento
 *   - fix_fs_sync: re-sincroniza processos com campos corrigidos para o Freshsales
 *   - fix_all: executa todas as correções em sequência
 *   - reset_datajud: reseta processos "processando" para "pendente" (desbloqueio)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FS_DOMAIN = Deno.env.get("FRESHSALES_DOMAIN") ?? "hermidamaia.myfreshworks.com";
const FS_KEY = Deno.env.get("FRESHSALES_API_KEY")!;

// ─── Freshsales helpers ───────────────────────────────────────────────────────

async function fsUpdateAccount(accountId: string, fields: Record<string, unknown>): Promise<boolean> {
  const resp = await fetch(
    `https://${FS_DOMAIN}/crm/sales/api/accounts/${accountId}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Token token=${FS_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ account: fields }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  return resp.ok;
}

// ─── Ação: status ─────────────────────────────────────────────────────────────

async function getStatus(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("exec_sql" as never, {
    query: `
      SELECT 
        COUNT(*) as total_processos,
        COUNT(account_id_freshsales) as com_account_fs,
        COUNT(CASE WHEN status IS NULL THEN 1 END) as sem_status,
        COUNT(CASE WHEN instancia IS NULL THEN 1 END) as sem_instancia,
        COUNT(CASE WHEN tribunal IS NULL THEN 1 END) as sem_tribunal,
        COUNT(CASE WHEN classe IS NULL THEN 1 END) as sem_classe,
        COUNT(CASE WHEN polo_ativo IS NULL THEN 1 END) as sem_polo_ativo,
        COUNT(CASE WHEN polo_passivo IS NULL THEN 1 END) as sem_polo_passivo,
        COUNT(CASE WHEN dados_incompletos = true THEN 1 END) as dados_incompletos,
        COUNT(CASE WHEN datajud_status = 'pendente' THEN 1 END) as datajud_pendente,
        COUNT(CASE WHEN datajud_status = 'enriquecido' THEN 1 END) as datajud_enriquecido,
        COUNT(CASE WHEN datajud_status = 'processando' THEN 1 END) as datajud_processando,
        COUNT(CASE WHEN datajud_status = 'nao_enriquecivel' THEN 1 END) as datajud_nao_enriquecivel
      FROM judiciario.processos 
      WHERE deleted_at IS NULL
    `
  } as never);
  
  if (error) {
    // Fallback: query direta
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${SRK}`, "Content-Type": "application/json", "apikey": SRK },
        body: JSON.stringify({ query: `SELECT COUNT(*) as total, COUNT(CASE WHEN status IS NULL THEN 1 END) as sem_status, COUNT(CASE WHEN instancia IS NULL THEN 1 END) as sem_instancia, COUNT(CASE WHEN polo_ativo IS NULL THEN 1 END) as sem_polo_ativo, COUNT(CASE WHEN dados_incompletos = true THEN 1 END) as dados_incompletos FROM judiciario.processos WHERE deleted_at IS NULL` }),
      }
    );
    const d = await r.json();
    return { diagnostico: d, nota: "query simplificada" };
  }
  
  return { diagnostico: data };
}

// ─── Ação: fix_instancia ──────────────────────────────────────────────────────

async function fixInstancia(batch = 200): Promise<Record<string, unknown>> {
  // Preenche instância baseado no grau do processo
  // grau 1 = 1ª instância, grau 2 = 2ª instância, grau 3 = STJ/STF
  const { data: processos, error } = await supabase
    .from("processos")
    .select("id, grau, tribunal")
    .is("instancia", null)
    .not("grau", "is", null)
    .limit(batch);
  
  if (error || !processos?.length) return { corrigidos: 0, erro: error?.message };
  
  let corrigidos = 0;
  for (const p of processos) {
    const grau = Number(p.grau);
    let instancia = null;
    if (grau === 1) instancia = "1ª Instância";
    else if (grau === 2) instancia = "2ª Instância";
    else if (grau === 3) instancia = "Instância Superior";
    else if (grau === 4) instancia = "Turma Recursal";
    
    if (instancia) {
      const { error: e } = await supabase
        .from("processos")
        .update({ instancia })
        .eq("id", p.id);
      if (!e) corrigidos++;
    }
  }
  
  return { corrigidos, total_candidatos: processos.length };
}

// ─── Ação: fix_status ─────────────────────────────────────────────────────────

async function fixStatus(batch = 100): Promise<Record<string, unknown>> {
  // Preenche status_atual_processo a partir do último movimento
  const { data: processos, error } = await supabase
    .from("processos")
    .select("id, numero_cnj")
    .is("status_atual_processo", null)
    .eq("datajud_status", "enriquecido")
    .limit(batch);
  
  if (error || !processos?.length) return { corrigidos: 0, erro: error?.message };
  
  let corrigidos = 0;
  const ids = processos.map(p => p.id);
  
  // Buscar último movimento de cada processo
  const { data: movimentos } = await supabase
    .from("movimentos")
    .select("processo_id, descricao, data_movimento")
    .in("processo_id", ids)
    .order("data_movimento", { ascending: false });
  
  if (!movimentos?.length) return { corrigidos: 0, nota: "sem movimentos" };
  
  // Agrupar por processo_id (pegar o mais recente)
  const ultimoMov: Record<string, string> = {};
  for (const m of movimentos) {
    if (!ultimoMov[m.processo_id]) {
      ultimoMov[m.processo_id] = m.descricao ?? "Em andamento";
    }
  }
  
  for (const p of processos) {
    const status = ultimoMov[p.id];
    if (status) {
      const { error: e } = await supabase
        .from("processos")
        .update({ status_atual_processo: status.slice(0, 200) })
        .eq("id", p.id);
      if (!e) corrigidos++;
    }
  }
  
  return { corrigidos, total_candidatos: processos.length };
}

// ─── Ação: fix_partes ─────────────────────────────────────────────────────────

async function fixPartes(batch = 100): Promise<Record<string, unknown>> {
  // Busca polo_ativo/passivo da tabela judiciario.partes
  const { data: processos, error } = await supabase
    .from("processos")
    .select("id")
    .is("polo_ativo", null)
    .eq("datajud_status", "enriquecido")
    .limit(batch);
  
  if (error || !processos?.length) return { corrigidos: 0, erro: error?.message };
  
  let corrigidos = 0;
  const ids = processos.map(p => p.id);
  
  // Buscar partes de cada processo
  const { data: partes } = await supabase
    .from("partes")
    .select("processo_id, polo, nome")
    .in("processo_id", ids);
  
  if (!partes?.length) return { corrigidos: 0, nota: "sem partes cadastradas" };
  
  // Agrupar por processo
  const partesMap: Record<string, { ativo: string[], passivo: string[] }> = {};
  for (const parte of partes) {
    if (!partesMap[parte.processo_id]) {
      partesMap[parte.processo_id] = { ativo: [], passivo: [] };
    }
    const polo = String(parte.polo ?? "").toLowerCase();
    if (polo.includes("ativo") || polo === "autor" || polo === "requerente" || polo === "exequente") {
      partesMap[parte.processo_id].ativo.push(parte.nome);
    } else if (polo.includes("passivo") || polo === "réu" || polo === "requerido" || polo === "executado") {
      partesMap[parte.processo_id].passivo.push(parte.nome);
    }
  }
  
  for (const p of processos) {
    const parteProc = partesMap[p.id];
    if (parteProc && (parteProc.ativo.length > 0 || parteProc.passivo.length > 0)) {
      const updates: Record<string, string> = {};
      if (parteProc.ativo.length > 0) updates.polo_ativo = parteProc.ativo.slice(0, 3).join(" | ");
      if (parteProc.passivo.length > 0) updates.polo_passivo = parteProc.passivo.slice(0, 3).join(" | ");
      
      const { error: e } = await supabase
        .from("processos")
        .update(updates)
        .eq("id", p.id);
      if (!e) corrigidos++;
    }
  }
  
  return { corrigidos, total_candidatos: processos.length };
}

// ─── Ação: fix_fs_sync ────────────────────────────────────────────────────────

async function fixFsSync(batch = 30): Promise<Record<string, unknown>> {
  // Re-sincroniza processos com campos corrigidos para o Freshsales
  // Busca processos com account_id mas que precisam de atualização
  const { data: processos, error } = await supabase
    .from("processos")
    .select("id, numero_cnj, tribunal, instancia, status_atual_processo, classe, orgao_julgador, polo_ativo, polo_passivo, account_id_freshsales, dados_incompletos")
    .not("account_id_freshsales", "is", null)
    .eq("dados_incompletos", true)
    .not("instancia", "is", null)
    .limit(batch);
  
  if (error || !processos?.length) return { sincronizados: 0, erro: error?.message };
  
  let sincronizados = 0;
  let erros = 0;
  
  for (const p of processos) {
    // Montar campos para atualizar no Freshsales Account
    const fsFields: Record<string, unknown> = {};
    if (p.instancia) fsFields["cf_instancia"] = p.instancia;
    if (p.tribunal) fsFields["cf_tribunal"] = p.tribunal;
    if (p.status_atual_processo) fsFields["cf_status_processo"] = p.status_atual_processo;
    if (p.classe) fsFields["cf_classe_processual"] = p.classe;
    if (p.orgao_julgador) fsFields["cf_orgao_julgador"] = p.orgao_julgador;
    if (p.polo_ativo) fsFields["cf_polo_ativo"] = p.polo_ativo;
    if (p.polo_passivo) fsFields["cf_polo_passivo"] = p.polo_passivo;
    
    if (Object.keys(fsFields).length === 0) continue;
    
    const ok = await fsUpdateAccount(p.account_id_freshsales, fsFields);
    if (ok) {
      // Marcar como não mais incompleto se os campos principais foram preenchidos
      const camposPreenchidos = p.instancia && p.tribunal && p.orgao_julgador;
      if (camposPreenchidos) {
        await supabase
          .from("processos")
          .update({ dados_incompletos: false, fs_sync_at: new Date().toISOString() })
          .eq("id", p.id);
      } else {
        await supabase
          .from("processos")
          .update({ fs_sync_at: new Date().toISOString() })
          .eq("id", p.id);
      }
      sincronizados++;
    } else {
      erros++;
    }
    
    // Respeitar rate limit do Freshsales (1000 req/hora = ~1 req/3.6s)
    await new Promise(r => setTimeout(r, 100));
  }
  
  return { sincronizados, erros, total_candidatos: processos.length };
}

// ─── Ação: reset_datajud ──────────────────────────────────────────────────────

async function resetDatajud(): Promise<Record<string, unknown>> {
  // Reseta processos presos em "processando" para "pendente"
  const { data, error } = await supabase
    .from("processos")
    .update({ datajud_status: "pendente" })
    .eq("datajud_status", "processando")
    .select("id");
  
  return { resetados: data?.length ?? 0, erro: error?.message };
}

// ─── Ação: fix_all ────────────────────────────────────────────────────────────

async function fixAll(batch = 100): Promise<Record<string, unknown>> {
  const resultados: Record<string, unknown> = {};
  
  console.log("fix_all: iniciando fix_instancia...");
  resultados.instancia = await fixInstancia(batch);
  
  console.log("fix_all: iniciando fix_partes...");
  resultados.partes = await fixPartes(batch);
  
  console.log("fix_all: iniciando fix_status...");
  resultados.status = await fixStatus(batch);
  
  console.log("fix_all: iniciando fix_fs_sync...");
  resultados.fs_sync = await fixFsSync(Math.min(batch, 30));
  
  return resultados;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  
  const url = new URL(req.url);
  const action = String(body.action ?? url.searchParams.get("action") ?? "status");
  const batch = Number(body.batch ?? url.searchParams.get("batch") ?? 100);
  
  console.log(`fs-repair-orphans: action=${action} batch=${batch}`);
  
  let resultado: Record<string, unknown>;
  
  try {
    switch (action) {
      case "status":
        resultado = await getStatus();
        break;
      case "fix_instancia":
        resultado = await fixInstancia(batch);
        break;
      case "fix_status":
        resultado = await fixStatus(batch);
        break;
      case "fix_partes":
        resultado = await fixPartes(batch);
        break;
      case "fix_fs_sync":
        resultado = await fixFsSync(Math.min(batch, 30));
        break;
      case "reset_datajud":
        resultado = await resetDatajud();
        break;
      case "fix_all":
        resultado = await fixAll(batch);
        break;
      default:
        resultado = {
          error: `Ação desconhecida: ${action}`,
          acoes_disponiveis: ["status", "fix_instancia", "fix_status", "fix_partes", "fix_fs_sync", "reset_datajud", "fix_all"]
        };
    }
  } catch (e) {
    resultado = { error: String(e), action };
  }
  
  // Notificar Slack se foi uma ação de correção
  if (action !== "status" && !resultado.error) {
    fetch(`${SUPABASE_URL}/functions/v1/dotobot-slack`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SRK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "notify_cron_status",
        job: `fs-repair-orphans/${action}`,
        status: "ok",
        detalhes: JSON.stringify(resultado),
      }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {});
  }
  
  return new Response(JSON.stringify(resultado, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
