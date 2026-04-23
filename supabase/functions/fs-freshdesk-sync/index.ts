/**
 * fs-freshdesk-sync — Sincronização bidirecional de contatos Freshsales ↔ Freshdesk
 *
 * Ações disponíveis:
 *   - sync_fd_to_supabase: Importa todos os contatos do Freshdesk para o Supabase
 *   - sync_fs_to_fd: Cria/atualiza no Freshdesk os contatos do Freshsales que não existem lá
 *   - link_contacts: Vincula contatos Freshsales ↔ Freshdesk pelo e-mail
 *   - full_sync: Executa as três ações em sequência
 *
 * Rate limit Freshdesk: 1.000 req/hora (compartilhado com Freshsales)
 * Cron: a cada 30 minutos
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FD_DOMAIN = Deno.env.get("FRESHDESK_DOMAIN") || "https://hmdesk.freshdesk.com";
const FD_API_KEY = Deno.env.get("FRESHDESK_API_KEY")!;

// IDs fixos do Freshdesk (auditados em 23/04/2026)
const FD_AGENT_ADRIANO = 103077748617;
const FD_GROUP_JURIDICO = 103000419984;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers Freshdesk ────────────────────────────────────────────────────────

function fdHeaders() {
  const token = btoa(`${FD_API_KEY}:X`);
  return {
    "Authorization": `Basic ${token}`,
    "Content-Type": "application/json",
  };
}

async function fdGet(path: string, params: Record<string, string> = {}): Promise<[number, unknown]> {
  const url = new URL(`${FD_DOMAIN}/api/v2${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { headers: fdHeaders() });
  const body = r.status !== 204 ? await r.json() : {};
  return [r.status, body];
}

async function fdPost(path: string, data: unknown): Promise<[number, unknown]> {
  const r = await fetch(`${FD_DOMAIN}/api/v2${path}`, {
    method: "POST",
    headers: fdHeaders(),
    body: JSON.stringify(data),
  });
  const body = r.status !== 204 ? await r.json() : {};
  return [r.status, body];
}

async function fdPut(path: string, data: unknown): Promise<[number, unknown]> {
  const r = await fetch(`${FD_DOMAIN}/api/v2${path}`, {
    method: "PUT",
    headers: fdHeaders(),
    body: JSON.stringify(data),
  });
  const body = r.status !== 204 ? await r.json() : {};
  return [r.status, body];
}

// ─── Buscar todos os contatos do Freshdesk (paginado) ────────────────────────

async function fetchAllFdContacts(): Promise<unknown[]> {
  const all: unknown[] = [];
  let page = 1;
  while (true) {
    const [status, data] = await fdGet("/contacts", { per_page: "100", page: String(page) });
    if (status !== 200 || !Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 100) break;
    page++;
    await new Promise(r => setTimeout(r, 300)); // respeitar rate limit
  }
  return all;
}

// ─── Ação 1: Importar contatos do Freshdesk → Supabase ───────────────────────

async function syncFdToSupabase(): Promise<Record<string, number>> {
  const contacts = await fetchAllFdContacts();
  let inseridos = 0, atualizados = 0, erros = 0;

  for (const c of contacts as Record<string, unknown>[]) {
    const cf = (c.custom_fields as Record<string, unknown>) || {};
    const record = {
      fd_contact_id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      mobile: c.mobile,
      cpf: cf.cpf ? String(cf.cpf) : null,
      status: cf.status as string || null,
      fd_raw_payload: c,
      sync_status: "synced",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("freshdesk_contacts")
      .upsert(record, { onConflict: "fd_contact_id" });

    if (error) erros++;
    else inseridos++;
  }

  return { total_fd: contacts.length, inseridos, atualizados, erros };
}

// ─── Ação 2: Vincular contatos Freshsales ↔ Freshdesk pelo e-mail ────────────

async function linkContacts(): Promise<Record<string, number>> {
  // Buscar contatos Freshsales com e-mail mas sem vínculo Freshdesk
  const { data: fsContacts } = await supabase
    .from("freshsales_contacts")
    .select("id, freshsales_contact_id, name, email, email_normalized")
    .is("fd_contact_id", null)
    .not("email", "is", null)
    .limit(500);

  if (!fsContacts || fsContacts.length === 0) return { vinculados: 0, sem_match: 0 };

  let vinculados = 0, sem_match = 0;

  for (const fsContact of fsContacts) {
    const email = fsContact.email_normalized || fsContact.email;
    if (!email) { sem_match++; continue; }

    // Buscar no Supabase (freshdesk_contacts) pelo e-mail
    const { data: fdMatch } = await supabase
      .from("freshdesk_contacts")
      .select("fd_contact_id")
      .ilike("email", email)
      .maybeSingle();

    if (fdMatch) {
      // Vincular no Supabase
      await supabase
        .from("freshsales_contacts")
        .update({ fd_contact_id: fdMatch.fd_contact_id, fd_synced_at: new Date().toISOString() })
        .eq("id", fsContact.id);

      // Vincular na freshdesk_contacts também
      await supabase
        .from("freshdesk_contacts")
        .update({ fs_contact_id: fsContact.freshsales_contact_id })
        .eq("fd_contact_id", fdMatch.fd_contact_id);

      vinculados++;
    } else {
      sem_match++;
    }
  }

  return { vinculados, sem_match };
}

// ─── Ação 3: Criar no Freshdesk os clientes do Freshsales que não existem ────

async function syncFsToFd(): Promise<Record<string, number>> {
  // Buscar contatos Freshsales com lifecycle_stage de cliente (via raw_payload)
  // que ainda não têm fd_contact_id
  const { data: fsContacts } = await supabase
    .from("freshsales_contacts")
    .select("id, freshsales_contact_id, name, email, phone")
    .is("fd_contact_id", null)
    .not("email", "is", null)
    .limit(50); // lote pequeno para respeitar rate limit

  if (!fsContacts || fsContacts.length === 0) return { criados: 0, ja_existiam: 0, erros: 0 };

  let criados = 0, ja_existiam = 0, erros = 0;

  for (const fsContact of fsContacts) {
    if (!fsContact.email) continue;

    // Verificar se já existe no Freshdesk pelo e-mail
    const [searchStatus, searchResult] = await fdGet("/contacts", {
      email: fsContact.email,
    });

    if (searchStatus === 200 && Array.isArray(searchResult) && searchResult.length > 0) {
      // Já existe — apenas vincular
      const fdContact = searchResult[0] as Record<string, unknown>;
      await supabase
        .from("freshsales_contacts")
        .update({ fd_contact_id: fdContact.id, fd_synced_at: new Date().toISOString() })
        .eq("id", fsContact.id);

      // Upsert na freshdesk_contacts
      await supabase.from("freshdesk_contacts").upsert({
        fd_contact_id: fdContact.id,
        fs_contact_id: fsContact.freshsales_contact_id,
        name: fdContact.name,
        email: fdContact.email,
        fd_raw_payload: fdContact,
        sync_status: "synced",
        updated_at: new Date().toISOString(),
      }, { onConflict: "fd_contact_id" });

      ja_existiam++;
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    // Criar no Freshdesk
    const [createStatus, created] = await fdPost("/contacts", {
      name: fsContact.name || "Sem nome",
      email: fsContact.email,
      phone: fsContact.phone || undefined,
      unique_external_id: `fs_${fsContact.freshsales_contact_id}`,
    });

    if (createStatus === 201 && created && typeof created === "object") {
      const fdId = (created as Record<string, unknown>).id as number;

      await supabase
        .from("freshsales_contacts")
        .update({ fd_contact_id: fdId, fd_synced_at: new Date().toISOString() })
        .eq("id", fsContact.id);

      await supabase.from("freshdesk_contacts").upsert({
        fd_contact_id: fdId,
        fs_contact_id: fsContact.freshsales_contact_id,
        name: fsContact.name,
        email: fsContact.email,
        fd_raw_payload: created,
        sync_status: "synced",
        updated_at: new Date().toISOString(),
      }, { onConflict: "fd_contact_id" });

      criados++;
    } else {
      erros++;
    }

    await new Promise(r => setTimeout(r, 300)); // rate limit
  }

  return { criados, ja_existiam, erros };
}

// ─── Handler Principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const startTime = Date.now();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sem body */ }

  const action = (body.action as string) || "full_sync";
  const results: Record<string, unknown> = { action, started_at: new Date().toISOString() };

  try {
    if (action === "sync_fd_to_supabase" || action === "full_sync") {
      results.fd_to_supabase = await syncFdToSupabase();
    }

    if (action === "link_contacts" || action === "full_sync") {
      results.link = await linkContacts();
    }

    if (action === "sync_fs_to_fd" || action === "full_sync") {
      results.fs_to_fd = await syncFsToFd();
    }

    results.status = "ok";
    results.elapsed_ms = Date.now() - startTime;

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", error: String(err), ...results }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
