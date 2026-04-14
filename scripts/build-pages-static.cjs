const { spawnSync } = require("node:child_process");
const path = require("node:path");

function run(command, args, extraEnv = {}) {
  const isWindows = process.platform === "win32";
  const resolvedCommand =
    isWindows && command === "node"
      ? process.execPath
      : command;
  const resolvedArgs =
    isWindows && command === "npm"
      ? [process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...args]
      : args;
  const finalCommand = isWindows && command === "npm" ? process.execPath : resolvedCommand;

  const result = spawnSync(finalCommand, resolvedArgs, {
    stdio: "inherit",
    shell: false,
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build:core"], { STATIC_EXPORT: "1" });
run("node", [path.join("scripts", "normalize-pages-export-assets.js")], { STATIC_EXPORT: "1" });
