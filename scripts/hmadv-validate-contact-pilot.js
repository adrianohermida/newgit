#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(process.cwd(), ".dev.vars");

loadLocalEnv();

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const cnj = normalizeCnj(process.argv[2] || "00001454220218260286");
  if (!cnj) {
    throw new Error("Informe um CNJ valido com 20 digitos ou formatado.");
  }

  const processos = await supabaseRequest(
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&numero_cnj=eq.${cnj}&limit=1`,
    {},
    "judiciario"
  );
  const processo = Array.isArray(processos) ? processos[0] || null : null;

  if (!processo?.id) {
    console.log(JSON.stringify({ ok: false, cnj, reason: "processo_not_found" }, null, 2));
    return;
  }

  const [partes, syncRows, publicacoes] = await Promise.all([
    supabaseRequest(
      `partes?select=id,nome,polo,tipo_pessoa,documento,contato_freshsales_id,cliente_hmadv,representada_pelo_escritorio,principal_no_account&processo_id=eq.${processo.id}&order=nome.asc`,
      {},
      "judiciario"
    ),
    supabaseRequest(
      `processo_contato_sync?select=parte_id,contact_id_freshsales,relacao,principal,synced_at&processo_id=eq.${processo.id}&order=synced_at.desc`,
      {},
      "judiciario"
    ),
    supabaseRequest(
      `publicacoes?select=id,data_publicacao,freshsales_activity_id,processo_id&processo_id=eq.${processo.id}&order=data_publicacao.desc&limit=20`,
      {},
      "judiciario"
    ),
  ]);

  const linkedContactIds = [
    ...new Set(
      (Array.isArray(partes) ? partes : [])
        .map((item) => cleanValue(item?.contato_freshsales_id))
        .filter(Boolean)
    ),
  ];

  const contactMirror = linkedContactIds.length
    ? await supabaseRequest(
        `freshsales_contacts?select=id,freshsales_contact_id,name,email,phone,last_synced_at&freshsales_contact_id=in.(${linkedContactIds.map((item) => `"${item}"`).join(",")})`,
        {},
        "judiciario"
      )
    : [];

  const result = {
    ok: true,
    cnj,
    auth: {
      has_contacts_refresh: Boolean(cleanValue(process.env.FRESHSALES_CONTACTS_REFRESH_TOKEN)),
      has_contacts_access: Boolean(cleanValue(process.env.FRESHSALES_CONTACTS_ACCESS_TOKEN)),
      has_deals_refresh: Boolean(cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)),
    },
    processo: {
      id: processo.id,
      numero_cnj: processo.numero_cnj,
      titulo: processo.titulo || null,
      account_id_freshsales: processo.account_id_freshsales || null,
      status_atual_processo: processo.status_atual_processo || null,
      polo_ativo: processo.polo_ativo || null,
      polo_passivo: processo.polo_passivo || null,
    },
    metrics: {
      partes_total: Array.isArray(partes) ? partes.length : 0,
      partes_com_contato: Array.isArray(partes) ? partes.filter((item) => cleanValue(item?.contato_freshsales_id)).length : 0,
      sync_rows_total: Array.isArray(syncRows) ? syncRows.length : 0,
      publicacoes_total: Array.isArray(publicacoes) ? publicacoes.length : 0,
      publicacoes_com_activity: Array.isArray(publicacoes) ? publicacoes.filter((item) => cleanValue(item?.freshsales_activity_id)).length : 0,
      contacts_mirror_total: Array.isArray(contactMirror) ? contactMirror.length : 0,
    },
    partes: (Array.isArray(partes) ? partes : []).map((item) => ({
      id: item.id,
      nome: item.nome,
      polo: item.polo,
      tipo_pessoa: item.tipo_pessoa,
      documento: item.documento || null,
      contato_freshsales_id: item.contato_freshsales_id || null,
      cliente_hmadv: Boolean(item.cliente_hmadv),
      representada_pelo_escritorio: Boolean(item.representada_pelo_escritorio),
      principal_no_account: Boolean(item.principal_no_account),
    })),
    sync_rows: Array.isArray(syncRows) ? syncRows : [],
    contacts_mirror: Array.isArray(contactMirror) ? contactMirror : [],
    publicacoes_sample: (Array.isArray(publicacoes) ? publicacoes : []).slice(0, 10),
  };

  console.log(JSON.stringify(result, null, 2));
}

function loadLocalEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeCnj(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length === 20 ? digits : null;
}

async function supabaseRequest(pathname, init = {}, schema = "public") {
  const baseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const apiKey = cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!baseUrl || !apiKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Accept-Profile": schema,
      ...(init.headers || {}),
    },
  });

  const text = await response.text().catch(() => "");
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((payload && (payload.message || payload.error || payload.details)) || text || `Supabase REST failed: ${response.status}`);
  }
  return payload;
}
