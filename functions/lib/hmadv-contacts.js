import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { freshsalesRequest, listFreshsalesSalesAccountContacts, listFreshsalesSalesAccountsFromViews, viewFreshsalesContact } from "./freshsales-crm.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function cleanDigits(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits || null;
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
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

function getCustomField(rawPayload, key) {
  return cleanValue(rawPayload?.custom_field?.[key]) || cleanValue(rawPayload?.custom_fields?.[key]) || cleanValue(rawPayload?.[key]) || null;
}

function mapMirrorRow(row) {
  return {
    id: row.id,
    freshsales_contact_id: row.freshsales_contact_id,
    external_id: cleanValue(row?.raw_payload?.external_id),
    name: row.name || row.raw_payload?.display_name || row.raw_payload?.name || "Contato sem nome",
    email: row.email || null,
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
  const name = cleanValue(contact?.display_name) || cleanValue(contact?.name) || [cleanValue(contact?.first_name), cleanValue(contact?.last_name)].filter(Boolean).join(" ") || "Contato sem nome";
  const email = cleanValue(contact?.email) || (Array.isArray(contact?.emails) ? cleanValue(contact.emails[0]) : null);
  const phone = cleanValue(contact?.mobile_number) || cleanValue(contact?.phone) || cleanValue(contact?.work_number);
  return {
    freshsales_contact_id: String(contact.id),
    name,
    email,
    phone,
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
}

function buildNameKey(name) {
  return normalizeText(name).replace(/[^\p{L}\p{N}\s]/gu, "").trim();
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
  const { first_name, last_name } = splitName(name);
  const body = {
    unique_identifier: externalId ? { external_id: String(externalId) } : undefined,
    contact: {
      first_name,
      last_name,
      external_id: externalId || undefined,
      email: cleanValue(email) || undefined,
      emails: cleanValue(email) ? [cleanValue(email)] : undefined,
      mobile_number: cleanDigits(phone) || undefined,
      phone: cleanDigits(phone) || undefined,
      custom_field: {
        cf_tipo: type || "Cliente",
        ...(cleanDigits(cpf) ? { cf_cpf: cleanDigits(cpf) } : {}),
        ...(cleanDigits(cnpj) ? { cf_cnpj: cleanDigits(cnpj) } : {}),
        ...(cleanDigits(cep) ? { cf_cep: cleanDigits(cep) } : {}),
      },
    },
  };
  const { payload } = await freshsalesRequest(env, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = [];
  if (query) {
    const encoded = encodeURIComponent(`*${query}*`);
    filters.push(`or=(name.ilike.${encoded},email.ilike.${encoded},phone.ilike.${encoded})`);
  }
  const rows = await hmadvRest(env, `freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&${filters.join("&")}${filters.length ? "&" : ""}order=last_synced_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`);
  let items = rows.map(mapMirrorRow);
  if (type) items = items.filter((item) => normalizeText(item.type) === normalizeText(type));
  return { page: safePage, pageSize: safePageSize, totalRows: await hmadvCount(env, "freshsales_contacts", filters.join("&")), items };
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
  return { contact, crm: await viewFreshsalesContact(env, contactId).catch(() => null), partes, processos, metrics: { processos: processos.length, publicacoes: publicacoes.length, audiencias: audiencias.length, consultas: 0, financeiro: 0, documentos: 0 } };
}

export async function syncFreshsalesContactsMirror(env, { limit = 200, dryRun = false } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 200), 5000));
  const rows = [];
  let source = "contacts_view";
  try {
    for (let page = 1; page <= Math.max(1, Math.ceil(safeLimit / 100)); page += 1) {
      await waitFreshsalesRate(env);
      const { payload } = await freshsalesRequest(env, `/contacts/view/1?page=${page}&per_page=${Math.min(100, safeLimit)}`);
      const batch = Array.isArray(payload?.contacts) ? payload.contacts : Array.isArray(payload) ? payload : [];
      rows.push(...batch);
      if (batch.length < Math.min(100, safeLimit)) break;
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
  return { checkedAt: new Date().toISOString(), dryRun, total: unique.length, imported: unique.length, source, sample: unique.slice(0, 50).map((row) => ({ freshsales_contact_id: row.freshsales_contact_id, name: row.name })) };
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
  return createOrUpdateFreshsalesContact(env, { name, type, externalId });
}

export async function createContact(env, payload) {
  return createOrUpdateFreshsalesContact(env, payload);
}

export async function updateContact(env, payload) {
  const contactId = cleanValue(payload.contactId);
  if (!contactId) throw new Error("contactId obrigatorio para atualizar.");
  const { first_name, last_name } = splitName(payload.name);
  const body = {
    contact: {
      first_name,
      last_name,
      email: cleanValue(payload.email) || undefined,
      emails: cleanValue(payload.email) ? [cleanValue(payload.email)] : undefined,
      mobile_number: cleanDigits(payload.phone) || undefined,
      phone: cleanDigits(payload.phone) || undefined,
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
  const processos = await hmadvRest(env, processPath, {}, "judiciario");
  const processIds = processos.map((item) => item.id);
  const [partes, publicacoes, mirrorRows] = await Promise.all([
    processIds.length ? hmadvRest(env, `partes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,nome,polo,tipo_pessoa,documento,cliente_hmadv,representada_pelo_escritorio,contato_freshsales_id&limit=${Math.max(processIds.length * 20, 20)}`, {}, "judiciario") : [],
    processIds.length ? hmadvRest(env, `publicacoes?processo_id=in.(${processIds.map((id) => `"${id}"`).join(",")})&select=id,processo_id,conteudo,raw_payload&limit=${Math.max(processIds.length * 10, 10)}`, {}, "judiciario") : [],
    hmadvRest(env, "freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at,raw_payload&limit=5000"),
  ]);
  const mirrorByName = new Map();
  for (const row of mirrorRows.map(mapMirrorRow)) {
    const key = buildNameKey(row.name);
    if (!key) continue;
    if (!mirrorByName.has(key)) mirrorByName.set(key, []);
    mirrorByName.get(key).push(row);
  }
  let contatosVinculados = 0;
  let contatosCriados = 0;
  const sample = [];
  for (const proc of processos) {
    const partesProc = partes.filter((item) => item.processo_id === proc.id);
    const pubsProc = publicacoes.filter((item) => item.processo_id === proc.id).slice(0, 10);
    const representedPole = publicationHasOfficeMarker(pubsProc) ? inferRepresentedPole(pubsProc, partesProc) : null;
    const partesOut = [];
    for (const parte of partesProc) {
      if (!cleanValue(parte.nome)) continue;
      const role = getParteRole(parte, representedPole);
      const matches = mirrorByName.get(buildNameKey(parte.nome)) || [];
      let contactId = cleanValue(parte.contato_freshsales_id);
      let mode = "already_linked";
      if (!contactId) {
        if (matches.length === 1) {
          contactId = matches[0].freshsales_contact_id;
          mode = "matched_existing";
        } else if (apply) {
          const created = await createOrUpdateFreshsalesContact(env, {
            name: parte.nome,
            type: role,
            cpf: parte.tipo_pessoa === "FISICA" ? parte.documento : null,
            cnpj: parte.tipo_pessoa === "JURIDICA" ? parte.documento : null,
            externalId: `hmadv:processo:${proc.id}:parte:${parte.id}:tipo:${String(role).toLowerCase().replace(/\s+/g, "_")}`,
          });
          contactId = String(created.id);
          contatosCriados += 1;
          mode = "created";
        } else {
          mode = matches.length > 1 ? "ambiguous_match" : "create_needed";
        }
      }
      if (contactId && apply) {
        await patchParteLink(env, parte.id, proc.id, proc.numero_cnj, proc.account_id_freshsales, contactId, role);
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
  return { checkedAt: new Date().toISOString(), apply, processosLidos: processos.length, contatosVinculados, contatosCriados, sample: sample.slice(0, 20) };
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
