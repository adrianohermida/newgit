#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const applyStatus = args.includes('--apply-status');
  const filteredArgs = args.filter((item) => item !== '--apply-status');

  const importLimit = sanitizePositiveInt(filteredArgs[0], 200);
  const publishLimit = sanitizePositiveInt(filteredArgs[1], 200);
  const crmLimit = sanitizePositiveInt(filteredArgs[2], 200);

  const steps = [
    {
      label: 'Importar deals existentes do Freshsales',
      command: ['node', 'scripts/sync-freshsales-deals.js', String(importLimit), ...(applyStatus ? ['--apply-status'] : [])],
    },
    {
      label: 'Publicar deals locais pendentes',
      command: ['node', 'scripts/publish-hmadv-deals.js', String(publishLimit)],
    },
    {
      label: 'Processar fila CRM',
      command: ['node', 'scripts/process-hmadv-crm-events.js', String(crmLimit)],
    },
  ];

  const summary = {
    ok: true,
    apply_status: applyStatus,
    steps: [],
  };

  for (const step of steps) {
    const [bin, ...stepArgs] = step.command;
    const result = spawnSync(bin, stepArgs, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      shell: false,
    });

    summary.steps.push({
      label: step.label,
      command: step.command.join(' '),
      exit_code: result.status,
      stdout: cleanOutput(result.stdout),
      stderr: cleanOutput(result.stderr),
    });

    if (result.status !== 0) {
      summary.ok = false;
      break;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

function sanitizePositiveInt(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanOutput(value) {
  const text = String(value || '').trim();
  return text || null;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
