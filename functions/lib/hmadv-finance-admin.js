import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { freshsalesRequest, listFreshsalesSalesAccountsFromViews } from "./freshsales-crm.js";
import { getCleanEnvValue } from "./env.js";
import { createContact, linkPartesToExistingContact } from "./hmadv-contacts.js";

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(getKey(item) || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function basename(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || String(value || "");
}

function resolveFreshsalesOrgDomain(env) {
  const explicit = getCleanEnvValue(env.FRESHSALES_ORG_DOMAIN);
  if (explicit) return explicit;
  const rawBase = getCleanEnvValue(env.FRESHSALES_API_BASE || env.FRESHSALES_BASE_URL || env.FRESHSALES_DOMAIN);
  if (!rawBase) return null;
  const host = rawBase
    .replace(/^https?:\/\//i, "")
    .replace(/\/(crm\/sales\/api|api)\/?$/i, "")
    .trim();
  if (!host) return null;
  if (host.includes("myfreshworks.com")) return host;
  if (host.endsWith(".freshsales.io")) return host.replace(/\.freshsales\.io$/i, ".myfreshworks.com");
  return host;
}

function getFreshsalesDealsOauthClientId(env) {
  return getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) || getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) || getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_ID) || null;
}

function getFreshsalesDealsOauthClientSecret(env) {
  return getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) || getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) || getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_SECRET) || null;
}

function getFreshsalesDealsScopes(env) {
  return getCleanEnvValue(env.FRESHSALES_DEALS_SCOPES) || getCleanEnvValue(env.FRESHSALES_DEAL_SCOPES) || getCleanEnvValue(env.FRESHSALES_SCOPES) || getCleanEnvValue(env.FRESHSALES_OAUTH_SCOPES) || null;
}

function buildFreshsalesAuthorizationUrl(env) {
  const clientId = getFreshsalesDealsOauthClientId(env);
  const orgDomain = resolveFreshsalesOrgDomain(env);
  const supabaseUrl = getCleanEnvValue(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri =
    getCleanEnvValue(env.FRESHSALES_REDIRECT_URI) ||
    getCleanEnvValue(env.REDIRECT_URI) ||
    getCleanEnvValue(env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    getCleanEnvValue(env.OAUTH_CALLBACK_URL) ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);
  const state = getCleanEnvValue(env.FRESHSALES_OAUTH_STATE) || "hmadv-billing";
  const scopes = getFreshsalesDealsScopes(env) || [
    "freshsales.contacts.create",
    "freshsales.contacts.edit",
    "freshsales.contacts.view",
    "freshsales.sales_accounts.create",
    "freshsales.sales_accounts.edit",
    "freshsales.sales_accounts.view",
    "freshsales.deals.create",
    "freshsales.deals.edit",
    "freshsales.deals.view",
    "freshsales.settings.fields.view",
  ].join(" ");

  if (!clientId || !orgDomain || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  });

  return `https://${orgDomain}/org/oauth/v2/authorize?${params.toString()}`;
}

function buildFreshsalesAuthSnapshot(env) {
  const apiBase = getCleanEnvValue(env.FRESHSALES_API_BASE || env.FRESHSALES_BASE_URL || env.FRESHSALES_DOMAIN);
  const apiKey = getCleanEnvValue(env.FRESHSALES_API_KEY);
  const accessToken = getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN);
  const refreshToken = getCleanEnvValue(env.FRESHSALES_REFRESH_TOKEN);
  const tokenExpiry = getCleanEnvValue(env.FRESHSALES_TOKEN_EXPIRY);
  const expiryDate = tokenExpiry && !Number.isNaN(Number(tokenExpiry)) ? new Date(Number(tokenExpiry)).toISOString() : null;
  const dealsClientId = getFreshsalesDealsOauthClientId(env);
  const dealsClientSecret = getFreshsalesDealsOauthClientSecret(env);
  const contactsClientId = getCleanEnvValue(env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) || null;
  const contactsClientSecret = getCleanEnvValue(env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) || null;
  const oauthOperational = Boolean(dealsClientId && dealsClientSecret && (accessToken || refreshToken));
  const preferredAuthMode = oauthOperational ? "oauth" : apiKey ? "api_key" : accessToken ? "access_token" : "missing";
  const oauthConfigured = Boolean(
    dealsClientId &&
    dealsClientSecret &&
    (accessToken || refreshToken)
  );
  const operational = Boolean(apiKey || accessToken || oauthConfigured);

  return {
    has_api_base: Boolean(apiBase),
    has_api_key: Boolean(apiKey),
    has_access_token: Boolean(accessToken),
    has_refresh_token: Boolean(refreshToken),
    has_client_id: Boolean(dealsClientId),
    has_client_secret: Boolean(dealsClientSecret),
    has_deals_client_id: Boolean(dealsClientId),
    has_deals_client_secret: Boolean(dealsClientSecret),
    has_contacts_client_id: Boolean(contactsClientId),
    has_contacts_client_secret: Boolean(contactsClientSecret),
    has_org_domain: Boolean(resolveFreshsalesOrgDomain(env)),
    has_redirect_uri: Boolean(getCleanEnvValue(env.FRESHSALES_REDIRECT_URI) || getCleanEnvValue(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)),
    preferred_auth_mode: preferredAuthMode,
    oauth_configured: oauthConfigured,
    auth_operational: operational,
    auth_summary: operational
      ? preferredAuthMode === "api_key"
        ? "Operando por API key"
        : preferredAuthMode === "oauth"
          ? "OAuth configurado para operacao"
          : "Operando por token OAuth"
      : "Sem credencial operacional",
    oauth_required_for_operation: !apiKey || oauthOperational,
    api_base: apiBase,
    org_domain: resolveFreshsalesOrgDomain(env),
    token_expiry: expiryDate,
    authorization_url: apiKey ? null : buildFreshsalesAuthorizationUrl(env),
  };
}

