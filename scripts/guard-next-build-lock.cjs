const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync, spawnSync } = require('node:child_process');

const nextDir = path.join(process.cwd(), '.next');
const lockPath = path.join(nextDir, 'lock');
const MAX_ATTEMPTS = 3;
const BENIGN_WINDOWS_BUILD_ENOENT_PATTERNS = [
  "Error: ENOENT: no such file or directory, unlink '",
  "Error: ENOENT: no such file or directory, rename '",
];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hasConcurrentNextBuild() {
  try {
    if (os.platform() === 'win32') {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -match 'next\\\\dist\\\\bin\\\\next\" build' } | Select-Object -ExpandProperty ProcessId"`;
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return out.length > 0;
    }
    const out = execSync("ps -ax -o command= | grep -E 'next(.+)?dist/bin/next build' | grep -v grep", {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/sh',
    }).toString().trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

function killLingeringNextProcesses() {
  try {
    if (os.platform() === 'win32') {
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$targets = Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -match 'next\\\\dist\\\\bin\\\\next\" build|\\.next\\\\build\\\\postcss\\.js' } | Select-Object -ExpandProperty ProcessId; foreach ($target in $targets) { Stop-Process -Id $target -Force -ErrorAction SilentlyContinue }"`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } else {
      execSync("pkill -f 'next(.+)?dist/bin/next build|/.next/build/postcss.js'", {
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: '/bin/sh',
      });
    }
  } catch {
    // nothing to kill
  }
}

function cleanNextDir() {
  killLingeringNextProcesses();
  sleep(750);
  if (!fs.existsSync(nextDir)) return;
  try {
    fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    console.log('guard-next-build-lock: cleaned stale .next directory.');
  } catch (error) {
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
    console.warn(`guard-next-build-lock: partial cleanup: ${error.message}`);
  }
}

function hasUsableNextArtifacts() {
  const required = [
    path.join(nextDir, 'BUILD_ID'),
    path.join(nextDir, 'routes-manifest.json'),
    path.join(nextDir, 'prerender-manifest.json'),
    path.join(nextDir, 'server', 'pages-manifest.json'),
  ];
  return required.every((filePath) => fs.existsSync(filePath));
}

function isBenignWindowsNextBuildFailure(output) {
  if (os.platform() !== 'win32') return false;
  const text = String(output || '');
  const generatedAllPages =
    text.includes('Generating static pages using 1 worker') &&
    text.includes('✓ Generating static pages using 1 worker');
  const hasKnownEnoent = BENIGN_WINDOWS_BUILD_ENOENT_PATTERNS.some((pattern) => text.includes(pattern));
  return generatedAllPages && hasKnownEnoent && hasUsableNextArtifacts();
}

if (hasConcurrentNextBuild()) {
  console.error('guard-next-build-lock: another next build process is running; aborting.');
  process.exit(1);
}

const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
const buildArgs = ['build', '--webpack'];
let exitCode = 1;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  cleanNextDir();

  if (attempt > 1) {
    console.error(`\nguard-next-build-lock: retrying build (attempt ${attempt}/${MAX_ATTEMPTS})...\n`);
  }

  const result = spawnSync(nextBin, buildArgs, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: os.platform() === 'win32',
    env: process.env,
  });

  const stdout = result.stdout ? result.stdout.toString() : '';
  const stderr = result.stderr ? result.stderr.toString() : '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const combinedOutput = `${stdout}\n${stderr}`;
  if ((result.status ?? 1) !== 0 && isBenignWindowsNextBuildFailure(combinedOutput)) {
    console.warn('guard-next-build-lock: detected benign Next.js Windows cleanup ENOENT after a complete build; accepting artifacts.');
    exitCode = 0;
    break;
  }

  exitCode = result.status ?? 1;
  if (exitCode === 0) break;

  if (attempt < MAX_ATTEMPTS) {
    console.error(`guard-next-build-lock: build failed (attempt ${attempt}). Retrying after clean.`);
    killLingeringNextProcesses();
    sleep(1200);
  }
}

process.exit(exitCode);
