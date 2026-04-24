import {
  createFreshsalesAppointmentForAgendamento,
  freshsalesRequest,
  listFreshsalesAppointmentsFromViews,
  listFreshsalesDealsFromViews,
  listFreshsalesSalesActivities,
  listFreshsalesSalesAccountsFromViews,
  lookupFreshsalesContactByEmail,
  viewFreshsalesContact,
  viewFreshsalesDeal,
  viewFreshsalesSalesAccount,
} from "./freshsales-crm.js";
import {
  listFreshchatAgents,
  listFreshchatConversations,
  listFreshchatGroups,
  listFreshchatUsers,
  sendFreshchatConversationMessage,
  updateFreshchatConversation,
  viewFreshchatConversation,
} from "./freshchat-admin.js";
import {
  createClientTicket,
  listClientDocumentos,
  listClientTickets,
} from "./client-data.js";
import {
  createFreshdeskNote,
  listFreshdeskAgents,
  listFreshdeskContacts,
  listFreshdeskGroups,
  listFreshdeskTickets,
  updateFreshdeskTicket,
  viewFreshdeskContact,
  viewFreshdeskTicket,
} from "./freshdesk-admin.js";
import { deleteGoogleEvent, ensureSlotAvailable, upsertGoogleEvent } from "./agendamento-helpers.js";
import { getGoogleAccessToken } from "./google-auth.js";
import { countSupabaseAdmin, fetchSupabaseAdmin } from "./supabase-rest.js";
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getZoomMeeting,
  listZoomMeetingParticipants,
} from "./zoom-admin.js";

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

function stripDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function toDateOnlyLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getTodayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function summarizeProcess(processo) {
  if (!processo) return "Processo nao encontrado.";
  return [
    `Processo: ${processo.numero_cnj || "n/d"}`,
    `Tribunal: ${processo.tribunal || "n/d"}`,
    `Tipo: ${processo.tipo_processo || "n/d"}`,
    `Instancia: ${processo.instancia || "n/d"}`,
    `Polo ativo: ${truncate(processo.polo_ativo || "", 160) || "n/d"}`,
    `Polo passivo: ${truncate(processo.polo_passivo || "", 160) || "n/d"}`,
    `Ultima movimentacao: ${toDateLabel(processo.data_ultima_movimentacao) || "n/d"}`,
  ].join("\n");
}

function summarizeMovement(movimento) {
  return [
    `${toDateLabel(movimento.data_movimento) || "n/d"} · ${movimento.numero_cnj || "s/nº"}`,
    truncate(movimento.descricao || movimento.conteudo || "", 180) || "Sem descricao",
  ].join("\n");
}

function summarizePublication(publicacao) {
  return [
    `${toDateOnlyLabel(publicacao.data_publicacao) || "n/d"} · ${publicacao.numero_processo_api || "s/nº"}`,
    truncate(publicacao.conteudo || "", 180) || "Sem conteudo",
  ].join("\n");
}

function summarizeDeadline(prazo) {
  const processo = prazo?.processo || {};
  return [
    `${toDateOnlyLabel(prazo.data_vencimento) || "n/d"} · ${processo.numero_cnj || "s/nº"}`,
    `${truncate(prazo.titulo || "", 100) || "Sem titulo"} · prioridade ${prazo.prioridade || "media"}`,
  ].join("\n");
}

