const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const nextDir = path.join(process.cwd(), '.next');
const lockPath = path.join(nextDir, 'lock');

function hasConcurrentNextBuild() {
  try {
    if (os.platform() === 'win32') {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -match 'next\\\\dist\\\\bin\\\\next\" build' } | Select-Object -ExpandProperty ProcessId"`;
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      return out.length > 0;
    }

    const out = execSync("ps -ax -o command= | grep -E 'next(.+)?dist/bin/next build' | grep -v grep", {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/sh',
    })
      .toString()
      .trim();

    return out.length > 0;
  } catch {
    return false;
  }
}

if (hasConcurrentNextBuild()) {
  console.error('guard-next-build-lock: another next build process is running; aborting this build.');
  process.exit(1);
}

if (!fs.existsSync(nextDir)) {
  process.exit(0);
}

try {
  fs.rmSync(nextDir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
  console.log('guard-next-build-lock: cleaned stale .next directory.');
} catch (error) {
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
      console.log('guard-next-build-lock: removed stale .next/lock file after cleanup retry.');
      process.exit(0);
    } catch {
      // fall through to consolidated error below
    }
  }

  console.error(`guard-next-build-lock: failed to clean .next directory: ${error.message}`);
  process.exit(1);
}