async function fetchSupabaseAdminAll(env, path, { schema = "public", pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    const page = await fetchSupabaseAdmin(env, path, {
      headers: {
        Range: `${from}-${from + pageSize - 1}`,
        Prefer: "count=exact",
        "Accept-Profile": schema,
        "Content-Profile": schema,
      },
    });

    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchSupabaseSchema(env, path, { schema = "public", init = {} } = {}) {
  return fetchSupabaseAdmin(env, path, {
    ...init,
    headers: {
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(init.headers || {}),
    },
  });
}

function buildStatusCounts(items, field = "status") {
  return items.reduce((acc, item) => {
    const key = String(item?.[field] || "sem_status").trim() || "sem_status";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildImportSourceCounts(rows, runsById) {
  return rows.reduce((acc, row) => {
    const run = runsById.get(String(row.import_run_id || "").trim()) || null;
    const key = basename(run?.source_file || run?.source_name || "desconhecido");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatRecentReceivable(row, contractsById, contactsById) {
  const contract = contractsById.get(String(row.contract_id || "").trim()) || null;
  const contact = contactsById.get(String(row.contact_id || "").trim()) || null;
  const syncStatus = row.freshsales_deal_id ? "freshsales_synced" : "canonical_only";
  return {
    id: row.id,
    title: contract?.title || row.description || row.invoice_number || "Recebivel",
    invoice_number: row.invoice_number || null,
    receivable_type: row.receivable_type || null,
    status: row.status || null,
    due_date: row.due_date || null,
    amount_original: toNumber(row.amount_original),
    balance_due: toNumber(row.balance_due_corrected ?? row.balance_due ?? row.amount_original),
    process_reference: contract?.process_reference || null,
    freshsales_account_id: row.freshsales_account_id || contract?.freshsales_account_id || null,
    freshsales_deal_id: row.freshsales_deal_id || null,
    sync_status: syncStatus,
    sync_status_label: syncStatus === "freshsales_synced" ? "Sincronizado no Freshsales" : "Base canonica pendente de Deal",
    contact_name: contact?.name || null,
    contact_email: contact?.email || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function formatPendingRow(row, contactsById, runsById) {
  const contact = contactsById.get(String(row.resolved_contact_id || "").trim()) || null;
  const run = runsById.get(String(row.import_run_id || "").trim()) || null;
  const validationErrors = Array.isArray(row.validation_errors)
    ? row.validation_errors
    : Object.values(safeJsonParse(row.validation_errors, {})).filter(Boolean);

  return {
    id: row.id,
    source_file: basename(run?.source_file || run?.source_name || ""),
    person_name: row.person_name || null,
    email: row.email || null,
    invoice_number: row.invoice_number || null,
    due_date: row.due_date || null,
    matching_status: row.matching_status || null,
    resolved_contact_name: contact?.name || null,
    resolved_contact_email: contact?.email || null,
    resolved_account_id_freshsales: row.resolved_account_id_freshsales || null,
    resolved_process_reference: row.resolved_process_reference || null,
    deal_reference_raw: row.deal_reference_raw || null,
    product_family_inferred: row.product_family_inferred || null,
    billing_type_inferred: row.billing_type_inferred || null,
    validation_errors: validationErrors,
    updated_at: row.created_at || null,
  };
}

function deriveResolutionStats(importRows, receivables, contracts) {
  const textualContracts = contracts.filter((item) => safeJsonParse(item.metadata, {}).account_resolution_status === "textual_only").length;
  const resolvedContracts = contracts.filter((item) => item.freshsales_account_id).length;
  const receivablesWithAccount = receivables.filter((item) => item.freshsales_account_id).length;
  const receivablesWithoutAccount = receivables.length - receivablesWithAccount;

  return {
    pending_contact: importRows.filter((item) => item.matching_status === "pendente_contato").length,
    pending_account: importRows.filter((item) => item.matching_status === "pendente_account").length,
    pending_review: importRows.filter((item) => item.matching_status === "pendente_revisao").length,
    matched: importRows.filter((item) => item.matching_status === "pareado").length,
    contracts_resolved: resolvedContracts,
    contracts_textual_only: textualContracts,
    receivables_with_account: receivablesWithAccount,
    receivables_without_account: receivablesWithoutAccount,
  };
}

function deriveMigrationProgressBySource(importRows, receivables, runsById) {
  const bucket = new Map();

  const ensureSource = (sourceName) => {
    const key = basename(sourceName || "desconhecido");
    if (!bucket.has(key)) {
      bucket.set(key, {
        source_file: key,
        import_rows: 0,
        duplicates: 0,
        pending_contact: 0,
        pending_account: 0,
        pending_review: 0,
        matched: 0,
        materialized_receivables: 0,
        freshsales_synced: 0,
        canonical_only: 0,
        publish_ready: 0,
      });
    }
    return bucket.get(key);
  };

  const rowSourceById = new Map();
  for (const row of importRows) {
    const run = runsById.get(String(row.import_run_id || "").trim()) || null;
    const source = ensureSource(run?.source_file || run?.source_name || "desconhecido");
    source.import_rows += 1;
    if (row.is_duplicate === true) source.duplicates += 1;
    if (row.matching_status === "pendente_contato") source.pending_contact += 1;
    if (row.matching_status === "pendente_account") source.pending_account += 1;
    if (row.matching_status === "pendente_revisao") source.pending_review += 1;
    if (row.matching_status === "pareado") source.matched += 1;
    rowSourceById.set(String(row.id), source.source_file);
  }

  for (const receivable of receivables) {
    const sourceFile = rowSourceById.get(String(receivable.source_import_row_id || "").trim()) || "desconhecido";
    const source = ensureSource(sourceFile);
    source.materialized_receivables += 1;
    if (receivable.freshsales_deal_id) {
      source.freshsales_synced += 1;
    } else {
      source.canonical_only += 1;
    }
    if (receivable.contact_id && receivable.freshsales_account_id && !receivable.freshsales_deal_id) {
      source.publish_ready += 1;
    }
  }

  return Array.from(bucket.values())
    .map((item) => ({
      ...item,
      materialization_rate: item.import_rows ? Number(((item.materialized_receivables / item.import_rows) * 100).toFixed(2)) : 0,
      freshsales_sync_rate: item.materialized_receivables ? Number(((item.freshsales_synced / item.materialized_receivables) * 100).toFixed(2)) : 0,
    }))
    .sort((left, right) => left.source_file.localeCompare(right.source_file, "pt-BR"));
}

function deriveExecutiveMigrationSummary({ importRows, receivables, resolution, migrationProgressBySource }) {
  const totalImportRows = importRows.length;
  const totalMaterialized = receivables.length;
  const totalSynced = receivables.filter((item) => item.freshsales_deal_id).length;
  const totalCanonicalOnly = totalMaterialized - totalSynced;
  const totalPublishReady = receivables.filter((item) => item.contact_id && item.freshsales_account_id && !item.freshsales_deal_id).length;

  const blockers = [];
  if (resolution.pending_contact > 0) {
    blockers.push({
      key: "pending_contact",
      label: "Contatos pendentes",
      count: resolution.pending_contact,
      helper: "Linhas ainda sem vinculo confiavel de contato para virar contrato/recebivel publicavel.",
    });
  }
  if (resolution.pending_account > 0) {
    blockers.push({
      key: "pending_account",
      label: "Accounts pendentes",
      count: resolution.pending_account,
      helper: "Linhas que dependem de processo/account para publicar Deals no Freshsales.",
    });
  }
  if (resolution.pending_review > 0) {
    blockers.push({
      key: "pending_review",
      label: "Revisao manual",
      count: resolution.pending_review,
      helper: "Linhas com erro de parsing, ambiguidade ou necessidade de saneamento.",
    });
  }
  if (resolution.contracts_textual_only > 0) {
    blockers.push({
      key: "textual_only",
      label: "Contratos textual_only",
      count: resolution.contracts_textual_only,
      helper: "Contratos canonicos sem Sales Account resolvido, ainda fora do fluxo ideal de Deals.",
    });
  }
  if (resolution.receivables_without_account > 0) {
    blockers.push({
      key: "receivables_without_account",
      label: "Recebiveis sem account",
      count: resolution.receivables_without_account,
      helper: "Recebiveis que ainda nao podem ser publicados diretamente no Freshsales.",
    });
  }

  return {
    total_import_rows: totalImportRows,
    total_materialized_receivables: totalMaterialized,
    total_freshsales_synced: totalSynced,
    total_canonical_only: totalCanonicalOnly,
    total_publish_ready: totalPublishReady,
    materialization_rate: totalImportRows ? Number(((totalMaterialized / totalImportRows) * 100).toFixed(2)) : 0,
    freshsales_sync_rate_over_materialized: totalMaterialized ? Number(((totalSynced / totalMaterialized) * 100).toFixed(2)) : 0,
    freshsales_sync_rate_over_import_rows: totalImportRows ? Number(((totalSynced / totalImportRows) * 100).toFixed(2)) : 0,
    by_source: migrationProgressBySource.map((item) => ({
      source_file: item.source_file,
      import_rows: item.import_rows,
      materialized_receivables: item.materialized_receivables,
      freshsales_synced: item.freshsales_synced,
      canonical_only: item.canonical_only,
      publish_ready: item.publish_ready,
      materialization_rate: item.materialization_rate,
      freshsales_sync_rate: item.freshsales_sync_rate,
    })),
    top_blockers: blockers
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}

function getHmadvFinanceAdminDefaultSettings(env = {}) {
  return {
    backfill_limit: Math.max(1, Math.min(200, Number(getCleanEnvValue(env.HMADV_FINANCE_BACKFILL_LIMIT) || 50) || 50)),
    materialize_workspace_id: getCleanEnvValue(env.HMADV_WORKSPACE_ID) || null,
    reprocess_limit: Math.max(1, Number(getCleanEnvValue(env.HMADV_FINANCE_REPROCESS_LIMIT) || 3000) || 3000),
    publish_limit: Math.max(1, Number(getCleanEnvValue(env.HMADV_FINANCE_PUBLISH_LIMIT) || 50) || 50),
    crm_events_limit: Math.max(1, Number(getCleanEnvValue(env.HMADV_FINANCE_CRM_EVENTS_LIMIT) || 50) || 50),
    freshsales_owner_id: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || getCleanEnvValue(env.FS_OWNER_ID) || null,
  };
}

function sanitizeHmadvFinanceAdminSettings(input = {}, env = {}) {
  const defaults = getHmadvFinanceAdminDefaultSettings(env);
  const next = { ...defaults, ...(input && typeof input === "object" ? input : {}) };
  return {
    backfill_limit: Math.max(1, Math.min(200, Number(next.backfill_limit || defaults.backfill_limit) || defaults.backfill_limit)),
    materialize_workspace_id: String(next.materialize_workspace_id || "").trim() || null,
    reprocess_limit: Math.max(1, Number(next.reprocess_limit || defaults.reprocess_limit) || defaults.reprocess_limit),
    publish_limit: Math.max(1, Number(next.publish_limit || defaults.publish_limit) || defaults.publish_limit),
    crm_events_limit: Math.max(1, Number(next.crm_events_limit || defaults.crm_events_limit) || defaults.crm_events_limit),
    freshsales_owner_id: String(next.freshsales_owner_id || defaults.freshsales_owner_id || "").trim() || null,
  };
}

async function loadHmadvFinanceAdminSettings(env) {
  try {
    const rows = await fetchSupabaseSchema(
      env,
      "hmadv_finance_admin_settings?select=key,value,description,updated_at&key=eq.default&limit=1",
      { schema: "public" }
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    const persisted = safeJsonParse(row?.value, {});
    return {
      key: row?.key || "default",
      description: row?.description || "Configuracao operacional do modulo administrativo financeiro HMADV.",
      updated_at: row?.updated_at || null,
      value: sanitizeHmadvFinanceAdminSettings(persisted, env),
    };
  } catch {
    return {
      key: "default",
      description: "Configuracao operacional do modulo administrativo financeiro HMADV.",
      updated_at: null,
      value: getHmadvFinanceAdminDefaultSettings(env),
    };
  }
}

export async function updateHmadvFinanceAdminConfig(env, payload = {}) {
  const current = await loadHmadvFinanceAdminSettings(env);
  const merged = sanitizeHmadvFinanceAdminSettings({
    ...(current?.value || {}),
    ...(payload?.settings || {}),
  }, env);

  await fetchSupabaseSchema(
    env,
    "hmadv_finance_admin_settings?on_conflict=key",
    {
      schema: "public",
      init: {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{
          key: "default",
          description: "Configuracao operacional do modulo administrativo financeiro HMADV.",
          value: merged,
        }]),
      },
    }
  );

  return loadHmadvFinanceAdminSettings(env);
}

export async function getHmadvFinanceAdminConfig(env = {}) {
  const settings = await loadHmadvFinanceAdminSettings(env);
  const values = settings?.value || getHmadvFinanceAdminDefaultSettings(env);
  return {
    settings,
    endpoints: {
      overview: {
        method: "GET",
        path: "/api/admin-hmadv-financeiro",
        query: { action: "overview" },
      },
      search_processes: {
        method: "GET",
        path: "/api/admin-hmadv-financeiro",
        query: { action: "search_processes" },
      },
      run_operation: {
        method: "POST",
        path: "/api/admin-hmadv-financeiro",
        body: { action: "run_operation" },
      },
      backfill_textual_accounts: {
        method: "POST",
        path: "/api/admin-hmadv-financeiro",
        body: { action: "backfill_textual_accounts" },
      },
      resolve_account_rows: {
        method: "POST",
        path: "/api/admin-hmadv-financeiro",
        body: { action: "resolve_account_rows" },
      },
    },
    operations: [
      {
        key: "refresh_freshsales_token",
        label: "Renovar token Freshsales",
        helper: "Atualiza o access token persistido no backend antes de publicar deals.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {},
      },
      {
        key: "backfill_textual_accounts",
        label: "Backfill de accounts textuais",
        helper: "Cria ou vincula Sales Accounts a partir do processo textual quando ainda nao existe account resolvido.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "backfill_textual_accounts",
        payload: {
          limit: values.backfill_limit,
        },
      },
      {
        key: "materialize_latest_run",
        label: "Materializar staging",
        helper: "Transforma rows importadas em contratos e recebiveis canonicos.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {
          workspace_id: values.materialize_workspace_id,
        },
      },
      {
        key: "reprocess_billing",
        label: "Reprocessar pendencias",
        helper: "Recalcula rows que ja ganharam contact, account ou processo.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {
          limit: values.reprocess_limit,
          workspace_id: values.materialize_workspace_id,
        },
      },
      {
        key: "publish_deals",
        label: "Publicar deals no Freshsales",
        helper: "Tenta criar ou atualizar deals a partir dos recebiveis aptos.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {
          limit: values.publish_limit,
        },
      },
      {
        key: "diagnose_freshsales_auth",
        label: "Diagnosticar autenticacao Freshsales",
        helper: "Valida as bases e credenciais efetivas do Freshsales.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {},
      },
      {
        key: "process_crm_events",
        label: "Processar fila CRM",
        helper: "Aplica eventos pendentes de sincronismo do CRM.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {
          limit: values.crm_events_limit,
        },
      },
      {
        key: "export_accounts_import",
        label: "Exportar CSV de accounts",
        helper: "Gera import manual de Sales Accounts para destravar processos sem account.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {},
      },
      {
        key: "export_deals_import",
        label: "Exportar CSV de deals",
        helper: "Gera import manual de Deals para concluir a migracao historica.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {},
      },
      {
        key: "report_ops",
        label: "Gerar relatorio ops",
        helper: "Atualiza a fotografia operacional da base financeira HMADV.",
        endpoint: "/api/admin-hmadv-financeiro",
        method: "POST",
        action: "run_operation",
        payload: {},
      },
    ],
  };
}

export async function getHmadvFinanceAdminOverview(env) {
  const config = await getHmadvFinanceAdminConfig(env);
  const [
    importRuns,
    importRows,
    contracts,
    receivables,
    contacts,
    dealsRegistry,
    crmQueue,
  ] = await Promise.all([
    fetchSupabaseAdminAll(
      env,
      "billing_import_runs?select=id,source_name,source_file,status,total_rows,valid_rows,error_rows,started_at,completed_at,summary&order=started_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_import_rows?select=id,import_run_id,person_name,email,invoice_number,due_date,matching_status,resolved_contact_id,resolved_account_id_freshsales,resolved_process_reference,deal_reference_raw,product_family_inferred,billing_type_inferred,validation_errors,is_duplicate,created_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_contracts?select=id,title,status,process_reference,freshsales_contact_id,freshsales_account_id,metadata,created_at,updated_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_receivables?select=id,contract_id,contact_id,source_import_row_id,freshsales_deal_id,freshsales_account_id,receivable_type,invoice_number,description,due_date,status,amount_original,balance_due,balance_due_corrected,created_at,updated_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "freshsales_contacts?select=id,name,email,freshsales_contact_id,created_at,updated_at&order=updated_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "freshsales_deals_registry?select=id,billing_receivable_id,freshsales_deal_id,freshsales_account_id,last_sync_status,last_sync_error,last_synced_at,created_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "crm_event_queue?select=id,event_type,status,error,attempts,scheduled_at,processed_at,created_at&order=created_at.desc"
    ),
  ]);

  const contractsById = new Map(contracts.map((item) => [String(item.id), item]));
  const contactsById = new Map(contacts.map((item) => [String(item.id), item]));
  const runsById = new Map(importRuns.map((item) => [String(item.id), item]));
  const importStatusCounts = buildStatusCounts(importRows, "matching_status");
  const receivableStatusCounts = buildStatusCounts(receivables, "status");
  const dealSyncCounts = buildStatusCounts(dealsRegistry, "last_sync_status");
  const crmQueueCounts = buildStatusCounts(crmQueue, "status");
  const sourceCounts = buildImportSourceCounts(importRows, runsById);
  const resolution = deriveResolutionStats(importRows, receivables, contracts);
  const migrationProgressBySource = deriveMigrationProgressBySource(importRows, receivables, runsById);
  const executiveSummary = deriveExecutiveMigrationSummary({
    importRows,
    receivables,
    resolution,
    migrationProgressBySource,
  });

  const publishReady = receivables.filter((item) => item.contact_id && item.freshsales_account_id && !item.freshsales_deal_id).length;
  const portalReady = receivables.filter((item) => item.contact_id).length;
  const canonicalAmount = receivables.reduce((sum, item) => sum + toNumber(item.balance_due_corrected ?? item.balance_due ?? item.amount_original), 0);
  const openAmount = receivables
    .filter((item) => !["pago", "encerrado"].includes(normalizeText(item.status)))
    .reduce((sum, item) => sum + toNumber(item.balance_due_corrected ?? item.balance_due ?? item.amount_original), 0);

  return {
    generated_at: new Date().toISOString(),
    config,
    overview: {
      import_runs: importRuns.length,
      import_rows: importRows.length,
      contacts: contacts.length,
      contracts: contracts.length,
      receivables: receivables.length,
      deals_registry: dealsRegistry.length,
      crm_queue: crmQueue.length,
      publish_ready: publishReady,
      portal_ready: portalReady,
      canonical_amount: canonicalAmount,
      open_amount: openAmount,
    },
    freshsales_auth: buildFreshsalesAuthSnapshot(env),
    resolution,
    executive_summary: executiveSummary,
    counts: {
      import_status: importStatusCounts,
      receivable_status: receivableStatusCounts,
      deal_sync_status: dealSyncCounts,
      crm_queue_status: crmQueueCounts,
      import_sources: sourceCounts,
    },
    migration_progress_by_source: migrationProgressBySource,
    recent_import_runs: importRuns.slice(0, 8).map((row) => ({
      id: row.id,
      source_name: row.source_name || null,
      source_file: basename(row.source_file || ""),
      status: row.status || null,
      total_rows: row.total_rows || 0,
      valid_rows: row.valid_rows || 0,
      error_rows: row.error_rows || 0,
      started_at: row.started_at || null,
      completed_at: row.completed_at || null,
    })),
    recent_receivables: receivables.slice(0, 20).map((row) => formatRecentReceivable(row, contractsById, contactsById)),
    pending_account_rows: importRows
      .filter((item) => item.matching_status === "pendente_account")
      .slice(0, 30)
      .map((row) => formatPendingRow(row, contactsById, runsById)),
    pending_contact_rows: importRows
      .filter((item) => item.matching_status === "pendente_contato")
      .slice(0, 20)
      .map((row) => formatPendingRow(row, contactsById, runsById)),
    deal_failures: dealsRegistry
      .filter((item) => normalizeText(item.last_sync_status) === "error")
      .slice(0, 15)
      .map((item) => ({
        id: item.id,
        billing_receivable_id: item.billing_receivable_id || null,
        freshsales_deal_id: item.freshsales_deal_id || null,
        freshsales_account_id: item.freshsales_account_id || null,
        last_sync_error: item.last_sync_error || null,
        last_synced_at: item.last_synced_at || null,
      })),
    crm_queue_backlog: crmQueue
      .filter((item) => normalizeText(item.status) !== "processed")
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        event_type: item.event_type || null,
        status: item.status || null,
        attempts: item.attempts || 0,
        error: item.error || null,
        created_at: item.created_at || null,
      })),
    diagnostics: {
      contracts_textual_only_share: contracts.length
        ? Number(((resolution.contracts_textual_only / contracts.length) * 100).toFixed(2))
        : 0,
      receivables_without_account_share: receivables.length
        ? Number(((resolution.receivables_without_account / receivables.length) * 100).toFixed(2))
        : 0,
      import_sources_detected: Object.keys(sourceCounts).length,
      ready_for_freshsales_publish: publishReady > 0,
      executive_sync_rate: executiveSummary.freshsales_sync_rate_over_materialized,
      executive_materialization_rate: executiveSummary.materialization_rate,
    },
  };
}

export async function getHmadvFinanceOperationGuidance(env, operation = null) {
  const [contracts, receivables, importRows] = await Promise.all([
    fetchSupabaseAdminAll(
      env,
      "billing_contracts?select=id,freshsales_account_id,metadata"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_receivables?select=id,contact_id,freshsales_account_id,freshsales_deal_id,status"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_import_rows?select=id,matching_status"
    ),
  ]);

  const contractsTextualOnly = contracts.filter((item) => safeJsonParse(item.metadata, {}).account_resolution_status === "textual_only").length;
  const pendingAccount = importRows.filter((item) => item.matching_status === "pendente_account").length;
  const pendingContact = importRows.filter((item) => item.matching_status === "pendente_contato").length;
  const receivablesWithoutAccount = receivables.filter((item) => !item.freshsales_account_id).length;
  const publishReady = receivables.filter((item) => item.contact_id && item.freshsales_account_id && !item.freshsales_deal_id).length;
  const publishedDeals = receivables.filter((item) => item.freshsales_deal_id).length;

  const nextSteps = [];
  if (pendingContact > 0) {
    nextSteps.push("Resolver ou importar contacts pendentes antes de tentar publicar 100% dos deals.");
  }
  if (pendingAccount > 0 || receivablesWithoutAccount > 0 || contractsTextualOnly > 0) {
    nextSteps.push("Executar backfill de accounts textuais ou importar Sales Accounts via CSV para reduzir contratos textual_only.");
  }
  if (publishReady > 0) {
    nextSteps.push("Executar publicacao direta de deals no Freshsales para os recebiveis ja aptos.");
  }
  if (!publishReady && receivablesWithoutAccount > 0) {
    nextSteps.push("Gerar CSV de accounts e deals para concluir a migracao historica diretamente pelo importador do Freshsales.");
  }

  const fallback = {
    should_export_accounts_csv: pendingAccount > 0 || receivablesWithoutAccount > 0 || contractsTextualOnly > 0,
    should_export_deals_csv: publishReady === 0 && receivablesWithoutAccount > 0,
    should_retry_publish: publishReady > 0,
  };

  return {
    operation,
    snapshot: {
      pending_contact: pendingContact,
      pending_account: pendingAccount,
      contracts_textual_only: contractsTextualOnly,
      receivables_without_account: receivablesWithoutAccount,
      publish_ready: publishReady,
      published_deals: publishedDeals,
    },
    fallback,
    next_steps: nextSteps,
  };
}

function formatProcessCandidate(item, source = "processos", matchedBy = "query") {
  return {
    id: item.id,
    numero_cnj: item.numero_cnj || null,
    numero_processo: item.numero_processo || null,
    titulo: item.titulo || null,
    account_id_freshsales: item.account_id_freshsales || null,
    status: item.status_atual_processo || item.status || null,
    source,
    matched_by: matchedBy,
    label: item.numero_cnj || item.numero_processo || item.titulo || item.id,
  };
}

async function updateFinanceImportRow(env, rowId, patch) {
  await fetchSupabaseSchema(
    env,
    `billing_import_rows?id=eq.${encodeURIComponent(String(rowId))}`,
    {
      schema: "public",
      init: {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      },
    }
  );
}

async function loadFinanceImportRowsByIds(env, rowIds = []) {
  if (!rowIds.length) return [];
  return fetchSupabaseSchema(
    env,
    `billing_import_rows?select=id,person_name,email,email_normalized,invoice_number,due_date,matching_status,resolved_contact_id,resolved_process_id,resolved_account_id_freshsales,resolved_process_reference,deal_reference_raw,product_family_inferred,billing_type_inferred,validation_errors&id=in.(${rowIds.map((item) => `"${item}"`).join(",")})`,
    { schema: "public" }
  );
}

async function findFinancePartesByPersonName(env, personName, limit = 20) {
  const normalizedName = normalizeText(personName);
  if (!normalizedName) return { exact: [], broad: [], processos: [] };

  const encodedLike = encodeURIComponent(`*${String(personName || "").replace(/\*/g, "").trim()}*`);
  const partes = await fetchSupabaseSchema(
    env,
    `partes?select=id,processo_id,nome,polo,tipo_pessoa,contato_freshsales_id,cliente_hmadv,representada_pelo_escritorio,principal_no_account&nome=ilike.${encodedLike}&limit=${Math.max(5, Math.min(limit, 50))}`,
    { schema: "judiciario" }
  ).catch(() => []);

  const safePartes = Array.isArray(partes) ? partes : [];
  const exact = safePartes.filter((item) => normalizeText(item?.nome) === normalizedName);
  const processIds = uniqueBy(
    safePartes.map((item) => item?.processo_id).filter(Boolean),
    (item) => item
  );

  const processos = processIds.length
    ? await fetchSupabaseSchema(
        env,
        `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo,updated_at&id=in.(${processIds.map((item) => `"${item}"`).join(",")})&limit=${Math.max(processIds.length, 1)}`,
        { schema: "judiciario" }
      ).catch(() => [])
    : [];

  return {
    exact,
    broad: safePartes,
    processos: Array.isArray(processos) ? processos : [],
  };
}

function chooseFinanceProcessCandidate(row, parteProcessCandidates = [], searchedCandidates = []) {
  const explicitReferences = [
    normalizeText(row?.resolved_process_reference),
    normalizeText(row?.deal_reference_raw),
    normalizeText(row?.invoice_number),
  ].filter(Boolean);

  const merged = uniqueBy(
    [
      ...parteProcessCandidates.map((item) => formatProcessCandidate(item, "partes", "nome_da_parte")),
      ...searchedCandidates.map((item) => ({ ...item })),
    ],
    (item) => item.id
  );

  for (const candidate of merged) {
    const corpus = [
      normalizeText(candidate?.numero_cnj),
      normalizeText(candidate?.numero_processo),
      normalizeText(candidate?.titulo),
      normalizeText(candidate?.account_id_freshsales),
    ].filter(Boolean);
    if (explicitReferences.some((reference) => corpus.some((piece) => piece && piece.includes(reference)))) {
      return candidate;
    }
  }

  const withAccount = merged.filter((item) => cleanValue(item?.account_id_freshsales));
  if (withAccount.length === 1) return withAccount[0];
  if (merged.length === 1) return merged[0];
  return null;
}

export async function searchHmadvFinanceProcessCandidates(env, rawQuery, limit = 20) {
  const query = String(rawQuery || "").trim();
  if (!query) {
    return { items: [], query };
  }

  const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const encodedLike = `*${query.replace(/\*/g, "")}*`;
  const processPath = `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo,updated_at&or=(numero_cnj.ilike.${encodeURIComponent(encodedLike)},numero_processo.ilike.${encodeURIComponent(encodedLike)},titulo.ilike.${encodeURIComponent(encodedLike)},account_id_freshsales.ilike.${encodeURIComponent(encodedLike)})&order=updated_at.desc&limit=${normalizedLimit}`;

  const [directProcesses, relatedPartes] = await Promise.all([
    fetchSupabaseSchema(env, processPath, { schema: "judiciario" }).catch(() => []),
    fetchSupabaseSchema(
      env,
      `partes?select=processo_id,nome,polo,tipo_contato&nome=ilike.${encodeURIComponent(encodedLike)}&limit=${normalizedLimit * 3}`,
      { schema: "judiciario" }
    ).catch(() => []),
  ]);

  const processIdsFromPartes = uniqueBy(
    (Array.isArray(relatedPartes) ? relatedPartes : []).map((item) => item?.processo_id).filter(Boolean),
    (item) => item
  );

  let parteProcesses = [];
  if (processIdsFromPartes.length) {
    parteProcesses = await fetchSupabaseSchema(
      env,
      `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo,updated_at&id=in.(${processIdsFromPartes.map((item) => `"${item}"`).join(",")})&limit=${normalizedLimit * 2}`,
      { schema: "judiciario" }
    ).catch(() => []);
  }

  const merged = uniqueBy(
    [
      ...(Array.isArray(directProcesses) ? directProcesses.map((item) => formatProcessCandidate(item, "processos", "query")) : []),
      ...(Array.isArray(parteProcesses) ? parteProcesses.map((item) => formatProcessCandidate(item, "partes", "nome_da_parte")) : []),
    ],
    (item) => item.id
  ).slice(0, normalizedLimit);

  return {
    query,
    items: merged,
  };
}

export async function resolveHmadvFinancePendingAccounts(env, payload = {}) {
  const rowIds = uniqueBy(Array.isArray(payload.rowIds) ? payload.rowIds.filter(Boolean) : [], (item) => item);
  if (!rowIds.length) {
    throw new Error("Nenhuma linha pendente foi informada para reconciliacao.");
  }

  let processRow = null;
  if (payload.processId) {
    const rows = await fetchSupabaseSchema(
      env,
      `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo&id=eq.${encodeURIComponent(payload.processId)}&limit=1`,
      { schema: "judiciario" }
    );
    processRow = Array.isArray(rows) ? rows[0] || null : null;
  }

  const explicitAccountId = String(payload.freshsalesAccountId || processRow?.account_id_freshsales || "").trim() || null;
  const explicitProcessReference =
    String(payload.processReference || processRow?.numero_cnj || processRow?.numero_processo || processRow?.titulo || "").trim() || null;
  const explicitProcessId = processRow?.id || payload.processId || null;

  if (!explicitAccountId && !explicitProcessReference) {
    throw new Error("Informe um processo ou account do Freshsales para concluir a reconciliacao.");
  }

  const rows = await fetchSupabaseSchema(
    env,
    `billing_import_rows?select=id,resolved_contact_id,matching_status&id=in.(${rowIds.map((item) => `"${item}"`).join(",")})`,
    { schema: "public" }
  );

  const updates = await Promise.all(
    (Array.isArray(rows) ? rows : []).map(async (row) => {
      const nextStatus = row?.resolved_contact_id ? "pareado" : "pendente_contato";
      await fetchSupabaseSchema(
        env,
        `billing_import_rows?id=eq.${encodeURIComponent(row.id)}`,
        {
          schema: "public",
          init: {
            method: "PATCH",
            headers: {
              Prefer: "return=minimal",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resolved_process_id: explicitProcessId,
              resolved_account_id_freshsales: explicitAccountId,
              resolved_process_reference: explicitProcessReference,
              matching_status: nextStatus,
            }),
          },
        }
      );
      return {
        id: row.id,
        matching_status: nextStatus,
      };
    })
  );

  return {
    updated: updates.length,
    process: processRow ? formatProcessCandidate(processRow, "processos", "manual") : null,
    freshsales_account_id: explicitAccountId,
    process_reference: explicitProcessReference,
    rows: updates,
  };
}

export async function resolveHmadvFinancePendingContacts(env, payload = {}) {
  const rowIds = uniqueBy(Array.isArray(payload.rowIds) ? payload.rowIds.filter(Boolean) : [], (item) => item);
  if (!rowIds.length) {
    throw new Error("Nenhuma linha pendente de contato foi informada.");
  }

  const rows = await loadFinanceImportRowsByIds(env, rowIds);
  const processed = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const personName = firstNonEmpty(row?.person_name, row?.email, row?.invoice_number);
    if (!personName) {
      await updateFinanceImportRow(env, row.id, {
        matching_status: "pendente_revisao",
      });
      processed.push({
        id: row.id,
        created_contact: null,
        linked_partes: 0,
        matching_status: "pendente_revisao",
        error: "Linha sem nome ou email para criar contato.",
        possible_processes: [],
      });
      continue;
    }

    const created = await createContact(env, {
      name: row.person_name || row.email,
      type: "Cliente",
      email: row.email || row.email_normalized || null,
      externalId: `hmadv:financeiro:import_row:${row.id}`,
    });

    const createdContactId = String(created?.id || "").trim();
    if (!createdContactId) {
      throw new Error(`Freshsales nao retornou id para a linha ${row.id}.`);
    }

    const parteMatches = await findFinancePartesByPersonName(env, row.person_name || row.email || "", 30);
    const exactUnlinkedPartes = (parteMatches.exact || []).filter((item) => !cleanValue(item?.contato_freshsales_id));

    if (exactUnlinkedPartes.length) {
      await linkPartesToExistingContact(env, {
        parteIds: exactUnlinkedPartes.map((item) => item.id),
        contactId: createdContactId,
        type: "Cliente",
      });
    }

    const searchedCandidates = [];
    const searchQueries = uniqueBy(
      [row?.resolved_process_reference, row?.deal_reference_raw, row?.person_name].filter(Boolean),
      (item) => item
    );
    for (const query of searchQueries) {
      const result = await searchHmadvFinanceProcessCandidates(env, query, 10);
      searchedCandidates.push(...(Array.isArray(result?.items) ? result.items : []));
    }

    const chosenProcess = chooseFinanceProcessCandidate(row, parteMatches.processos || [], searchedCandidates);
    const nextAccountId = cleanValue(row?.resolved_account_id_freshsales) || cleanValue(chosenProcess?.account_id_freshsales) || null;
    const nextProcessReference =
      cleanValue(row?.resolved_process_reference) ||
      cleanValue(chosenProcess?.numero_cnj) ||
      cleanValue(chosenProcess?.numero_processo) ||
      cleanValue(chosenProcess?.titulo) ||
      cleanValue(row?.deal_reference_raw) ||
      null;
    const nextStatus = nextAccountId || chosenProcess?.id ? "pareado" : "pendente_account";

    await updateFinanceImportRow(env, row.id, {
      resolved_contact_id: createdContactId,
      resolved_process_id: chosenProcess?.id || row?.resolved_process_id || null,
      resolved_account_id_freshsales: nextAccountId,
      resolved_process_reference: nextProcessReference,
      matching_status: nextStatus,
    });

    processed.push({
      id: row.id,
      created_contact: {
        id: createdContactId,
        name: [created?.first_name, created?.last_name].filter(Boolean).join(" ").trim() || row.person_name || row.email || "Contato criado",
        email: row.email || row.email_normalized || null,
      },
      linked_partes: exactUnlinkedPartes.length,
      matching_status: nextStatus,
      process: chosenProcess || null,
      possible_processes: uniqueBy(
        [
          ...(parteMatches.processos || []).map((item) => formatProcessCandidate(item, "partes", "nome_da_parte")),
          ...searchedCandidates,
        ],
        (item) => item.id
      ).slice(0, 10),
    });
  }

  return {
    updated: processed.length,
    contacts_created: processed.filter((item) => item.created_contact?.id).length,
    partes_linked: processed.reduce((sum, item) => sum + Number(item.linked_partes || 0), 0),
    matched_processes: processed.filter((item) => item.process?.id).length,
    rows: processed,
  };
}

function extractSalesAccountProcessReference(account) {
  return firstNonEmpty(
    account?.custom_field?.cf_processo,
    account?.custom_fields?.cf_processo,
    account?.cf_processo,
    account?.name
  );
}

function mapSalesAccountByReference(accounts = []) {
  const byReference = new Map();
  for (const account of accounts) {
    const keys = [
      normalizeText(account?.name),
      normalizeText(extractSalesAccountProcessReference(account)),
    ].filter(Boolean);
    for (const key of keys) {
      if (!byReference.has(key)) byReference.set(key, account);
    }
  }
  return byReference;
}

async function createTextualFreshsalesAccount(env, processReference, { ownerId: ownerIdOverride } = {}) {
  const title = String(processReference || "").trim();
  if (!title) {
    throw new Error("Referencia textual do processo ausente para criar Sales Account.");
  }

  const ownerId = Number(ownerIdOverride || getCleanEnvValue(env.FRESHSALES_OWNER_ID) || getCleanEnvValue(env.FS_OWNER_ID) || "31000147944");
  const { payload } = await freshsalesRequest(env, "/sales_accounts", {
    method: "POST",
    body: JSON.stringify({
      sales_account: {
        name: title.slice(0, 255),
        owner_id: ownerId,
        custom_field: {
          cf_processo: title,
        },
        custom_fields: {
          cf_processo: title,
        },
      },
    }),
  });

  const account = payload?.sales_account || payload || null;
  const accountId = String(account?.id || "").trim();
  if (!accountId) {
    throw new Error("Freshsales nao retornou Sales Account para a referencia textual.");
  }

  return {
    id: accountId,
    name: account?.name || title,
    cf_processo: title,
    source: "created",
  };
}

async function createTextualFreshsalesAccountWithRetry(env, processReference, options = {}, maxAttempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await createTextualFreshsalesAccount(env, processReference, options);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (status !== 429 || attempt >= maxAttempts) break;
      const delayMs = attempt * 2000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("Falha ao criar Sales Account textual no Freshsales.");
}

export async function backfillHmadvFinanceAccounts(env, { limit = 50, ownerId = null } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const contracts = await fetchSupabaseAdminAll(
    env,
    `billing_contracts?select=id,process_reference,freshsales_account_id,metadata&freshsales_account_id=is.null&process_reference=not.is.null&order=created_at.asc&limit=${safeLimit}`
  );

  if (!contracts.length) {
    return {
      scanned: 0,
      linked_existing: 0,
      created_accounts: 0,
      updated_contracts: 0,
      updated_receivables: 0,
      items: [],
    };
  }

  let accounts = [];
  try {
    accounts = await listFreshsalesSalesAccountsFromViews(env, { maxPages: 2, perPage: 100 });
  } catch {
    accounts = [];
  }
  const byReference = mapSalesAccountByReference(accounts);

  const items = [];
  let linkedExisting = 0;
  let createdAccounts = 0;
  let updatedContracts = 0;
  let updatedReceivables = 0;
  let failed = 0;

  for (const contract of contracts) {
    const processReference = String(contract.process_reference || "").trim();
    if (!processReference) continue;

    try {
      const key = normalizeText(processReference);
      let account = byReference.get(key) || null;
      let mode = "linked_existing";

      if (!account) {
        account = await createTextualFreshsalesAccountWithRetry(env, processReference, { ownerId });
        byReference.set(key, account);
        mode = "created";
        createdAccounts += 1;
        await new Promise((resolve) => setTimeout(resolve, 400));
      } else {
        linkedExisting += 1;
      }

      await fetchSupabaseSchema(
        env,
        `billing_contracts?id=eq.${encodeURIComponent(contract.id)}`,
        {
          schema: "public",
          init: {
            method: "PATCH",
            headers: {
              Prefer: "return=minimal",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              freshsales_account_id: String(account.id),
              metadata: {
                ...safeJsonParse(contract.metadata, {}),
                account_resolution_status: mode === "created" ? "created_textual_account" : "linked_textual_account",
              },
            }),
          },
        }
      );
      updatedContracts += 1;

      await fetchSupabaseSchema(
        env,
        `billing_receivables?contract_id=eq.${encodeURIComponent(contract.id)}`,
        {
          schema: "public",
          init: {
            method: "PATCH",
            headers: {
              Prefer: "return=minimal",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              freshsales_account_id: String(account.id),
            }),
          },
        }
      );

      const receivableRows = await fetchSupabaseSchema(
        env,
        `billing_receivables?select=id&contract_id=eq.${encodeURIComponent(contract.id)}&limit=1000`,
        { schema: "public" }
      );
      updatedReceivables += Array.isArray(receivableRows) ? receivableRows.length : 0;

      items.push({
        contract_id: contract.id,
        process_reference: processReference,
        freshsales_account_id: String(account.id),
        mode,
        account_name: account.name || processReference,
      });
    } catch (error) {
      failed += 1;
      items.push({
        contract_id: contract.id,
        process_reference: processReference,
        mode: "error",
        error: String(error?.message || error).slice(0, 500),
      });
    }
  }

  return {
    scanned: contracts.length,
    linked_existing: linkedExisting,
    created_accounts: createdAccounts,
    updated_contracts: updatedContracts,
    updated_receivables: updatedReceivables,
    failed,
    items,
  };
}
