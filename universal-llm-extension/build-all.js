/**
 * build-all.js — Orquestra o build completo sem operadores de shell.
 * Cross-platform: funciona em PowerShell, CMD e bash.
 * Execução: node build-all.js
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

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

function hasIcons() {
  return ["icon-16.png", "icon-48.png", "icon-128.png"].every((name) =>
    fs.existsSync(path.join(dir, "../_tmp_universal_llm_assistant/icons", name))
  );
}

console.log("\n>>> Gerando ícones...");
const iconBuild = spawnSync(node, [path.join(dir, "generate-icons.js")], {
  stdio: "inherit",
  cwd: dir,
});
if (iconBuild.status !== 0) {
  if (hasIcons()) {
    console.warn("Aviso: nao foi possivel regenerar os icones agora, mas os arquivos existentes serao reutilizados no build.");
  } else {
    console.error(`ERRO em Gerando ícones... (exit ${iconBuild.status})`);
    process.exit(iconBuild.status || 1);
  }
}

run("build.js",          "Empacotando extensão...");

console.log("\n✓ Build completo.");
