import {
  freshsalesRequest,
  listFreshsalesSalesActivities,
  lookupFreshsalesContactByEmail,
  viewFreshsalesContact,
  viewFreshsalesDeal,
  viewFreshsalesSalesAccount,
} from "./freshsales-crm.js";
import { getSupabaseBaseUrl, getSupabaseServerKey, getCleanEnvValue } from "./env.js";
import { persistDotobotMemory, retrieveDotobotRagContext } from "../../lib/lawdesk/rag.js";
import {
  getClientProcessDetails,
  getClientSummary,
  listClientDocumentos,
  listClientProcessos,
  listClientPublicacoes,
} from "./client-data.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function getGatewaySecret(env) {
  return (
    getCleanEnvValue(env.FREDDY_ACTION_SHARED_SECRET) ||
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    null
  );
}

function getProvidedSecret(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return (
    getCleanEnvValue(request.headers.get("x-freddy-secret")) ||
    getCleanEnvValue(request.headers.get("x-hmadv-secret")) ||
    getCleanEnvValue(request.headers.get("x-shared-secret")) ||
    getCleanEnvValue(bearerMatch?.[1]) ||
    null
  );
}

export function authorizeFreddyGateway(request, env) {
  const expected = getGatewaySecret(env);
  const provided = getProvidedSecret(request);

  if (!expected) {
    return { ok: false, status: 500, error: "FREDDY_ACTION_SHARED_SECRET ausente no ambiente." };
  }

  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Nao autorizado para usar o Freddy Memory Gateway." };
  }

  return { ok: true };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function extractContactId(contact) {
  return (
    contact?.id ||
    contact?.contact?.id ||
    contact?.contact_id ||
    null
  );
}

function extractPrimarySalesAccountId(contact) {
  return (
    contact?.sales_account_id ||
    contact?.sales_account?.id ||
    normalizeArray(contact?.sales_accounts)[0]?.id ||
    normalizeArray(contact?.sales_account_ids)[0] ||
    null
  );
}

function extractDealIds(contact, dealId = null) {
  const fromContact = normalizeArray(contact?.deals).map((item) => item?.id).filter(Boolean);
  const fromIds = normalizeArray(contact?.deal_ids).filter(Boolean);
  return Array.from(new Set([dealId, ...fromContact, ...fromIds].filter(Boolean)));
}

function buildContactName(contact, fallback = "Cliente") {
  return (
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
    contact?.display_name ||
    fallback
  );
}

function extractProcessCandidates(input = {}, contact360 = {}) {
  const rawCandidates = [
    input.process_id,
    input.processId,
    input.process_number,
    input.processNumber,
    input.numero_cnj,
    input.numeroCNJ,
    input.cnj,
    input.account_process_reference,
    contact360?.salesAccount?.cf_processo,
    contact360?.salesAccount?.custom_field?.cf_processo,
    contact360?.salesAccount?.name,
    contact360?.contact?.cf_processo,
    contact360?.contact?.custom_field?.cf_processo,
  ];

  return Array.from(
    new Set(
      rawCandidates
        .map((value) => safeText(value))
        .filter(Boolean)
    )
  );
}

