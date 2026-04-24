/**
 * freshdesk-cnj-webhook — Webhook do Freshdesk para extração automática de CNJ
 *
 * Modos de operação:
 * 1. Webhook (ticket individual): recebe payload do Freshdesk com ticket_id
 * 2. Batch scan (cron job): body = { mode: "batch_scan" } — varre todos os tickets sem CNJ
 *
 * Extração automática:
 *   - Regex com pontuação: NNNNNNN-NN.NNNN.N.NN.NNNN
 *   - Regex sem pontuação: 20 dígitos contínuos no padrão CNJ
 *   - Fontes: tags (prioridade 1) → assunto (prioridade 2) → corpo (prioridade 3)
 *
 * Variáveis de ambiente:
 *   FRESHDESK_API_KEY, FRESHDESK_DOMAIN (opcional, default: hmdesk.freshdesk.com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FD_DOMAIN = Deno.env.get("FRESHDESK_DOMAIN") || "https://hmdesk.freshdesk.com";
const FD_API_KEY = Deno.env.get("FRESHDESK_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Regex CNJ ────────────────────────────────────────────────────────────────
const CNJ_WITH_PUNCT = /\b(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})\b/;
const CNJ_WITHOUT_PUNCT = /\b(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})\b/;

function normalizeCnj(groups: string[]): string {
  return `${groups[0]}-${groups[1]}.${groups[2]}.${groups[3]}.${groups[4]}.${groups[5]}`;
}

function extractFirstCnj(text: string): string | null {
  if (!text) return null;
  const mPunct = text.match(CNJ_WITH_PUNCT);
  if (mPunct) return normalizeCnj(Array.from(mPunct).slice(1));
  const mNoPunct = text.match(CNJ_WITHOUT_PUNCT);
  if (mNoPunct) return normalizeCnj(Array.from(mNoPunct).slice(1));
  return null;
}

function isCnjTag(tag: string): boolean {
  const t = tag.trim();
  return CNJ_WITH_PUNCT.test(t) || CNJ_WITHOUT_PUNCT.test(t);
}

// ─── Helpers Freshdesk ────────────────────────────────────────────────────────
function fdHeaders() {
  const token = btoa(`${FD_API_KEY}:X`);
  return {
    "Authorization": `Basic ${token}`,
    "Content-Type": "application/json",
  };
}

async function getTicketDetail(ticketId: number): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${FD_DOMAIN}/api/v2/tickets/${ticketId}`, {
    headers: fdHeaders(),
  });
  if (!r.ok) return null;
  return await r.json();
}

async function getAllTicketsWithoutCnj(): Promise<number[]> {
  // Busca tickets no Freshdesk sem cf_processo_cnj preenchido
  const ticketIds: number[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(
      `${FD_DOMAIN}/api/v2/tickets?per_page=100&page=${page}&order_by=created_at&order_type=desc`,
      { headers: fdHeaders() }
    );
    if (!r.ok) break;
    const tickets = await r.json() as Record<string, unknown>[];
    if (!tickets || tickets.length === 0) break;

    for (const t of tickets) {
      const cf = (t.custom_fields as Record<string, unknown>) || {};
      const cnj = cf.cf_processo_cnj as string | null;
      if (!cnj) {
        ticketIds.push(Number(t.id));
      }
    }
    if (tickets.length < 100) break;
    page++;
    // Limite de segurança: máximo 10 páginas por execução (1000 tickets)
    if (page > 10) break;
  }
  return ticketIds;
}

async function updateTicketCnj(
  ticketId: number,
  cnj: string,
  tagsToKeep: string[] | null
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    custom_fields: { cf_processo_cnj: cnj },
  };
  if (tagsToKeep !== null) {
    payload.tags = tagsToKeep;
  }
  const r = await fetch(`${FD_DOMAIN}/api/v2/tickets/${ticketId}`, {
    method: "PUT",
    headers: fdHeaders(),
    body: JSON.stringify(payload),
  });
  return r.ok;
}

// ─── Verificar processo no Supabase ──────────────────────────────────────────
async function findProcessoByCnj(cnj: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("processos")
    .select("id, numero_cnj")
    .or(`numero_cnj.eq.${cnj},numero_cnj.eq.${cnj.replace(/[-\.]/g, "")}`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as Record<string, string>).id;
}

// ─── Atualizar freshdesk_tickets no Supabase ─────────────────────────────────
async function upsertFreshdeskTicket(
  ticketId: number,
  cnj: string,
  processoId: string | null
): Promise<void> {
  const { data: existing } = await supabase
    .from("freshdesk_tickets")
    .select("id")
    .eq("fd_ticket_id", ticketId)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase
      .from("freshdesk_tickets")
      .update({ process_cnj: cnj, processo_id: processoId, updated_at: new Date().toISOString() })
      .eq("fd_ticket_id", ticketId);
  } else {
    await supabase
      .from("freshdesk_tickets")
      .insert({ fd_ticket_id: ticketId, process_cnj: cnj, processo_id: processoId, updated_at: new Date().toISOString() });
  }
}

// ─── Processar um ticket individual ──────────────────────────────────────────
async function processTicket(ticketId: number): Promise<Record<string, unknown>> {
  const ticket = await getTicketDetail(ticketId);
  if (!ticket) {
    return { ticket_id: ticketId, action: "ticket_not_found" };
  }

  const subject = String(ticket.subject || "");
  const descriptionText = String(ticket.description_text || "");
  const tags = (ticket.tags as string[]) || [];
  const customFields = (ticket.custom_fields as Record<string, unknown>) || {};
  const currentCnj = customFields.cf_processo_cnj as string | null;

  if (currentCnj) {
    return { ticket_id: ticketId, cnj: currentCnj, action: "already_set" };
  }

  let cnjFound: string | null = null;
  let cnjSource = "";
  let tagsToKeep: string[] | null = null;

  // 1. Tags
  const cnjTags: string[] = [];
  const nonCnjTags: string[] = [];
  for (const tag of tags) {
    if (isCnjTag(tag)) {
      const normalized = extractFirstCnj(tag);
      if (normalized && !cnjFound) { cnjFound = normalized; cnjSource = "tag"; }
      cnjTags.push(tag);
    } else {
      nonCnjTags.push(tag);
    }
  }
  if (cnjFound) tagsToKeep = nonCnjTags;

  // 2. Assunto
  if (!cnjFound) {
    cnjFound = extractFirstCnj(subject);
    if (cnjFound) cnjSource = "subject";
  }

  // 3. Corpo
  if (!cnjFound) {
    cnjFound = extractFirstCnj(descriptionText);
    if (cnjFound) cnjSource = "body";
  }

  if (!cnjFound) {
    return { ticket_id: ticketId, cnj: null, action: "no_cnj_found" };
  }

  const processoId = await findProcessoByCnj(cnjFound);
  const fdUpdated = await updateTicketCnj(ticketId, cnjFound, tagsToKeep);
  await upsertFreshdeskTicket(ticketId, cnjFound, processoId);

  return {
    ticket_id: ticketId,
    cnj: cnjFound,
    cnj_source: cnjSource,
    processo_id: processoId,
    freshdesk_updated: fdUpdated,
    action: "cnj_extracted",
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // ── Modo batch_scan (cron job) ───────────────────────────────────────────
  if (body.mode === "batch_scan") {
    console.log("Iniciando batch_scan de tickets sem CNJ...");
    const ticketIds = await getAllTicketsWithoutCnj();
    console.log(`Encontrados ${ticketIds.length} tickets sem CNJ`);

    const results = [];
    let processed = 0;
    let found = 0;

    for (const ticketId of ticketIds) {
      const result = await processTicket(ticketId);
      results.push(result);
      processed++;
      if (result.action === "cnj_extracted") found++;
      // Rate limiting: 1 requisição por 200ms (max 5/s, limite Freshdesk = 50/min)
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Batch scan concluído: ${processed} processados, ${found} CNJs encontrados`);
    return new Response(
      JSON.stringify({ ok: true, mode: "batch_scan", processed, found, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Modo webhook (ticket individual) ────────────────────────────────────
  const ticketData = (body.ticket || body) as Record<string, unknown>;
  const ticketId = Number(ticketData.id || body.id || body.ticket_id);

  if (!ticketId) {
    return new Response(JSON.stringify({ error: "ticket_id not found in payload" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const result = await processTicket(ticketId);
  return new Response(
    JSON.stringify({ ok: true, ...result }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
