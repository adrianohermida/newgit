function normalizeDomain(value) {
  return String(value || "").replace(/\/+$/, "");
}

export async function listFreshdeskTickets(env, filters = {}) {
  const domain = normalizeDomain(env.FRESHDESK_DOMAIN);
  const token = env.FRESHDESK_BASIC_TOKEN;

  if (!domain || !token) {
    return {
      items: [],
      warning: "Configuracao incompleta no servidor. Variaveis do Freshdesk ausentes.",
    };
  }

  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));

  if (filters.email) {
    params.set("email", filters.email);
  }

  const response = await fetch(`${domain}/api/v2/tickets?${params.toString()}`, {
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Freshdesk request failed with status ${response.status}`);
  }

  const items = await response.json();
  return {
    items: Array.isArray(items) ? items : [],
    warning: null,
  };
}