async function resolveJudicial360(env, input = {}, contact360 = {}) {
  const email =
    safeText(input.email) ||
    safeText(contact360?.identifiers?.email) ||
    safeText(contact360?.contact?.email) ||
    safeText(normalizeArray(contact360?.contact?.emails)[0]);

  if (!email) {
    return {
      enabled: false,
      warning: "Email do cliente ausente para carregar contexto judicial.",
      identifiers: {
        email: null,
        process_reference: null,
      },
      summary: null,
      process_portfolio: [],
      recent_publications: [],
      recent_documents: [],
      process_detail: null,
      dashboard: null,
      warnings: ["Nao foi possivel resolver o email do cliente para consultar a carteira judicial."],
    };
  }

  const profile = {
    email,
    full_name: safeText(input.full_name || input.fullName) || buildContactName(contact360?.contact, email),
  };

  const processCandidates = extractProcessCandidates(input, contact360);
  const processReference = processCandidates[0] || null;

  const [portfolio, publications, documents, dashboard, processDetail] = await Promise.all([
    listClientProcessos(env, email).catch((error) => ({
      items: [],
      warning: error?.message || "Nao foi possivel carregar a carteira processual.",
    })),
    listClientPublicacoes(env, profile).catch((error) => ({
      items: [],
      warning: error?.message || "Nao foi possivel carregar as publicacoes judiciais.",
    })),
    listClientDocumentos(env, email).catch((error) => ({
      items: [],
      warning: error?.message || "Nao foi possivel carregar os documentos judiciais.",
    })),
    getClientSummary(env, profile).catch((error) => ({
      summary: {},
      recentActivity: [],
      attentionItems: [],
      warnings: [error?.message || "Nao foi possivel carregar o resumo judicial."],
    })),
    processReference
      ? getClientProcessDetails(env, profile, processReference).catch((error) => ({
          process: null,
          parts: [],
          movements: [],
          publications: [],
          audiencias: [],
          documents: [],
          warnings: [error?.message || "Nao foi possivel carregar o detalhe do processo solicitado."],
        }))
      : Promise.resolve(null),
  ]);

  const warnings = [
    portfolio?.warning,
    publications?.warning,
    documents?.warning,
    ...(normalizeArray(dashboard?.warnings)),
    ...(normalizeArray(processDetail?.warnings)),
  ].filter(Boolean);

  const summaryParts = [];
  const processItems = normalizeArray(portfolio?.items);
  const publicationItems = normalizeArray(publications?.items);
  const documentItems = normalizeArray(documents?.items);
  const highlightedProcess = processDetail?.process || processItems[0] || null;

  if (dashboard?.summary) {
    const counts = [];
    if (dashboard.summary.processos != null) counts.push(`${dashboard.summary.processos} processos`);
    if (dashboard.summary.publicacoes != null) counts.push(`${dashboard.summary.publicacoes} publicacoes`);
    if (dashboard.summary.documentos != null) counts.push(`${dashboard.summary.documentos} documentos`);
    if (counts.length) {
      summaryParts.push(`Carteira judicial: ${counts.join(", ")}.`);
    }
  }

  if (highlightedProcess) {
    const processLabel = highlightedProcess.title || highlightedProcess.number || highlightedProcess.numero_cnj || highlightedProcess.id;
    const processStatus = highlightedProcess.status || highlightedProcess.status_label || highlightedProcess.court || highlightedProcess.tribunal;
    summaryParts.push(`Processo foco: ${processLabel}${processStatus ? ` (${processStatus})` : ""}.`);
  }

  if (publicationItems.length) {
    const latestPublication = publicationItems[0];
    summaryParts.push(`Ultima publicacao: ${latestPublication?.title || latestPublication?.source || "Publicacao judicial"}${latestPublication?.date ? ` em ${latestPublication.date}` : ""}.`);
  }

  if (documentItems.length) {
    const latestDocument = documentItems[0];
    summaryParts.push(`Documento recente: ${latestDocument?.name || "Documento"}${latestDocument?.status_label ? ` (${latestDocument.status_label})` : ""}.`);
  }

  if (processDetail?.movements?.length) {
    const latestMovement = processDetail.movements[0];
    summaryParts.push(`Ultimo andamento: ${latestMovement?.title || latestMovement?.description || latestMovement?.summary || "Movimentacao processual recente"}.`);
  }

  if (processDetail?.audiencias?.length) {
    const nextAudience = processDetail.audiencias[0];
    summaryParts.push(`Audiencias vinculadas: ${processDetail.audiencias.length}${nextAudience?.date ? `, proxima referencia em ${nextAudience.date}` : ""}.`);
  }

  return {
    enabled: true,
    identifiers: {
      email,
      process_reference: processReference,
    },
    summary: summaryParts.join(" "),
    process_portfolio: processItems.slice(0, 10),
    recent_publications: publicationItems.slice(0, 10),
    recent_documents: documentItems.slice(0, 10),
    process_detail: processDetail,
    dashboard,
    warnings,
  };
}

