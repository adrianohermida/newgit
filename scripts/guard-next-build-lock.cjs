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

function listLingeringNextProcessIds() {
  try {
    if (os.platform() === 'win32') {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$current = ${process.pid}; Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.ProcessId -ne $current -and $_.CommandLine -and ( $_.CommandLine -like '*guard-next-build-lock.cjs*' -or $_.CommandLine -match 'next\\\\dist\\\\bin\\\\next\"?\\s+build(\\s|$)' -or $_.CommandLine -like '*\\\\.next\\\\build\\\\postcss.js*' ) } | Select-Object -ExpandProperty ProcessId"`;
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return out ? out.split(/\s+/).map((value) => Number(value)).filter(Boolean) : [];
    }

    const out = execSync("ps -ax -o pid=,command= | grep -E 'guard-next-build-lock\\.cjs|next(.+)?dist/bin/next build|/\\.next/build/postcss\\.js' | grep -v grep", {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/sh',
    }).toString().trim();

    return out
      ? out.split(/\r?\n/).map((line) => Number(line.trim().split(/\s+/)[0])).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function hasConcurrentNextBuild() {
  return listLingeringNextProcessIds().length > 0;
}

function killLingeringNextProcesses() {
  const targets = listLingeringNextProcessIds();
  if (!targets.length) return;

  try {
    if (os.platform() === 'win32') {
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$targets = '${targets.join(',')}'.Split(',') | Where-Object { $_ }; foreach ($target in $targets) { Stop-Process -Id ([int]$target) -Force -ErrorAction SilentlyContinue }"`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } else {
      execSync(`kill -9 ${targets.join(' ')}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: '/bin/sh',
      });
    }
    console.warn(`guard-next-build-lock: terminated lingering build process(es): ${targets.join(', ')}`);
  } catch {
    // ignore cleanup failures
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
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore lock cleanup errors
      }
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
    (text.includes('✓ Generating static pages using 1 worker') ||
      text.includes('Generating static pages using 1 worker (70/70)'));
  const hasKnownEnoent = BENIGN_WINDOWS_BUILD_ENOENT_PATTERNS.some((pattern) => text.includes(pattern));
  return generatedAllPages && hasKnownEnoent && hasUsableNextArtifacts();
}

if (hasConcurrentNextBuild()) {
  console.warn('guard-next-build-lock: found lingering build process(es); cleaning before starting.');
  killLingeringNextProcesses();
  sleep(1200);
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
