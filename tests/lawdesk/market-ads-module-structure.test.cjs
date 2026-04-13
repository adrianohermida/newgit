const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const repoRoot = "D:/Github/newgit";
const moduleRoot = path.join(repoRoot, "components/interno/market-ads");
const pageEntry = path.join(repoRoot, "pages/interno/market-ads.js");

const tests = [];

function registerTest(name, fn) {
  tests.push({ name, fn });
}

async function readFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

function countLines(source) {
  return source.split(/\r?\n/).length;
}

async function listJsFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listJsFiles(absolutePath);
      }
      return absolutePath.endsWith(".js") ? [absolutePath] : [];
    }),
  );

  return nested.flat();
}

registerTest("market ads page entry delegates to the componentized module", async () => {
  const source = await readFile(pageEntry);

  assert.match(source, /import MarketAdsPage from "\.\.\/\.\.\/components\/interno\/market-ads";/);
  assert.match(source, /export default MarketAdsPage;/);
});

registerTest("market ads page shell stays below the maintenance line budget", async () => {
  const source = await readFile(path.join(moduleRoot, "MarketAdsPage.js"));
  assert.ok(countLines(source) <= 200, "MarketAdsPage.js should stay at or below 200 lines");
});

registerTest("market ads components and hooks stay below the 150-line limit", async () => {
  const files = await listJsFiles(moduleRoot);
  const ignoredFiles = new Set(["index.js"]);
  const oversized = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (ignoredFiles.has(fileName)) {
      continue;
    }

    const source = await readFile(filePath);
    const lineCount = countLines(source);

    if (lineCount > 150) {
      oversized.push(`${path.relative(repoRoot, filePath)} (${lineCount} lines)`);
    }
  }

  assert.deepEqual(
    oversized,
    [],
    `These files exceeded the 150-line maintenance limit:\n${oversized.join("\n")}`,
  );
});

registerTest("module barrel exposes the main market ads building blocks", async () => {
  const source = await readFile(path.join(moduleRoot, "index.js"));

  for (const exportName of [
    "MarketAdsPage",
    "SummarySection",
    "IntegrationsSection",
    "FormsWorkspaceSection",
    "OperationsInsightsPanel",
    "CompetitorInsightsPanel",
    "useMarketAdsController",
  ]) {
    assert.match(source, new RegExp(`export \\{ default as ${exportName} \\}`));
  }
});

async function run() {
  let failures = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`PASS ${tests.length} tests`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
