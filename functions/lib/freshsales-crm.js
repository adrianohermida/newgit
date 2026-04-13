import { getCleanEnvValue, getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
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

function decodeJwtPayload(token) {
  const raw = getCleanEnvValue(token);
  if (!raw || !raw.includes(".")) return null;
  try {
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4;
    const payloadBase64 = normalized + (pad ? "=".repeat(4 - pad) : "");
    const payload = JSON.parse(atob(payloadBase64));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function buildFreshsalesAuthDiagnostic(env) {
  const tokenPayload = decodeJwtPayload(env.FRESHSALES_ACCESS_TOKEN);
  const scope = Array.isArray(tokenPayload?.scope)
    ? tokenPayload.scope.slice(0, 8)
    : typeof tokenPayload?.scope === "string"
      ? String(tokenPayload.scope).split(/\s+/).slice(0, 8)
      : [];
  return {
    org_domain_env: resolveOauthOrgDomain(env),
    token_iss: getCleanEnvValue(tokenPayload?.iss) || null,
    token_org_domain: getCleanEnvValue(tokenPayload?.organisation_domain) || getCleanEnvValue(tokenPayload?.org_domain) || null,
    token_aud: getCleanEnvValue(tokenPayload?.aud) || null,
    token_scope_sample: scope,
  };
}

function extractFreshsalesTokenScopes(token) {
  const tokenPayload = decodeJwtPayload(token);
  if (Array.isArray(tokenPayload?.scope)) {
    return tokenPayload.scope.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof tokenPayload?.scope === "string") {
    return String(tokenPayload.scope)
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function tokenNeedsFreshsalesScopeRefresh(token, kind = "deals") {
  const scopes = extractFreshsalesTokenScopes(token);
  if (!scopes.length) return false;
  const requiredScopes =
    kind === "contacts"
      ? ["freshsales.contacts.view", "freshsales.contacts.create", "freshsales.contacts.edit"]
      : kind === "products"
        ? ["freshsales.products.view"]
        : ["freshsales.sales_activities.create", "freshsales.selectors.view"];
  return requiredScopes.some((scope) => !scopes.includes(scope));
}

function isOauthAuthFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "");
  const payloadText = JSON.stringify(error?.payload || {});
  return status === 401 && /invalid signature|token has expired|login failed|invalid scopes/i.test(`${message} ${payloadText}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfterMs(response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function buildCandidates(env) {
  const raw = resolveFreshsalesBase(env);
  const orgDomain = resolveOauthOrgDomain(env);
  const candidates = [];
  const addCandidate = (value) => {
    if (!value) return;
    if (!candidates.includes(value)) candidates.push(value);
  };
  const pushHostVariants = (host) => {
    if (!host) return;
    const normalized = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (normalized.includes("myfreshworks.com")) {
      addCandidate(`https://${normalized.replace(/myfreshworks\.com$/i, "freshsales.io")}/crm/sales/api`);
      addCandidate(`https://${normalized.replace(/myfreshworks\.com$/i, "freshsales.io")}/api`);
    } else if (normalized.endsWith(".freshsales.io")) {
      addCandidate(`https://${normalized.replace(/\.freshsales\.io$/i, ".myfreshworks.com")}/crm/sales/api`);
      addCandidate(`https://${normalized.replace(/\.freshsales\.io$/i, ".myfreshworks.com")}/api`);
    }
  };

  if (raw) {
    const base = raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;

    if (base.includes("/crm/sales/api")) {
      addCandidate(base);
      addCandidate(base.replace(/\/crm\/sales\/api$/i, "/api"));
      pushHostVariants(base);
    } else if (base.includes("/api")) {
      const host = base.replace(/^https?:\/\//i, "").replace(/\/api\/?$/i, "");
      addCandidate(`https://${host}/crm/sales/api`);
      addCandidate(`https://${host}/api`);
      pushHostVariants(host);
    } else {
      addCandidate(`${base}/crm/sales/api`);
      addCandidate(`${base}/api`);
      pushHostVariants(base);
    }
  }

  if (orgDomain) {
    addCandidate(`https://${orgDomain}/crm/sales/api`);
    addCandidate(`https://${orgDomain}/api`);
    pushHostVariants(orgDomain);
  }

  return candidates;
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

function getSupabaseRestBase(env) {
  const supabaseUrl =
    getCleanEnvValue(env.SUPABASE_URL) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) ||
    null;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
}

async function supabaseRestRequest(env, pathname, init = {}) {
  const base = getSupabaseRestBase(env);
  const serviceRoleKey = getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !serviceRoleKey) return null;

  const response = await fetch(`${base}/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }).catch(() => null);

  if (!response) return null;
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function resolveOauthOrgDomain(env) {
  const direct =
    getCleanEnvValue(env.FRESHSALES_ORG_DOMAIN) ||
    getCleanEnvValue(env.FRESHSALES_DOMAIN) ||
    getCleanEnvValue(env.FRESHSALES_ALIAS_DOMAIN) ||
    resolveFreshsalesBase(env) ||
    null;
  if (!direct) return null;

  const host = String(direct)
    .replace(/^https?:\/\//i, "")
    .replace(/\/(crm\/sales\/api|api|crm\/sales)\/?$/i, "")
    .replace(/\/+$/, "");

  if (host.includes("myfreshworks.com")) return host;
  if (host.endsWith(".freshsales.io")) return host.replace(/\.freshsales\.io$/i, ".myfreshworks.com");
  return host || null;
}

function resolveOauthRedirectUri(env) {
  return (
    getCleanEnvValue(env.FRESHSALES_REDIRECT_URI) ||
    getCleanEnvValue(env.REDIRECT_URI) ||
    getCleanEnvValue(env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    getCleanEnvValue(env.OAUTH_CALLBACK_URL) ||
    resolveSupabaseOAuthUrl(env, "callback")?.replace(/\?action=callback$/, "") ||
    null
  );
}

function resolveFreshsalesAuthKind(path = "") {
  const normalized = String(path || "").trim().toLowerCase();
  if (/^\/contacts(\/|$)/.test(normalized) || /^\/settings\/contacts(\/|$)/.test(normalized)) {
    return "contacts";
  }
  if (/^\/products(\/|$)/.test(normalized)) {
    return "products";
  }
  return "deals";
}

function resolveFreshsalesProvider(kind = "deals") {
  if (kind === "contacts") return "freshsales_contacts";
  if (kind === "products") return "freshsales_products";
  return "freshsales";
}

function resolveFreshsalesOauthClientId(env, kind = "deals") {
  if (kind === "contacts") {
    return (
      getCleanEnvValue(env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_CONTACT_OAUTH_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
      null
    );
  }
  if (kind === "products") {
    return (
      getCleanEnvValue(env.FRESHSALES_OAUTH_PRODUCTS_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_PRODUCT_OAUTH_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
      getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
      null
    );
  }
  return (
    getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_ID) ||
    getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
    getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
    null
  );
}

function resolveFreshsalesOauthClientSecret(env, kind = "deals") {
  if (kind === "contacts") {
    return (
      getCleanEnvValue(env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_CONTACT_OAUTH_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
      null
    );
  }
  if (kind === "products") {
    return (
      getCleanEnvValue(env.FRESHSALES_OAUTH_PRODUCTS_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_PRODUCT_OAUTH_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
      getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
      null
    );
  }
  return (
    getCleanEnvValue(env.FRESHSALES_OAUTH_CLIENT_SECRET) ||
    getCleanEnvValue(env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
    getCleanEnvValue(env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
    null
  );
}

function resolveFreshsalesOauthScope(env, kind = "deals") {
  if (kind === "contacts") {
    return (
      getCleanEnvValue(env.FRESHSALES_CONTACTS_SCOPES) ||
      getCleanEnvValue(env.FRESHSALES_CONTACT_SCOPES) ||
      getCleanEnvValue(env.FRESHSALES_SCOPES) ||
      null
    );
  }
  if (kind === "products") {
    return (
      getCleanEnvValue(env.FRESHSALES_PRODUCTS_SCOPES) ||
      getCleanEnvValue(env.FRESHSALES_PRODUCT_SCOPES) ||
      getCleanEnvValue(env.FRESHSALES_SCOPES) ||
      null
    );
  }
  return (
    getCleanEnvValue(env.FRESHSALES_SCOPES) ||
    getCleanEnvValue(env.FRESHSALES_DEALS_SCOPES) ||
    getCleanEnvValue(env.FRESHSALES_DEAL_SCOPES) ||
    null
  );
}

function resolveFreshsalesAccessToken(env, kind = "deals") {
  if (kind === "contacts") {
    return (
      getCleanEnvValue(env.FRESHSALES_CONTACTS_ACCESS_TOKEN) ||
      getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN) ||
      null
    );
  }
  if (kind === "products") {
    return (
      getCleanEnvValue(env.FRESHSALES_PRODUCTS_ACCESS_TOKEN) ||
      getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN) ||
      null
    );
  }
  return getCleanEnvValue(env.FRESHSALES_ACCESS_TOKEN) || null;
}

function resolveFreshsalesRefreshToken(env, kind = "deals") {
  if (kind === "contacts") {
    return (
      getCleanEnvValue(env.FRESHSALES_CONTACTS_REFRESH_TOKEN) ||
      getCleanEnvValue(env.FRESHSALES_REFRESH_TOKEN) ||
      null
    );
  }
  if (kind === "products") {
    return (
      getCleanEnvValue(env.FRESHSALES_PRODUCTS_REFRESH_TOKEN) ||
      getCleanEnvValue(env.FRESHSALES_REFRESH_TOKEN) ||
      null
    );
  }
  return getCleanEnvValue(env.FRESHSALES_REFRESH_TOKEN) || null;
}

function setFreshsalesAccessToken(env, kind = "deals", token = "") {
  if (kind === "contacts") env.FRESHSALES_CONTACTS_ACCESS_TOKEN = token;
  else if (kind === "products") env.FRESHSALES_PRODUCTS_ACCESS_TOKEN = token;
  else env.FRESHSALES_ACCESS_TOKEN = token;
}

async function getStoredOauthRow(env, kind = "deals") {
  const provider = resolveFreshsalesProvider(kind);
  const result = await supabaseRestRequest(
    env,
    `freshsales_oauth_tokens?provider=eq.${encodeURIComponent(provider)}&select=provider,access_token,refresh_token,expires_at,token_type,scope,updated_at&limit=1`
  );
  if (!result?.response?.ok) return null;
  return Array.isArray(result.payload) ? result.payload[0] || null : result.payload || null;
}

async function upsertStoredOauthRow(env, row, kind = "deals") {
  const provider = resolveFreshsalesProvider(kind);
  const result = await supabaseRestRequest(
    env,
    "freshsales_oauth_tokens?on_conflict=provider",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        ...row,
        provider,
      }),
    }
  );
  return Boolean(result?.response?.ok);
}

async function seedOauthRowFromEnv(env, kind = "deals") {
  const accessToken = resolveFreshsalesAccessToken(env, kind);
  const refreshToken = resolveFreshsalesRefreshToken(env, kind);
  if (!accessToken || !refreshToken) return false;

  const expiryTs = Number(getCleanEnvValue(env.FRESHSALES_TOKEN_EXPIRY) || "0");
  const fallbackExpiresIn = Number(getCleanEnvValue(env.FRESHSALES_EXPIRES_IN) || "1799");
  const expiresInSeconds = expiryTs > Date.now()
    ? Math.max(30, Math.round((expiryTs - Date.now()) / 1000))
    : fallbackExpiresIn;

  return upsertStoredOauthRow(env, {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    token_type: getCleanEnvValue(env.FRESHSALES_TOKEN_TYPE) || "Bearer",
    scope: resolveFreshsalesOauthScope(env, kind),
    updated_at: new Date().toISOString(),
  }, kind);
}

async function refreshOauthRow(env, refreshToken, kind = "deals") {
  const clientId = resolveFreshsalesOauthClientId(env, kind);
  const clientSecret = resolveFreshsalesOauthClientSecret(env, kind);
  const orgDomain = resolveOauthOrgDomain(env);
  const redirectUri = resolveOauthRedirectUri(env);
  if (!clientId || !clientSecret || !orgDomain || !redirectUri || !refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
  const basicAuth = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

  const response = await fetch(`https://${orgDomain}/org/oauth/v2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth,
    },
    body,
  }).catch(() => null);

  if (!response?.ok) return null;
  const payload = await response.json().catch(() => ({}));
  if (!payload?.access_token) return null;

  await upsertStoredOauthRow(env, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + Number(payload.expires_in || 1799) * 1000).toISOString(),
    token_type: payload.token_type || "Bearer",
    scope: payload.scope || resolveFreshsalesOauthScope(env, kind) || null,
    updated_at: new Date().toISOString(),
  }, kind);

  return payload.access_token;
}