async function safeFreshsales(env, path, init = {}) {
  try {
    const { payload } = await freshsalesRequest(env, path, init);
    return payload;
  } catch {
    return null;
  }
}

async function listContactTasks(env, contactId) {
  const candidates = [
    `/tasks?targetable_type=Contact&targetable_id=${encodeURIComponent(String(contactId))}`,
    `/contacts/${encodeURIComponent(String(contactId))}/tasks`,
  ];

  for (const path of candidates) {
    const payload = await safeFreshsales(env, path);
    const tasks = normalizeArray(payload?.tasks || payload);
    if (tasks.length) return tasks;
  }
  return [];
}

async function listContactNotes(env, contactId) {
  const candidates = [
    `/contacts/${encodeURIComponent(String(contactId))}/notes`,
    `/notes?targetable_type=Contact&targetable_id=${encodeURIComponent(String(contactId))}`,
  ];

  for (const path of candidates) {
    const payload = await safeFreshsales(env, path);
    const notes = normalizeArray(payload?.notes || payload);
    if (notes.length) return notes;
  }
  return [];
}

async function listContactDocuments(env, contactId) {
  const candidates = [
    `/contacts/${encodeURIComponent(String(contactId))}/documents`,
    `/documents?targetable_type=Contact&targetable_id=${encodeURIComponent(String(contactId))}`,
  ];

  for (const path of candidates) {
    const payload = await safeFreshsales(env, path);
    const docs = normalizeArray(payload?.documents || payload);
    if (docs.length) return docs;
  }
  return [];
}

function buildContactSummary({ contact, salesAccount, deals, tasks, notes, documents, activities, ragContext, judicialContext }) {
  const parts = [];

  if (contact) {
    const name = buildContactName(contact, "Contato");
    parts.push(`Contato: ${name}.`);
    if (contact.email || normalizeArray(contact.emails)[0]) {
      parts.push(`Email principal: ${contact.email || normalizeArray(contact.emails)[0]}.`);
    }
    if (contact.mobile_number || contact.phone_number) {
      parts.push(`Telefone: ${contact.mobile_number || contact.phone_number}.`);
    }
  }

  if (salesAccount?.name) {
    parts.push(`Account vinculado: ${salesAccount.name}.`);
  }

  if (deals.length) {
    parts.push(`Deals relacionados: ${deals.slice(0, 3).map((deal) => deal?.name || deal?.title || deal?.id).filter(Boolean).join(", ")}.`);
  }

  if (tasks.length) {
    parts.push(`Tasks abertas/recentes: ${tasks.slice(0, 3).map((task) => task?.title || task?.subject || task?.id).filter(Boolean).join(", ")}.`);
  }

  if (notes.length) {
    parts.push(`Notas recentes: ${notes.length}.`);
  }

  if (documents.length) {
    parts.push(`Documentos relacionados: ${documents.length}.`);
  }

  if (activities.length) {
    parts.push(`Atividades recentes: ${activities.slice(0, 4).map((item) => item?.title || item?.subject || item?.type_name || item?.id).filter(Boolean).join(", ")}.`);
  }

  if (ragContext?.matches?.length) {
    parts.push(`Memoria relevante: ${ragContext.matches.slice(0, 3).map((item) => item?.text).filter(Boolean).join(" | ")}.`);
  }

  if (judicialContext?.summary) {
    parts.push(`Contexto judicial: ${judicialContext.summary}`);
  }

  return parts.join(" ");
}

