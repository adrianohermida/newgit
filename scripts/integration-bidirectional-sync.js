#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { loadRuntimeEnv, resolveWorkspaceId } = require("../lib/integration-kit/runtime");

const runtime = loadRuntimeEnv(process.cwd(), process.env);

function runStep(command) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    shell: false,
  });

  return {
    command: command.join(" "),
    exit_code: result.status,
    stdout: String(result.stdout || "").trim() || null,
    stderr: String(result.stderr || "").trim() || null,
    ok: result.status === 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  const applyStatus = args.includes("--apply-status");
  const workspaceId = resolveWorkspaceId(runtime);

  const steps = [
    ["node", "scripts/integration-seed-products.js", ...(workspaceId ? [workspaceId] : [])],
    ["node", "scripts/integration-sync.js"],
    ["node", "scripts/publish-hmadv-deals.js", "200"],
    ["node", "scripts/process-hmadv-crm-events.js", "200"],
    ...(applyStatus ? [["node", "scripts/sync-freshsales-deals.js", "200", "--apply-status"]] : []),
  ];

  const results = steps.map(runStep);
  const report = {
    ok: results.every((item) => item.ok),
    workspace_id: workspaceId,
    apply_status: applyStatus,
    steps: results,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