async function ensureSupabaseOauthSeed(env, kind = "deals") {
  const seedUrl = resolveSupabaseOAuthUrl(env, "seed");
  const accessToken = resolveFreshsalesAccessToken(env, kind);
  const refreshToken = resolveFreshsalesRefreshToken(env, kind);
  if (!seedUrl || !accessToken || !refreshToken) return false;

  const response = await fetch(seedUrl, {
    method: "POST",
    headers: getSupabaseFunctionHeaders(env),
  }).catch(() => null);

  return Boolean(response?.ok);
}

async function getSupabaseOauthAccessToken(env, kind = "deals") {
  const tokenUrl = resolveSupabaseOAuthUrl(env, "token");
  if (tokenUrl) {
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
    if (initial?.missing) {
      const seeded = await ensureSupabaseOauthSeed(env, kind);
      if (seeded) {
        const retried = await requestToken();
        if (typeof retried === "string") return retried;
      }
    }
  }

  let row = await getStoredOauthRow(env, kind);
  if (!row) {
    const seeded = await seedOauthRowFromEnv(env, kind);
    if (seeded) {
      row = await getStoredOauthRow(env, kind);
    }
  }
  if (!row?.access_token) return null;

  const expiresAt = new Date(row.expires_at || 0).getTime();
  const shouldRefresh = row.refresh_token && (
    !expiresAt ||
    Date.now() >= expiresAt - 60_000 ||
    tokenNeedsFreshsalesScopeRefresh(row.access_token, kind)
  );
  if (shouldRefresh) {
    const refreshed = await refreshOauthRow(env, row.refresh_token, kind);
    if (refreshed) return refreshed;
  }

  return row.access_token;
}

