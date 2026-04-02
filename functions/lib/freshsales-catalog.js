function getCleanValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildFreshsalesBaseCandidates(env) {
  const raw =
    getCleanValue(env.FRESHSALES_API_BASE) ||
    getCleanValue(env.FRESHSALES_BASE_URL) ||
    getCleanValue(env.FRESHSALES_DOMAIN);

  if (!raw) return [];

  const base = raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;

  if (base.includes("/crm/sales/api")) return [base];
  if (base.includes("/api")) return [base];

  const host = base.replace(/^https?:\/\//i, "");
  const normalizedHost = host.includes("myfreshworks.com")
    ? host
    : host.replace(/\.freshsales\.io$/i, ".myfreshworks.com");

  return [
    `${base}/crm/sales/api`,
    `${base}/api`,
    `https://${normalizedHost}/crm/sales/api`,
    `https://${normalizedHost}/api`,
  ].filter((value, index, list) => list.indexOf(value) === index);
}

async function fetchFreshsalesJson(env, path) {
  const candidates = buildFreshsalesBaseCandidates(env);
  const apiKey = getCleanValue(env.FRESHSALES_API_KEY).replace(/^Token token=/i, "").replace(/^Bearer /i, "");
  const accessToken = getCleanValue(env.FRESHSALES_ACCESS_TOKEN).replace(/^Bearer /i, "");
  const authHeaders = [
    apiKey ? { Authorization: `Token token=${apiKey}` } : null,
    accessToken ? { Authorization: `Bearer ${accessToken}` } : null,
  ].filter(Boolean);

  if (!candidates.length || !authHeaders.length) {
    throw new Error("Freshsales nao configurado neste runtime.");
  }

  let lastError = null;
  for (const base of candidates) {
    for (const auth of authHeaders) {
      const response = await fetch(`${base}/${path}`, {
        headers: {
          ...auth,
          Accept: "application/json",
        },
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(`Freshsales ${path} retornou ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
        continue;
      }

      return {
        payload,
        base,
      };
    }
  }

  throw lastError || new Error("Falha ao consultar o Freshsales.");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function simplifyField(field) {
  return {
    id: field.id ?? null,
    name: field.name ?? null,
    label: field.label ?? null,
    type: field.type ?? null,
    required: Boolean(field.required),
    visible: Boolean(field.visible),
    base_model: field.base_model ?? null,
    choices: toArray(field.choices).map((choice) => ({
      id: choice.id ?? null,
      value: choice.value ?? null,
    })),
  };
}

function simplifySelectorItem(item) {
  return {
    id: item.id ?? item.value ?? null,
    name: item.name ?? item.value ?? item.label ?? null,
    raw: item,
  };
}

async function safeCatalogFetch(env, path, transform) {
  try {
    const result = await fetchFreshsalesJson(env, path);
    return {
      ok: true,
      base: result.base,
      items: transform(result.payload),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      items: [],
    };
  }
}

export async function getFreshsalesCatalog(env) {
  const [contacts, deals, accounts, salesActivityTypes, owners] = await Promise.all([
    safeCatalogFetch(env, "settings/contacts/fields", (payload) => toArray(payload.fields).map(simplifyField)),
    safeCatalogFetch(env, "settings/deals/fields", (payload) => toArray(payload.fields).map(simplifyField)),
    safeCatalogFetch(env, "settings/sales_accounts/fields", (payload) => toArray(payload.fields).map(simplifyField)),
    safeCatalogFetch(env, "selector/sales_activity_types", (payload) => toArray(payload.sales_activity_types || payload.items || payload).map(simplifySelectorItem)),
    safeCatalogFetch(env, "selector/owners", (payload) => toArray(payload.users || payload.owners || payload.items || payload).map(simplifySelectorItem)),
  ]);

  return {
    base_used: contacts.base || deals.base || accounts.base || salesActivityTypes.base || owners.base || null,
    contacts_fields: contacts.items,
    deals_fields: deals.items,
    sales_accounts_fields: accounts.items,
    sales_activity_types: salesActivityTypes.items,
    owners: owners.items,
    warnings: [
      ...(!contacts.ok ? [`contacts_fields: ${contacts.error}`] : []),
      ...(!deals.ok ? [`deals_fields: ${deals.error}`] : []),
      ...(!accounts.ok ? [`sales_accounts_fields: ${accounts.error}`] : []),
      ...(!salesActivityTypes.ok ? [`sales_activity_types: ${salesActivityTypes.error}`] : []),
      ...(!owners.ok ? [`owners: ${owners.error}`] : []),
    ],
  };
}
