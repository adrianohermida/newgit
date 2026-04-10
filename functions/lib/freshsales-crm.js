import { getCleanEnvValue } from "./env.js";
import { buildFreshsalesAppointmentPayload, buildFreshsalesJourneyUpdate, getFreshsalesJourneyConfig } from "./freshsales-journey.js";

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { first_name: "Cliente", last_name: "Site" };
  }
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: "Site" };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

function buildCandidates(env) {
  const raw = resolveFreshsalesBase(env);

  if (!raw) return [];
  const base = raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;

  if (base.includes("/crm/sales/api")) return [base];
  if (base.includes("/api")) return [base];
  return [`${base}/crm/sales/api`, `${base}/api`];
}

function resolveFreshsalesBase(env) {
  const direct =
    getCleanEnvValue(env.FRESHSALES_API_BASE) ||
    expandEnvTemplate(env, getCleanEnvValue(env.FRESHSALES_BASE_URL)) ||
    getCleanEnvValue(env.FRESHSALES_ALIAS_DOMAIN) ||
    getCleanEnvValue(env.FRESHSALES_DOMAIN);

  if (!direct) return null;

  const normalized = direct.startsWith("http") ? direct : `https://${direct}`;
  return normalized.replace(/\/+$/, "");
}

function expandEnvTemplate(env, value) {
  const text = getCleanEnvValue(value);
  if (!text) return null;
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key) => getCleanEnvValue(env[key]) || "");
}