async function resolveContact360(env, input = {}) {
  const email = safeText(input.email);
  const explicitContactId = safeText(input.contact_id || input.contactId);
  const explicitAccountId = safeText(input.account_id || input.accountId);
  const explicitDealId = safeText(input.deal_id || input.dealId);

  let contact = null;
  if (explicitContactId) {
    contact = await viewFreshsalesContact(env, explicitContactId).catch(() => null);
  } else if (email) {
    const found = await lookupFreshsalesContactByEmail(env, email).catch(() => null);
    const contactId = extractContactId(found);
    contact = contactId ? await viewFreshsalesContact(env, contactId).catch(() => found) : found;
  }

  const contactId = extractContactId(contact);
  const salesAccountId = explicitAccountId || extractPrimarySalesAccountId(contact);
  const dealIds = extractDealIds(contact, explicitDealId);

  const [salesAccount, deals, tasks, notes, documents, activities] = await Promise.all([
    salesAccountId ? viewFreshsalesSalesAccount(env, salesAccountId).catch(() => null) : Promise.resolve(null),
    Promise.all(dealIds.slice(0, 4).map((dealId) => viewFreshsalesDeal(env, dealId).catch(() => null))).then((rows) => rows.filter(Boolean)),
    contactId ? listContactTasks(env, contactId) : Promise.resolve([]),
    contactId ? listContactNotes(env, contactId) : Promise.resolve([]),
    contactId ? listContactDocuments(env, contactId) : Promise.resolve([]),
    listFreshsalesSalesActivities(env, { page: 1, perPage: 50 }).catch(() => []),
  ]);

  const filteredActivities = normalizeArray(activities)
    .filter((item) => {
      const targetableId = String(item?.targetable_id || item?.contact_id || "");
      return contactId ? targetableId === String(contactId) : true;
    })
    .slice(0, 10);

  return {
    contact,
    salesAccount,
    deals,
    tasks: normalizeArray(tasks).slice(0, 10),
    notes: normalizeArray(notes).slice(0, 10),
    documents: normalizeArray(documents).slice(0, 10),
    activities: filteredActivities,
    identifiers: {
      email: email || contact?.email || normalizeArray(contact?.emails)[0] || null,
      contact_id: contactId || null,
      account_id: salesAccountId || null,
      deal_ids: dealIds,
    },
  };
}

async function supabaseInsert(env, table, payload) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServerKey(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta.");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text().catch(() => "");
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error((data && (data.message || data.error)) || raw || `Falha ao inserir em ${table}.`);
  }
  return data;
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: JSON_HEADERS,
  });
}

