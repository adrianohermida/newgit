#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceId = args.workspaceId || process.env.HMADV_WORKSPACE_ID || null;
  const files = args.files;
  const indicesFile = args.indicesFile || null;
  const publishLimit = String(args.publishLimit || 10);
  const queueLimit = String(args.queueLimit || 50);

  const workspaceArgs = workspaceId ? [workspaceId] : [];

  runStep('Seed produtos', ['node', 'scripts/seed-hmadv-products.js', ...workspaceArgs]);
  runStep('Sync contacts', ['node', 'scripts/sync-freshsales-contacts.js', ...workspaceArgs]);
  runStep('Sync products', ['node', 'scripts/sync-freshsales-products.js', ...workspaceArgs]);

  if (indicesFile) {
    runStep('Import indices', ['node', 'scripts/import-billing-indices.js', indicesFile, 'IGP-M', 'csv']);
  }

  const importRunIds = [];
  for (const file of files) {
    const importArgs = workspaceId
      ? ['node', 'scripts/import-hmadv-billing-csv.js', '--workspace-id', workspaceId, file]
      : ['node', 'scripts/import-hmadv-billing-csv.js', file];

    runStep(`Import billing CSV (${path.basename(file)})`, importArgs);

    const importRunId = findLatestImportRunId();
    if (!importRunId) {
      throw new Error(`Nao foi possivel localizar o ultimo import_run apos a importacao de ${file}.`);
    }
    importRunIds.push(importRunId);

    runStep(
      `Materialize billing (${path.basename(file)})`,
      workspaceId
        ? ['node', 'scripts/materialize-hmadv-billing.js', importRunId, workspaceId]
        : ['node', 'scripts/materialize-hmadv-billing.js', importRunId]
    );
  }

  runStep('Publish deals', ['node', 'scripts/publish-hmadv-deals.js', publishLimit]);
  runStep('Process CRM queue', ['node', 'scripts/process-hmadv-crm-events.js', queueLimit]);

  console.log(JSON.stringify({
    ok: true,
    workspace_id: workspaceId,
    import_run_ids: importRunIds,
    publish_limit: Number(publishLimit),
    queue_limit: Number(queueLimit),
  }, null, 2));
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const result = {
    workspaceId: null,
    files: [],
    indicesFile: null,
    publishLimit: 10,
    queueLimit: 50,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace-id') {
      result.workspaceId = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--indices-file') {
      result.indicesFile = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--publish-limit') {
      result.publishLimit = Number(argv[i + 1] || '10');
      i += 1;
      continue;
    }
    if (arg === '--queue-limit') {
      result.queueLimit = Number(argv[i + 1] || '50');
      i += 1;
      continue;
    }
    result.files.push(arg);
  }

  return result;
}

function runStep(label, commandArgs) {
  console.log(`\n== ${label} ==`);
  console.log(commandArgs.join(' '));
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${label} falhou com exit code ${result.status}`);
  }
}

function findLatestImportRunId() {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
  }

  const url = `${baseUrl}/rest/v1/billing_import_runs?select=id&order=started_at.desc&limit=1`;
  const result = spawnSync('node', ['-e', `
    fetch(${JSON.stringify(url)}, {
      headers: {
        apikey: ${JSON.stringify(apiKey)},
        Authorization: 'Bearer ' + ${JSON.stringify(apiKey)},
        Accept: 'application/json'
      }
    }).then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      process.stdout.write((json[0] && json[0].id) || '');
    }).catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
  `], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Falha ao localizar ultimo import_run');
  }

  return String(result.stdout || '').trim() || null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