async function getAuthHeaders(env, path = "") {
  const authKind = resolveFreshsalesAuthKind(path);
  const apiKey = getCleanEnvValue(env.FRESHSALES_API_KEY);
  const accessToken = resolveFreshsalesAccessToken(env, authKind);
  const basicAuth = getCleanEnvValue(env.FRESHSALES_BASIC_AUTH);
  const explicitMode = getCleanEnvValue(env.FRESHSALES_AUTH_MODE);
  const supabaseOauthToken = await getSupabaseOauthAccessToken(env, authKind);
  const headers = [
    apiKey ? { name: "api_key", header: { Authorization: `Token token=${apiKey}` } } : null,
    basicAuth ? { name: "basic_auth", header: /^Basic\s+/i.test(basicAuth) ? { Authorization: basicAuth } : { Authorization: `Basic ${basicAuth}` } } : null,
    supabaseOauthToken ? { name: "supabase_oauth", header: { Authorization: `Authtoken=${supabaseOauthToken}` } } : null,
    accessToken ? { name: "access_token", header: { Authorization: `Authtoken=${accessToken}` } } : null,
  ].filter(Boolean);

  if (explicitMode === "oauth") {
    headers.sort((left, right) => {
      const leftRank = left.name === "supabase_oauth" ? 0 : left.name === "access_token" ? 1 : 2;
      const rightRank = right.name === "supabase_oauth" ? 0 : right.name === "access_token" ? 1 : 2;
      return leftRank - rightRank;
    });
  } else if (!explicitMode && (supabaseOauthToken || accessToken)) {
    headers.sort((left, right) => {
      const rank = (name) => {
        if (name === "supabase_oauth") return 0;
        if (name === "access_token") return 1;
        if (name === "api_key") return 2;
        if (name === "basic_auth") return 3;
        return 4;
      };
      return rank(left.name) - rank(right.name);
    });
  } else if (explicitMode) {
    headers.sort((left, right) => (left.name === explicitMode ? -1 : right.name === explicitMode ? 1 : 0));
  }

  return headers;
}