export function jsonError(message, status = 500, code = null) {
  return new Response(JSON.stringify({ ok: false, error: message, ...(code ? { code } : {}) }), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function handleFreddyGetContact360(request, env) {
  const auth = authorizeFreddyGateway(request, env);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  const body = await request.json().catch(() => ({}));
  const query = safeText(body.query || body.user_query || body.message);
  const topK = Number(body.top_k || body.topK || 6);
  const contact360 = await resolveContact360(env, body);
  const judicialContext = await resolveJudicial360(env, body, contact360);
  const ragContext = query
    ? await retrieveDotobotRagContext(env, { query, topK: Number.isFinite(topK) && topK > 0 ? topK : 6 })
    : { enabled: false, matches: [], trace: [], providers: {} };

  return jsonOk({
    data: {
      identifiers: contact360.identifiers,
      contact: contact360.contact,
      sales_account: contact360.salesAccount,
      deals: contact360.deals,
      tasks: contact360.tasks,
      notes: contact360.notes,
      documents: contact360.documents,
      activities: contact360.activities,
      judicial: judicialContext,
      rag: ragContext,
      summary: buildContactSummary({ ...contact360, ragContext, judicialContext }),
    },
  });
}

export async function handleFreddySearchMemory(request, env) {
  const auth = authorizeFreddyGateway(request, env);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  const body = await request.json().catch(() => ({}));
  const query = safeText(body.query || body.user_query || body.message);
  if (!query) {
    return jsonError("Informe query para buscar memoria.", 400);
  }

  const topK = Number(body.top_k || body.topK || 8);
  const ragContext = await retrieveDotobotRagContext(env, {
    query,
    topK: Number.isFinite(topK) && topK > 0 ? topK : 8,
  });

  return jsonOk({
    data: {
      query,
      rag: ragContext,
      matches: ragContext.matches || [],
      summary: normalizeArray(ragContext.matches).slice(0, 5).map((item) => item.text).join(" | "),
    },
  });
}

export async function handleFreddySaveMemory(request, env) {
  const auth = authorizeFreddyGateway(request, env);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  const body = await request.json().catch(() => ({}));
  const query = safeText(body.query || body.user_query || body.message);
  const responseText = safeText(body.response_text || body.response || body.answer);
  if (!query || !responseText) {
    return jsonError("Informe query e response_text para salvar memoria.", 400);
  }

  const sessionId =
    safeText(body.session_id || body.sessionId) ||
    safeText(body.contact_id || body.contactId) ||
    safeText(body.email) ||
    "freddy";

  const memory = await persistDotobotMemory(env, {
    sessionId,
    query,
    responseText,
    status: safeText(body.status, "ok"),
    steps: normalizeArray(body.steps),
    context: {
      route: safeText(body.route, "/freddy"),
      profile: {
        role: safeText(body.agent_ref || body.agentRef || "freddy-ai"),
      },
      assistant: {
        source: "freshsales-freddy",
      },
      crm: {
        contact_id: safeText(body.contact_id || body.contactId),
        account_id: safeText(body.account_id || body.accountId),
        deal_id: safeText(body.deal_id || body.dealId),
        email: safeText(body.email),
      },
    },
  });

  return jsonOk({
    data: {
      stored: Boolean(memory?.stored),
      memory,
    },
  });
}

export async function handleFreddySaveOutcome(request, env) {
  const auth = authorizeFreddyGateway(request, env);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  const body = await request.json().catch(() => ({}));
  const outcome = {
    id: crypto.randomUUID(),
    source_system: "freddy",
    category: safeText(body.category || "conversation_outcome"),
    severity: safeText(body.severity || "baixa"),
    status: safeText(body.status || "open"),
    title: safeText(body.title || "Outcome de conversa Freddy"),
    description: safeText(body.description || body.summary || "Resultado operacional registrado pelo Freddy."),
    agent_ref: safeText(body.agent_ref || body.agentRef || "freddy-ai"),
    conversation_id: safeText(body.conversation_id || body.conversationId),
    metadata: {
      email: safeText(body.email),
      contact_id: safeText(body.contact_id || body.contactId),
      account_id: safeText(body.account_id || body.accountId),
      deal_id: safeText(body.deal_id || body.dealId),
      workflow: safeText(body.workflow),
      intent: safeText(body.intent),
      handoff: safeText(body.handoff),
      raw: body,
    },
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const [incident] = await supabaseInsert(env, "agentlab_incidents", outcome);

  if (safeText(body.query || body.user_query || body.message) && safeText(body.response_text || body.response || body.answer)) {
    await persistDotobotMemory(env, {
      sessionId:
        safeText(body.session_id || body.sessionId) ||
        safeText(body.contact_id || body.contactId) ||
        safeText(body.email) ||
        "freddy",
      query: safeText(body.query || body.user_query || body.message),
      responseText: safeText(body.response_text || body.response || body.answer),
      status: "ok",
      steps: normalizeArray(body.steps),
      context: {
        route: "/freddy/outcome",
        profile: { role: safeText(body.agent_ref || body.agentRef || "freddy-ai") },
      },
    });
  }

  return jsonOk({
    data: {
      incident,
    },
  });
}
