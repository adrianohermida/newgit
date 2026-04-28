/**
 * build-cross.cjs
 * Script de build cross-platform (Linux/macOS/Windows).
 * Substitui o uso de `set VAR=1&&` (sintaxe Windows) no package.json,
 * garantindo que AUTO_DEPLOY_WRANGLER e ALLOW_STATIC_ONLY_PAGES_DEPLOY
 * sejam definidos corretamente antes de chamar o build:core e os passos
 * subsequentes de normalização de assets.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const isWindows = process.platform === 'win32';

const extraEnv = {
  AUTO_DEPLOY_WRANGLER: '1',
  ALLOW_STATIC_ONLY_PAGES_DEPLOY: '1',
};

function run(command, args) {
  const resolvedArgs =
    isWindows && command === 'npm'
      ? [
          process.env.npm_execpath ||
            path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
          ...args,
        ]
      : args;
  const finalCommand =
    isWindows && command === 'npm' ? process.execPath : command;

  const result = spawnSync(finalCommand, resolvedArgs, {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'build:core']);
run('node', [path.join('scripts', 'normalize-pages-export-assets.js')]);
run('node', [path.join('scripts', 'copy-manual-to-public.js')]);
run('node', [path.join('scripts', 'copy-functions-to-out.js')]);
run('node', [path.join('scripts', 'generate-cf-pages-redirects.cjs')]);
