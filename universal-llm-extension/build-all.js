/**
 * build-all.js — Orquestra o build completo sem operadores de shell.
 * Cross-platform: funciona em PowerShell, CMD e bash.
 * Execução: node build-all.js
 */
const { spawnSync } = require("child_process");
const path = require("path");

const node = process.execPath;
const dir  = __dirname;

function run(script, label) {
  console.log(`\n>>> ${label}`);
  const result = spawnSync(node, [path.join(dir, script)], {
    stdio: "inherit",
    cwd: dir,
  });
  if (result.status !== 0) {
    console.error(`ERRO em ${label} (exit ${result.status})`);
    process.exit(result.status || 1);
  }
}

run("generate-icons.js", "Gerando ícones...");
run("build.js",          "Empacotando extensão...");

console.log("\n✓ Build completo.");
