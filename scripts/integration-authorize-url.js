#!/usr/bin/env node

const { loadPreferredEnvFiles } = require("../lib/integration-kit/env");
const { buildAuthorizeUrl } = require("../lib/integration-kit/freshworks");

loadPreferredEnvFiles(process.cwd(), process.env);

const target = String(process.argv[2] || "freshsales").trim().toLowerCase();
const result = buildAuthorizeUrl(process.env, target);

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, target, ...result }, null, 2));
