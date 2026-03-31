import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { buildFallbackClientProfile, isClientProfileComplete } from "./client-auth.js";

function normalizeFreshdeskDomain(value) {
  return String(value || "").replace(/\/+$/, "");
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function buildClientDraftProfile(user, profile = null) {
  const fallback = buildFallbackClientProfile(user);
  const metadata = safeJsonParse(profile?.metadata, fallback.metadata || {});
  return {
    id: profile?.id || fallback.id,
    email: profile?.email || fallback.email,
    full_name: profile?.full_name || fallback.full_name,
    is_active: profile?.is_active ?? fallback.is_active,
    whatsapp: profile?.whatsapp || fallback.whatsapp,
    cpf: profile?.cpf || fallback.cpf,
    metadata,
    onboarding_required: !isClientProfileComplete({
      ...profile,
      ...{
        full_name: profile?.full_name || fallback.full_name,
        whatsapp: profile?.whatsapp || fallback.whatsapp,
        cpf: profile?.cpf || fallback.cpf,
        metadata,
        is_active: profile?.is_active ?? fallback.is_active,
      },
    }),
  };
}

async function tryFetchOptional(env, variants) {
  let lastError = null;

  for (const variant of variants) {
    try {
      const rows = await fetchSupabaseAdmin(env, variant.path);
      return {
        ok: true,
        items: Array.isArray(rows) ? rows.map(variant.mapRow) : [],
        warning: null,
      };
    } catch (error) {
      const message = String(error?.message || "");
      lastError = error;
      if (
        message.includes("404") ||
        message.includes("PGRST205") ||
        message.includes("Could not find the table") ||
        message.includes("does not exist") ||
        message.includes("42703")
      ) {
        continue;
      }
      throw error;
    }
  }

  return {
    ok: true,
    items: [],
    warning: lastError ? null : null,
  };
}

export async function listClientConsultas(env, email) {
  const params = new URLSearchParams();
  params.set("select", "id,nome,email,telefone,area,data,hora,status,observacoes,created_at,updated_at");
  params.set("email", `eq.${email}`);
  params.set("order", "data.desc,hora.desc");
  params.set("limit", "50");
  const rows = await fetchSupabaseAdmin(env, `agendamentos?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

export async function listClientProcessos(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `processos?select=id,numero,tribunal,status,updated_at,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        number: row.numero || null,
        court: row.tribunal || null,
        status: row.status || "sem_status",
        updated_at: row.updated_at || null,
      }),
    },
    {
      path: `processos?select=id,cnj,tribunal,status,updated_at,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        number: row.cnj || null,
        court: row.tribunal || null,
        status: row.status || "sem_status",
        updated_at: row.updated_at || null,
      }),
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      warning: "Leitura de processos ainda nao foi ligada neste projeto Supabase.",
    };
  }

  return result;
}

export async function listClientDocumentos(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `documentos?select=id,nome,status,created_at,updated_at,arquivo_url,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.nome || "Documento",
        status: row.status || "disponivel",
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        url: row.arquivo_url || null,
      }),
    },
    {
      path: `documentos?select=id,titulo,status,created_at,updated_at,file_url,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.titulo || "Documento",
        status: row.status || "disponivel",
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        url: row.file_url || null,
      }),
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      warning: "Estante documental em ativacao neste projeto.",
    };
  }

  return result;
}

export async function listClientFinanceiro(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `faturas?select=id,descricao,status,valor,vencimento,created_at,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=vencimento.asc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        title: row.descricao || "Fatura",
        status: row.status || "pendente",
        amount: row.valor || null,
        due_date: row.vencimento || null,
        created_at: row.created_at || null,
      }),
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      warning: "Modulo financeiro do cliente ainda nao possui fonte conectada neste ambiente.",
    };
  }

  return result;
}

export async function listClientTickets(env, email) {
  const domain = normalizeFreshdeskDomain(env.FRESHDESK_DOMAIN);
  const token = env.FRESHDESK_BASIC_TOKEN;

  if (!domain || !token) {
    return {
      items: [],
      warning: "Suporte do portal ainda nao foi conectado ao Freshdesk neste ambiente.",
    };
  }

  try {
    const params = new URLSearchParams();
    params.set("per_page", "30");
    params.set("page", "1");
    params.set("email", email);

    const response = await fetch(`${domain}/api/v2/tickets?${params.toString()}`, {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        items: [],
        warning: "Nao foi possivel listar os tickets do cliente via Freshdesk neste ambiente.",
      };
    }

    const payload = await response.json().catch(() => []);
    return {
      items: Array.isArray(payload)
        ? payload.map((item) => ({
            id: item.id,
            subject: item.subject || "Sem assunto",
            status: item.status,
            priority: item.priority,
            created_at: item.created_at,
            updated_at: item.updated_at,
            description_text: item.description_text || "",
          }))
        : [],
      warning: null,
    };
  } catch {
    return {
      items: [],
      warning: "Nao foi possivel listar os tickets do cliente via Freshdesk neste ambiente.",
    };
  }
}

export async function createClientTicket(env, profile, payload) {
  const domain = normalizeFreshdeskDomain(env.FRESHDESK_DOMAIN);
  const token = env.FRESHDESK_BASIC_TOKEN;

  if (!domain || !token) {
    throw new Error("Suporte do portal ainda nao foi conectado ao Freshdesk neste ambiente.");
  }

  const response = await fetch(`${domain}/api/v2/tickets`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: profile.full_name || profile.email,
      email: profile.email,
      subject: payload.subject,
      description: payload.description,
      priority: payload.priority || 1,
      status: 2,
      custom_fields: {
        cf_origem_do_ticket: "portal_cliente",
      },
    }),
  });

  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(body?.description || body?.message || "Nao foi possivel abrir o ticket do cliente.");
  }

  return body;
}

export async function getClientSummary(env, profile) {
  const [consultas, tickets, processos, documentos, financeiro] = await Promise.all([
    listClientConsultas(env, profile.email),
    listClientTickets(env, profile.email),
    listClientProcessos(env, profile.email),
    listClientDocumentos(env, profile.email),
    listClientFinanceiro(env, profile.email),
  ]);

  const warnings = [tickets.warning, processos.warning, documentos.warning, financeiro.warning].filter(Boolean);

  return {
    summary: {
      processos: processos.items.length,
      tickets: tickets.items.length,
      consultas: consultas.length,
      documentos: documentos.items.length,
      financeiro: financeiro.items.length,
    },
    warnings,
  };
}
