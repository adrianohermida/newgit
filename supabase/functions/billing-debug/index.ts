/**
 * billing-debug — Edge Function de diagnóstico
 * Verifica a configuração do Freshsales e testa a criação de um deal
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FS_DOMAIN_RAW = Deno.env.get("FRESHSALES_DOMAIN") || "";
const FS_API_KEY = Deno.env.get("FRESHSALES_API_KEY") || "";
const FS_OWNER_ID = Number(Deno.env.get("FRESHSALES_OWNER_ID") || "31000147944");

const DOMAIN_MAP: Record<string, string> = {
  "hmadv-7b725ea101eff55.freshsales.io": "hmadv-org.myfreshworks.com",
};

function fsDomain(): string {
  const d = FS_DOMAIN_RAW.trim();
  if (d.includes("myfreshworks.com")) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, ".myfreshworks.com");
}

function fsHeaders(): HeadersInit {
  return {
    "Authorization": `Token token=${FS_API_KEY.trim()}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

Deno.serve(async (_req: Request) => {
  const domain = fsDomain();
  const result: Record<string, unknown> = {
    config: {
      domain_raw: FS_DOMAIN_RAW,
      domain_normalized: domain,
      api_key_present: !!FS_API_KEY,
      api_key_prefix: FS_API_KEY ? FS_API_KEY.substring(0, 10) + "..." : null,
      owner_id: FS_OWNER_ID,
    }
  };

  // Testar autenticação
  try {
    const r = await fetch(`https://${domain}/crm/sales/api/contacts/search?q=test&include=contact`, {
      headers: fsHeaders(),
    });
    result.auth_test = { status: r.status, ok: r.ok };
    if (!r.ok) {
      result.auth_error = await r.text();
    }
  } catch (e) {
    result.auth_exception = String(e);
  }

  // Buscar deal stages
  try {
    const r = await fetch(`https://${domain}/crm/sales/api/deal_stages`, {
      headers: fsHeaders(),
    });
    result.deal_stages_status = r.status;
    if (r.ok) {
      const data = await r.json();
      result.deal_stages = (data.deal_stages || []).map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        pipeline_id: s.deal_pipeline_id,
      }));
    } else {
      result.deal_stages_error = await r.text();
    }
  } catch (e) {
    result.deal_stages_exception = String(e);
  }

  // Testar criação de deal simples
  try {
    const payload = {
      deal: {
        name: "TESTE DIAGNÓSTICO - pode apagar",
        amount: 1.00,
        deal_stage_id: 31000000000, // placeholder
        owner_id: FS_OWNER_ID,
      }
    };
    const r = await fetch(`https://${domain}/crm/sales/api/deals`, {
      method: "POST",
      headers: fsHeaders(),
      body: JSON.stringify(payload),
    });
    result.deal_create_test = { status: r.status, ok: r.ok };
    const body = await r.text();
    result.deal_create_response = body.substring(0, 500);
  } catch (e) {
    result.deal_create_exception = String(e);
  }

  return Response.json(result, { status: 200 });
});
