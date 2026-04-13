const { spawnSync } = require("node:child_process");

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
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
run("node", ["scripts/normalize-pages-export-assets.js"], { STATIC_EXPORT: "1" });
