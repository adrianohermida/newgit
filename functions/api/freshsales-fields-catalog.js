const JSON_HEADERS = { "Content-Type": "application/json" };

function normalizeDomain(value) {
  const raw = String(value || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.includes("myfreshworks.com")) return raw;
  return raw.replace(/\.freshsales\.io$/i, ".myfreshworks.com");
}

function authHeader(env) {
  const key = String(env.FRESHSALES_API_KEY || "").trim().replace(/^Token token=/i, "").replace(/^Bearer /i, "");
  if (!key) return null;
  return `Token token=${key}`;
}

async function fetchFreshsalesJson(env, path) {
  const domain = normalizeDomain(env.FRESHSALES_DOMAIN);
  const authorization = authHeader(env);
  if (!domain || !authorization) {
    throw new Error("Freshsales nao configurado neste runtime.");
  }

  const response = await fetch(`https://${domain}/crm/sales/api/${path}`, {
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Freshsales ${path} retornou ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }

  return payload;
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

function pick(fields, keywords) {
  return fields.filter((field) => {
    const haystack = `${field.name || ""} ${field.label || ""}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const [dealsRaw, accountsRaw] = await Promise.all([
      fetchFreshsalesJson(env, "settings/deals/fields"),
      fetchFreshsalesJson(env, "settings/sales_accounts/fields"),
    ]);

    const dealsFields = toArray(dealsRaw.fields).map(simplifyField);
    const salesAccountFields = toArray(accountsRaw.fields).map(simplifyField);

    return new Response(JSON.stringify({
      ok: true,
      domain_used: normalizeDomain(env.FRESHSALES_DOMAIN),
      deals_fields_total: dealsFields.length,
      sales_accounts_fields_total: salesAccountFields.length,
      candidates: {
        deal_type: pick(dealsFields, ["tipo", "categoria", "modalidade", "subscription", "assinatura", "fatura", "invoice", "plano", "produto"]),
        deal_stage: pick(dealsFields, ["stage", "estagio", "status"]),
        deal_amount: pick(dealsFields, ["amount", "valor", "price", "preco"]),
        account_process: pick(salesAccountFields, ["processo", "cnj", "numero", "número"]),
        account_status: pick(salesAccountFields, ["status", "situa"]),
      },
      deals_fields: dealsFields,
      sales_accounts_fields: salesAccountFields,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
