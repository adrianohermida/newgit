import {
  freshsalesRequest,
  listFreshsalesAppointmentsFromViews,
  listFreshsalesDealsFromViews,
  listFreshsalesSalesAccountsFromViews,
  lookupFreshsalesContactByEmail,
  viewFreshsalesContact,
  viewFreshsalesDeal,
  viewFreshsalesSalesAccount,
} from "./freshsales-crm.js";
import {
  createClientTicket,
  listClientDocumentos,
  listClientTickets,
} from "./client-data.js";
import { listFreshdeskTickets } from "./freshdesk-admin.js";
import { fetchSupabaseAdmin } from "./supabase-rest.js";

function clean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function truncate(text, max = 240) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function toDateLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function listToBullets(values, formatter) {
  return values.map((item, index) => `- ${formatter(item, index)}`).join("\n");
}

async function listFreshsalesTasks(env, { page = 1, perPage = 20 } = {}) {
  const { payload } = await freshsalesRequest(
    env,
    `/tasks?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`
  );
  return Array.isArray(payload?.tasks) ? payload.tasks : Array.isArray(payload) ? payload : [];
}

async function viewFreshsalesTask(env, taskId) {
  const { payload } = await freshsalesRequest(env, `/tasks/${encodeURIComponent(String(taskId))}`);
  return payload?.task || payload || null;
}

