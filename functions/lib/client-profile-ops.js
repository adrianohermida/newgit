import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeContactList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: normalizeText(item?.id) || `contact-${index + 1}`,
      label: normalizeText(item?.label || item?.tipo || item?.type),
      type: normalizeText(item?.type || item?.tipo || "telefone") || "telefone",
      value: normalizeText(item?.value || item?.contato || item?.numero || item?.email),
      notes: normalizeText(item?.notes || item?.observacoes),
      primary: normalizeBoolean(item?.primary),
    }))
    .filter((item) => item.value);
}

function normalizeAddressList(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: normalizeText(item?.id) || `address-${index + 1}`,
      label: normalizeText(item?.label || item?.tipo),
      street: normalizeText(item?.street || item?.logradouro),
      number: normalizeText(item?.number || item?.numero),
      complement: normalizeText(item?.complement || item?.complemento),
      district: normalizeText(item?.district || item?.bairro),
      city: normalizeText(item?.city || item?.cidade),
      state: normalizeText(item?.state || item?.estado || item?.uf).toUpperCase(),
      postal_code: normalizeText(item?.postal_code || item?.cep),
      country: normalizeText(item?.country || item?.pais || "Brasil"),
      primary: normalizeBoolean(item?.primary),
    }))
    .filter((item) => item.street || item.city || item.state || item.postal_code);
}

function normalizeConsentFlags(body, fallbackMetadata = {}) {
  return {
    consent_lgpd:
      body?.metadata?.consent_lgpd === true ||
      body?.consent_lgpd === true ||
      fallbackMetadata?.consent_lgpd === true,
    communication_consent:
      body?.metadata?.communication_consent === true ||
      body?.communication_consent === true ||
      fallbackMetadata?.communication_consent === true,
  };
}

export function buildClientProfileSnapshot(user, profile = null) {
  const metadata = safeJsonParse(profile?.metadata, {});
  return {
    id: profile?.id || user?.id || null,
    email: profile?.email || user?.email || "",
    full_name: profile?.full_name || metadata.full_name || "",
    whatsapp: profile?.whatsapp || metadata.whatsapp || "",
    cpf: profile?.cpf || metadata.cpf || "",
    is_active: profile?.is_active !== false,
    profession: normalizeText(metadata.profession),
    marital_status: normalizeText(metadata.marital_status),
    addresses: normalizeAddressList(metadata.addresses),
    contacts: normalizeContactList(metadata.contacts),
    metadata,
  };
}

export function normalizeClientProfilePayload(body = {}, profile = null, options = {}) {
  const metadata = safeJsonParse(profile?.metadata, {});
  const locks = safeJsonParse(metadata.personal_data_locks, {});
  const { requireEssentialFields = false } = options;

  const fullName = normalizeText(body.full_name ?? profile?.full_name);
  const whatsapp = digitsOnly(body.whatsapp ?? profile?.whatsapp);
  const cpf = digitsOnly(body.cpf ?? profile?.cpf);
  const profession = normalizeText(body.profession ?? metadata.profession);
  const maritalStatus = normalizeText(body.marital_status ?? metadata.marital_status);
  const addresses = normalizeAddressList(body.addresses ?? metadata.addresses);
  const contacts = normalizeContactList(body.contacts ?? metadata.contacts);
  const consentFlags = normalizeConsentFlags(body, metadata);

  if (requireEssentialFields) {
    if (!fullName || !whatsapp || !cpf) {
      return { error: "Preencha nome completo, WhatsApp e CPF para concluir o perfil do cliente." };
    }
    if (!consentFlags.consent_lgpd) {
      return { error: "E necessario aceitar o consentimento LGPD para ativar o portal." };
    }
  }

  if (locks.cpf_verified === true && cpf && digitsOnly(profile?.cpf) && cpf !== digitsOnly(profile?.cpf)) {
    return { error: "O CPF ja foi validado e nao pode ser alterado pelo portal." };
  }

  if (locks.full_name_verified === true && fullName && normalizeText(profile?.full_name) && fullName !== normalizeText(profile?.full_name)) {
    return { error: "O nome completo ja foi verificado pela equipe e nao pode ser alterado pelo portal." };
  }

  const nextMetadata = {
    ...metadata,
    consent_lgpd: consentFlags.consent_lgpd,
    communication_consent: consentFlags.communication_consent,
    profession,
    marital_status: maritalStatus,
    addresses,
    contacts,
    personal_data_locks: {
      cpf_verified: locks.cpf_verified === true,
      full_name_verified: locks.full_name_verified === true,
    },
  };

  return {
    payload: {
      id: profile?.id || null,
      email: normalizeText(body.email ?? profile?.email),
      full_name: fullName,
      whatsapp,
      cpf,
      is_active: profile?.is_active !== false,
      metadata: nextMetadata,
    },
    locks: nextMetadata.personal_data_locks,
  };
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes(tableName)
  );
}

export async function listClientProfileChangeRequests(env, filters = {}) {
  try {
    const params = new URLSearchParams();
    params.set("select", "id,client_id,client_email,status,current_snapshot,requested_payload,review_notes,reviewed_by,reviewed_by_email,reviewed_at,applied_at,created_at,updated_at");
    if (filters.clientId) params.set("client_id", `eq.${filters.clientId}`);
    if (filters.clientEmail) params.set("client_email", `eq.${filters.clientEmail}`);
    if (filters.status) params.set("status", `eq.${filters.status}`);
    params.set("order", "created_at.desc");
    params.set("limit", String(filters.limit || 25));
    const rows = await fetchSupabaseAdmin(env, `client_profile_change_requests?${params.toString()}`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isMissingTableError(error, "client_profile_change_requests")) {
      return [];
    }
    throw error;
  }
}