async function forceRefreshFreshsalesOauthToken(env, path = "") {
  const authKind = resolveFreshsalesAuthKind(path);
  let row = await getStoredOauthRow(env, authKind);
  if (!row) {
    const seeded = await seedOauthRowFromEnv(env, authKind);
    if (seeded) row = await getStoredOauthRow(env, authKind);
  }
  const refreshToken = getCleanEnvValue(row?.refresh_token) || resolveFreshsalesRefreshToken(env, authKind);
  if (!refreshToken) return null;
  const refreshed = await refreshOauthRow(env, refreshToken, authKind);
  if (refreshed) setFreshsalesAccessToken(env, authKind, refreshed);
  return refreshed;
}

export async function freshsalesRequest(env, path, init = {}) {
  let refreshedAfter401 = false;
  let lastError = null;
  const attemptedAuthModes = [];

  for (let cycle = 0; cycle < 2; cycle += 1) {
    const candidates = buildCandidates(env);
    const authHeaders = await getAuthHeaders(env, path);
    if (!candidates.length || !authHeaders.length) {
      throw new Error("Credenciais do Freshsales ausentes no ambiente.");
    }

    lastError = null;
    for (const base of candidates) {
      for (const authEntry of authHeaders) {
        const authHeader = authEntry?.header || {};
        const authName = String(authEntry?.name || "unknown");
        if (!attemptedAuthModes.includes(authName)) attemptedAuthModes.push(authName);
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const response = await fetchWithTimeout(`${base}${path}`, {
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
          if (response.status === 429 && attempt < 3) {
            const retryMs = parseRetryAfterMs(response) ?? (1500 * (attempt + 1));
            await sleep(retryMs);
            continue;
          }
          if (!response.ok) {
            const err = new Error(
              payload.message ||
                payload.error ||
                `Freshsales request failed with status ${response.status} (${base}${path})`
            );
            err.status = response.status;
            err.payload = payload;
            err.base = base;
            err.path = path;
            lastError = err;
            break;
          }

          const method = String(init?.method || "GET").toUpperCase();
          const expectsEntityPayload =
            method === "GET" &&
            (/^\/contacts(\/|$)/.test(String(path || "")) ||
              /^\/sales_accounts(\/|$)/.test(String(path || "")) ||
              /^\/deals(\/|$)/.test(String(path || "")));
          const expectsCatalogPayload =
            method === "GET" &&
            (/^\/selector\//.test(String(path || "")) ||
              /^\/settings\//.test(String(path || "")));
          const emptyPayload =
            payload &&
            !Array.isArray(payload) &&
            typeof payload === "object" &&
            !Object.keys(payload).length;
          const baseLooksGenericApi = /\/api$/i.test(String(base || "")) && !/\/crm\/sales\/api$/i.test(String(base || ""));
          if ((expectsEntityPayload || expectsCatalogPayload) && emptyPayload && baseLooksGenericApi) {
            lastError = new Error(`Freshsales retornou payload vazio em base generica (${base}${path}); tentando proxima base.`);
            continue;
          }

          return {
            payload,
            base,
          };
        }
      }
    }

    if (!refreshedAfter401 && isOauthAuthFailure(lastError)) {
      const refreshed = await forceRefreshFreshsalesOauthToken(env, path);
      if (refreshed) {
        refreshedAfter401 = true;
        continue;
      }
    }
    break;
  }

  if (Number(lastError?.status) === 401) {
    const error = new Error(
      `Freshsales recusou a autenticacao (${lastError?.base || "sem_base"}${path}). Verifique token OAuth/app instalada/dominio.`
    );
    error.status = 401;
    error.payload = {
      original_message: lastError?.message || null,
      original_payload: lastError?.payload || null,
      attempted_auth_modes: attemptedAuthModes,
      diagnostic: buildFreshsalesAuthDiagnostic(env),
    };
    throw error;
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

function normalizeActivityTypeLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const freshsalesActivityTypeCache = new Map();

async function listFreshsalesSalesActivityTypes(env) {
  const cacheKey = resolveOauthOrgDomain(env) || resolveFreshsalesBase(env) || "default";
  if (freshsalesActivityTypeCache.has(cacheKey)) {
    return freshsalesActivityTypeCache.get(cacheKey);
  }
  const promise = (async () => {
    const { payload } = await freshsalesRequest(env, "/selector/sales_activity_types");
    const items = Array.isArray(payload?.sales_activity_types)
      ? payload.sales_activity_types
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];
    return items
      .map((item) => ({
        id: item?.id ?? item?.value ?? null,
        name: item?.name ?? item?.label ?? item?.value ?? null,
        raw: item,
      }))
      .filter((item) => item.id && item.name);
  })().catch((error) => {
    freshsalesActivityTypeCache.delete(cacheKey);
    throw error;
  });
  freshsalesActivityTypeCache.set(cacheKey, promise);
  return promise;
}

async function listFreshsalesSalesActivityTypesFromEdge(env) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);
  if (!baseUrl || !serviceKey) return [];

  const sharedSecret =
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.HMADV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    "";
  const runnerToken =
    getCleanEnvValue(env.HMADV_RUNNER_TOKEN) ||
    getCleanEnvValue(env.MADV_RUNNER_TOKEN) ||
    "";

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/functions/v1/publicacoes-freshsales?action=activity_types`,
    {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
        ...(sharedSecret
          ? {
              "x-hmadv-secret": sharedSecret,
              "x-shared-secret": sharedSecret,
            }
          : {}),
        ...(runnerToken
          ? {
              "x-hmadv-runner-token": runnerToken,
            }
          : {}),
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Falha ao consultar activity types remotos (${response.status}).`);
  }

  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.sales_activity_types)
    ? payload.sales_activity_types
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  return items
    .map((item) => ({
      id: item?.id ?? item?.value ?? null,
      name: item?.name ?? item?.label ?? item?.value ?? null,
      raw: item,
    }))
    .filter((item) => item.id && item.name);
}

