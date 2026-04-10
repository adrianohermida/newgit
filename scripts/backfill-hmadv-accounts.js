#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

loadLocalEnv();

async function main() {
  const limit = Math.max(1, Math.min(Number(process.argv[2] || '50'), 200));
  const mod = await import(pathToFileURL(path.join(process.cwd(), 'functions/lib/hmadv-finance-admin.js')).href);
  const result = await mod.backfillHmadvFinanceAccounts(process.env, { limit });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
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
  process.exitCode = 1;
});
