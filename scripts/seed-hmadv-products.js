#!/usr/bin/env node

const { loadRuntimeEnv } = require('../lib/integration-kit/runtime');

loadRuntimeEnv(process.cwd(), process.env);

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || process.env.INTEGRATION_WORKSPACE_SLUG || null;
  process.argv[2] = workspaceId || '';
  await import('./integration-seed-products.js');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
