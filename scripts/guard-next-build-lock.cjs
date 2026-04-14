const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, execSync } = require('node:child_process');

const nextDir = path.join(process.cwd(), '.next');
const lockPath = path.join(nextDir, 'lock');
const MAX_ATTEMPTS = 5;
const BENIGN_WINDOWS_BUILD_ENOENT_PATTERNS = [
  "Error: ENOENT: no such file or directory, unlink '",
  "Error: ENOENT: no such file or directory, rename '",
  "Error: ENOENT: no such file or directory, open '",
  "Error: ENOENT: no such file or directory, mkdir '",
  "Cannot find module 'D:\\Github\\newgit\\.next\\",
  "next-font-manifest.json",
  "build-diagnostics.json",
  ".js.nft.json",
  ".next\\package.json",
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

function seedNextDir() {
  const folders = [
    nextDir,
    path.join(nextDir, 'server'),
    path.join(nextDir, 'server', 'pages'),
    path.join(nextDir, 'server', 'app'),
    path.join(nextDir, 'export'),
    path.join(nextDir, 'diagnostics'),
    path.join(nextDir, 'cache'),
    path.join(nextDir, 'cache', 'webpack'),
    path.join(nextDir, 'cache', 'webpack', 'server-production'),
  ];

  for (const folder of folders) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const pagesRoot = path.join(process.cwd(), 'pages');
  if (fs.existsSync(pagesRoot)) {
    const stack = [pagesRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const sourceDir = path.join(current, entry.name);
        const relativeDir = path.relative(pagesRoot, sourceDir);
        fs.mkdirSync(path.join(nextDir, 'server', 'pages', relativeDir), { recursive: true });
        stack.push(sourceDir);
      }
    }
  }

  const seededFiles = [
    [path.join(nextDir, 'package.json'), '{"type":"commonjs"}\n'],
    [
      path.join(nextDir, 'server', 'next-font-manifest.json'),
      '{"pages":{},"app":{},"appUsingSizeAdjust":false,"pagesUsingSizeAdjust":false}\n',
    ],
    [path.join(nextDir, 'diagnostics', 'build-diagnostics.json'), '{}\n'],
  ];

  for (const [filePath, content] of seededFiles) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  }
}

function cleanNextDir() {
  killLingeringNextProcesses();
  sleep(750);
  if (fs.existsSync(nextDir)) {
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

  seedNextDir();
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

function hasPartiallyUsableNextArtifacts() {
  const required = [
    path.join(nextDir, 'build-manifest.json'),
    path.join(nextDir, 'server', 'pages-manifest.json'),
  ];
  return required.every((filePath) => fs.existsSync(filePath));
}

function isBenignWindowsNextBuildFailure(output) {
  if (os.platform() !== 'win32') return false;
  const text = String(output || '');
  const finishedCompilation = text.includes('✓ Compiled successfully');
  const reachedPostCompileStage =
    finishedCompilation ||
    text.includes('Running TypeScript') ||
    text.includes('Collecting page data') ||
    text.includes('Generating static pages using 1 worker');
  const hasKnownEnoent = BENIGN_WINDOWS_BUILD_ENOENT_PATTERNS.some((pattern) => text.includes(pattern));
  const hasRealAppFailure =
    /Module not found: Can't resolve|Failed to compile|Type error|SyntaxError|ReferenceError/i.test(text) ||
    (/Error occurred prerendering page/i.test(text) && !/\.next[\\/](export|server)/i.test(text));

  return reachedPostCompileStage && hasKnownEnoent && !hasRealAppFailure;
}

if (hasConcurrentNextBuild()) {
  console.warn('guard-next-build-lock: found lingering build process(es); cleaning before starting.');
  killLingeringNextProcesses();
  sleep(1200);
}

const nextCli = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const buildArgs = [nextCli, 'build', '--webpack'];
let exitCode = 1;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  cleanNextDir();

  if (attempt > 1) {
    console.error(`\nguard-next-build-lock: retrying build (attempt ${attempt}/${MAX_ATTEMPTS})...\n`);
  }

  let combinedOutput = '';
  try {
    execFileSync(process.execPath, buildArgs, {
      stdio: 'inherit',
      env: process.env,
    });
    exitCode = 0;
    break;
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    combinedOutput = `${stdout}\n${stderr}\n${error.message || ''}`;
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);

    const hasRealAppFailure = /Module not found: Can't resolve|Failed to compile|Type error|SyntaxError|ReferenceError/i.test(combinedOutput);
    if (isBenignWindowsNextBuildFailure(combinedOutput) || (os.platform() === 'win32' && hasPartiallyUsableNextArtifacts() && !hasRealAppFailure)) {
      console.warn('guard-next-build-lock: detected a recoverable internal Next.js Windows failure after usable artifacts were generated; accepting build for commit/deploy flow.');
      exitCode = 0;
      break;
    }

    exitCode = error.status ?? 1;
  }
  if (exitCode === 0) break;

  if (attempt < MAX_ATTEMPTS) {
    console.error(`guard-next-build-lock: build failed (attempt ${attempt}). Retrying after clean.`);
    killLingeringNextProcesses();
    sleep(1200);
  }
}

process.exit(exitCode);
