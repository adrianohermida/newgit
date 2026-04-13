const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function importModule(relativePath) {
  const fullPath = path.resolve(relativePath);
  return import(pathToFileURL(fullPath).href);
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload?.error || payload?.message || payload?.raw || `HTTP ${response.status}`;
    throw new Error(`Falha ao chamar ${url}: ${message}`);
  }
  return payload;
}

function summarizeOverview(overview) {
  return {
    publicacoesTotal: Number(overview?.publicacoesTotal || 0),
    publicacoesComActivity: Number(overview?.publicacoesComActivity || 0),
    publicacoesPendentesComAccount: Number(overview?.publicacoesPendentesComAccount || 0),
    publicacoesLeilaoIgnorado: Number(overview?.publicacoesLeilaoIgnorado || 0),
    publicacoesSemProcesso: Number(overview?.publicacoesSemProcesso || 0),
  };
}

async function main() {
  loadDotEnv(path.resolve(".dev.vars"));
  loadDotEnv(path.resolve(".local.supabase.env"));

  const env = process.env;
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!baseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const batch = asPositiveInt(getArg("batch", "30"), 30);
  const iterations = asPositiveInt(getArg("iterations", "1"), 1);
  const stopAt = asPositiveInt(getArg("stopAt", "0"), 0);
  const validateEvery = asPositiveInt(getArg("validateEvery", "1"), 1);
  const dryRun = process.argv.includes("--dry-run");

  const runtimeOps = await importModule("./functions/lib/hmadv-ops.js");

  const syncUrl = `${baseUrl}/functions/v1/publicacoes-freshsales?action=sync&batch=${batch}`;
  const report = {
    checkedAt: new Date().toISOString(),
    batch,
    iterations,
    stopAt,
    validateEvery,
    dryRun,
    runs: [],
  };

  let latestOverview = summarizeOverview(await runtimeOps.getPublicacoesOverview(env));
  report.before = latestOverview;
  console.log(JSON.stringify({ stage: "before", overview: latestOverview }, null, 2));

  for (let index = 0; index < iterations; index += 1) {
    if (stopAt > 0 && latestOverview.publicacoesPendentesComAccount <= stopAt) {
      report.stoppedEarly = true;
      report.stopReason = `pending<=${stopAt}`;
      break;
    }

    let syncResult = null;
    if (!dryRun) {
      const payload = await postJson(syncUrl, serviceKey, {});
      syncResult = payload?.data || payload;
    }

    const shouldValidate = ((index + 1) % validateEvery) === 0 || index === iterations - 1;
    if (shouldValidate) {
      latestOverview = summarizeOverview(await runtimeOps.getPublicacoesOverview(env));
    }

    const run = {
      iteration: index + 1,
      syncResult,
      overview: latestOverview,
    };
    report.runs.push(run);
    console.log(JSON.stringify({ stage: "iteration", ...run }, null, 2));
  }

  report.after = latestOverview;
  console.log(JSON.stringify({ stage: "after", overview: latestOverview }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