async function findProcessByCnj(env, cnj) {
  const digits = stripDigits(cnj);
  if (!digits) return null;
  const rows = await fetchSupabaseAdmin(
    env,
    `processos?select=id,numero_cnj,tipo_processo,instancia,polo_ativo,polo_passivo,tribunal,data_ultima_movimentacao&numero_cnj=ilike.*${digits.slice(0, 15)}*&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
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

async function listFreshsalesProducts(env, { page = 1, perPage = 20 } = {}) {
  const { payload } = await freshsalesRequest(
    env,
    `/products?page=${encodeURIComponent(String(page))}&per_page=${encodeURIComponent(String(perPage))}`
  );
  return Array.isArray(payload?.products) ? payload.products : Array.isArray(payload) ? payload : [];
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

function summarizeActivity(activity) {
  return `${activity.id || "n/d"} · ${activity.title || activity.subject || "Sem titulo"} · ${toDateLabel(activity.activity_date || activity.due_date || activity.created_at) || "n/d"} · ${activity.status || activity.outcome || "n/d"}`;
}

function summarizeProduct(product) {
  return `${product.id || "n/d"} · ${product.name || "Sem nome"} · valor ${product.amount || product.price || "n/d"} · status ${product.status || "n/d"}`;
}

function summarizeFreshdeskContact(contact) {
  return `${contact.id || "n/d"} · ${contact.name || contact.email || "Sem nome"} · ${contact.email || "sem email"} · ${contact.phone || "sem telefone"}`;
}

function summarizeFreshdeskAgent(agent) {
  return `${agent.id || "n/d"} · ${agent.contact?.name || agent.name || "Sem nome"} · ${agent.contact?.email || agent.email || "sem email"}`;
}

function summarizeFreshdeskGroup(group) {
  return `${group.id || "n/d"} · ${group.name || "Sem nome"} · agentes ${group.agent_ids?.length || 0}`;
}

function summarizeFreshchatConversation(conversation) {
  return `${conversation.id || "n/d"} · status ${conversation.status || "n/d"} · prioridade ${conversation.priority || "n/d"} · grupo ${conversation.group_id || "n/d"}`;
}

function summarizeFreshchatAgent(agent) {
  return `${agent.id || "n/d"} · ${agent.name || agent.email || "Sem nome"} · ${agent.email || "sem email"}`;
}

function summarizeFreshchatGroup(group) {
  return `${group.id || "n/d"} · ${group.name || "Sem nome"} · membros ${group.member_count || group.members_count || "n/d"}`;
}

function summarizeFreshchatUser(user) {
  const name = [user.first_name || user.name || user.email || "Sem nome", user.last_name || ""].join(" ").trim();
  return `${user.id || "n/d"} · ${name} · ${user.email || "sem email"}`;
}

function summarizeCalendarEvent(event) {
  return `${event.id || "n/d"} · ${event.summary || "Sem titulo"} · ${toDateLabel(event.start?.dateTime || event.start?.date) || "n/d"}`;
}

function summarizeZoomMeeting(meeting) {
  return `${meeting.id || "n/d"} · ${meeting.topic || "Sem topico"} · ${toDateLabel(meeting.start_time) || "n/d"} · status ${meeting.status || "n/d"}`;
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
    case "count_processes": {
      const total = await countSupabaseAdmin(env, "processos?select=id");
      return {
        ok: true,
        text: `Atualmente temos ${Number(total || 0).toLocaleString("pt-BR")} processos cadastrados no sistema.`,
        data: { total: total || 0 },
      };
    }
    case "count_publications": {
      const total = await countSupabaseAdmin(env, "publicacoes?select=id");
      return {
        ok: true,
        text: `Atualmente temos ${Number(total || 0).toLocaleString("pt-BR")} publicacoes cadastradas no sistema.`,
        data: { total: total || 0 },
      };
    }
    case "count_movements": {
      const total = await countSupabaseAdmin(env, "movimentos?select=id");
      return {
        ok: true,
        text: `Atualmente temos ${Number(total || 0).toLocaleString("pt-BR")} movimentacoes registradas.`,
        data: { total: total || 0 },
      };
    }
    case "count_appointments": {
      const total = await countSupabaseAdmin(env, `audiencias?select=id&data_audiencia=gte.${getTodayInSaoPaulo()}`);
      return {
        ok: true,
        text: `Atualmente temos ${Number(total || 0).toLocaleString("pt-BR")} audiencias futuras na agenda.`,
        data: { total: total || 0 },
      };
    }
    case "count_deadlines": {
      const total = await countSupabaseAdmin(env, "prazo_calculado?select=titulo&status=eq.pendente");
      return {
        ok: true,
        text: `Atualmente temos ${Number(total || 0).toLocaleString("pt-BR")} prazos pendentes.`,
        data: { total: total || 0 },
      };
    }
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
    case "deals_list": {
      const deals = await listFreshsalesDealsFromViews(env, { maxPages: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: deals.length
          ? `Deals:\n${listToBullets(deals, (item) => summarizeDeal(item))}`
          : "Nenhum deal encontrado.",
        data: deals,
      };
    }
    case "accounts_list": {
      const accounts = await listFreshsalesSalesAccountsFromViews(env, { maxPages: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: accounts.length
          ? `Contas:\n${listToBullets(accounts, (item) => summarizeAccount(item))}`
          : "Nenhuma conta encontrada.",
        data: accounts,
      };
    }
    case "activities_list": {
      const activities = await listFreshsalesSalesActivities(env, { page: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: activities.length
          ? `Activities:\n${listToBullets(activities, (item) => summarizeActivity(item))}`
          : "Nenhuma activity encontrada.",
        data: activities,
      };
    }
    case "products_list": {
      const products = await listFreshsalesProducts(env, { page: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: products.length
          ? `Produtos:\n${listToBullets(products, (item) => summarizeProduct(item))}`
          : "Nenhum produto encontrado.",
        data: products,
      };
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
    case "upcoming_audiencias": {
      const audiencias = await fetchSupabaseAdmin(
        env,
        `audiencias?select=id,data_audiencia,tipo,descricao,numero_cnj,local&data_audiencia=gte.${getTodayInSaoPaulo()}&order=data_audiencia.asc&limit=${Number(args.limit) || 5}`
      ).catch(() => []);
      return {
        ok: true,
        text: Array.isArray(audiencias) && audiencias.length
          ? `Proximas audiencias:\n${listToBullets(audiencias, (item) => `${toDateLabel(item.data_audiencia) || "n/d"} · ${(item.tipo || "Audiencia")} · ${item.numero_cnj || "s/nº"}${item.local ? ` · ${truncate(item.local, 60)}` : ""}`)}`
          : "Nenhuma audiencia futura encontrada na agenda.",
        data: audiencias,
      };
    }
    case "recent_publications": {
      const publicacoes = await fetchSupabaseAdmin(
        env,
        `publicacoes?select=id,data_publicacao,numero_processo_api,conteudo&order=data_publicacao.desc&limit=${Number(args.limit) || 5}`
      ).catch(() => []);
      return {
        ok: true,
        text: Array.isArray(publicacoes) && publicacoes.length
          ? `Ultimas publicacoes:\n${listToBullets(publicacoes, (item) => summarizePublication(item))}`
          : "Nenhuma publicacao encontrada.",
        data: publicacoes,
      };
    }
    case "deadlines_list": {
      const prazos = await fetchSupabaseAdmin(
        env,
        `prazo_calculado?select=titulo,data_vencimento,status,prioridade,processo:processo_id(numero_cnj,tribunal)&status=eq.pendente&order=data_vencimento.asc&limit=${Number(args.limit) || 5}`
      ).catch(() => []);
      return {
        ok: true,
        text: Array.isArray(prazos) && prazos.length
          ? `Prazos pendentes:\n${listToBullets(prazos, (item) => summarizeDeadline(item))}`
          : "Nenhum prazo pendente encontrado.",
        data: prazos,
      };
    }
    case "process_summary_by_cnj": {
      const processo = await findProcessByCnj(env, args.cnj);
      if (!processo?.id) {
        return { ok: true, text: `Nao encontrei processo para o CNJ ${args.cnj}.` };
      }

      const [publicacoes, prazos] = await Promise.all([
        fetchSupabaseAdmin(
          env,
          `publicacoes?select=id,data_publicacao,conteudo,numero_processo_api&processo_id=eq.${processo.id}&order=data_publicacao.desc&limit=3`
        ).catch(() => []),
        fetchSupabaseAdmin(
          env,
          `prazo_calculado?select=titulo,data_vencimento,status,prioridade&processo_id=eq.${processo.id}&status=eq.pendente&order=data_vencimento.asc&limit=3`
        ).catch(() => []),
      ]);

      return {
        ok: true,
        text: [
          summarizeProcess(processo),
          Array.isArray(publicacoes) && publicacoes.length
            ? `Publicacoes recentes:\n${listToBullets(publicacoes, (item) => summarizePublication(item))}`
            : "Publicacoes recentes: nenhuma encontrada.",
          Array.isArray(prazos) && prazos.length
            ? `Prazos pendentes:\n${listToBullets(prazos, (item) => `${toDateOnlyLabel(item.data_vencimento) || "n/d"} · ${truncate(item.titulo || "", 100) || "Sem titulo"} · prioridade ${item.prioridade || "media"}`)}`
            : "Prazos pendentes: nenhum encontrado.",
        ].join("\n\n"),
        data: { processo, publicacoes, prazos },
      };
    }
    case "recent_movements_by_cnj": {
      const processo = await findProcessByCnj(env, args.cnj);
      if (!processo?.id) {
        return { ok: true, text: `Nao encontrei processo para o CNJ ${args.cnj}.` };
      }
      const movimentos = await fetchSupabaseAdmin(
        env,
        `movimentos?select=id,data_movimento,descricao,numero_cnj,conteudo&processo_id=eq.${processo.id}&order=data_movimento.desc&limit=${Number(args.limit) || 5}`
      ).catch(() => []);
      return {
        ok: true,
        text: Array.isArray(movimentos) && movimentos.length
          ? `Ultimas movimentacoes do processo ${processo.numero_cnj || args.cnj}:\n${listToBullets(movimentos, (item) => summarizeMovement(item))}`
          : `Nao encontrei movimentacoes recentes para o processo ${processo.numero_cnj || args.cnj}.`,
        data: { processo, movimentos },
      };
    }
    case "schedule_meeting_simple": {
      if (!clean(args.date) || !clean(args.time)) {
        return { ok: false, text: "Preciso de data e horario para agendar a reuniao." };
      }
      const email = normalizeEmail(args.email);
      const contact = email ? await lookupFreshsalesContactByEmail(env, email).catch(() => null) : null;
      const appointment = await createFreshsalesAppointmentForAgendamento(
        env,
        {
          id: args.external_id || null,
          data: args.date,
          hora: args.time,
          area: args.area || "Operacional",
          observacoes: args.observacoes || "Solicitacao criada pelo Slack.",
          nome: args.name || "Solicitante Slack",
          email: email || null,
          telefone: clean(args.phone) || null,
          status: "agendado",
        },
        contact?.id ? String(contact.id) : null,
        null,
        { eventType: "booked" }
      );
      const startLabel = toDateLabel(appointment?.appointment?.from_date || `${args.date}T${args.time}:00-03:00`) || `${args.date} ${args.time}`;
      return {
        ok: true,
        text: `A reuniao foi agendada para ${startLabel}.`,
        data: appointment,
      };
    }
    case "google_calendar_check": {
      if (!clean(args.date) || !clean(args.time)) {
        return { ok: false, text: "Preciso de data e horario para consultar a disponibilidade." };
      }
      const availability = await ensureSlotAvailable(env, args.date, args.time);
      if (!availability?.ok) {
        const body = await availability.response?.json?.().catch(() => null);
        return {
          ok: false,
          text: body?.error || "O horario informado nao esta disponivel.",
          data: body,
        };
      }
      return {
        ok: true,
        text: `O horario ${args.date} ${args.time} esta disponivel no Google Calendar.`,
        data: availability,
      };
    }
    case "google_calendar_create_simple": {
      if (!clean(args.date) || !clean(args.time) || !clean(args.email)) {
        return { ok: false, text: "Use data, horario e email para criar o evento no Google Calendar." };
      }
      const availability = await ensureSlotAvailable(env, args.date, args.time);
      if (!availability?.ok) {
        const body = await availability.response?.json?.().catch(() => null);
        return {
          ok: false,
          text: body?.error || "Nao consegui reservar esse horario no Google Calendar.",
          data: body,
        };
      }
      const { accessToken } = await getGoogleAccessToken(env);
      const event = await upsertGoogleEvent(
        accessToken,
        {
          area: args.area || "Operacional",
          nome: args.name || "Solicitante",
          email: args.email,
          telefone: clean(args.phone) || "",
          observacoes: args.observacoes || "Evento criado pelo DotoBot.",
          google_event_id: null,
        },
        args.date,
        args.time
      );
      return {
        ok: true,
        text: `Evento criado no Google Calendar.\n${summarizeCalendarEvent(event)}`,
        data: event,
      };
    }
    case "google_calendar_delete": {
      if (!args.id) return { ok: false, text: "Informe o ID do evento do Google Calendar." };
      const { accessToken } = await getGoogleAccessToken(env);
      const result = await deleteGoogleEvent(accessToken, args.id);
      return {
        ok: Boolean(result?.ok),
        text: result?.ok ? `Evento ${args.id} removido do Google Calendar.` : "Nao consegui remover o evento do Google Calendar.",
        data: result,
      };
    }
    case "zoom_meeting_create_simple": {
      if (!clean(args.date) || !clean(args.time)) {
        return { ok: false, text: "Preciso de data e horario para criar a reuniao no Zoom." };
      }
      const meeting = await createZoomMeeting(
        env,
        {
          data: args.date,
          hora: args.time,
          area: args.area || "Operacional",
          nome: args.name || "Solicitante",
          email: args.email || "",
          telefone: clean(args.phone) || "",
          observacoes: args.observacoes || "Reuniao criada pelo DotoBot.",
        },
        {
          topic: args.topic || `Reuniao - ${args.area || "Operacional"}`,
        }
      );
      return {
        ok: true,
        text: `Reuniao Zoom criada.\n${summarizeZoomMeeting(meeting)}`,
        data: meeting,
      };
    }
    case "zoom_meeting_view": {
      if (!args.id) return { ok: false, text: "Informe o ID da reuniao Zoom." };
      const meeting = await getZoomMeeting(env, args.id);
      return {
        ok: true,
        text: summarizeZoomMeeting(meeting),
        data: meeting,
      };
    }
    case "zoom_meeting_participants": {
      if (!args.id) return { ok: false, text: "Informe o ID da reuniao Zoom." };
      const participants = await listZoomMeetingParticipants(env, args.id);
      const items = Array.isArray(participants?.participants) ? participants.participants : [];
      return {
        ok: true,
        text: items.length
          ? `Participantes:\n${listToBullets(items, (item) => `${item.name || item.user_name || "Sem nome"} · ${item.user_email || "sem email"} · entrou ${toDateLabel(item.join_time) || "n/d"}`)}`
          : "Nenhum participante encontrado para essa reuniao.",
        data: participants,
      };
    }
    case "zoom_meeting_delete": {
      if (!args.id) return { ok: false, text: "Informe o ID da reuniao Zoom." };
      const result = await deleteZoomMeeting(env, args.id);
      return {
        ok: Boolean(result?.ok),
        text: result?.ok ? `Reuniao Zoom ${args.id} removida com sucesso.` : "Nao consegui remover a reuniao Zoom.",
        data: result,
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
    case "freshdesk_ticket_view": {
      if (!args.id) return { ok: false, text: "Informe o ID do ticket." };
      const ticket = await viewFreshdeskTicket(env, args.id);
      return {
        ok: true,
        text: ticket ? summarizeTicket(ticket) : `Nao encontrei ticket ${args.id}.`,
        data: ticket,
      };
    }
    case "freshdesk_ticket_update": {
      if (!args.id) return { ok: false, text: "Informe o ID do ticket." };
      const ticket = await updateFreshdeskTicket(env, args.id, args.patch || {});
      return {
        ok: true,
        text: `Ticket atualizado.\n${summarizeTicket(ticket)}`,
        data: ticket,
      };
    }
    case "freshdesk_ticket_note": {
      if (!args.id || !clean(args.body)) {
        return { ok: false, text: "Informe o ID do ticket e a nota a ser registrada." };
      }
      const note = await createFreshdeskNote(env, args.id, {
        body: args.body,
        private: Boolean(args.private ?? true),
      });
      return {
        ok: true,
        text: `Nota registrada no ticket ${args.id}.`,
        data: note,
      };
    }
    case "freshdesk_contacts_list": {
      const contacts = await listFreshdeskContacts(env, {
        page: 1,
        perPage: Number(args.limit) || 10,
        email: args.email || null,
      });
      return {
        ok: true,
        text: contacts.length
          ? `Contatos Freshdesk:\n${listToBullets(contacts, (item) => summarizeFreshdeskContact(item))}`
          : "Nenhum contato encontrado no Freshdesk.",
        data: contacts,
      };
    }
    case "freshdesk_contact_view": {
      if (!args.id) return { ok: false, text: "Informe o ID do contato." };
      const contact = await viewFreshdeskContact(env, args.id);
      return {
        ok: true,
        text: contact ? summarizeFreshdeskContact(contact) : `Nao encontrei contato ${args.id}.`,
        data: contact,
      };
    }
    case "freshdesk_agents_list": {
      const agents = await listFreshdeskAgents(env, { page: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: agents.length
          ? `Agentes Freshdesk:\n${listToBullets(agents, (item) => summarizeFreshdeskAgent(item))}`
          : "Nenhum agente encontrado no Freshdesk.",
        data: agents,
      };
    }
    case "freshdesk_groups_list": {
      const groups = await listFreshdeskGroups(env, { page: 1, perPage: Number(args.limit) || 10 });
      return {
        ok: true,
        text: groups.length
          ? `Grupos Freshdesk:\n${listToBullets(groups, (item) => summarizeFreshdeskGroup(item))}`
          : "Nenhum grupo encontrado no Freshdesk.",
        data: groups,
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
    case "freshchat_conversations_list": {
      const conversations = await listFreshchatConversations(env, {
        limit: Number(args.limit) || 10,
        status: args.status || null,
        groupId: args.group_id || null,
        userId: args.user_id || null,
      });
      return {
        ok: true,
        text: conversations.length
          ? `Conversas Freshchat:\n${listToBullets(conversations, (item) => summarizeFreshchatConversation(item))}`
          : "Nenhuma conversa encontrada no Freshchat.",
        data: conversations,
      };
    }
    case "freshchat_conversation_view": {
      if (!args.id) return { ok: false, text: "Informe o ID da conversa." };
      const conversation = await viewFreshchatConversation(env, args.id);
      return {
        ok: true,
        text: conversation ? summarizeFreshchatConversation(conversation) : `Nao encontrei a conversa ${args.id}.`,
        data: conversation,
      };
    }
    case "freshchat_conversation_update": {
      if (!args.id) return { ok: false, text: "Informe o ID da conversa." };
      const conversation = await updateFreshchatConversation(env, args.id, args.patch || {});
      return {
        ok: true,
        text: `Conversa atualizada.\n${summarizeFreshchatConversation(conversation)}`,
        data: conversation,
      };
    }
    case "freshchat_agents_list": {
      const agents = await listFreshchatAgents(env, { limit: Number(args.limit) || 10 });
      return {
        ok: true,
        text: agents.length
          ? `Agentes Freshchat:\n${listToBullets(agents, (item) => summarizeFreshchatAgent(item))}`
          : "Nenhum agente encontrado no Freshchat.",
        data: agents,
      };
    }
    case "freshchat_groups_list": {
      const groups = await listFreshchatGroups(env, { limit: Number(args.limit) || 10 });
      return {
        ok: true,
        text: groups.length
          ? `Grupos Freshchat:\n${listToBullets(groups, (item) => summarizeFreshchatGroup(item))}`
          : "Nenhum grupo encontrado no Freshchat.",
        data: groups,
      };
    }
    case "freshchat_users_list": {
      const users = await listFreshchatUsers(env, {
        limit: Number(args.limit) || 10,
        email: args.email || null,
        externalId: args.external_id || null,
        phone: args.phone || null,
      });
      return {
        ok: true,
        text: users.length
          ? `Usuarios Freshchat:\n${listToBullets(users, (item) => summarizeFreshchatUser(item))}`
          : "Nenhum usuario encontrado no Freshchat.",
        data: users,
      };
    }
    case "freshchat_message_send": {
      if (!args.id || !clean(args.message)) {
        return { ok: false, text: "Informe o ID da conversa e a mensagem a enviar." };
      }
      const message = await sendFreshchatConversationMessage(env, args.id, args.message);
      return {
        ok: true,
        text: `Mensagem enviada para a conversa ${args.id}.`,
        data: message,
      };
    }
    default:
      return { ok: false, text: `Operacao ${operation} nao suportada.` };
  }
}

export function parseWorkspacePatch(input) {
  return parseKeyValuePatch(input);
}
