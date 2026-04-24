function normalizeDomain(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildFreshdeskAuthHeader(env) {
  const basicToken = String(env.FRESHDESK_BASIC_TOKEN || "").trim();
  if (basicToken) {
    return basicToken.startsWith("Basic ") ? basicToken : `Basic ${basicToken}`;
  }

  const apiKey = String(env.FRESHDESK_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  return `Basic ${btoa(`${apiKey}:X`)}`;
}

export async function freshdeskRequest(env, path, init = {}) {
  const domain = normalizeDomain(env.FRESHDESK_DOMAIN);
  const token = buildFreshdeskAuthHeader(env);

  if (!domain || !token) {
    throw new Error("Configuracao incompleta no servidor. Variaveis do Freshdesk ausentes.");
  }

  const response = await fetch(`${domain}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const raw = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw ? { raw } : null;
  }

  if (!response.ok) {
    const detail =
      typeof payload?.description === "string"
        ? payload.description
        : typeof payload?.message === "string"
          ? payload.message
          : raw;
    throw new Error(detail || `Freshdesk request failed with status ${response.status}`);
  }

  return { response, payload };
}

export async function listFreshdeskTickets(env, filters = {}) {
  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));

  if (filters.email) {
    params.set("email", filters.email);
  }

  const { payload } = await freshdeskRequest(env, `/api/v2/tickets?${params.toString()}`);
  const items = payload;
  return {
    items: Array.isArray(items) ? items : [],
    warning: null,
  };
}

export async function viewFreshdeskTicket(env, ticketId) {
  const { payload } = await freshdeskRequest(env, `/api/v2/tickets/${encodeURIComponent(String(ticketId))}`);
  return payload || null;
}

export async function updateFreshdeskTicket(env, ticketId, patch = {}) {
  const { payload } = await freshdeskRequest(env, `/api/v2/tickets/${encodeURIComponent(String(ticketId))}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return payload || null;
}

export async function createFreshdeskNote(env, ticketId, note = {}) {
  const { payload } = await freshdeskRequest(
    env,
    `/api/v2/tickets/${encodeURIComponent(String(ticketId))}/notes`,
    {
      method: "POST",
      body: JSON.stringify(note),
    }
  );
  return payload || null;
}

export async function listFreshdeskContacts(env, filters = {}) {
  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));
  if (filters.email) {
    params.set("email", String(filters.email).trim());
  }
  const { payload } = await freshdeskRequest(env, `/api/v2/contacts?${params.toString()}`);
  return Array.isArray(payload) ? payload : [];
}

export async function viewFreshdeskContact(env, contactId) {
  const { payload } = await freshdeskRequest(env, `/api/v2/contacts/${encodeURIComponent(String(contactId))}`);
  return payload || null;
}

export async function listFreshdeskAgents(env, filters = {}) {
  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));
  const { payload } = await freshdeskRequest(env, `/api/v2/agents?${params.toString()}`);
  return Array.isArray(payload) ? payload : [];
}

export async function listFreshdeskGroups(env, filters = {}) {
  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));
  const { payload } = await freshdeskRequest(env, `/api/v2/groups?${params.toString()}`);
  return Array.isArray(payload) ? payload : [];
}
