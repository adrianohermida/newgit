#!/usr/bin/env node

const { loadRuntimeEnv, resolveWorkspaceId } = require("../lib/integration-kit/runtime");

const runtime = loadRuntimeEnv(process.cwd(), process.env);

async function main() {
  const workspaceId = process.argv[2] || resolveWorkspaceId(runtime) || null;
  const products = Array.isArray(runtime.canonicalProducts) ? runtime.canonicalProducts : [];

  if (!products.length) {
    throw new Error("Nenhum canonical-products.json encontrado no setup do integration kit.");
  }

  const payload = products.map((item) => ({
    workspace_id: workspaceId,
    price_default: null,
    metadata: {
      source: "integration_kit_seed",
      canonical_product: true,
    },
    ...item,
  }));

  await supabaseRequest("freshsales_products?on_conflict=name", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  console.log(JSON.stringify({
    ok: true,
    workspace_id: workspaceId,
    seeded: payload.length,
  }, null, 2));
}

async function supabaseRequest(pathname, init = {}) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
