import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { freshsalesRequest, viewFreshsalesContact } from "./freshsales-crm.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function buildSupabaseHeaders(env, schema = "public", extra = {}) {
  const apiKey = getSupabaseServerKey(env);
  if (!apiKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no runtime.");
  }
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    ...extra,
  };
}

async function hmadvRest(env, path, init = {}, schema = "public") {
  return fetchSupabaseAdmin(env, path, {
    ...init,
    headers: {
      ...buildSupabaseHeaders(env, schema),
      ...(init.headers || {}),
    },
  });
}

async function hmadvCount(env, table, filters = "", schema = "public") {
  const baseUrl = getSupabaseBaseUrl(env);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${filters}${filters ? "&" : ""}select=id`, {
    headers: buildSupabaseHeaders(env, schema, {
      Prefer: "count=exact",
      Range: "0-0",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Count failed for ${table}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getContactType(row) {
  return (
    cleanValue(row?.raw_payload?.custom_field?.cf_tipo) ||
    cleanValue(row?.raw_payload?.cf_tipo) ||
    cleanValue(row?.raw_payload?.type) ||
    "Nao classificado"
  );
}

function getContactCpf(row) {
  return (
    cleanValue(row?.raw_payload?.custom_field?.cf_cpf) ||
    cleanValue(row?.raw_payload?.cf_cpf) ||
    null
  );
}

function getContactCnpj(row) {
  return (
    cleanValue(row?.raw_payload?.custom_field?.cf_cnpj) ||
    cleanValue(row?.raw_payload?.cf_cnpj) ||
    null
  );
}

function getContactCep(row) {
  return (
    cleanValue(row?.raw_payload?.custom_field?.cf_cep) ||
    cleanValue(row?.raw_payload?.cf_cep) ||
    cleanValue(row?.raw_payload?.zipcode) ||
    null
  );
}

function mapContactRow(row) {
  return {
    id: row.id,
    freshsales_contact_id: row.freshsales_contact_id,
    name: row.name || row.raw_payload?.display_name || row.raw_payload?.name || "Contato sem nome",
    email: row.email || null,
    phone: row.phone || null,
    type: getContactType(row),
    cpf: getContactCpf(row),
    cnpj: getContactCnpj(row),
    cep: getContactCep(row),
    last_synced_at: row.last_synced_at || null,
    freshsales_url: row.freshsales_contact_id
      ? `https://hmadv-org.myfreshworks.com/crm/sales/contacts/${row.freshsales_contact_id}`
      : null,
    raw_payload: row.raw_payload || {},
  };
}

async function loadFreshsalesContactsMirror(env, { query = "", page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = [];
  if (query) {
    const encoded = encodeURIComponent(`*${query}*`);
    filters.push(`or=(name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded})`);
  }
  const qs = [
    "select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload",
    ...filters,
    `order=last_synced_at.desc.nullslast`,
    `limit=${safePageSize}`,
    `offset=${(safePage - 1) * safePageSize}`,
  ].join("&");
  const rows = await hmadvRest(env, `freshsales_contacts?${qs}`);
  const totalRows = await hmadvCount(env, "freshsales_contacts", filters.join("&"));
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows,
    items: rows.map(mapContactRow),
  };
}