function matchFreshsalesActivityType(activityTypes = [], labelCandidates = []) {
  if (!activityTypes.length) return null;
  const normalizedCandidates = labelCandidates.map((item) => normalizeActivityTypeLabel(item)).filter(Boolean);
  const exactMatch = activityTypes.find((item) => normalizedCandidates.includes(normalizeActivityTypeLabel(item.name)));
  if (exactMatch) {
    return {
      id: String(exactMatch.id),
      matchSource: "exact",
      detail: exactMatch.name,
    };
  }
  const partialMatch = activityTypes.find((item) => {
    const normalizedName = normalizeActivityTypeLabel(item.name);
    return normalizedCandidates.some((candidate) => normalizedName.includes(candidate) || candidate.includes(normalizedName));
  });
  if (partialMatch) {
    return {
      id: String(partialMatch.id),
      matchSource: "partial",
      detail: partialMatch.name,
    };
  }
  return null;
}

async function resolveFreshsalesActivityType(env, {
  envKeys = [],
  eventKeys = [],
  labelCandidates = [],
  staticFallbackId = null,
  staticFallbackDetail = null,
} = {}) {
  const directId = resolveFreshsalesActivityTypeId(env, envKeys);
  if (directId) {
    return {
      id: String(directId),
      source: "env",
      detail: envKeys.find((key) => getCleanEnvValue(env?.[key])) || null,
    };
  }

  const journeyConfig = getFreshsalesJourneyConfig(env);
  const eventMap = journeyConfig?.salesActivityTypeByEvent && typeof journeyConfig.salesActivityTypeByEvent === "object"
    ? journeyConfig.salesActivityTypeByEvent
    : {};
  for (const eventKey of eventKeys) {
    const mapped = getCleanEnvValue(eventMap?.[eventKey]);
    if (mapped) {
      return {
        id: String(mapped),
        source: "event_map",
        detail: eventKey,
      };
    }
  }

  let activityTypes = [];
  try {
    activityTypes = await listFreshsalesSalesActivityTypes(env);
  } catch {
    activityTypes = [];
  }

  const catalogMatch = matchFreshsalesActivityType(activityTypes, labelCandidates);
  if (catalogMatch?.id) {
    return {
      id: catalogMatch.id,
      source: `catalog_${catalogMatch.matchSource}`,
      detail: catalogMatch.detail,
    };
  }

  let edgeActivityTypes = [];
  try {
    edgeActivityTypes = await listFreshsalesSalesActivityTypesFromEdge(env);
  } catch {
    edgeActivityTypes = [];
  }

  const edgeCatalogMatch = matchFreshsalesActivityType(edgeActivityTypes, labelCandidates);
  if (edgeCatalogMatch?.id) {
    return {
      id: edgeCatalogMatch.id,
      source: `edge_catalog_${edgeCatalogMatch.matchSource}`,
      detail: edgeCatalogMatch.detail,
    };
  }

  const fallbackId = resolveFreshsalesActivityTypeId(env, ["FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID"]);
  if (fallbackId) {
    return {
      id: String(fallbackId),
      source: "default_env",
      detail: "FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID",
    };
  }

  if (staticFallbackId) {
    return {
      id: String(staticFallbackId),
      source: "static_fallback",
      detail: staticFallbackDetail || null,
    };
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

  const activityType = await resolveFreshsalesActivityType(env, {
    envKeys: [
      "FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID",
      "FRESHSALES_PUBLICACOES_ACTIVITY_TYPE_ID",
      "FRESHSALES_ACTIVITY_TYPE_PUBLICACAO_ID",
      "FRESHSALES_SALES_ACTIVITY_TYPE_PUBLICACAO_ID",
      "FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL",
      "FRESHSALES_ACTIVITY_TYPE_INTIMACAO",
      "FRESHSALES_ACTIVITY_TYPE_INTIMACAO_PROCESSUAL",
      "FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID",
      "FS_ACTIVITY_TYPE_ID",
    ],
    eventKeys: ["publicacao", "publicacoes", "publication", "publicacao_judicial", "intimacao"],
    labelCandidates: [
      "Publicacao judicial",
      "Publicacao",
      "Publicacoes",
      "Intimacao",
      "Intimacoes",
      "Nota processual",
      "Andamento processual",
    ],
    staticFallbackId: "31001147751",
    staticFallbackDetail: "rollout_default_nota_processual",
  });
  if (!activityType?.id) {
    throw new Error("Tipo de activity de publicacao nao configurado nem encontrado automaticamente no catalogo do Freshsales.");
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
      sales_activity_type_id: activityType.id,
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
    resolvedActivityType: activityType,
  };
}

export async function createFreshsalesMovementActivity(env, {
  accountId,
  movement,
  process = {},
} = {}) {
  const normalizedAccountId = String(accountId || process?.account_id_freshsales || "").trim();
  if (!normalizedAccountId) {
    throw new Error("Sales Account ausente para criar activity de movimentacao.");
  }

  const activityTypeId = resolveFreshsalesActivityTypeId(env, [
    "FRESHSALES_MOVIMENTACAO_ACTIVITY_TYPE_ID",
    "FRESHSALES_MOVIMENTACOES_ACTIVITY_TYPE_ID",
    "FRESHSALES_ACTIVITY_TYPE_MOVIMENTACAO_ID",
    "FRESHSALES_SALES_ACTIVITY_TYPE_MOVIMENTACAO_ID",
    "FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL",
    "FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID",
  ]);
  if (!activityTypeId) {
    throw new Error("Tipo de activity de movimentacao nao configurado no ambiente do Freshsales.");
  }

  const processNumber = String(process?.numero_cnj || movement?.numero_cnj || "").trim();
  const processTitle = String(process?.titulo || "").trim();
  const movementTitle = String(
    movement?.tipo ||
    movement?.descricao ||
    movement?.movimento ||
    "Movimentacao processual"
  ).trim();
  const movementBody = String(
    movement?.texto ||
    movement?.complemento ||
    movement?.descricao_completa ||
    movement?.conteudo ||
    movement?.resumo ||
    ""
  ).trim().slice(0, 4000);
  const movementDate = movement?.data_movimentacao
    ? new Date(movement.data_movimentacao).toISOString()
    : new Date().toISOString();

  const noteLines = [
    processNumber ? `Processo: ${processNumber}` : null,
    processTitle ? `Titulo: ${processTitle}` : null,
    movement?.fonte ? `Fonte: ${movement.fonte}` : null,
    movement?.data_movimentacao ? `Data da movimentacao: ${movement.data_movimentacao}` : null,
    movement?.id ? `Movimentacao HMADV: ${movement.id}` : null,
    movementTitle ? `Resumo: ${movementTitle}` : null,
    movementBody ? `Conteudo:\n${movementBody}` : null,
  ].filter(Boolean);

  const activityPayload = {
    sales_activity: {
      subject: processNumber
        ? `Movimentacao processual - ${processNumber}`
        : `Movimentacao processual - conta ${normalizedAccountId}`,
      note: noteLines.join("\n\n"),
      activity_date: movementDate,
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