export async function createClientProfileChangeRequest(env, { user, profile, requestedPayload }) {
  const currentSnapshot = buildClientProfileSnapshot(user, profile);
  const row = {
    client_id: user.id,
    client_email: user.email,
    status: "pending",
    current_snapshot: currentSnapshot,
    requested_payload: requestedPayload,
  };

  try {
    const rows = await fetchSupabaseAdmin(env, "client_profile_change_requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    return Array.isArray(rows) ? rows[0] || row : row;
  } catch (error) {
    if (isMissingTableError(error, "client_profile_change_requests")) {
      throw new Error("A fila de solicitacoes cadastrais ainda nao foi criada no Supabase. Aplique a migration 022.");
    }
    throw error;
  }
}

export async function upsertClientProfile(env, { user, currentProfile, payload }) {
  const row = {
    id: user.id,
    email: user.email,
    full_name: payload.full_name,
    whatsapp: payload.whatsapp,
    cpf: payload.cpf,
    is_active: payload.is_active !== false,
    created_at: currentProfile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: payload.metadata || {},
  };

  try {
    const rows = await fetchSupabaseAdmin(env, "client_profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    return Array.isArray(rows) ? rows[0] || row : row;
  } catch (error) {
    if (isMissingTableError(error, "client_profiles")) {
      throw new Error("A tabela client_profiles ainda nao esta disponivel neste projeto Supabase.");
    }
    throw error;
  }
}

export async function updateClientAuthMetadata(env, userId, metadata) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);
  if (!baseUrl || !serviceKey) {
    throw new Error("Configuracao do Supabase incompleta para atualizar metadata do usuario.");
  }

  const response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_metadata: metadata }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || body?.error_description || "Falha ao atualizar metadata do usuario.");
  }
  return body?.user || null;
}

export async function reviewClientProfileChangeRequest(env, { requestId, decision, adminUser, adminProfile }) {
  const [requestRow] = await listClientProfileChangeRequests(env, { limit: 1 }).then((rows) =>
    rows.filter((item) => String(item.id) === String(requestId)).slice(0, 1)
  );

  if (!requestRow) {
    throw new Error("Solicitacao de alteracao cadastral nao encontrada.");
  }

  if (requestRow.status !== "pending") {
    throw new Error("Essa solicitacao ja foi analisada.");
  }

  if (decision === "reject") {
    const rows = await fetchSupabaseAdmin(env, `client_profile_change_requests?id=eq.${encodeURIComponent(String(requestId))}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUser.id,
        reviewed_by_email: adminUser.email || adminProfile?.email || null,
      }),
    });
    return Array.isArray(rows) ? rows[0] || requestRow : requestRow;
  }

  const currentSnapshot = safeJsonParse(requestRow.current_snapshot, {});
  const requestedPayload = safeJsonParse(requestRow.requested_payload, {});
  const appliedProfile = await upsertClientProfile(env, {
    user: { id: requestRow.client_id, email: requestRow.client_email },
    currentProfile: currentSnapshot,
    payload: requestedPayload,
  });

  await updateClientAuthMetadata(env, requestRow.client_id, {
    ...(safeJsonParse(currentSnapshot.metadata, {})),
    ...(safeJsonParse(requestedPayload.metadata, {})),
    full_name: requestedPayload.full_name || currentSnapshot.full_name || "",
    whatsapp: requestedPayload.whatsapp || currentSnapshot.whatsapp || "",
    cpf: requestedPayload.cpf || currentSnapshot.cpf || "",
    is_active: true,
  });

  const rows = await fetchSupabaseAdmin(env, `client_profile_change_requests?id=eq.${encodeURIComponent(String(requestId))}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      status: "applied",
      reviewed_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
      reviewed_by_email: adminUser.email || adminProfile?.email || null,
    }),
  });

  return {
    request: Array.isArray(rows) ? rows[0] || requestRow : requestRow,
    profile: appliedProfile,
  };
}

export async function updateClientProfileLocks(env, { clientId, cpfVerified, fullNameVerified }) {
  const rows = await fetchSupabaseAdmin(
    env,
    `client_profiles?select=id,email,full_name,is_active,whatsapp,cpf,metadata,created_at,updated_at&id=eq.${encodeURIComponent(String(clientId))}&limit=1`
  );
  const profile = Array.isArray(rows) ? rows[0] || null : null;
  if (!profile) {
    throw new Error("Perfil do cliente nao encontrado para atualizar bloqueios.");
  }

  const metadata = safeJsonParse(profile.metadata, {});
  const nextMetadata = {
    ...metadata,
    personal_data_locks: {
      cpf_verified: cpfVerified === true,
      full_name_verified: fullNameVerified === true,
    },
  };

  const updatedRows = await fetchSupabaseAdmin(env, `client_profiles?id=eq.${encodeURIComponent(String(clientId))}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    }),
  });

  return Array.isArray(updatedRows) ? updatedRows[0] || profile : profile;
}
