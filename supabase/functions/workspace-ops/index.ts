/**
 * workspace-ops — Operações de Workspace CRM (Freshsales + Freshdesk + Supabase)
 *
 * Extração de workspace-ops.js para edge function Supabase.
 *
 * Rotas:
 *   POST /execute         — Executa uma operação de workspace
 *   GET  /health          — Health check
 *
 * Operações disponíveis (campo "operation" no body):
 *   daily_summary         — Resumo diário operacional
 *   contact_lookup        — Busca contato por email
 *   deal_view             — Visualiza deal por ID
 *   account_view          — Visualiza account por ID
 *   tasks_list            — Lista tasks
 *   task_view             — Visualiza task por ID
 *   task_create           — Cria nova task
 *   task_update           — Atualiza task
 *   task_delete           — Remove task
 *   contact_update        — Atualiza contato
 *   deal_update           — Atualiza deal
 *   appointments_list     — Lista appointments
 *   documents_by_email    — Documentos do cliente por email
 *   tickets_by_email      — Tickets Freshdesk por email
 *   ticket_create         — Cria ticket Freshdesk
 *   freshdesk_queue       — Fila de tickets Freshdesk
 *   conversations_by_email — Conversas registradas por email
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

// ─── Helpers de ambiente ───────────────────────────────────────────────────

function getClean(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function getEnv(key: string): string | null {
  return getClean(Deno.env.get(key));
}

function getFreshsalesApiKey(): string {
  return getEnv("FRESHSALES_API_KEY") || getEnv("FS_API_KEY") || "";
}

function getFreshsalesDomain(): string {
  return getEnv("FRESHSALES_DOMAIN") || getEnv("FS_DOMAIN") || "hmadv-org.myfreshworks.com";
}

function getFreshdeskApiKey(): string {
  return getEnv("FRESHDESK_API_KEY") || "";
}

function getFreshdeskDomain(): string {
  return getEnv("FRESHDESK_DOMAIN") || "hmadv.freshdesk.com";
}

function getSupabaseUrl(): string {
  return getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL") || "";
}

function getSupabaseKey(): string {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_ANON_KEY") || "";
}

function getGatewaySecret(): string | null {
  return (
    getEnv("CIDA_WOPS_SECRET") ||
    getEnv("FREDDY_ACTION_SHARED_SECRET") ||
    getEnv("HMDAV_AI_SHARED_SECRET") ||
    getEnv("HMADV_AI_SHARED_SECRET") ||
    getEnv("LAWDESK_AI_SHARED_SECRET")
  );
}

// ─── Autorização ──────────────────────────────────────────────────────────

// Decodifica payload de um JWT sem verificar assinatura (apenas para inspecão de claims)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Adicionar padding base64 se necessário
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function authorizeRequest(req: Request): { ok: boolean; status?: number; error?: string } {
  const expected = getGatewaySecret();
  const supabaseRef = getSupabaseUrl().match(/\/\/([^.]+)\./)?.[1] || '';

  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided =
    getClean(req.headers.get("x-freddy-secret")) ||
    getClean(req.headers.get("x-hmadv-secret")) ||
    getClean(req.headers.get("x-shared-secret")) ||
    getClean(bearerMatch?.[1]) ||
    null;

  if (!provided) {
    return { ok: false, status: 401, error: "Nao autorizado para usar o Workspace Ops." };
  }

  // (1) Aceitar shared secret configurado
  if (expected && provided === expected) {
    return { ok: true };
  }

  // (2) Aceitar JWT Supabase com role=service_role do mesmo projeto
  // Decodifica o payload sem verificar assinatura (confiamos na rede interna do Supabase)
  const payload = decodeJwtPayload(provided);
  if (
    payload &&
    payload.role === 'service_role' &&
    payload.iss === 'supabase' &&
    (supabaseRef === '' || payload.ref === supabaseRef)
  ) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "Nao autorizado para usar o Workspace Ops." };
}

// ─── Respostas JSON ───────────────────────────────────────────────────────

function jsonOk(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), { status, headers: JSON_HEADERS });
}

function jsonError(message: string, status = 500, code?: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...(code ? { code } : {}) }),
    { status, headers: JSON_HEADERS }
  );
}

// ─── Freshsales helpers ───────────────────────────────────────────────────

async function fsRequest(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; payload: unknown }> {
  const domain = getFreshsalesDomain();
  const apiKey = getFreshsalesApiKey();
  const url = `https://${domain}/crm/sales/api${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Token token=${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Freshsales retornou HTML (rate limit, auth error, etc.)
    payload = { _raw_error: text.slice(0, 300), _status: resp.status };
  }
  // Lançar erro explícito para status problemáticos
  if (resp.status === 429) {
    throw new Error(`[Freshsales] Rate limit atingido (HTTP 429). Aguarde alguns minutos e tente novamente.`);
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`[Freshsales] Autenticação falhou (HTTP ${resp.status}). Verifique FRESHSALES_API_KEY.`);
  }
  // Verificar se o payload contém _raw_error (HTML inesperado)
  const p = payload as Record<string, unknown>;
  if (p?._raw_error) {
    throw new Error(`[Freshsales] Resposta inválida (HTTP ${resp.status}): ${String(p._raw_error).slice(0, 150)}`);
  }
  return { status: resp.status, payload };
}

async function listTasks(page = 1, perPage = 20): Promise<unknown[]> {
  const { payload } = await fsRequest(`/tasks?page=${page}&per_page=${perPage}`);
  const p = payload as Record<string, unknown>;
  return Array.isArray(p?.tasks) ? p.tasks as unknown[] : Array.isArray(payload) ? payload as unknown[] : [];
}

async function viewTask(taskId: string): Promise<unknown> {
  const { payload } = await fsRequest(`/tasks/${encodeURIComponent(taskId)}`);
  const p = payload as Record<string, unknown>;
  return p?.task ?? payload;
}

async function createTask(task: Record<string, unknown>): Promise<unknown> {
  const { payload } = await fsRequest("/tasks", {
    method: "POST",
    body: JSON.stringify({ task }),
  });
  const p = payload as Record<string, unknown>;
  return p?.task ?? payload;
}

async function updateTask(taskId: string, patch: Record<string, unknown>): Promise<unknown> {
  const { payload } = await fsRequest(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify({ task: patch }),
  });
  const p = payload as Record<string, unknown>;
  return p?.task ?? payload;
}

async function deleteTask(taskId: string): Promise<{ deleted: boolean; id: string }> {
  await fsRequest(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  return { deleted: true, id: taskId };
}

async function updateContact(contactId: string, patch: Record<string, unknown>): Promise<unknown> {
  const { payload } = await fsRequest(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify({ contact: patch }),
  });
  const p = payload as Record<string, unknown>;
  return p?.contact ?? payload;
}

async function updateDeal(dealId: string, patch: Record<string, unknown>): Promise<unknown> {
  const { payload } = await fsRequest(`/deals/${encodeURIComponent(dealId)}`, {
    method: "PUT",
    body: JSON.stringify({ deal: patch }),
  });
  const p = payload as Record<string, unknown>;
  return p?.deal ?? payload;
}

async function viewContact(contactId: string): Promise<unknown> {
  const { payload } = await fsRequest(`/contacts/${encodeURIComponent(contactId)}?include=owner,sales_accounts,deals`);
  const p = payload as Record<string, unknown>;
  return p?.contact ?? payload;
}

async function viewDeal(dealId: string): Promise<unknown> {
  const { payload } = await fsRequest(`/deals/${encodeURIComponent(dealId)}`);
  const p = payload as Record<string, unknown>;
  return p?.deal ?? payload;
}

async function viewAccount(accountId: string): Promise<unknown> {
  const { payload } = await fsRequest(`/sales_accounts/${encodeURIComponent(accountId)}`);
  const p = payload as Record<string, unknown>;
  return p?.sales_account ?? payload;
}

async function lookupContactByEmail(email: string): Promise<unknown> {
  const { payload } = await fsRequest(
    `/contacts/filter?include=owner,sales_accounts&q=${encodeURIComponent(email)}`
  );
  const p = payload as Record<string, unknown>;
  const contacts = (p?.contacts ?? p?.data ?? []) as unknown[];
  return (contacts as Array<Record<string, unknown>>)[0] || null;
}

async function listDeals(page = 1, perPage = 10): Promise<unknown[]> {
  const { payload } = await fsRequest(`/deals?page=${page}&per_page=${perPage}`);
  const p = payload as Record<string, unknown>;
  return Array.isArray(p?.deals) ? p.deals as unknown[] : [];
}

async function listAccounts(page = 1, perPage = 10): Promise<unknown[]> {
  const { payload } = await fsRequest(`/sales_accounts?page=${page}&per_page=${perPage}`);
  const p = payload as Record<string, unknown>;
  return Array.isArray(p?.sales_accounts) ? p.sales_accounts as unknown[] : [];
}

async function listAppointments(page = 1, perPage = 10): Promise<unknown[]> {
  const { payload } = await fsRequest(`/appointments?page=${page}&per_page=${perPage}`);
  const p = payload as Record<string, unknown>;
  return Array.isArray(p?.appointments) ? p.appointments as unknown[] : [];
}

// ─── Freshdesk helpers ────────────────────────────────────────────────────

async function freshdeskRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const domain = getFreshdeskDomain();
  const apiKey = getFreshdeskApiKey();
  const url = `https://${domain}/api/v2${path}`;
  const credentials = btoa(`${apiKey}:X`);
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text().catch(() => "");
  return text ? JSON.parse(text) : null;
}

async function listFreshdeskTickets(page = 1, perPage = 10): Promise<unknown[]> {
  const data = await freshdeskRequest(`/tickets?page=${page}&per_page=${perPage}&order_by=updated_at&order_type=desc`);
  return Array.isArray(data) ? data : [];
}

async function createFreshdeskTicket(payload: Record<string, unknown>): Promise<unknown> {
  return freshdeskRequest("/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Supabase helpers ─────────────────────────────────────────────────────

async function supabaseQuery(path: string): Promise<unknown> {
  const url = `${getSupabaseUrl()}/rest/v1/${path}`;
  const key = getSupabaseKey();
  const resp = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Supabase ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ─── Formatadores ─────────────────────────────────────────────────────────

function clean(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function toDateLabel(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function summarizeContact(contact: Record<string, unknown>): string {
  if (!contact) return "Contato nao encontrado.";
  const emails = Array.isArray(contact.emails) ? (contact.emails as string[]).join(", ") : clean(contact.email) || "sem email";
  return [
    `Contato: ${contact.display_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Sem nome"}`,
    `ID: ${contact.id || "n/d"}`,
    `Emails: ${emails}`,
    `Telefone: ${contact.mobile_number || contact.work_number || "n/d"}`,
  ].join("\n");
}

function summarizeDeal(deal: Record<string, unknown>): string {
  if (!deal) return "Deal nao encontrado.";
  return [
    `Deal: ${deal.name || "Sem nome"}`,
    `ID: ${deal.id || "n/d"}`,
    `Valor: ${deal.amount || "n/d"}`,
    `Estagio: ${(deal.stage_name || deal.stage || "n/d")}`,
    `Fechamento: ${toDateLabel(deal.expected_close_date) || "n/d"}`,
  ].join("\n");
}

function summarizeAccount(account: Record<string, unknown>): string {
  if (!account) return "Conta nao encontrada.";
  return [
    `Conta: ${account.name || "Sem nome"}`,
    `ID: ${account.id || "n/d"}`,
    `Telefone: ${account.phone || "n/d"}`,
  ].join("\n");
}

function summarizeTask(task: Record<string, unknown>): string {
  return `${task.id || "n/d"} · ${task.title || "Sem titulo"} · vencimento ${toDateLabel(task.due_date) || "n/d"} · status ${task.status || "n/d"}`;
}

function summarizeAppointment(appt: Record<string, unknown>): string {
  return `${appt.id || "n/d"} · ${appt.title || appt.name || "Sem titulo"} · ${toDateLabel(appt.from_date || appt.start_time) || "n/d"}`;
}

function summarizeTicket(ticket: Record<string, unknown>): string {
  return `${ticket.id || "n/d"} · ${ticket.subject || "Sem assunto"} · status ${ticket.status || ticket.status_label || "n/d"}`;
}

function listToBullets<T>(items: T[], formatter: (item: T) => string): string {
  return items.map((item) => `- ${formatter(item)}`).join("\n");
}

// ─── Executor de operações ────────────────────────────────────────────────

async function executeOp(
  operation: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; text: string; data?: unknown }> {
  switch (operation) {
    case "daily_summary": {
      const [deals, accounts, appointments, tasks, tickets] = await Promise.allSettled([
        listDeals(1, 10),
        listAccounts(1, 10),
        listAppointments(1, 10),
        listTasks(1, 10),
        listFreshdeskTickets(1, 10),
      ]);

      const dealsItems = deals.status === "fulfilled" ? deals.value : [];
      const accountItems = accounts.status === "fulfilled" ? accounts.value : [];
      const appointmentItems = appointments.status === "fulfilled" ? appointments.value : [];
      const taskItems = tasks.status === "fulfilled" ? tasks.value : [];
      const ticketItems = tickets.status === "fulfilled" ? tickets.value : [];

      return {
        ok: true,
        text: [
          "Resumo diario operacional",
          `- Deals: ${dealsItems.length}`,
          `- Accounts: ${accountItems.length}`,
          `- Appointments: ${appointmentItems.length}`,
          `- Tasks: ${taskItems.length}`,
          `- Tickets Freshdesk: ${ticketItems.length}`,
          "",
          dealsItems.length
            ? `Top deals:\n${listToBullets(dealsItems.slice(0, 5) as Array<Record<string, unknown>>, summarizeDeal)}`
            : "Top deals: nenhum dado",
          "",
          taskItems.length
            ? `Tasks:\n${listToBullets(taskItems.slice(0, 5) as Array<Record<string, unknown>>, summarizeTask)}`
            : "Tasks: nenhum dado",
        ].join("\n"),
        data: { deals: dealsItems, accounts: accountItems, appointments: appointmentItems, tasks: taskItems, tickets: ticketItems },
      };
    }

    case "contact_lookup": {
      const email = String(args.email || "").trim().toLowerCase();
      if (!email) return { ok: false, text: "Informe um email para consultar o contato." };
      const contact = await lookupContactByEmail(email) as Record<string, unknown> | null;
      if (!contact?.id) return { ok: true, text: `Nao encontrei contato para ${email}.` };
      const detail = await viewContact(String(contact.id));
      return { ok: true, text: summarizeContact(detail as Record<string, unknown>), data: detail };
    }

    case "deal_view": {
      const deal = await viewDeal(String(args.id || ""));
      return { ok: true, text: summarizeDeal(deal as Record<string, unknown>), data: deal };
    }

    case "account_view": {
      const account = await viewAccount(String(args.id || ""));
      return { ok: true, text: summarizeAccount(account as Record<string, unknown>), data: account };
    }

    case "tasks_list": {
      const tasks = await listTasks(1, Number(args.limit) || 10);
      return {
        ok: true,
        text: tasks.length
          ? `Tasks:\n${listToBullets(tasks as Array<Record<string, unknown>>, summarizeTask)}`
          : "Nenhuma task encontrada.",
        data: tasks,
      };
    }

    case "task_view": {
      const task = await viewTask(String(args.id || ""));
      return { ok: true, text: summarizeTask(task as Record<string, unknown>), data: task };
    }

    case "task_create": {
      if (!clean(args.title)) return { ok: false, text: "Informe o titulo da task." };
      const task = await createTask({
        title: args.title,
        description: args.description || null,
        due_date: args.due_date || null,
        owner_id: args.owner_id || null,
        targetable_type: args.targetable_type || null,
        targetable_id: args.targetable_id || null,
      });
      return { ok: true, text: `Task criada.\n${summarizeTask(task as Record<string, unknown>)}`, data: task };
    }

    case "task_update": {
      if (!args.id) return { ok: false, text: "Informe o ID da task." };
      const task = await updateTask(String(args.id), (args.patch || {}) as Record<string, unknown>);
      return { ok: true, text: `Task atualizada.\n${summarizeTask(task as Record<string, unknown>)}`, data: task };
    }

    case "task_delete": {
      if (!args.id) return { ok: false, text: "Informe o ID da task." };
      await deleteTask(String(args.id));
      return { ok: true, text: `Task ${args.id} removida.` };
    }

    case "contact_update": {
      if (!args.id) return { ok: false, text: "Informe o ID do contato." };
      const contact = await updateContact(String(args.id), (args.patch || {}) as Record<string, unknown>);
      return { ok: true, text: `Contato atualizado.\n${summarizeContact(contact as Record<string, unknown>)}`, data: contact };
    }

    case "deal_update": {
      if (!args.id) return { ok: false, text: "Informe o ID do deal." };
      const deal = await updateDeal(String(args.id), (args.patch || {}) as Record<string, unknown>);
      return { ok: true, text: `Deal atualizado.\n${summarizeDeal(deal as Record<string, unknown>)}`, data: deal };
    }

    case "appointments_list": {
      const appointments = await listAppointments(1, Number(args.limit) || 10);
      return {
        ok: true,
        text: appointments.length
          ? `Appointments:\n${listToBullets(appointments as Array<Record<string, unknown>>, summarizeAppointment)}`
          : "Nenhum appointment encontrado.",
        data: appointments,
      };
    }

    case "tickets_by_email": {
      const email = String(args.email || "").trim().toLowerCase();
      if (!email) return { ok: false, text: "Informe um email para buscar tickets." };
      const tickets = await listFreshdeskTickets(1, Number(args.limit) || 10);
      const filtered = (tickets as Array<Record<string, unknown>>).filter(
        (t) => String(t.requester_id || t.email || "").toLowerCase().includes(email)
      );
      return {
        ok: true,
        text: filtered.length
          ? `Tickets do cliente:\n${listToBullets(filtered, summarizeTicket)}`
          : `Nenhum ticket encontrado para ${email}.`,
        data: filtered,
      };
    }

    case "ticket_create": {
      const email = String(args.email || "").trim().toLowerCase();
      if (!email || !clean(args.subject) || !clean(args.description)) {
        return { ok: false, text: "Use email, assunto e descricao para abrir o ticket." };
      }
      const ticket = await createFreshdeskTicket({
        subject: args.subject,
        description: args.description,
        email,
        priority: Number(args.priority) || 1,
        status: Number(args.status) || 2,
      });
      return {
        ok: true,
        text: `Ticket criado.\n${summarizeTicket((ticket as Record<string, unknown>)?.ticket as Record<string, unknown> || ticket as Record<string, unknown>)}`,
        data: ticket,
      };
    }

    case "freshdesk_queue": {
      const tickets = await listFreshdeskTickets(1, Number(args.limit) || 10);
      return {
        ok: true,
        text: tickets.length
          ? `Fila Freshdesk:\n${listToBullets(tickets as Array<Record<string, unknown>>, summarizeTicket)}`
          : "Nenhum ticket na fila.",
        data: tickets,
      };
    }

    case "documents_by_email": {
      const email = String(args.email || "").trim().toLowerCase();
      if (!email) return { ok: false, text: "Informe um email para buscar documentos." };
      try {
        const docs = await supabaseQuery(
          `documentos?select=id,nome,tipo,created_at&email_cliente=eq.${encodeURIComponent(email)}&order=created_at.desc.nullslast&limit=20`
        );
        const items = Array.isArray(docs) ? docs as Array<Record<string, unknown>> : [];
        return {
          ok: true,
          text: items.length
            ? `Documentos:\n${listToBullets(items, (d) => `${d.id || "n/d"} · ${d.nome || "Sem nome"} · ${d.tipo || "n/d"}`)}`
            : `Nenhum documento para ${email}.`,
          data: items,
        };
      } catch (err) {
        return { ok: false, text: `Erro ao buscar documentos: ${String(err)}` };
      }
    }

    case "conversations_by_email": {
      const email = String(args.email || "").trim().toLowerCase();
      if (!email) return { ok: false, text: "Informe um email para buscar conversas." };
      try {
        const threads = await supabaseQuery(
          `agentlab_conversation_threads?select=id,source,customer_name,customer_email,last_message_at,status,summary&customer_email=eq.${encodeURIComponent(email)}&order=last_message_at.desc.nullslast&limit=${Number(args.limit) || 10}`
        );
        const items = Array.isArray(threads) ? threads as Array<Record<string, unknown>> : [];
        return {
          ok: true,
          text: items.length
            ? `Conversas:\n${listToBullets(items, (t) => `${t.id} · ${t.source || "fonte"} · ${toDateLabel(t.last_message_at) || "sem data"}`)}`
            : `Nenhuma conversa para ${email}.`,
          data: items,
        };
      } catch (err) {
        return { ok: false, text: `Erro ao buscar conversas: ${String(err)}` };
      }
    }

    default:
      return { ok: false, text: `Operacao '${operation}' nao suportada.` };
  }
}

// ─── Roteador principal ───────────────────────────────────────────────────

serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/workspace-ops/, "");
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-freddy-secret, x-hmadv-secret, x-shared-secret",
      },
    });
  }

  // Health check (GET) ou raiz sem body de operation
  if (path === "/health" || ((path === "" || path === "/") && method === "GET")) {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "workspace-ops",
        version: "1.1.0",
        operations: [
          "daily_summary", "contact_lookup", "deal_view", "account_view",
          "tasks_list", "task_view", "task_create", "task_update", "task_delete",
          "contact_update", "deal_update", "appointments_list",
          "documents_by_email", "tickets_by_email", "ticket_create",
          "freshdesk_queue", "conversations_by_email",
        ],
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  }

  if (method !== "POST") {
    return jsonError("Metodo nao permitido. Use POST.", 405);
  }

  // Aceitar POST tanto em / quanto em /execute (retrocompatibilidade)
  if (path !== "/execute" && path !== "" && path !== "/") {
    return jsonError(`Rota ${path} nao encontrada. Use /execute ou POST na raiz.`, 404);
  }

  const auth = authorizeRequest(req);
  if (!auth.ok) return jsonError(auth.error!, auth.status!);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const operation = String(body.operation || "").trim();
    // Aceitar args, params, ou o body inteiro (retrocompatibilidade)
    const args = (body.args || body.params || body) as Record<string, unknown>;

    if (!operation) {
      return jsonError("Informe o campo 'operation'.", 400);
    }

    const result = await executeOp(operation, args);
    return jsonOk({ result });
  } catch (err) {
    console.error("workspace-ops error:", err);
    return jsonError(String(err), 500);
  }
});