async function createFreshsalesTask(env, task) {
  const payload = {
    task: {
      title: task.title,
      description: task.description || null,
      due_date: task.due_date || null,
      owner_id: task.owner_id || null,
      targetable_type: task.targetable_type || null,
      targetable_id: task.targetable_id || null,
    },
  };
  const response = await freshsalesRequest(env, "/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response?.payload?.task || response?.payload || null;
}

async function updateFreshsalesTask(env, taskId, patch) {
  const payload = { task: patch };
  const response = await freshsalesRequest(env, `/tasks/${encodeURIComponent(String(taskId))}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return response?.payload?.task || response?.payload || null;
}

async function deleteFreshsalesTask(env, taskId) {
  await freshsalesRequest(env, `/tasks/${encodeURIComponent(String(taskId))}`, {
    method: "DELETE",
  });
  return { deleted: true, id: String(taskId) };
}

async function updateFreshsalesContact(env, contactId, patch) {
  const payload = { contact: patch };
  const response = await freshsalesRequest(env, `/contacts/${encodeURIComponent(String(contactId))}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return response?.payload?.contact || response?.payload || null;
}

async function updateFreshsalesDeal(env, dealId, patch) {
  const payload = { deal: patch };
  const response = await freshsalesRequest(env, `/deals/${encodeURIComponent(String(dealId))}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return response?.payload?.deal || response?.payload || null;
}

async function listAgentlabConversationThreads(env, email, limit = 10) {
  const normalizedEmail = normalizeEmail(email);
  const filters = [
    `customer_email=eq.${encodeURIComponent(normalizedEmail)}`,
    `metadata->>email=eq.${encodeURIComponent(normalizedEmail)}`,
  ];

  const query = `agentlab_conversation_threads?select=id,source,source_thread_id,customer_name,customer_email,last_message_at,status,summary,metadata&or=(${filters.join(",")})&order=last_message_at.desc.nullslast&limit=${limit}`;

  try {
    const rows = await fetchSupabaseAdmin(env, query);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function summarizeContact(contact) {
  if (!contact) return "Contato nao encontrado.";
  const emails = Array.isArray(contact.emails) ? contact.emails.join(", ") : clean(contact.email) || "sem email";
  const accounts = Array.isArray(contact.sales_accounts) ? contact.sales_accounts.length : 0;
  const deals = Array.isArray(contact.deals) ? contact.deals.length : 0;
  const appointments = Array.isArray(contact.appointments) ? contact.appointments.length : 0;
  return [
    `Contato: ${contact.display_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Sem nome"}`,
    `ID: ${contact.id || "n/d"}`,
    `Emails: ${emails}`,
    `Telefone: ${contact.mobile_number || contact.work_number || "n/d"}`,
    `Accounts: ${accounts}`,
    `Deals: ${deals}`,
    `Appointments: ${appointments}`,
  ].join("\n");
}

function summarizeDeal(deal) {
  if (!deal) return "Deal nao encontrado.";
  return [
    `Deal: ${deal.name || "Sem nome"}`,
    `ID: ${deal.id || "n/d"}`,
    `Valor: ${deal.amount || "n/d"}`,
    `Estagio: ${deal.stage_name || deal.stage || "n/d"}`,
    `Status: ${deal.status || "n/d"}`,
    `Owner: ${deal.owner?.display_name || deal.owner?.name || deal.owner_id || "n/d"}`,
    `Fechamento previsto: ${toDateLabel(deal.expected_close_date) || "n/d"}`,
  ].join("\n");
}

function summarizeAccount(account) {
  if (!account) return "Conta nao encontrada.";
  return [
    `Conta: ${account.name || "Sem nome"}`,
    `ID: ${account.id || "n/d"}`,
    `Telefone: ${account.phone || "n/d"}`,
    `Site: ${account.website || "n/d"}`,
    `Owner: ${account.owner?.display_name || account.owner?.name || account.owner_id || "n/d"}`,
    `Cidade: ${account.city || "n/d"}`,
  ].join("\n");
}

function summarizeTask(task) {
  return `${task.id || "n/d"} · ${task.title || "Sem titulo"} · vencimento ${toDateLabel(task.due_date) || "n/d"} · status ${task.status || "n/d"}`;
}

function summarizeAppointment(appointment) {
  return `${appointment.id || "n/d"} · ${appointment.title || appointment.name || "Sem titulo"} · ${toDateLabel(appointment.from_date || appointment.start_time) || "n/d"}`;
}

function summarizeTicket(ticket) {
  return `${ticket.id || "n/d"} · ${ticket.subject || "Sem assunto"} · status ${ticket.status || ticket.status_label || "n/d"} · prioridade ${ticket.priority || ticket.priority_label || "n/d"}`;
}

function parseKeyValuePatch(input) {
  const patch = {};
  const parts = String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    patch[key] = rawValue.trim();
  }
  return patch;
}

export async function executeWorkspaceOp(env, operation, args = {}) {
  switch (operation) {
    case "daily_summary": {
      const [deals, accounts, appointments, tasks, freshdesk] = await Promise.allSettled([
        listFreshsalesDealsFromViews(env, { maxPages: 1, perPage: 10 }),
        listFreshsalesSalesAccountsFromViews(env, { maxPages: 1, perPage: 10 }),
        listFreshsalesAppointmentsFromViews(env, { maxPages: 1, perPage: 10 }),
        listFreshsalesTasks(env, { page: 1, perPage: 10 }),
        listFreshdeskTickets(env, { page: 1, perPage: 10 }),
      ]);

      const dealsItems = deals.status === "fulfilled" ? deals.value : [];
      const accountItems = accounts.status === "fulfilled" ? accounts.value : [];
      const appointmentItems = appointments.status === "fulfilled" ? appointments.value : [];
      const taskItems = tasks.status === "fulfilled" ? tasks.value : [];
      const ticketItems = freshdesk.status === "fulfilled" ? freshdesk.value.items || [] : [];

      return {
        ok: true,
        text: [
          "Resumo diario operacional",
          `- Deals monitorados: ${dealsItems.length}`,
          `- Accounts monitoradas: ${accountItems.length}`,
          `- Appointments visiveis: ${appointmentItems.length}`,
          `- Tasks visiveis: ${taskItems.length}`,
          `- Tickets Freshdesk: ${ticketItems.length}`,
          "",
          dealsItems.length ? `Top deals:\n${listToBullets(dealsItems.slice(0, 5), (item) => summarizeDeal(item))}` : "Top deals: nenhum dado",
          "",
          appointmentItems.length ? `Proximos appointments:\n${listToBullets(appointmentItems.slice(0, 5), (item) => summarizeAppointment(item))}` : "Proximos appointments: nenhum dado",
          "",
          taskItems.length ? `Tasks:\n${listToBullets(taskItems.slice(0, 5), (item) => summarizeTask(item))}` : "Tasks: nenhum dado",
          "",
          ticketItems.length ? `Tickets:\n${listToBullets(ticketItems.slice(0, 5), (item) => summarizeTicket(item))}` : "Tickets: nenhum dado",
        ].join("\n"),
      };
    }
    case "contact_lookup": {
      const email = normalizeEmail(args.email);
      if (!email) return { ok: false, text: "Informe um email para consultar o contato." };
      const contact = await lookupFreshsalesContactByEmail(env, email);
      if (!contact?.id) {
        return { ok: true, text: `Nao encontrei contato no Freshsales para ${email}.` };
      }
      const detail = await viewFreshsalesContact(env, contact.id);
      return { ok: true, text: summarizeContact(detail), data: detail };
    }
    case "deal_view": {
      const deal = await viewFreshsalesDeal(env, args.id);
      return { ok: true, text: summarizeDeal(deal), data: deal };
    }
    case "account_view": {
      const account = await viewFreshsalesSalesAccount(env, args.id);
      return { ok: true, text: summarizeAccount(account), data: account };
    }
    case "tasks_list": {
      const tasks = await listFreshsalesTasks(env, { page: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: tasks.length
          ? `Tasks:\n${listToBullets(tasks, (item) => summarizeTask(item))}`
          : "Nenhuma task encontrada.",
        data: tasks,
      };
    }
    case "task_view": {
      const task = await viewFreshsalesTask(env, args.id);
      return { ok: true, text: summarizeTask(task), data: task };
    }
    case "task_create": {
      if (!clean(args.title)) return { ok: false, text: "Informe o titulo da task." };
      const task = await createFreshsalesTask(env, args);
      return { ok: true, text: `Task criada com sucesso.\n${summarizeTask(task)}`, data: task };
    }
    case "task_update": {
      if (!args.id) return { ok: false, text: "Informe o ID da task." };
      const task = await updateFreshsalesTask(env, args.id, args.patch || {});
      return { ok: true, text: `Task atualizada.\n${summarizeTask(task)}`, data: task };
    }
    case "task_delete": {
      if (!args.id) return { ok: false, text: "Informe o ID da task." };
      await deleteFreshsalesTask(env, args.id);
      return { ok: true, text: `Task ${args.id} removida com sucesso.` };
    }
    case "contact_update": {
      if (!args.id) return { ok: false, text: "Informe o ID do contato." };
      const contact = await updateFreshsalesContact(env, args.id, args.patch || {});
      return { ok: true, text: `Contato atualizado.\n${summarizeContact(contact)}`, data: contact };
    }
    case "deal_update": {
      if (!args.id) return { ok: false, text: "Informe o ID do deal." };
      const deal = await updateFreshsalesDeal(env, args.id, args.patch || {});
      return { ok: true, text: `Deal atualizado.\n${summarizeDeal(deal)}`, data: deal };
    }
    case "appointments_list": {
      const appointments = await listFreshsalesAppointmentsFromViews(env, { maxPages: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: appointments.length
          ? `Appointments:\n${listToBullets(appointments, (item) => summarizeAppointment(item))}`
          : "Nenhum appointment encontrado.",
        data: appointments,
      };
    }
    case "documents_by_email": {
      const email = normalizeEmail(args.email);
      if (!email) return { ok: false, text: "Informe um email para buscar documentos." };
      const docs = await listClientDocumentos(env, email);
      return {
        ok: true,
        text: Array.isArray(docs) && docs.length
          ? `Documentos do cliente:\n${listToBullets(docs.slice(0, 10), (item) => `${item.id || "n/d"} · ${item.nome || item.title || "Sem nome"} · ${truncate(item.tipo || item.category || "") || "tipo n/d"}`)}`
          : `Nenhum documento encontrado para ${email}.`,
        data: docs,
      };
    }
    case "tickets_by_email": {
      const email = normalizeEmail(args.email);
      if (!email) return { ok: false, text: "Informe um email para buscar tickets." };
      const tickets = await listClientTickets(env, email);
      return {
        ok: true,
        text: Array.isArray(tickets) && tickets.length
          ? `Tickets do cliente:\n${listToBullets(tickets.slice(0, 10), (item) => summarizeTicket(item))}`
          : `Nenhum ticket encontrado para ${email}.`,
        data: tickets,
      };
    }
    case "ticket_create": {
      const email = normalizeEmail(args.email);
      if (!email || !clean(args.subject) || !clean(args.description)) {
        return { ok: false, text: "Use email, assunto e descricao para abrir o ticket." };
      }
      const payload = {
        subject: args.subject,
        description: args.description,
        email,
        priority: Number(args.priority) || 1,
        status: Number(args.status) || 2,
      };
      const ticket = await createClientTicket(env, { email, nome: args.name || email }, payload);
      return {
        ok: true,
        text: `Ticket criado com sucesso.\n${ticket?.ticket ? summarizeTicket(ticket.ticket) : args.subject}`,
        data: ticket,
      };
    }
    case "freshdesk_queue": {
      const result = await listFreshdeskTickets(env, { page: 1, perPage: Number(args.limit) || 10 });
      const items = Array.isArray(result?.items) ? result.items : [];
      return {
        ok: true,
        text: items.length
          ? `Fila Freshdesk:\n${listToBullets(items, (item) => summarizeTicket(item))}`
          : "Nenhum ticket encontrado na fila do Freshdesk.",
        data: items,
      };
    }
    case "conversations_by_email": {
      const email = normalizeEmail(args.email);
      if (!email) return { ok: false, text: "Informe um email para buscar conversas." };
      const threads = await listAgentlabConversationThreads(env, email, Number(args.limit) || 10);
      return {
        ok: true,
        text: threads.length
          ? `Conversas registradas:\n${listToBullets(threads, (item) => `${item.id} · ${item.source || "fonte"} · ${toDateLabel(item.last_message_at) || "sem data"} · ${truncate(item.summary || item.customer_name || item.customer_email || "", 140)}`)}`
          : `Nenhuma conversa encontrada para ${email}.`,
        data: threads,
      };
    }
    default:
      return { ok: false, text: `Operacao ${operation} nao suportada.` };
  }
}

export function parseWorkspacePatch(input) {
  return parseKeyValuePatch(input);
}
