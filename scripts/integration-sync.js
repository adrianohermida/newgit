#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { loadRuntimeEnv } = require("../lib/integration-kit/runtime");

const runtime = loadRuntimeEnv(process.cwd(), process.env);

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });

  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function main() {
  const steps = [
    runCommand("node", ["scripts/sync-freshsales-products.js"]),
    runCommand("node", ["scripts/sync-freshsales-contacts.js"]),
    runCommand("node", ["scripts/sync-freshsales-deals.js"]),
  ];

  const report = {
    ok: steps.every((step) => step.ok),
    workspaceSlug: runtime.workspaceSlug || null,
    steps,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