export async function getContactsOverview(env) {
  const total = await hmadvCount(env, "freshsales_contacts");
  const rows = await hmadvRest(
    env,
    "freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=200"
  );
  const typed = rows.reduce((acc, row) => {
    const type = getContactType(row);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return {
    total,
    tipos: typed,
    comEmail: rows.filter((row) => cleanValue(row.email)).length,
    comTelefone: rows.filter((row) => cleanValue(row.phone)).length,
    comCpf: rows.filter((row) => getContactCpf(row)).length,
    comCnpj: rows.filter((row) => getContactCnpj(row)).length,
  };
}

export async function listContacts(env, { page = 1, pageSize = 20, query = "", type = "" } = {}) {
  const result = await loadFreshsalesContactsMirror(env, { page, pageSize, query });
  const normalizedType = normalizeText(type);
  if (!normalizedType) return result;
  const filteredItems = result.items.filter((item) => normalizeText(item.type) === normalizedType);
  return {
    ...result,
    items: filteredItems,
  };
}

export async function getContactDetail(env, contactId) {
  const rows = await hmadvRest(
    env,
    `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}&select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=1`
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Contato nao encontrado no espelho local.");
  }
  const mapped = mapContactRow(row);
  const partes = await hmadvRest(
    env,
    `partes?contato_freshsales_id=eq.${encodeURIComponent(String(contactId))}&select=id,processo_id,nome,polo,cliente_hmadv,principal_no_account`,
    {},
    "judiciario"
  );
  const processIds = Array.from(new Set(partes.map((item) => item.processo_id).filter(Boolean)));
  const processos = processIds.length
    ? await hmadvRest(
        env,
        `processos?id=in.(${processIds.map((item) => `"${item}"`).join(",")})&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo`,
        {},
        "judiciario"
      )
    : [];
  const publicacoes = processIds.length
    ? await hmadvRest(
        env,
        `publicacoes?processo_id=in.(${processIds.map((item) => `"${item}"`).join(",")})&select=id,processo_id,data_publicacao&limit=200`,
        {},
        "judiciario"
      )
    : [];
  const audiencias = processIds.length
    ? await hmadvRest(
        env,
        `audiencias?processo_id=in.(${processIds.map((item) => `"${item}"`).join(",")})&select=id,processo_id,data_audiencia,tipo,situacao&limit=200`,
        {},
        "judiciario"
      )
    : [];
  return {
    contact: mapped,
    crm: await viewFreshsalesContact(env, contactId).catch(() => null),
    partes,
    processos,
    metrics: {
      processos: processos.length,
      publicacoes: publicacoes.length,
      audiencias: audiencias.length,
      consultas: 0,
      financeiro: 0,
      documentos: 0,
    },
  };
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Contato", last_name: "HMADV" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "HMADV" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function normalizeEmail(value) {
  const text = cleanValue(value);
  return text ? text.toLowerCase() : null;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits || null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncFreshsalesContactsMirror(env, { limit = 50, dryRun = false } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const minInterval = Math.max(500, Number(env.FRESHSALES_MIN_INTERVAL_MS || 4500));
  const accountRows = await hmadvRest(
    env,
    `processos?account_id_freshsales=not.is.null&select=account_id_freshsales,numero_cnj,titulo&limit=${safeLimit}`,
    {},
    "judiciario"
  );
  const accountIds = Array.from(new Set(accountRows.map((item) => cleanValue(item.account_id_freshsales)).filter(Boolean)));
  const collected = new Map();
  const sample = [];
  for (const accountId of accountIds) {
    await sleep(minInterval);
    const { payload } = await freshsalesRequest(env, `/sales_accounts/${encodeURIComponent(accountId)}/contacts`);
    const contacts = Array.isArray(payload) ? payload : Array.isArray(payload?.contacts) ? payload.contacts : [];
    for (const contact of contacts) {
      const id = cleanValue(contact?.id);
      if (!id || collected.has(id)) continue;
      const firstName = cleanValue(contact?.first_name);
      const lastName = cleanValue(contact?.last_name);
      const name = cleanValue(contact?.display_name) || [firstName, lastName].filter(Boolean).join(" ") || cleanValue(contact?.name);
      const email =
        cleanValue(contact?.email) ||
        (Array.isArray(contact?.emails) ? cleanValue(contact.emails[0]) : null);
      const phone =
        cleanValue(contact?.mobile_number) ||
        cleanValue(contact?.phone) ||
        cleanValue(contact?.work_number);
      const row = {
        freshsales_contact_id: id,
        name,
        email,
        email_normalized: normalizeEmail(email),
        phone,
        phone_normalized: normalizePhone(phone),
        raw_payload: contact,
        last_synced_at: new Date().toISOString(),
      };
      collected.set(id, row);
      sample.push({
        freshsales_contact_id: id,
        name,
        account_id_freshsales: accountId,
      });
    }
  }
  if (!dryRun && collected.size) {
    await hmadvRest(
      env,
      "freshsales_contacts?on_conflict=freshsales_contact_id",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(Array.from(collected.values())),
      }
    );
  }
  return {
    checkedAt: new Date().toISOString(),
    dryRun,
    accountLidos: accountIds.length,
    contatosEncontrados: collected.size,
    sample: sample.slice(0, 30),
  };
}

async function mergeRawPayloadEnrichment(env, contactId, patch) {
  const rows = await hmadvRest(
    env,
    `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}&select=id,raw_payload&limit=1`
  );
  const row = rows[0];
  if (!row) throw new Error("Contato nao encontrado para enriquecimento.");
  const nextPayload = {
    ...(row.raw_payload || {}),
    enriquecimento: {
      ...(row.raw_payload?.enriquecimento || {}),
      ...patch,
    },
  };
  await hmadvRest(
    env,
    `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        raw_payload: nextPayload,
        last_synced_at: new Date().toISOString(),
      }),
    }
  );
  return nextPayload;
}

export async function enrichContactViaCep(env, { contactId, cep }) {
  const cleanCep = String(cep || "").replace(/\D+/g, "");
  if (cleanCep.length !== 8) throw new Error("CEP invalido para consulta ViaCEP.");
  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.erro) {
    throw new Error("ViaCEP nao retornou um endereco valido.");
  }
  await mergeRawPayloadEnrichment(env, contactId, { viacep: payload });
  return payload;
}

export async function enrichContactViaDirectData(env, { contactId, personType = "pf" }) {
  const rows = await hmadvRest(
    env,
    `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}&select=id,raw_payload&limit=1`
  );
  const row = rows[0];
  if (!row) throw new Error("Contato nao encontrado para enriquecimento DirectData.");
  const token = cleanValue(env.DIRECTDATA_TOKEN || env.DIRECTD_TOKEN);
  if (!token) throw new Error("DIRECTDATA_TOKEN nao configurado no runtime.");
  const isPf = String(personType || "pf").toLowerCase() !== "pj";
  const identifier = isPf ? getContactCpf(row) : getContactCnpj(row);
  if (!identifier) {
    throw new Error(isPf ? "Contato sem CPF para consulta DirectData." : "Contato sem CNPJ para consulta DirectData.");
  }
  const endpoint = isPf
    ? `https://apiv3.directd.com.br/api/CadastroPessoaFisica?CPF=${encodeURIComponent(identifier)}&TOKEN=${encodeURIComponent(token)}`
    : `https://apiv3.directd.com.br/api/CadastroPessoaJuridica?CNPJ=${encodeURIComponent(identifier)}&TOKEN=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `DirectData retornou ${response.status}.`);
  }
  await mergeRawPayloadEnrichment(env, contactId, { [isPf ? "directdata_pf" : "directdata_pj"]: payload });
  return payload;
}

export async function createOrUpdateContactByNameOnly(env, { name, type = "Cliente", externalId = null }) {
  const { first_name, last_name } = splitName(name);
  const payload = {
    unique_identifier: externalId ? { external_id: String(externalId) } : undefined,
    contact: {
      first_name,
      last_name,
      custom_field: {
        cf_tipo: type,
      },
    },
  };
  const { payload: response } = await freshsalesRequest(env, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response?.contact || response || null;
}