function resolveSupabaseOAuthUrl(env, action = "token") {
  const supabaseUrl =
    getCleanEnvValue(env.SUPABASE_URL) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) ||
    null;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/oauth?action=${encodeURIComponent(action)}`;
}

function getSupabaseFunctionHeaders(env) {
  const serviceRoleKey = getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (!serviceRoleKey) return headers;
  return {
    ...headers,
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function ensureSupabaseOauthSeed(env) {
  const seedUrl = resolveSupabaseOAuthUrl(env, "seed");
  const accessToken = getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN);
  const refreshToken = getCleanEnvValue(env.FRESHSALES_REFRESH_TOKEN);
  if (!seedUrl || !accessToken || !refreshToken) return false;

  const response = await fetch(seedUrl, {
    method: "POST",
    headers: getSupabaseFunctionHeaders(env),
  }).catch(() => null);

  return Boolean(response?.ok);
}

async function getSupabaseOauthAccessToken(env) {
  const tokenUrl = resolveSupabaseOAuthUrl(env, "token");
  if (!tokenUrl) return null;

  const requestToken = async () => {
    const response = await fetch(tokenUrl, {
      method: "GET",
      headers: getSupabaseFunctionHeaders(env),
    }).catch(() => null);

    if (!response) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 || response.status === 400) return { missing: true };
      return null;
    }

    if (!payload?.access_token) return null;
    return payload.access_token;
  };

  const initial = await requestToken();
  if (typeof initial === "string") return initial;
  if (!initial?.missing) return null;

  const seeded = await ensureSupabaseOauthSeed(env);
  if (!seeded) return null;

  const retried = await requestToken();
  return typeof retried === "string" ? retried : null;
}

async function getAuthHeaders(env) {
  const apiKey = getCleanEnvValue(env.FRESHSALES_API_KEY);
  const accessToken = getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN);
  const basicAuth = getCleanEnvValue(env.FRESHSALES_BASIC_AUTH);
  const explicitMode = getCleanEnvValue(env.FRESHSALES_AUTH_MODE);
  const supabaseOauthToken = await getSupabaseOauthAccessToken(env);
  const headers = [
    apiKey ? { name: "api_key", header: { Authorization: `Token token=${apiKey}` } } : null,
    basicAuth ? { name: "basic_auth", header: /^Basic\s+/i.test(basicAuth) ? { Authorization: basicAuth } : { Authorization: `Basic ${basicAuth}` } } : null,
    supabaseOauthToken ? { name: "supabase_oauth", header: { Authorization: `Bearer ${supabaseOauthToken}` } } : null,
    accessToken ? { name: "access_token", header: { Authorization: `Bearer ${accessToken}` } } : null,
  ].filter(Boolean);

  if (explicitMode === "oauth") {
    headers.sort((left, right) => {
      const leftRank = left.name === "supabase_oauth" ? 0 : left.name === "access_token" ? 1 : 2;
      const rightRank = right.name === "supabase_oauth" ? 0 : right.name === "access_token" ? 1 : 2;
      return leftRank - rightRank;
    });
  } else if (explicitMode) {
    headers.sort((left, right) => (left.name === explicitMode ? -1 : right.name === explicitMode ? 1 : 0));
  }

  return headers.map((item) => item.header);
}

export async function freshsalesRequest(env, path, init = {}) {
  const candidates = buildCandidates(env);
  const authHeaders = await getAuthHeaders(env);
  if (!candidates.length || !authHeaders.length) {
    throw new Error("Credenciais do Freshsales ausentes no ambiente.");
  }

  let lastError = null;
  for (const base of candidates) {
    for (const authHeader of authHeaders) {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader,
          ...(init.headers || {}),
        },
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(payload.message || payload.error || `Freshsales request failed with status ${response.status}`);
        continue;
      }

      return {
        payload,
        base,
      };
    }
  }

  throw lastError || new Error("Falha ao conectar no Freshsales.");
}

function resolveFreshsalesActivityTypeId(env, candidates = []) {
  for (const candidate of candidates) {
    const value = getCleanEnvValue(env?.[candidate]);
    if (value) return value;
  }
  return null;
}

export async function lookupFreshsalesContactByEmail(env, email) {
  const query = encodeURIComponent(String(email || "").trim());
  const candidates = [
    `/lookup?q=${query}&f=email&entities=contact`,
    `/lookup?q=${query}&f=email&entities=contacts`,
  ];

  for (const path of candidates) {
    try {
      const { payload } = await freshsalesRequest(env, path);
      const items = [
        ...(Array.isArray(payload?.contacts) ? payload.contacts : []),
        ...(Array.isArray(payload?.contacts?.contacts) ? payload.contacts.contacts : []),
        ...(Array.isArray(payload?.results) ? payload.results : []),
        ...(Array.isArray(payload) ? payload : []),
      ].filter(Boolean);

      const direct = items.find((item) => {
        const emails = Array.isArray(item?.emails) ? item.emails : [];
        return emails.some((entry) => String(entry || "").trim().toLowerCase() === String(email || "").trim().toLowerCase())
          || String(item?.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase();
      });

      if (direct) return direct;
      if (items[0]) return items[0];
    } catch {
      continue;
    }
  }

  return null;
}

export async function viewFreshsalesContact(env, contactId, include = "sales_accounts,deals,appointments,sales_activities,owner") {
  const { payload } = await freshsalesRequest(env, `/contacts/${encodeURIComponent(String(contactId))}?include=${include}`);
  return payload?.contact || payload || null;
}

export async function viewFreshsalesSalesAccount(env, accountId, include = "owner,contacts,deals,appointments") {
  const { payload } = await freshsalesRequest(env, `/sales_accounts/${encodeURIComponent(String(accountId))}?include=${include}`);
  return payload?.sales_account || payload || null;
}

export async function listFreshsalesSalesAccountContacts(env, accountId) {
  const { payload } = await freshsalesRequest(env, `/sales_accounts/${encodeURIComponent(String(accountId))}/contacts`);
  return Array.isArray(payload?.contacts) ? payload.contacts : Array.isArray(payload) ? payload : [];
}

export async function viewFreshsalesDeal(env, dealId) {
  const { payload } = await freshsalesRequest(env, `/deals/${encodeURIComponent(String(dealId))}`);
  return payload?.deal || payload || null;
}

export async function listFreshsalesSalesActivities(env, { page = 1, perPage = 100 } = {}) {
  const { payload } = await freshsalesRequest(env, `/sales_activities?page=${page}&per_page=${perPage}`);
  return Array.isArray(payload?.sales_activities) ? payload.sales_activities : Array.isArray(payload) ? payload : [];
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeFreshsalesCollectionPayload(entity, payload) {
  const directKey = entity === "sales_accounts" ? "sales_accounts" : entity;
  return toArray(payload?.[directKey] || payload?.items || payload);
}

async function listFreshsalesFilters(env, entity) {
  const { payload } = await freshsalesRequest(env, `/${entity}/filters`);
  return toArray(payload?.filters || payload);
}

async function listFreshsalesView(env, entity, viewId, { page = 1, perPage = 100 } = {}) {
  const { payload } = await freshsalesRequest(env, `/${entity}/view/${encodeURIComponent(String(viewId))}?page=${page}&per_page=${perPage}`);
  return normalizeFreshsalesCollectionPayload(entity, payload);
}

function pickPreferredFilter(filters, preferredNames = []) {
  if (!filters.length) return null;

  for (const preferredName of preferredNames) {
    const exact = filters.find((item) => String(item?.name || "").trim().toLowerCase() === String(preferredName || "").trim().toLowerCase());
    if (exact) return exact;
  }

  const allCandidate = filters.find((item) => /all/i.test(String(item?.name || "")));
  if (allCandidate) return allCandidate;

  return filters[0];
}

export async function listFreshsalesSalesAccountsFromViews(env, { maxPages = 4, perPage = 100 } = {}) {
  const filters = await listFreshsalesFilters(env, "sales_accounts");
  const selected = pickPreferredFilter(filters, ["All Accounts", "My Accounts", "All sales accounts", "My sales accounts"]);
  if (!selected?.id) return [];

  const pages = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const items = await listFreshsalesView(env, "sales_accounts", selected.id, { page, perPage });
    pages.push(...items);
    if (items.length < perPage) break;
  }

  return pages;
}

export async function listFreshsalesDealsFromViews(env, { maxPages = 4, perPage = 100 } = {}) {
  const filters = await listFreshsalesFilters(env, "deals");
  const selected = pickPreferredFilter(filters, ["All Deals", "My Deals", "All deals", "My deals"]);
  if (!selected?.id) return [];

  const pages = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const items = await listFreshsalesView(env, "deals", selected.id, { page, perPage });
    pages.push(...items);
    if (items.length < perPage) break;
  }

  return pages;
}

export async function listFreshsalesAppointmentsFromViews(env, { maxPages = 4, perPage = 100 } = {}) {
  const filters = await listFreshsalesFilters(env, "appointments");
  const selected = pickPreferredFilter(filters, ["All Appointments", "My Appointments", "All appointments", "My appointments"]);
  if (!selected?.id) return [];

  const pages = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const items = await listFreshsalesView(env, "appointments", selected.id, { page, perPage });
    pages.push(...items);
    if (items.length < perPage) break;
  }

  return pages;
}

export async function upsertFreshsalesContactForAgendamento(env, agendamento, eventType = "booked", options = {}) {
  const { first_name, last_name } = splitName(agendamento.nome);
  const stageUpdate = buildFreshsalesJourneyUpdate(eventType, agendamento, env, options);

  const contactPayload = {
    unique_identifier: { emails: agendamento.email },
    contact: {
      first_name,
      last_name,
      mobile_number: agendamento.telefone || null,
      emails: [agendamento.email],
      custom_field: stageUpdate.contact_update || {},
    },
  };

  const { payload, base } = await freshsalesRequest(env, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(contactPayload),
  });

  return {
    base,
    contact: payload.contact || payload,
    stageUpdate,
  };
}

export async function createFreshsalesAppointmentForAgendamento(env, agendamento, contactId, zoomSnapshot = null, options = {}) {
  const appointmentPayload = buildFreshsalesAppointmentPayload(agendamento, zoomSnapshot, env, options);
  if (contactId) {
    appointmentPayload.appointment.targetable_type = "Contact";
    appointmentPayload.appointment.targetable_id = String(contactId);
    appointmentPayload.appointment.appointment_attendees_attributes = [
      {
        attendee_type: "Contact",
        attendee_id: String(contactId),
      },
    ];
  }

  const { payload, base } = await freshsalesRequest(env, "/appointments", {
    method: "POST",
    body: JSON.stringify(appointmentPayload),
  });

  return {
    base,
    appointment: payload.appointment || payload,
    requestPayload: appointmentPayload,
  };
}

export async function updateFreshsalesAppointmentForAgendamento(env, appointmentId, agendamento, contactId, zoomSnapshot = null, options = {}) {
  const appointmentPayload = buildFreshsalesAppointmentPayload(agendamento, zoomSnapshot, env, options);
  if (contactId) {
    appointmentPayload.appointment.targetable_type = "Contact";
    appointmentPayload.appointment.targetable_id = String(contactId);
    appointmentPayload.appointment.appointment_attendees_attributes = [
      {
        attendee_type: "Contact",
        attendee_id: String(contactId),
      },
    ];
  }

  const { payload, base } = await freshsalesRequest(env, `/appointments/${encodeURIComponent(String(appointmentId))}`, {
    method: "PUT",
    body: JSON.stringify(appointmentPayload),
  });

  return {
    base,
    appointment: payload.appointment || payload,
    requestPayload: appointmentPayload,
  };
}

export async function deleteFreshsalesAppointment(env, appointmentId) {
  const { payload, base } = await freshsalesRequest(env, `/appointments/${encodeURIComponent(String(appointmentId))}`, {
    method: "DELETE",
  });

  return {
    base,
    payload,
  };
}

async function createFreshsalesSalesActivity(env, agendamento, contactId, eventType, options = {}) {
  const config = getFreshsalesJourneyConfig(env);
  const activityType = config.salesActivityTypeByEvent?.[eventType];
  if (!activityType) {
    return null;
  }

  const activityPayload = {
    sales_activity: {
      subject: `Agendamento (${eventType}) - ${agendamento.area}`,
      note: [
        `Cliente: ${agendamento.nome}`,
        `E-mail: ${agendamento.email}`,
        `Telefone: ${agendamento.telefone}`,
        `Status local: ${agendamento.status || "pendente"}`,
        options.actionLinks?.cliente?.confirmar ? `Confirmar: ${options.actionLinks.cliente.confirmar}` : null,
        options.actionLinks?.cliente?.cancelar ? `Cancelar: ${options.actionLinks.cliente.cancelar}` : null,
        options.actionLinks?.cliente?.remarcar ? `Remarcar: ${options.actionLinks.cliente.remarcar}` : null,
      ].filter(Boolean).join("\n"),
      activity_date: new Date(`${agendamento.data}T${agendamento.hora}:00-03:00`).toISOString(),
      owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
      targetable_type: contactId ? "Contact" : null,
      targetable_id: contactId ? String(contactId) : null,
      sales_activity_type_id: activityType,
    },
  };

  const { payload, base } = await freshsalesRequest(env, "/sales_activities", {
    method: "POST",
    body: JSON.stringify(activityPayload),
  });

  return {
    base,
    activity: payload.sales_activity || payload,
    requestPayload: activityPayload,
  };
}

export async function createFreshsalesPublicationActivity(env, {
  accountId,
  publication,
  process = {},
} = {}) {
  const normalizedAccountId = String(accountId || process?.account_id_freshsales || "").trim();
  if (!normalizedAccountId) {
    throw new Error("Sales Account ausente para criar activity de publicacao.");
  }

  const activityTypeId = resolveFreshsalesActivityTypeId(env, [
    "FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID",
    "FRESHSALES_PUBLICACOES_ACTIVITY_TYPE_ID",
    "FRESHSALES_ACTIVITY_TYPE_PUBLICACAO_ID",
    "FRESHSALES_SALES_ACTIVITY_TYPE_PUBLICACAO_ID",
    "FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID",
  ]);
  if (!activityTypeId) {
    throw new Error("Tipo de activity de publicacao nao configurado no ambiente do Freshsales.");
  }

  const processNumber = String(process?.numero_cnj || publication?.numero_processo_api || "").trim();
  const processTitle = String(process?.titulo || "").trim();
  const content = String(publication?.conteudo || "").trim();
  const snippet = content.slice(0, 4000);
  const publicationDate = publication?.data_publicacao
    ? new Date(publication.data_publicacao).toISOString()
    : new Date().toISOString();

  const noteLines = [
    processNumber ? `Processo: ${processNumber}` : null,
    processTitle ? `Titulo: ${processTitle}` : null,
    publication?.fonte ? `Fonte: ${publication.fonte}` : null,
    publication?.data_publicacao ? `Data da publicacao: ${publication.data_publicacao}` : null,
    publication?.id ? `Publicacao HMADV: ${publication.id}` : null,
    snippet ? `Conteudo:\n${snippet}` : null,
  ].filter(Boolean);

  const activityPayload = {
    sales_activity: {
      subject: processNumber
        ? `Publicacao judicial - ${processNumber}`
        : `Publicacao judicial - conta ${normalizedAccountId}`,
      note: noteLines.join("\n\n"),
      activity_date: publicationDate,
      owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
      targetable_type: "SalesAccount",
      targetable_id: normalizedAccountId,
      sales_activity_type_id: activityTypeId,
    },
  };

  const { payload, base } = await freshsalesRequest(env, "/sales_activities", {
    method: "POST",
    body: JSON.stringify(activityPayload),
  });

  return {
    base,
    activity: payload.sales_activity || payload,
    requestPayload: activityPayload,
  };
}

export async function createFreshsalesAudienciaActivity(env, {
  accountId,
  audiencia,
  process = {},
} = {}) {
  const normalizedAccountId = String(accountId || process?.account_id_freshsales || "").trim();
  if (!normalizedAccountId) {
    throw new Error("Sales Account ausente para criar activity de audiencia.");
  }

  const activityTypeId = resolveFreshsalesActivityTypeId(env, [
    "FRESHSALES_ACTIVITY_TYPE_AUDIENCIA",
    "FRESHSALES_AUDIENCIA_ACTIVITY_TYPE_ID",
    "FRESHSALES_AUDIENCIAS_ACTIVITY_TYPE_ID",
    "FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID",
  ]);
  if (!activityTypeId) {
    throw new Error("Tipo de activity de audiencia nao configurado no ambiente do Freshsales.");
  }

  const processNumber = String(process?.numero_cnj || "").trim();
  const title = processNumber
    ? `Audiencia judicial - ${processNumber}`
    : `Audiencia judicial - conta ${normalizedAccountId}`;
  const dateIso = audiencia?.data_audiencia
    ? new Date(audiencia.data_audiencia).toISOString()
    : new Date().toISOString();
  const noteLines = [
    processNumber ? `Processo: ${processNumber}` : null,
    process?.titulo ? `Titulo: ${process.titulo}` : null,
    audiencia?.tipo ? `Tipo: ${audiencia.tipo}` : null,
    audiencia?.situacao ? `Situacao: ${audiencia.situacao}` : null,
    audiencia?.local ? `Local: ${audiencia.local}` : null,
    audiencia?.descricao ? `Descricao:\n${String(audiencia.descricao).slice(0, 4000)}` : null,
    audiencia?.origem ? `Origem: ${audiencia.origem}` : null,
    audiencia?.id ? `Audiencia HMADV: ${audiencia.id}` : null,
  ].filter(Boolean);

  const activityPayload = {
    sales_activity: {
      subject: title,
      note: noteLines.join("\n\n"),
      activity_date: dateIso,
      owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
      targetable_type: "SalesAccount",
      targetable_id: normalizedAccountId,
      sales_activity_type_id: activityTypeId,
    },
  };

  const { payload, base } = await freshsalesRequest(env, "/sales_activities", {
    method: "POST",
    body: JSON.stringify(activityPayload),
  });

  return {
    base,
    activity: payload.sales_activity || payload,
    requestPayload: activityPayload,
  };
}

export async function createFreshsalesAppointmentForAudiencia(env, {
  accountId,
  audiencia,
  process = {},
} = {}) {
  const normalizedAccountId = String(accountId || process?.account_id_freshsales || "").trim();
  if (!normalizedAccountId) {
    throw new Error("Sales Account ausente para criar appointment de audiencia.");
  }
  const startAt = audiencia?.data_audiencia
    ? new Date(audiencia.data_audiencia)
    : new Date();
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const processNumber = String(process?.numero_cnj || "").trim();
  const appointmentPayload = {
    appointment: {
      title: processNumber ? `Audiencia - ${processNumber}` : "Audiencia judicial",
      from_date: startAt.toISOString(),
      end_date: endAt.toISOString(),
      description: [
        processNumber ? `Processo: ${processNumber}` : null,
        process?.titulo ? `Titulo: ${process.titulo}` : null,
        audiencia?.tipo ? `Tipo: ${audiencia.tipo}` : null,
        audiencia?.situacao ? `Situacao: ${audiencia.situacao}` : null,
        audiencia?.local ? `Local: ${audiencia.local}` : null,
        audiencia?.descricao ? `Descricao:\n${String(audiencia.descricao).slice(0, 3000)}` : null,
      ].filter(Boolean).join("\n\n"),
      location: audiencia?.local || "Audiencia judicial",
      owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
      targetable_type: "SalesAccount",
      targetable_id: normalizedAccountId,
      external_id: audiencia?.id ? `audiencia-${audiencia.id}` : null,
    },
  };

  const { payload, base } = await freshsalesRequest(env, "/appointments", {
    method: "POST",
    body: JSON.stringify(appointmentPayload),
  });

  return {
    base,
    appointment: payload.appointment || payload,
    requestPayload: appointmentPayload,
  };
}

export async function syncAgendamentoToFreshsales(env, agendamento, eventType, zoomSnapshot = null, options = {}) {
  const contactResult = await upsertFreshsalesContactForAgendamento(env, agendamento, eventType, options);
  const contactId = contactResult?.contact?.id || agendamento.freshsales_contact_id || null;

  let appointmentResult = null;
  if (eventType === "cancelled") {
    if (agendamento.freshsales_appointment_id) {
      appointmentResult = await deleteFreshsalesAppointment(env, agendamento.freshsales_appointment_id);
    }
  } else if (agendamento.freshsales_appointment_id) {
    appointmentResult = await updateFreshsalesAppointmentForAgendamento(
      env,
      agendamento.freshsales_appointment_id,
      agendamento,
      contactId,
      zoomSnapshot,
      { ...options, eventType }
    );
  } else {
    appointmentResult = await createFreshsalesAppointmentForAgendamento(env, agendamento, contactId, zoomSnapshot, {
      ...options,
      eventType,
    });
  }

  let activityResult = null;
  try {
    activityResult = await createFreshsalesSalesActivity(env, agendamento, contactId, eventType, options);
  } catch (error) {
    activityResult = {
      error: error.message,
    };
  }

  return {
    contactId: contactId ? String(contactId) : null,
    appointmentId: appointmentResult?.appointment?.id ? String(appointmentResult.appointment.id) : agendamento.freshsales_appointment_id || null,
    salesActivityId: activityResult?.activity?.id ? String(activityResult.activity.id) : null,
    base: appointmentResult?.base || contactResult?.base || activityResult?.base || null,
    payload: {
      eventType,
      contact: contactResult?.contact || null,
      appointment: appointmentResult?.appointment || null,
      salesActivity: activityResult?.activity || null,
      salesActivityError: activityResult?.error || null,
      stageUpdate: contactResult?.stageUpdate || null,
    },
  };
}
