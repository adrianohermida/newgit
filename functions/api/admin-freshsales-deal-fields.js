const JSON_HEADERS = { "Content-Type": "application/json" };

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

function isAuthorized(request, env) {
  const sharedSecret = String(env.HMDAV_AI_SHARED_SECRET || "").trim();
  if (!sharedSecret) return false;
  const provided = String(request.headers.get("x-hmadv-secret") || "").trim();
  return provided && provided === sharedSecret;
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

function matchCandidates(fields, keywords) {
  return fields.filter((field) => {
    const haystack = `${field.name || ""} ${field.label || ""}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
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

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!isAuthorized(request, env)) {
    return new Response(JSON.stringify({ ok: false, error: "Nao autorizado." }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  try {
    const [dealsResult, accountsResult] = await Promise.all([
      fetchFreshsalesJson(env, "settings/deals/fields"),
      fetchFreshsalesJson(env, "settings/sales_accounts/fields"),
    ]);

    const dealsFields = toArray(dealsResult.payload.fields).map(simplifyField);
    const accountFields = toArray(accountsResult.payload.fields).map(simplifyField);

    const summary = {
      deal_type_candidates: matchCandidates(dealsFields, ["tipo", "categoria", "modalidade", "subscription", "assinatura", "fatura", "invoice", "plano", "produto"]),
      deal_stage_candidates: matchCandidates(dealsFields, ["stage", "estagio", "status"]),
      deal_amount_candidates: matchCandidates(dealsFields, ["amount", "valor", "price", "preco"]),
      account_process_candidates: matchCandidates(accountFields, ["processo", "cnj", "numero", "número"]),
      account_status_candidates: matchCandidates(accountFields, ["status", "situa", "situa"]),
    };

    return new Response(JSON.stringify({
      ok: true,
      base_used: dealsResult.base,
      deals_fields_total: dealsFields.length,
      sales_accounts_fields_total: accountFields.length,
      summary,
      deals_fields: dealsFields,
      sales_accounts_fields: accountFields,
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
