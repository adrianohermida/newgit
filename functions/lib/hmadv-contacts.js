import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { freshsalesRequest, listFreshsalesSalesAccountContacts, listFreshsalesSalesAccountsFromViews, viewFreshsalesContact } from "./freshsales-crm.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
import { pickNextDispatchableJob, sortAdminJobsForDispatch } from "./admin-job-control.js";

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function safeJsonObject(value, fallback = {}) {
  if (!value) return { ...fallback };
  if (typeof value === "object" && !Array.isArray(value)) return { ...fallback, ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function sanitizeContactName(value) {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s*,+\s*/g, ", ")
    .replace(/^[,\s;:._-]+/, "")
    .replace(/[,\s;:._-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function cleanDigits(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits || null;
}

function normalizeEmail(value) {
  const email = cleanValue(value);
  return email ? email.toLowerCase() : null;
}

function normalizeWhatsapp(value) {
  const digits = cleanDigits(value);
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 11) return `55${digits}`;
  return digits;
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitName(fullName) {
  const parts = String(sanitizeContactName(fullName) || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Contato", last_name: "HMADV" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "HMADV" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function buildHeaders(env, schema = "public", extra = {}) {
  const apiKey = getSupabaseServerKey(env);
  if (!apiKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no runtime.");
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
      ...buildHeaders(env, schema),
      ...(init.headers || {}),
    },
  });
}

async function hmadvCount(env, table, filters = "", schema = "public") {
  const baseUrl = getSupabaseBaseUrl(env);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${filters}${filters ? "&" : ""}select=id`, {
    headers: buildHeaders(env, schema, { Prefer: "count=exact", Range: "0-0" }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Count failed for ${table}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function uniqueNonEmpty(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function getCustomField(rawPayload, key) {
  return cleanValue(rawPayload?.custom_field?.[key]) || cleanValue(rawPayload?.custom_fields?.[key]) || cleanValue(rawPayload?.[key]) || null;
}

function mapMirrorRow(row) {
  const originalName = row.name || row.raw_payload?.display_name || row.raw_payload?.name || null;
  return {
    id: row.id,
    freshsales_contact_id: row.freshsales_contact_id,
    external_id: cleanValue(row?.raw_payload?.external_id),
    original_name: cleanValue(originalName),
    original_email: cleanValue(row.email),
    original_phone: cleanValue(row.phone),
    name: sanitizeContactName(originalName) || "Contato sem nome",
    email: normalizeEmail(row.email) || null,
    phone: row.phone || null,
    type: getCustomField(row.raw_payload, "cf_tipo") || cleanValue(row?.raw_payload?.type) || "Nao classificado",
    cpf: getCustomField(row.raw_payload, "cf_cpf"),
    cnpj: getCustomField(row.raw_payload, "cf_cnpj"),
    cep: getCustomField(row.raw_payload, "cf_cep") || cleanValue(row?.raw_payload?.zipcode),
    last_synced_at: row.last_synced_at || null,
    freshsales_url: row.freshsales_contact_id ? `https://hmadv-org.myfreshworks.com/crm/sales/contacts/${row.freshsales_contact_id}` : null,
    raw_payload: row.raw_payload || {},
  };
}

function buildMirrorRow(contact) {
  const name =
    sanitizeContactName(contact?.display_name) ||
    sanitizeContactName(contact?.name) ||
    sanitizeContactName([cleanValue(contact?.first_name), cleanValue(contact?.last_name)].filter(Boolean).join(" ")) ||
    "Contato sem nome";
  const email = normalizeEmail(contact?.email) || (Array.isArray(contact?.emails) ? normalizeEmail(contact.emails[0]) : null);
  const phone = cleanDigits(contact?.mobile_number) || cleanDigits(contact?.phone) || cleanDigits(contact?.work_number);
  return {
    freshsales_contact_id: String(contact.id),
    name,
    email,
    email_normalized: email,
    phone,
    phone_normalized: phone,
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
}

function buildNameKey(name) {
  return normalizeText(name).replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

function buildParteUpsertRow(parte, { contactId, role }) {
  return {
    id: parte.id,
    processo_id: parte.processo_id,
    nome: parte.nome,
    polo: parte.polo,
    tipo_pessoa: parte.tipo_pessoa || null,
    documento: parte.documento || null,
    contato_freshsales_id: String(contactId),
    cliente_hmadv: role === "Cliente",
    representada_pelo_escritorio: role === "Cliente",
    principal_no_account: role === "Cliente",
  };
}

function shouldPatchParteLink(parte, { contactId, role }) {
  const nextContactId = cleanValue(contactId);
  if (!nextContactId) return false;
  const shouldBeClient = role === "Cliente";
  return (
    cleanValue(parte?.contato_freshsales_id) !== nextContactId ||
    Boolean(parte?.cliente_hmadv) !== shouldBeClient ||
    Boolean(parte?.representada_pelo_escritorio) !== shouldBeClient ||
    Boolean(parte?.principal_no_account) !== shouldBeClient
  );
}

function dedupeBy(rows = [], getKey = () => "") {
  const map = new Map();
  for (const row of rows) {
    const key = String(getKey(row) || "").trim();
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

function buildPortalContactExternalId(clientId, contactKey = "primary") {
  return `portal:client:${String(clientId || "").trim()}:${String(contactKey || "primary").trim()}`;
}

function buildPortalProfilePrimaryContact(profile) {
  return {
    key: "primary",
    name: sanitizeContactName(profile?.full_name),
    type: "Cliente",
    email: normalizeEmail(profile?.email),
    phone: normalizeWhatsapp(profile?.whatsapp),
    cpf: cleanDigits(profile?.cpf),
    cnpj: null,
    cep: cleanDigits(profile?.metadata?.addresses?.find?.((item) => item?.primary)?.postal_code) || cleanDigits(profile?.metadata?.addresses?.[0]?.postal_code),
  };
}

function buildPortalMetadataContacts(profile) {
  const metadata = safeJsonObject(profile?.metadata, {});
  const contacts = Array.isArray(metadata.contacts) ? metadata.contacts : [];
  return contacts.map((item, index) => ({
    key: cleanValue(item?.id) || `contact-${index + 1}`,
    name: sanitizeContactName(item?.label) || sanitizeContactName(profile?.full_name),
    type: "Cliente",
    email: String(item?.type || "").toLowerCase() === "email" ? normalizeEmail(item?.value) : null,
    phone: ["telefone", "whatsapp", "celular"].includes(String(item?.type || "").toLowerCase()) ? normalizeWhatsapp(item?.value) : null,
    cpf: null,
    cnpj: null,
    cep: null,
  })).filter((item) => item.name && (item.email || item.phone));
}

function buildPortalProfileContactsPayload(profile) {
  const primary = buildPortalProfilePrimaryContact(profile);
  const extras = buildPortalMetadataContacts(profile);
  return [primary, ...extras].filter((item, index, array) => {
    if (!item?.name) return false;
    const signature = `${item.name}|${item.email || ""}|${item.phone || ""}`;
    return array.findIndex((candidate) => `${candidate.name}|${candidate.email || ""}|${candidate.phone || ""}` === signature) === index;
  });
}

function normalizePortalContactItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: cleanValue(item?.id) || `contact-${index + 1}`,
      label: cleanValue(item?.label) || "",
      type: cleanValue(item?.type) || "telefone",
      value: cleanValue(item?.value) || "",
      notes: cleanValue(item?.notes) || "",
      primary: Boolean(item?.primary),
    }))
    .filter((item) => item.value);
}

function upsertPortalContactItem(items, nextItem) {
  const current = normalizePortalContactItems(items);
  const valueKey = cleanValue(nextItem?.value);
  if (!valueKey) return current;
  const index = current.findIndex((item) => cleanValue(item.value) === valueKey && String(item.type || "").toLowerCase() === String(nextItem.type || "").toLowerCase());
  if (index >= 0) {
    current[index] = { ...current[index], ...nextItem, id: current[index].id || nextItem.id };
    return current;
  }
  return [...current, nextItem];
}

function matchMirrorContactToClientProfile(contact, profile) {
  const metadata = safeJsonObject(profile?.metadata, {});
  const portalContacts = normalizePortalContactItems(metadata.contacts);
  const externalId = cleanValue(contact?.external_id);
  if (externalId && externalId.startsWith(`portal:client:${String(profile?.id || "").trim()}:`)) return true;
  const crmCpf = cleanDigits(contact?.cpf);
  if (crmCpf && crmCpf === cleanDigits(profile?.cpf)) return true;
  const crmEmail = normalizeEmail(contact?.email);
  if (crmEmail && crmEmail === normalizeEmail(profile?.email)) return true;
  const crmPhone = normalizeWhatsapp(contact?.phone);
  if (crmPhone && crmPhone === normalizeWhatsapp(profile?.whatsapp)) return true;
  if (crmEmail && portalContacts.some((item) => String(item.type || "").toLowerCase() === "email" && normalizeEmail(item.value) === crmEmail)) return true;
  if (crmPhone && portalContacts.some((item) => ["telefone", "whatsapp", "celular"].includes(String(item.type || "").toLowerCase()) && normalizeWhatsapp(item.value) === crmPhone)) return true;
  return Boolean(buildNameKey(contact?.name) && buildNameKey(contact?.name) === buildNameKey(profile?.full_name));
}

async function getClientProfiles(env, filters = {}) {
  const clauses = [
    "select=id,email,full_name,is_active,whatsapp,cpf,metadata,created_at,updated_at",
    filters.clientId ? `id=eq.${encodeURIComponent(String(filters.clientId))}` : null,
    filters.email ? `email=eq.${encodeURIComponent(String(filters.email).toLowerCase())}` : null,
    `limit=${Math.max(1, Math.min(Number(filters.limit || 200), 1000))}`,
  ].filter(Boolean);
  return hmadvRest(env, `client_profiles?${clauses.join("&")}`);
}

async function patchClientProfile(env, clientId, body) {
  const rows = await hmadvRest(env, `client_profiles?id=eq.${encodeURIComponent(String(clientId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      ...body,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows?.[0] || null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFreshsalesRate(env) {
  await sleep(Math.max(800, Number(env.FRESHSALES_MIN_INTERVAL_MS || 4500)));
}

async function upsertMirrorRows(env, rows) {
  if (!rows.length) return [];
  return hmadvRest(env, "freshsales_contacts?on_conflict=freshsales_contact_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}

async function createOrUpdateFreshsalesContact(env, { name, type, email, phone, cpf, cnpj, cep, externalId }) {
  const sanitizedName = sanitizeContactName(name);
  if (!sanitizedName) throw new Error("Nome obrigatorio para criar contato.");
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = cleanDigits(phone);
  const { first_name, last_name } = splitName(sanitizedName);
  const body = {
    unique_identifier: externalId ? { external_id: String(externalId) } : undefined,
    contact: {
      first_name,
      last_name,
      external_id: externalId || undefined,
      email: normalizedEmail || undefined,
      emails: normalizedEmail ? [normalizedEmail] : undefined,
      mobile_number: normalizedPhone || undefined,
      phone: normalizedPhone || undefined,
      custom_field: {
        cf_tipo: type || "Cliente",
        ...(cleanDigits(cpf) ? { cf_cpf: cleanDigits(cpf) } : {}),
        ...(cleanDigits(cnpj) ? { cf_cnpj: cleanDigits(cnpj) } : {}),
        ...(cleanDigits(cep) ? { cf_cep: cleanDigits(cep) } : {}),
      },
    },
  };
  let payload = null;
  try {
    const response = await freshsalesRequest(env, "/contacts/upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
    payload = response?.payload;
  } catch (error) {
    if (Number(error?.status) !== 404) {
      throw error;
    }
    const fallbackResponse = await freshsalesRequest(env, "/contacts", {
      method: "POST",
      body: JSON.stringify({ contact: body.contact }),
    });
    payload = fallbackResponse?.payload;
  }
  const contact = payload?.contact || payload;
  if (!contact?.id) throw new Error("Freshsales nao retornou id do contato.");
  await upsertMirrorRows(env, [buildMirrorRow(contact)]);
  return contact;
}

function publicationHasOfficeMarker(publicacoes) {
  const officeTerms = ["ADRIANO MENEZES HERMIDA MAIA", "ADRIANO HERMIDA MAIA", "HERMIDA MAIA", "ADRIANO MENEZES"].map(normalizeText);
  return publicacoes.some((pub) => {
    const rawCandidates = [normalizeText(pub?.raw_payload?.nomeCliente), normalizeText(pub?.raw_payload?.nomeUsuarioCliente)].filter(Boolean);
    return rawCandidates.some((candidate) => officeTerms.some((term) => candidate.includes(term)));
  });
}

function inferRepresentedPole(publicacoes, partes) {
  const joined = publicacoes.map((pub) => normalizeText(pub?.conteudo)).filter(Boolean).join(" || ");
  if (["parte exequente", "parte autora", "parte requerente", "agravante", "exequente", "autor", "requerente", "reclamante"].some((hint) => joined.includes(hint))) return "ativo";
  if (["parte executada", "parte requerida", "parte re", "agravado", "executado", "requerido", "reu", "reclamado"].some((hint) => joined.includes(hint))) return "passivo";
  const ativos = partes.filter((item) => item.polo === "ativo");
  const passivos = partes.filter((item) => item.polo === "passivo");
  if (ativos.length && !passivos.length) return "ativo";
  if (passivos.length && !ativos.length) return "passivo";
  return null;
}

function getParteRole(parte, representedPole) {
  if (parte?.cliente_hmadv || parte?.representada_pelo_escritorio) return "Cliente";
  if (representedPole && parte?.polo === representedPole) return "Cliente";
  if (parte?.polo === "ativo" || parte?.polo === "passivo") return "Parte Adversa";
  return "Terceiro Interessado";
}

async function updateFreshsalesContactType(env, contactId, type) {
  const id = cleanValue(contactId);
  const nextType = cleanValue(type);
  if (!id || !nextType) return null;
  const crm = await viewFreshsalesContact(env, id);
  return updateContact(env, {
    contactId: id,
    name: cleanValue(crm?.display_name) || cleanValue(crm?.name) || [cleanValue(crm?.first_name), cleanValue(crm?.last_name)].filter(Boolean).join(" ") || "Contato HMADV",
    type: nextType,
    email: cleanValue(crm?.email),
    phone: cleanValue(crm?.mobile_number) || cleanValue(crm?.phone),
    cpf: getCustomField(crm, "cf_cpf"),
    cnpj: getCustomField(crm, "cf_cnpj"),
    cep: getCustomField(crm, "cf_cep"),
    externalId: cleanValue(crm?.external_id),
  });
}

async function patchParteLink(env, parteId, processId, processNumber, accountId, contactId, role) {
  await hmadvRest(env, `partes?id=eq.${encodeURIComponent(String(parteId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
    body: JSON.stringify({
      contato_freshsales_id: String(contactId),
      cliente_hmadv: role === "Cliente",
      representada_pelo_escritorio: role === "Cliente",
      principal_no_account: role === "Cliente",
    }),
  }, "judiciario");
  const existing = await hmadvRest(env, `processo_contato_sync?processo_id=eq.${encodeURIComponent(String(processId))}&contact_id_freshsales=eq.${encodeURIComponent(String(contactId))}&select=id&limit=1`, {}, "judiciario");
  if (!existing.length) {
    await hmadvRest(env, "processo_contato_sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
      body: JSON.stringify({
        processo_id: processId,
        parte_id: parteId,
        contact_id_freshsales: String(contactId),
        relacao: role === "Cliente" ? "cliente_principal" : role === "Parte Adversa" ? "parte_adversa" : "parte_relacionada",
        principal: role === "Cliente",
        origem: "interno_contacts_reconcile",
        metadata: { numero_cnj: processNumber, account_id_freshsales: accountId || null, tipo_contato: role },
      }),
    }, "judiciario");
  }
}

export async function getContactsOverview(env) {
  const total = await hmadvCount(env, "freshsales_contacts");
  const rows = await hmadvRest(env, "freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=500");
  const tipos = rows.reduce((acc, row) => {
    const tipo = getCustomField(row.raw_payload, "cf_tipo") || "Nao classificado";
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});
  const duplicateMap = rows.reduce((acc, row) => {
    const key = buildNameKey(row.name);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    total,
    tipos,
    comEmail: rows.filter((row) => cleanValue(row.email)).length,
    comTelefone: rows.filter((row) => cleanValue(row.phone)).length,
    comCpf: rows.filter((row) => getCustomField(row.raw_payload, "cf_cpf")).length,
    comCnpj: rows.filter((row) => getCustomField(row.raw_payload, "cf_cnpj")).length,
    duplicados: Object.values(duplicateMap).filter((count) => count > 1).length,
    partesSemContato: await hmadvCount(env, "partes", "contato_freshsales_id=is.null", "judiciario").catch(() => 0),
  };
}

export async function listContacts(env, { page = 1, pageSize = 20, query = "", type = "" } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 100));
  const filters = [];
  if (query) {
    const encoded = encodeURIComponent(`*${query}*`);
    filters.push(`or=(name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded})`);
  }
  if (type) {
    const rows = await hmadvRest(env, `freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&${filters.join("&")}${filters.length ? "&" : ""}order=last_synced_at.desc.nullslast&limit=10000`);
    const filtered = rows.map(mapMirrorRow).filter((item) => normalizeText(item.type) === normalizeText(type));
    return {
      page: safePage,
      pageSize: safePageSize,
      totalRows: filtered.length,
      items: filtered.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    };
  }
  const rows = await hmadvRest(env, `freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&${filters.join("&")}${filters.length ? "&" : ""}order=last_synced_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`);
  return { page: safePage, pageSize: safePageSize, totalRows: await hmadvCount(env, "freshsales_contacts", filters.join("&")), items: rows.map(mapMirrorRow) };
}

export async function listContactIds(env, { query = "", type = "" } = {}) {
  const filters = [];
  if (query) {
    const encoded = encodeURIComponent(`*${query}*`);
    filters.push(`or=(name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded})`);
  }
  const rows = await hmadvRest(env, `freshsales_contacts?select=freshsales_contact_id,name,raw_payload&${filters.join("&")}${filters.length ? "&" : ""}limit=10000`);
  let items = rows.map(mapMirrorRow);
  if (type) items = items.filter((item) => normalizeText(item.type) === normalizeText(type));
  return {
    totalRows: items.length,
    ids: items.map((item) => item.freshsales_contact_id).filter(Boolean),
  };
}

export async function listDuplicateContacts(env, { page = 1, pageSize = 20 } = {}) {
  const rows = (await hmadvRest(env, "freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=5000")).map(mapMirrorRow);
  const groups = new Map();
  for (const row of rows) {
    const key = buildNameKey(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const items = Array.from(groups.entries()).filter(([, group]) => group.length > 1).map(([key, group]) => ({ key, label: group[0]?.name || key, items: group, total: group.length }));
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  return { page: safePage, pageSize: safePageSize, totalRows: items.length, items: items.slice((safePage - 1) * safePageSize, safePage * safePageSize) };
}

export async function listUnlinkedPartes(env, { page = 1, pageSize = 20, query = "" } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = [query ? `nome=ilike.${encodeURIComponent(`*${query}*`)}` : null, "contato_freshsales_id=is.null", "select=id,processo_id,nome,polo,tipo_pessoa,cliente_hmadv,representada_pelo_escritorio,principal_no_account", `limit=${safePageSize}`, `offset=${(safePage - 1) * safePageSize}`].filter(Boolean).join("&");
  const partes = await hmadvRest(env, `partes?${filters}`, {}, "judiciario");
  const processIds = [...new Set(partes.map((item) => item.processo_id).filter(Boolean))];
  const processos = processIds.length ? await hmadvRest(env, `processos?id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,numero_cnj,titulo,account_id_freshsales`, {}, "judiciario") : [];
  const procMap = new Map(processos.map((row) => [row.id, row]));
  return { page: safePage, pageSize: safePageSize, totalRows: await hmadvCount(env, "partes", `${query ? `nome=ilike.${encodeURIComponent(`*${query}*`)}&` : ""}contato_freshsales_id=is.null`, "judiciario"), items: partes.map((item) => ({ ...item, processo: procMap.get(item.processo_id) || null })) };
}

export async function listLinkedPartes(env, { page = 1, pageSize = 20, query = "", type = "" } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = [
    query ? `nome=ilike.${encodeURIComponent(`*${query}*`)}` : null,
    "contato_freshsales_id=not.is.null",
    "select=id,processo_id,nome,polo,tipo_pessoa,cliente_hmadv,representada_pelo_escritorio,principal_no_account,contato_freshsales_id",
    `limit=${safePageSize}`,
    `offset=${(safePage - 1) * safePageSize}`,
  ].filter(Boolean).join("&");
  const partes = await hmadvRest(env, `partes?${filters}`, {}, "judiciario");
  const processIds = [...new Set(partes.map((item) => item.processo_id).filter(Boolean))];
  const contactIds = [...new Set(partes.map((item) => item.contato_freshsales_id).filter(Boolean))];
  const [processos, contacts] = await Promise.all([
    processIds.length ? hmadvRest(env, `processos?id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,numero_cnj,titulo,account_id_freshsales`, {}, "judiciario") : [],
    contactIds.length ? hmadvRest(env, `freshsales_contacts?freshsales_contact_id=in.(${contactIds.map((id) => `"${id}"`).join(",")})&select=id,freshsales_contact_id,name,raw_payload`) : [],
  ]);
  const procMap = new Map(processos.map((row) => [row.id, row]));
  const contactMap = new Map(contacts.map((row) => [row.freshsales_contact_id, mapMirrorRow(row)]));
  let items = partes.map((item) => {
    const linkedContact = contactMap.get(String(item.contato_freshsales_id)) || null;
    const inferredType = linkedContact?.type || (item.cliente_hmadv || item.representada_pelo_escritorio ? "Cliente" : item.polo ? "Parte Adversa" : "Terceiro Interessado");
    return { ...item, processo: procMap.get(item.processo_id) || null, contact: linkedContact, tipo_contato: inferredType };
  });
  if (type) {
    const normalized = normalizeText(type);
    items = items.filter((item) => normalizeText(item.tipo_contato) === normalized);
  }
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await hmadvCount(env, "partes", `${query ? `nome=ilike.${encodeURIComponent(`*${query}*`)}&` : ""}contato_freshsales_id=not.is.null`, "judiciario"),
    items,
  };
}

export async function getContactDetail(env, contactId) {
  const rows = await hmadvRest(env, `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}&select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=1`);
  const row = rows[0];
  if (!row) throw new Error("Contato nao encontrado no espelho local.");
  const contact = mapMirrorRow(row);
  const partes = await hmadvRest(env, `partes?contato_freshsales_id=eq.${encodeURIComponent(String(contactId))}&select=id,processo_id,nome,polo,cliente_hmadv,principal_no_account`, {}, "judiciario");
  const processIds = [...new Set(partes.map((item) => item.processo_id).filter(Boolean))];
  const processos = processIds.length ? await hmadvRest(env, `processos?id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo`, {}, "judiciario") : [];
  const publicacoes = processIds.length ? await hmadvRest(env, `publicacoes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,data_publicacao&limit=200`, {}, "judiciario") : [];
  const audiencias = processIds.length ? await hmadvRest(env, `audiencias?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,data_audiencia&limit=200`, {}, "judiciario") : [];
  const recentPublicacoes = processIds.length
    ? await hmadvRest(
        env,
        `publicacoes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,data_publicacao,conteudo,raw_payload&order=data_publicacao.desc.nullslast&limit=20`,
        {},
        "judiciario"
      )
    : [];
  const processMap = new Map(processos.map((item) => [item.id, item]));
  return {
    contact,
    crm: await viewFreshsalesContact(env, contactId).catch(() => null),
    partes,
    processos,
    publicacoes: recentPublicacoes.map((item) => ({
      id: item.id,
      processo_id: item.processo_id,
      data_publicacao: item.data_publicacao || null,
      processo: processMap.get(item.processo_id) || null,
      resumo: cleanValue(item.raw_payload?.resumo) || cleanValue(item.raw_payload?.titulo) || cleanValue(String(item.conteudo || "").replace(/\s+/g, " ").slice(0, 280)),
    })),
    metrics: { processos: processos.length, publicacoes: publicacoes.length, audiencias: audiencias.length, consultas: 0, financeiro: 0, documentos: 0 },
  };
}

export async function syncFreshsalesContactsMirror(env, { limit = 200, dryRun = false, fetchAll = false } = {}) {
  const safeLimit = fetchAll ? 50000 : Math.max(1, Math.min(Number(limit || 200), 5000));
  const rows = [];
  let source = "contacts_view";
  try {
    for (let page = 1; page <= Math.max(1, Math.ceil(safeLimit / 100)); page += 1) {
      await waitFreshsalesRate(env);
      const { payload } = await freshsalesRequest(env, `/contacts/view/1?page=${page}&per_page=100`);
      const batch = Array.isArray(payload?.contacts) ? payload.contacts : Array.isArray(payload) ? payload : [];
      rows.push(...batch);
      if (batch.length < 100) break;
      if (!fetchAll && rows.length >= safeLimit) break;
    }
  } catch {
    source = "sales_accounts_contacts";
    const accounts = await listFreshsalesSalesAccountsFromViews(env, { maxPages: Math.max(1, Math.ceil(safeLimit / 100)), perPage: 100 }).catch(() => []);
    for (const account of accounts) {
      if (rows.length >= safeLimit) break;
      await waitFreshsalesRate(env);
      const contacts = await listFreshsalesSalesAccountContacts(env, account.id).catch(() => []);
      rows.push(...contacts);
    }
  }
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const id = cleanValue(row?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(buildMirrorRow(row));
    if (unique.length >= safeLimit) break;
  }
  if (!dryRun && unique.length) await upsertMirrorRows(env, unique);
  return { checkedAt: new Date().toISOString(), dryRun, fetchAll, total: unique.length, imported: unique.length, source, sample: unique.slice(0, 50).map((row) => ({ freshsales_contact_id: row.freshsales_contact_id, name: row.name })) };
}

export async function syncClientProfileToContacts(env, { clientId, clientEmail = "", dryRun = false } = {}) {
  const profiles = await getClientProfiles(env, {
    clientId: cleanValue(clientId) || undefined,
    email: normalizeEmail(clientEmail) || undefined,
    limit: 1,
  });
  const profile = Array.isArray(profiles) ? profiles[0] || null : null;
  if (!profile) throw new Error("Perfil do cliente nao encontrado para sincronizar com contacts.");

  const desiredContacts = buildPortalProfileContactsPayload({
    ...profile,
    metadata: safeJsonObject(profile.metadata, {}),
  });
  const sample = [];
  const mappings = [];

  for (const item of desiredContacts) {
    const payload = {
      name: item.name,
      type: item.type || "Cliente",
      email: item.email,
      phone: item.phone,
      cpf: item.key === "primary" ? cleanDigits(profile.cpf) : item.cpf,
      cnpj: item.cnpj,
      cep: item.cep,
      externalId: buildPortalContactExternalId(profile.id, item.key),
    };
    if (!dryRun) {
      const created = await createOrUpdateFreshsalesContact(env, payload);
      mappings.push({
        portal_contact_key: item.key,
        freshsales_contact_id: String(created.id),
        external_id: payload.externalId,
      });
      sample.push({
        portal_contact_key: item.key,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        freshsales_contact_id: String(created.id),
        mode: "upserted_to_crm",
      });
    } else {
      sample.push({
        portal_contact_key: item.key,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        external_id: payload.externalId,
        mode: "crm_upsert_pending",
      });
    }
  }

  if (!dryRun) {
    const metadata = safeJsonObject(profile.metadata, {});
    const nextMetadata = {
      ...metadata,
      contacts_sync: {
        ...(safeJsonObject(metadata.contacts_sync, {})),
        last_push_to_crm_at: new Date().toISOString(),
        mappings,
      },
    };
    await patchClientProfile(env, profile.id, { metadata: nextMetadata }).catch(() => null);
  }

  return {
    checkedAt: new Date().toISOString(),
    dryRun,
    client_id: profile.id,
    client_email: profile.email || null,
    totalRows: desiredContacts.length,
    synced: desiredContacts.length,
    direction: "portal_to_crm",
    sample,
  };
}

export async function syncContactsToPortal(env, { clientId = "", limit = 100, dryRun = false } = {}) {
  const profiles = await getClientProfiles(env, {
    clientId: cleanValue(clientId) || undefined,
    limit: clientId ? 1 : Math.max(1, Math.min(Number(limit || 100), 500)),
  });
  const mirrorRows = await hmadvRest(env, `freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=${Math.max(5000, Number(limit || 1000))}`);
  const mirrorContacts = (Array.isArray(mirrorRows) ? mirrorRows : []).map(mapMirrorRow);
  let synced = 0;
  const sample = [];

  for (const profile of profiles) {
    const matched = mirrorContacts.filter((contact) => matchMirrorContactToClientProfile(contact, profile));
    if (!matched.length) continue;
    const metadata = safeJsonObject(profile.metadata, {});
    let nextContacts = normalizePortalContactItems(metadata.contacts);
    let changed = false;

    for (const contact of matched) {
      const normalizedEmail = normalizeEmail(contact.email);
      const normalizedPhone = normalizeWhatsapp(contact.phone);
      if (normalizedEmail) {
        const candidate = {
          id: `crm-email-${contact.freshsales_contact_id}`,
          label: cleanValue(contact.name) || "E-mail CRM",
          type: "email",
          value: normalizedEmail,
          notes: "Sincronizado do Freshsales",
          primary: normalizedEmail === normalizeEmail(profile.email),
        };
        const merged = upsertPortalContactItem(nextContacts, candidate);
        changed = changed || merged.length !== nextContacts.length || JSON.stringify(merged) !== JSON.stringify(nextContacts);
        nextContacts = merged;
      }
      if (normalizedPhone) {
        const candidate = {
          id: `crm-phone-${contact.freshsales_contact_id}`,
          label: cleanValue(contact.name) || "Telefone CRM",
          type: "telefone",
          value: normalizedPhone,
          notes: "Sincronizado do Freshsales",
          primary: normalizedPhone === normalizeWhatsapp(profile.whatsapp),
        };
        const merged = upsertPortalContactItem(nextContacts, candidate);
        changed = changed || merged.length !== nextContacts.length || JSON.stringify(merged) !== JSON.stringify(nextContacts);
        nextContacts = merged;
      }
    }

    const primaryMatch = matched.find((item) => cleanValue(item.external_id) === buildPortalContactExternalId(profile.id, "primary")) || matched[0];
    const nextBody = {
      metadata: {
        ...metadata,
        contacts: nextContacts,
        contacts_sync: {
          ...(safeJsonObject(metadata.contacts_sync, {})),
          last_pull_from_crm_at: new Date().toISOString(),
          linked_contact_ids: matched.map((item) => item.freshsales_contact_id),
        },
      },
    };
    if (!cleanValue(profile.full_name) && cleanValue(primaryMatch?.name)) {
      nextBody.full_name = primaryMatch.name;
      changed = true;
    }
    if (!normalizeEmail(profile.email) && normalizeEmail(primaryMatch?.email)) {
      nextBody.email = normalizeEmail(primaryMatch.email);
      changed = true;
    }
    if (!normalizeWhatsapp(profile.whatsapp) && normalizeWhatsapp(primaryMatch?.phone)) {
      nextBody.whatsapp = normalizeWhatsapp(primaryMatch.phone);
      changed = true;
    }
    if (!cleanDigits(profile.cpf) && cleanDigits(primaryMatch?.cpf)) {
      nextBody.cpf = cleanDigits(primaryMatch.cpf);
      changed = true;
    }

    if (changed) {
      synced += 1;
      if (!dryRun) {
        await patchClientProfile(env, profile.id, nextBody);
      }
      sample.push({
        client_id: profile.id,
        client_email: profile.email || null,
        matched_contacts: matched.map((item) => item.freshsales_contact_id),
        mode: dryRun ? "portal_patch_pending" : "portal_updated",
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    dryRun,
    totalRows: profiles.length,
    synced,
    direction: "crm_to_portal",
    sample: sample.slice(0, 50),
  };
}

export async function enrichContactViaCep(env, { contactId, cep }) {
  const cleanCep = cleanDigits(cep);
  if (!cleanCep || cleanCep.length !== 8) throw new Error("CEP invalido para consulta ViaCEP.");
  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.erro) throw new Error("ViaCEP nao retornou um endereco valido.");
  await hmadvRest(env, `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: { enriquecimento: { viacep: payload } }, last_synced_at: new Date().toISOString() }),
  }).catch(() => null);
  return payload;
}

export async function enrichContactViaDirectData(env, { contactId, personType = "pf" }) {
  const rows = await hmadvRest(env, `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}&select=id,raw_payload&limit=1`);
  const row = rows[0];
  if (!row) throw new Error("Contato nao encontrado para enriquecimento DirectData.");
  const token = cleanValue(env.DIRECTDATA_TOKEN || env.DIRECTD_TOKEN);
  if (!token) throw new Error("DIRECTDATA_TOKEN nao configurado no runtime.");
  const isPf = String(personType || "pf").toLowerCase() !== "pj";
  const identifier = isPf ? getCustomField(row.raw_payload, "cf_cpf") : getCustomField(row.raw_payload, "cf_cnpj");
  if (!identifier) throw new Error(isPf ? "Contato sem CPF para consulta DirectData." : "Contato sem CNPJ para consulta DirectData.");
  const url = isPf ? `https://apiv3.directd.com.br/api/CadastroPessoaFisica?CPF=${encodeURIComponent(identifier)}&TOKEN=${encodeURIComponent(token)}` : `https://apiv3.directd.com.br/api/CadastroPessoaJuridica?CNPJ=${encodeURIComponent(identifier)}&TOKEN=${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `DirectData retornou ${response.status}.`);
  await hmadvRest(env, `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(contactId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: { enriquecimento: { [isPf ? "directdata_pf" : "directdata_pj"]: payload } }, last_synced_at: new Date().toISOString() }),
  }).catch(() => null);
  return payload;
}

export async function createOrUpdateContactByNameOnly(env, { name, type = "Cliente", externalId = null }) {
  return createOrUpdateFreshsalesContact(env, { name: sanitizeContactName(name), type, externalId });
}

export async function createContact(env, payload) {
  return createOrUpdateFreshsalesContact(env, payload);
}

export async function updateContact(env, payload) {
  const contactId = cleanValue(payload.contactId);
  if (!contactId) throw new Error("contactId obrigatorio para atualizar.");
  const sanitizedName = sanitizeContactName(payload.name);
  if (!sanitizedName) throw new Error("Nome obrigatorio para atualizar.");
  const normalizedEmail = normalizeEmail(payload.email);
  const normalizedPhone = cleanDigits(payload.phone);
  const { first_name, last_name } = splitName(sanitizedName);
  const body = {
    contact: {
      first_name,
      last_name,
      email: normalizedEmail || undefined,
      emails: normalizedEmail ? [normalizedEmail] : undefined,
      mobile_number: normalizedPhone || undefined,
      phone: normalizedPhone || undefined,
      external_id: cleanValue(payload.externalId) || undefined,
      custom_field: {
        cf_tipo: payload.type || "Cliente",
        ...(cleanDigits(payload.cpf) ? { cf_cpf: cleanDigits(payload.cpf) } : {}),
        ...(cleanDigits(payload.cnpj) ? { cf_cnpj: cleanDigits(payload.cnpj) } : {}),
        ...(cleanDigits(payload.cep) ? { cf_cep: cleanDigits(payload.cep) } : {}),
      },
    },
  };
  const { payload: response } = await freshsalesRequest(env, `/contacts/${encodeURIComponent(contactId)}`, { method: "PUT", body: JSON.stringify(body) });
  const contact = response?.contact || response;
  await upsertMirrorRows(env, [buildMirrorRow(contact)]);
  return contact;
}

export async function deleteContact(env, { contactId }) {
  const id = cleanValue(contactId);
  if (!id) throw new Error("contactId obrigatorio para exclusao.");
  await freshsalesRequest(env, `/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
  await hmadvRest(env, `freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }).catch(() => null);
  return { deleted: true, contactId: id };
}

export async function mergeContacts(env, { primaryContactId, duplicateContactId }) {
  const primaryId = cleanValue(primaryContactId);
  const duplicateId = cleanValue(duplicateContactId);
  if (!primaryId || !duplicateId || primaryId === duplicateId) throw new Error("Informe contatos distintos para mesclar.");
  const [primary, duplicate] = await Promise.all([viewFreshsalesContact(env, primaryId), viewFreshsalesContact(env, duplicateId)]);
  await updateContact(env, {
    contactId: primaryId,
    name: cleanValue(primary?.display_name) || cleanValue(primary?.name) || `${primary?.first_name || ""} ${primary?.last_name || ""}`.trim() || duplicate?.display_name,
    type: getCustomField(primary, "cf_tipo") || getCustomField(duplicate, "cf_tipo") || "Nao classificado",
    email: cleanValue(primary?.email) || cleanValue(duplicate?.email),
    phone: cleanValue(primary?.mobile_number) || cleanValue(primary?.phone) || cleanValue(duplicate?.mobile_number) || cleanValue(duplicate?.phone),
    cpf: getCustomField(primary, "cf_cpf") || getCustomField(duplicate, "cf_cpf"),
    cnpj: getCustomField(primary, "cf_cnpj") || getCustomField(duplicate, "cf_cnpj"),
    cep: getCustomField(primary, "cf_cep") || getCustomField(duplicate, "cf_cep"),
    externalId: cleanValue(primary?.external_id) || cleanValue(duplicate?.external_id),
  });
  await hmadvRest(env, `partes?contato_freshsales_id=eq.${encodeURIComponent(duplicateId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
    body: JSON.stringify({ contato_freshsales_id: primaryId }),
  }, "judiciario").catch(() => null);
  await hmadvRest(env, `processo_contato_sync?contact_id_freshsales=eq.${encodeURIComponent(duplicateId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
    body: JSON.stringify({ contact_id_freshsales: primaryId }),
  }, "judiciario").catch(() => null);
  await deleteContact(env, { contactId: duplicateId });
  return { mergedInto: primaryId, removed: duplicateId };
}

export async function reconcilePartesContacts(env, { processNumbers = [], limit = 20, apply = false } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const cnjs = processNumbers.map((item) => String(item || "").replace(/\D+/g, "")).filter(Boolean);
  const processPath = cnjs.length
    ? `processos?numero_cnj=in.(${cnjs.map((item) => `"${item}"`).join(",")})&select=id,numero_cnj,account_id_freshsales,titulo`
    : `processos?account_id_freshsales=not.is.null&select=id,numero_cnj,account_id_freshsales,titulo&limit=${safeLimit}`;
  const processos = (await hmadvRest(env, processPath, {}, "judiciario")) || [];
  const processIds = processos.map((item) => item.id);
  const [partes, publicacoes, mirrorRows] = await Promise.all([
    processIds.length
      ? hmadvRest(
          env,
          `partes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,nome,polo,tipo_pessoa,documento,cliente_hmadv,representada_pelo_escritorio,principal_no_account,contato_freshsales_id&limit=${Math.max(processIds.length * 20, 20)}`,
          {},
          "judiciario"
        )
      : [],
    processIds.length
      ? hmadvRest(
          env,
          `publicacoes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,conteudo,raw_payload&limit=${Math.max(processIds.length * 10, 10)}`,
          {},
          "judiciario"
        )
      : [],
    hmadvRest(env, "freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=5000"),
  ]);
  const safePartes = Array.isArray(partes) ? partes : [];
  const safePublicacoes = Array.isArray(publicacoes) ? publicacoes : [];
  const safeMirrorRows = Array.isArray(mirrorRows) ? mirrorRows : [];
  const mirrorByName = new Map();
  for (const row of safeMirrorRows.map(mapMirrorRow)) {
    const key = buildNameKey(row.name);
    if (!key) continue;
    if (!mirrorByName.has(key)) mirrorByName.set(key, []);
    mirrorByName.get(key).push(row);
  }
  let contatosVinculados = 0;
  let contatosCriados = 0;
  let skippedByBudget = 0;
  const sample = [];
  const pendingParteUpdates = [];
  const pendingSyncRows = [];
  let remainingCreateBudget = apply ? 12 : 0;
  for (const proc of processos) {
    const partesProc = safePartes.filter((item) => item.processo_id === proc.id);
    const pubsProc = safePublicacoes.filter((item) => item.processo_id === proc.id).slice(0, 10);
    const representedPole = publicationHasOfficeMarker(pubsProc) ? inferRepresentedPole(pubsProc, partesProc) : null;
    const partesOut = [];
    for (const parte of partesProc) {
      if (!cleanValue(parte.nome)) continue;
      const role = getParteRole(parte, representedPole);
      const nameKey = buildNameKey(parte.nome);
      const matches = mirrorByName.get(nameKey) || [];
      let contactId = cleanValue(parte.contato_freshsales_id);
      let mode = "already_linked";
      if (!contactId) {
        if (matches.length === 1) {
          contactId = matches[0].freshsales_contact_id;
          mode = "matched_existing";
        } else if (apply) {
          if (remainingCreateBudget <= 0) {
            skippedByBudget += 1;
            mode = "budget_exceeded";
          } else {
          const created = await createOrUpdateFreshsalesContact(env, {
            name: parte.nome,
            type: role,
            cpf: parte.tipo_pessoa === "FISICA" ? parte.documento : null,
            cnpj: parte.tipo_pessoa === "JURIDICA" ? parte.documento : null,
            externalId: `hmadv:processo:${proc.id}:parte:${parte.id}:tipo:${String(role).toLowerCase().replace(/\s+/g, "_")}`,
          });
          contactId = String(created.id);
          contatosCriados += 1;
          remainingCreateBudget -= 1;
          mode = "created";
          const createdMirror = mapMirrorRow(buildMirrorRow(created));
          const createdKey = buildNameKey(createdMirror.name);
          if (createdKey) {
            const existingMatches = mirrorByName.get(createdKey) || [];
            mirrorByName.set(createdKey, [...existingMatches, createdMirror]);
          }
          }
        } else {
          mode = matches.length > 1 ? "ambiguous_match" : "create_needed";
        }
      }
      if (contactId && apply) {
        if (shouldPatchParteLink(parte, { contactId, role })) {
          pendingParteUpdates.push(buildParteUpsertRow(parte, { contactId, role }));
        }
        pendingSyncRows.push({
          processo_id: proc.id,
          parte_id: parte.id,
          contact_id_freshsales: String(contactId),
          relacao: role === "Cliente" ? "cliente_principal" : role === "Parte Adversa" ? "parte_adversa" : "parte_relacionada",
          principal: role === "Cliente",
          origem: "interno_contacts_reconcile",
          synced_at: new Date().toISOString(),
          metadata: { numero_cnj: proc.numero_cnj, account_id_freshsales: proc.account_id_freshsales || null, tipo_contato: role },
        });
        contatosVinculados += 1;
      }
      partesOut.push({
        parte_id: parte.id,
        nome: parte.nome,
        polo: parte.polo,
        tipo_contato: role,
        contato_freshsales_id: contactId,
        modo: mode,
        candidatos: matches.slice(0, 3).map((item) => ({ freshsales_contact_id: item.freshsales_contact_id, name: item.name, freshsales_url: item.freshsales_url })),
      });
    }
    if (partesOut.length) sample.push({ processo_id: proc.id, numero_cnj: proc.numero_cnj, account_id_freshsales: proc.account_id_freshsales || null, represented_pole: representedPole, partes: partesOut });
  }
  if (apply && pendingParteUpdates.length) {
    const dedupedParteUpdates = dedupeBy(pendingParteUpdates, (row) => row.id);
    await hmadvRest(env, "partes?on_conflict=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(dedupedParteUpdates),
    }, "judiciario");
  }
  if (apply && pendingSyncRows.length) {
    const dedupedSyncRows = dedupeBy(
      pendingSyncRows,
      (row) => `${row.processo_id}|${row.contact_id_freshsales}`
    );
    await hmadvRest(env, "processo_contato_sync?on_conflict=processo_id,contact_id_freshsales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(dedupedSyncRows),
    }, "judiciario");
  }
  return {
    checkedAt: new Date().toISOString(),
    apply,
    processosLidos: processos.length,
    contatosVinculados,
    contatosCriados,
    skippedByBudget,
    sample: sample.slice(0, 20),
  };
}

export async function linkPartesToExistingContact(env, { parteIds = [], contactId, type = "" } = {}) {
  const ids = Array.isArray(parteIds) ? parteIds.map((item) => cleanValue(item)).filter(Boolean) : [];
  const linkedContactId = cleanValue(contactId);
  if (!ids.length) throw new Error("Selecione ao menos uma parte para vincular.");
  if (!linkedContactId) throw new Error("Selecione um contato para vincular as partes.");
  const partes = await hmadvRest(env, `partes?id=in.(${ids.map((id) => `"${id}"`).join(",")})&select=id,processo_id,nome,polo,tipo_pessoa,cliente_hmadv,representada_pelo_escritorio,principal_no_account`, {}, "judiciario");
  const processIds = [...new Set(partes.map((item) => item.processo_id).filter(Boolean))];
  const processos = processIds.length
    ? await hmadvRest(env, `processos?id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,numero_cnj,account_id_freshsales,titulo`, {}, "judiciario")
    : [];
  const procMap = new Map(processos.map((row) => [row.id, row]));
  if (type) {
    await updateFreshsalesContactType(env, linkedContactId, type);
  }
  const sample = [];
  for (const parte of partes) {
    const processo = procMap.get(parte.processo_id) || null;
    const role = cleanValue(type) || getParteRole(parte, null);
    await patchParteLink(env, parte.id, parte.processo_id, processo?.numero_cnj || null, processo?.account_id_freshsales || null, linkedContactId, role);
    sample.push({
      parte_id: parte.id,
      nome: parte.nome,
      polo: parte.polo,
      processo_id: parte.processo_id,
      numero_cnj: processo?.numero_cnj || null,
      account_id_freshsales: processo?.account_id_freshsales || null,
      contato_freshsales_id: linkedContactId,
      tipo_contato: role,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    partesAtualizadas: partes.length,
    contato_freshsales_id: linkedContactId,
    tipo_contato: cleanValue(type) || null,
    sample,
  };
}

export async function unlinkPartesFromContact(env, { parteIds = [] } = {}) {
  const ids = Array.isArray(parteIds) ? parteIds.map((item) => cleanValue(item)).filter(Boolean) : [];
  if (!ids.length) throw new Error("Selecione ao menos uma parte para desvincular.");
  const partes = await hmadvRest(env, `partes?id=in.(${ids.map((id) => `"${id}"`).join(",")})&select=id,processo_id,nome,contato_freshsales_id`, {}, "judiciario");
  await hmadvRest(env, `partes?id=in.(${ids.map((id) => `"${id}"`).join(",")})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
    body: JSON.stringify({
      contato_freshsales_id: null,
      cliente_hmadv: false,
      representada_pelo_escritorio: false,
      principal_no_account: false,
    }),
  }, "judiciario");
  for (const parte of partes) {
    await hmadvRest(env, `processo_contato_sync?parte_id=eq.${encodeURIComponent(String(parte.id))}`, { method: "DELETE", headers: { "Content-Profile": "judiciario", Prefer: "return=minimal" } }, "judiciario").catch(() => null);
  }
  return {
    checkedAt: new Date().toISOString(),
    partesAtualizadas: partes.length,
    sample: partes.map((parte) => ({
      parte_id: parte.id,
      nome: parte.nome,
      processo_id: parte.processo_id,
      contato_freshsales_id: parte.contato_freshsales_id,
      modo: "unlinked",
    })),
  };
}

export async function reclassifyLinkedPartes(env, { parteIds = [], type = "" } = {}) {
  const ids = Array.isArray(parteIds) ? parteIds.map((item) => cleanValue(item)).filter(Boolean) : [];
  const nextType = cleanValue(type);
  if (!ids.length) throw new Error("Selecione ao menos uma parte vinculada.");
  if (!nextType) throw new Error("Informe o tipo para reclassificar.");
  const partes = await hmadvRest(env, `partes?id=in.(${ids.map((id) => `"${id}"`).join(",")})&select=id,processo_id,nome,polo,contato_freshsales_id`, {}, "judiciario");
  const contactIds = [...new Set(partes.map((item) => cleanValue(item.contato_freshsales_id)).filter(Boolean))];
  for (const contactId of contactIds) {
    await updateFreshsalesContactType(env, contactId, nextType);
  }
  for (const parte of partes) {
    await hmadvRest(env, `partes?id=eq.${encodeURIComponent(String(parte.id))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Profile": "judiciario", Prefer: "return=minimal" },
      body: JSON.stringify({
        cliente_hmadv: nextType === "Cliente",
        representada_pelo_escritorio: nextType === "Cliente",
        principal_no_account: nextType === "Cliente",
      }),
    }, "judiciario");
  }
  return {
    checkedAt: new Date().toISOString(),
    partesAtualizadas: partes.length,
    tipo_contato: nextType,
    sample: partes.map((parte) => ({
      parte_id: parte.id,
      nome: parte.nome,
      processo_id: parte.processo_id,
      contato_freshsales_id: parte.contato_freshsales_id,
      tipo_contato: nextType,
      modo: "reclassified",
    })),
  };
}

async function resolveContactsForBulkAction(env, { contactIds = [], query = "", type = "", limit = 500 } = {}) {
  const explicitIds = Array.isArray(contactIds) ? contactIds.map((item) => cleanValue(item)).filter(Boolean) : [];
  if (explicitIds.length) {
    const rows = await hmadvRest(
      env,
      `freshsales_contacts?freshsales_contact_id=in.(${explicitIds.map((id) => `"${id}"`).join(",")})&select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=${Math.min(explicitIds.length, 1000)}`
    );
    return rows.map(mapMirrorRow);
  }
  const listed = await listContacts(env, { page: 1, pageSize: Math.min(limit, 100), query, type });
  return listed.items || [];
}

function buildValidatedContactPayload(contact, fallbackType = "Cliente") {
  const sanitizedName = sanitizeContactName(contact?.name);
  const email = normalizeEmail(contact?.email);
  const phone = cleanDigits(contact?.phone);
  const cpf = cleanDigits(contact?.cpf);
  const cnpj = cleanDigits(contact?.cnpj);
  const cep = cleanDigits(contact?.cep);
  return {
    contactId: contact?.freshsales_contact_id,
    name: sanitizedName,
    type: cleanValue(contact?.type) || fallbackType,
    email,
    phone,
    cpf,
    cnpj,
    cep,
    externalId: cleanValue(contact?.external_id),
  };
}

export async function validateContacts(env, { contactIds = [], query = "", type = "", apply = false, limit = 100 } = {}) {
  const contacts = await resolveContactsForBulkAction(env, { contactIds, query, type, limit: Math.max(1, Math.min(Number(limit || 100), 500)) });
  const sample = [];
  let changed = 0;
  for (const contact of contacts) {
    const nextPayload = buildValidatedContactPayload(contact, type || "Cliente");
    const hasChanges =
      nextPayload.name !== cleanValue(contact.original_name || contact.name) ||
      nextPayload.email !== cleanValue(contact.original_email || contact.email) ||
      nextPayload.phone !== cleanValue(contact.original_phone || contact.phone) ||
      nextPayload.cpf !== cleanValue(contact.cpf) ||
      nextPayload.cnpj !== cleanValue(contact.cnpj) ||
      nextPayload.cep !== cleanValue(contact.cep);
    const effectiveChange = hasChanges;
    if (effectiveChange) {
      changed += 1;
      if (apply) {
        await waitFreshsalesRate(env);
        await updateContact(env, nextPayload);
      }
      sample.push({
        freshsales_contact_id: contact.freshsales_contact_id,
        before: {
          name: contact.original_name || contact.name,
          email: contact.original_email || contact.email,
          phone: contact.original_phone || contact.phone,
          cpf: contact.cpf,
          cnpj: contact.cnpj,
          cep: contact.cep,
        },
        after: {
          name: nextPayload.name,
          email: nextPayload.email,
          phone: nextPayload.phone,
          cpf: nextPayload.cpf,
          cnpj: nextPayload.cnpj,
          cep: nextPayload.cep,
        },
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    apply,
    totalRows: contacts.length,
    changed,
    sample: sample.slice(0, 50),
  };
}

export async function bulkCreateContacts(env, { names = [], type = "Cliente", intervalMs = 1200, dryRun = false } = {}) {
  const existingRows = await hmadvRest(env, "freshsales_contacts?select=freshsales_contact_id,name&limit=10000");
  const existingKeys = new Set(existingRows.map((row) => buildNameKey(row.name)).filter(Boolean));
  const cleanNames = [...new Set((Array.isArray(names) ? names : []).map((item) => sanitizeContactName(item)).filter(Boolean))];
  const sample = [];
  let created = 0;
  let skipped = 0;
  for (let index = 0; index < cleanNames.length; index += 1) {
    const name = cleanNames[index];
    const key = buildNameKey(name);
    if (key && existingKeys.has(key)) {
      skipped += 1;
      sample.push({ name, mode: "already_exists" });
      continue;
    }
    if (!dryRun) {
      if (created > 0) {
        await sleep(Math.max(500, Number(intervalMs || 1200)));
      }
      const createdContact = await createOrUpdateFreshsalesContact(env, {
        name,
        type,
        externalId: `hmadv:bulk-contact:${Date.now()}:${index}`,
      });
      existingKeys.add(key);
      sample.push({ name, mode: "created", freshsales_contact_id: String(createdContact.id) });
    } else {
      sample.push({ name, mode: "create_pending" });
    }
    created += 1;
  }
  return {
    checkedAt: new Date().toISOString(),
    dryRun,
    totalRows: cleanNames.length,
    created,
    skipped,
    intervalMs: Math.max(500, Number(intervalMs || 1200)),
    sample: sample.slice(0, 100),
  };
}

export async function deleteContactsBulk(env, { contactIds = [] } = {}) {
  const ids = Array.isArray(contactIds) ? contactIds.map((item) => cleanValue(item)).filter(Boolean) : [];
  if (!ids.length) throw new Error("Selecione ao menos um contato para exclusao em lote.");
  const sample = [];
  for (const contactId of ids) {
    await waitFreshsalesRate(env);
    await deleteContact(env, { contactId });
    sample.push({ freshsales_contact_id: contactId, mode: "deleted" });
  }
  return {
    checkedAt: new Date().toISOString(),
    totalRows: ids.length,
    deleted: ids.length,
    sample,
  };
}

async function fetchOperationJob(env, id) {
  const rows = await hmadvRest(env, `operacao_jobs?id=eq.${encodeURIComponent(String(id || ""))}&select=*`, {}, "judiciario");
  return rows?.[0] || null;
}

async function insertOperationJob(env, body) {
  const rows = await hmadvRest(
    env,
    "operacao_jobs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    },
    "judiciario"
  );
  return rows?.[0] || null;
}

async function patchOperationJob(env, id, body) {
  const rows = await hmadvRest(
    env,
    `operacao_jobs?id=eq.${encodeURIComponent(String(id || ""))}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...body,
        updated_at: new Date().toISOString(),
      }),
    },
    "judiciario"
  );
  return rows?.[0] || null;
}

function normalizeContactsJobPayload(action, payload = {}) {
  const normalizedControl = normalizeContactsJobControl(payload, {
    defaultSource: "interno",
    defaultPriority: action === "bulk_create_contacts" ? 3 : 4,
    defaultRateLimitKey: action === "bulk_create_contacts" ? "freshsales_contacts_write" : "freshsales_contacts_validate",
    defaultVisibleToPortal: false,
  });
  if (action === "bulk_create_contacts") {
    return {
      action,
      jobControl: normalizedControl,
      type: cleanValue(payload.type) || "Cliente",
      intervalMs: Math.max(500, Number(payload.intervalMs || 1200)),
      dryRun: Boolean(payload.dryRun),
      names: uniqueNonEmpty(payload.names || []),
      scheduledFor: cleanValue(payload.scheduledFor),
      limit: Math.max(1, Math.min(Number(payload.limit || 25), 200)),
    };
  }
  if (action === "validate_contacts") {
    return {
      action,
      jobControl: normalizedControl,
      apply: Boolean(payload.apply),
      query: cleanValue(payload.query) || "",
      type: cleanValue(payload.type) || "",
      scheduledFor: cleanValue(payload.scheduledFor),
      contactIds: uniqueNonEmpty(payload.contactIds || []),
      limit: Math.max(1, Math.min(Number(payload.limit || 50), 200)),
    };
  }
  throw new Error(`Acao de contatos nao suportada para job: ${action}`);
}

function normalizeContactsJobControl(payload = {}, defaults = {}) {
  const rawControl = payload?.jobControl && typeof payload.jobControl === "object" ? payload.jobControl : payload;
  const rawSource = String(rawControl?.source || rawControl?.origem || defaults.defaultSource || "interno").trim().toLowerCase();
  const source = rawSource === "portal" ? "portal" : "interno";
  const priority = Math.max(1, Math.min(Number(rawControl?.priority || defaults.defaultPriority || 3), 5));
  const rateLimitKey = String(rawControl?.rateLimitKey || rawControl?.rate_limit_key || defaults.defaultRateLimitKey || "freshsales_contacts").trim() || "freshsales_contacts";
  const visibleToPortal = rawControl?.visibleToPortal !== undefined
    ? Boolean(rawControl.visibleToPortal)
    : rawControl?.visible_to_portal !== undefined
      ? Boolean(rawControl.visible_to_portal)
      : Boolean(defaults.defaultVisibleToPortal);
  return {
    source,
    priority,
    rateLimitKey,
    visibleToPortal,
  };
}

function isScheduledForFuture(isoString) {
  if (!isoString) return false;
  const parsed = Date.parse(String(isoString));
  return Number.isFinite(parsed) && parsed > Date.now();
}

export async function createContactAdminJob(env, { action, payload = {} } = {}) {
  const normalized = normalizeContactsJobPayload(action, payload);
  const requestedCount = action === "bulk_create_contacts"
    ? normalized.names.length
    : normalized.contactIds.length || normalized.limit;
  return insertOperationJob(env, {
    modulo: "contacts",
    acao: action,
    status: requestedCount ? "pending" : "completed",
    payload: normalized,
    requested_count: requestedCount,
    processed_count: 0,
    success_count: 0,
    error_count: 0,
    result_summary: requestedCount ? {} : { requested_count: 0 },
    result_sample: [],
    last_error: null,
    started_at: null,
    finished_at: requestedCount ? null : new Date().toISOString(),
  });
}

export async function getContactAdminJob(env, id) {
  return fetchOperationJob(env, id);
}

async function runContactJobAction(env, job, chunkPayload) {
  if (job.acao === "bulk_create_contacts") {
    return bulkCreateContacts(env, {
      names: chunkPayload.names || [],
      type: chunkPayload.type,
      intervalMs: chunkPayload.intervalMs,
      dryRun: chunkPayload.dryRun,
    });
  }
  if (job.acao === "validate_contacts") {
    return validateContacts(env, {
      contactIds: chunkPayload.contactIds || [],
      query: chunkPayload.query || "",
      type: chunkPayload.type || "",
      apply: chunkPayload.apply,
      limit: chunkPayload.limit,
    });
  }
  throw new Error(`Acao de job de contatos nao suportada: ${job.acao}`);
}

export async function processContactAdminJob(env, id) {
  const job = await fetchOperationJob(env, id);
  if (!job) throw new Error("Job de contatos nao encontrado.");
  if (["completed", "error", "cancelled"].includes(String(job.status || ""))) return job;
  const payload = normalizeContactsJobPayload(job.acao, job.payload || {});
  if (isScheduledForFuture(payload.scheduledFor)) {
    return job;
  }

  const now = new Date().toISOString();
  if (!job.started_at) {
    await patchOperationJob(env, job.id, { status: "running", started_at: now });
  } else if (job.status !== "running") {
    await patchOperationJob(env, job.id, { status: "running" });
  }

  try {
    if (job.acao === "bulk_create_contacts") {
      const names = uniqueNonEmpty(payload.names || []);
      const offset = Math.max(0, Number(job.processed_count || 0));
      const chunk = names.slice(offset, offset + payload.limit);
      if (!chunk.length) {
        return patchOperationJob(env, job.id, {
          status: "completed",
          finished_at: new Date().toISOString(),
        });
      }
      const result = await runContactJobAction(env, job, {
        names: chunk,
        type: payload.type,
        intervalMs: payload.intervalMs,
        dryRun: payload.dryRun,
      });
      const nextProcessed = offset + chunk.length;
      return patchOperationJob(env, job.id, {
        status: nextProcessed >= names.length ? "completed" : "running",
        processed_count: nextProcessed,
        success_count: Number(job.success_count || 0) + Number(result?.created || 0),
        error_count: Number(job.error_count || 0),
        result_summary: {
          ...(job.result_summary || {}),
          totalRows: Number(result?.totalRows || names.length),
          created: Number((job.result_summary || {}).created || 0) + Number(result?.created || 0),
          skipped: Number((job.result_summary || {}).skipped || 0) + Number(result?.skipped || 0),
        },
        result_sample: Array.isArray(result?.sample) ? result.sample.slice(0, 50) : [],
        last_error: null,
        finished_at: nextProcessed >= names.length ? new Date().toISOString() : null,
      });
    }

    const explicitIds = uniqueNonEmpty(payload.contactIds || []);
    const totalPlanned = explicitIds.length || Number(payload.limit || 50);
    const offset = Math.max(0, Number(job.processed_count || 0));
    const chunkIds = explicitIds.length ? explicitIds.slice(offset, offset + payload.limit) : [];
    const result = await runContactJobAction(env, job, {
      contactIds: chunkIds,
      query: payload.query,
      type: payload.type,
      apply: payload.apply,
      limit: explicitIds.length ? chunkIds.length : payload.limit,
    });
    const processedNow = explicitIds.length ? chunkIds.length : Number(result?.totalRows || 0);
    const nextProcessed = explicitIds.length ? offset + processedNow : totalPlanned;
    return patchOperationJob(env, job.id, {
      status: nextProcessed >= totalPlanned ? "completed" : "running",
      processed_count: nextProcessed,
      success_count: Number(job.success_count || 0) + Number(result?.changed || 0),
      error_count: Number(job.error_count || 0),
      result_summary: {
        ...(job.result_summary || {}),
        totalRows: Number((job.result_summary || {}).totalRows || 0) + Number(result?.totalRows || 0),
        changed: Number((job.result_summary || {}).changed || 0) + Number(result?.changed || 0),
      },
      result_sample: Array.isArray(result?.sample) ? result.sample.slice(0, 50) : [],
      last_error: null,
      finished_at: nextProcessed >= totalPlanned ? new Date().toISOString() : null,
    });
  } catch (error) {
    return patchOperationJob(env, job.id, {
      status: "error",
      last_error: error.message || "Falha ao processar job de contatos.",
      finished_at: new Date().toISOString(),
    });
  }
}

export async function drainContactAdminJobs(env, { maxChunks = 3 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 3), 20));
  let chunksProcessed = 0;
  let latestJob = null;
  while (chunksProcessed < safeChunks) {
    const jobs = await hmadvRest(
      env,
      "operacao_jobs?modulo=eq.contacts&status=in.(pending,running)&order=created_at.asc&limit=20&select=id,status,payload,processed_count",
      {},
      "judiciario"
    ).catch(() => []);
    const activeRateLimitKeys = (jobs || [])
      .filter((item) => String(item?.status || "") === "running")
      .map((item) => String(item?.payload?.jobControl?.rateLimitKey || "").trim())
      .filter(Boolean);
    const dueJob = pickNextDispatchableJob(jobs || [], { activeRateLimitKeys });
    if (!dueJob?.id) break;
    latestJob = await processContactAdminJob(env, dueJob.id);
    chunksProcessed += 1;
    if (!latestJob || !["pending", "running"].includes(String(latestJob.status || ""))) {
      continue;
    }
  }
  const pending = await hmadvRest(
    env,
    "operacao_jobs?modulo=eq.contacts&status=in.(pending,running)&order=created_at.asc&limit=20&select=id,status,payload,processed_count,requested_count",
    {},
    "judiciario"
  ).catch(() => []);
  return {
    chunksProcessed,
    pendingCount: Array.isArray(pending) ? pending.length : 0,
    activeJob: sortAdminJobsForDispatch(Array.isArray(pending) ? pending : [latestJob].filter(Boolean))[0] || latestJob,
    completedAll: !Array.isArray(pending) || pending.filter((item) => !isScheduledForFuture(item?.payload?.scheduledFor)).length === 0,
  };
}
