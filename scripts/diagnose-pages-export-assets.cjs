const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const outDir = path.join(root, "out");

function walk(dir, bucket = []) {
  if (!fs.existsSync(dir)) return bucket;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, bucket);
    else bucket.push(full);
  }
  return bucket;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function analyzeHtml(file) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  const links = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]);
  const assets = [...new Set([...scripts, ...links])]
    .filter((item) => item.startsWith("/_next/"));

  const missing = [];
  for (const asset of assets) {
    const target = path.join(outDir, asset.replace(/^\//, ""));
    if (!fs.existsSync(target)) {
      missing.push(asset);
    }
  }

  return {
    file: toPosix(path.relative(root, file)),
    assetsChecked: assets.length,
    missing,
  };
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.error("diagnose-pages-export-assets: pasta out/ não encontrada. Rode `npm run build` antes.");
    process.exit(1);
  }

  const htmlFiles = walk(outDir).filter((file) => file.endsWith(".html"));
  const report = htmlFiles.map(analyzeHtml);
  const failures = report.filter((entry) => entry.missing.length > 0);

  console.log(
    JSON.stringify(
      {
        checkedHtmlFiles: report.length,
        failedFiles: failures.length,
        results: report,
        diagnosis:
          failures.length > 0
            ? [
                "Há páginas exportadas referenciando assets inexistentes em out/_next/static.",
                "Isso pode gerar 404/503 de chunk após deploy parcial ou build inconsistente.",
              ]
            : [
                "Todas as páginas exportadas referenciam assets presentes em out/_next/static.",
                "Se houver 404/503 em produção, a causa mais provável é deploy parcial, cache antigo ou publicação fora do build conectado do Cloudflare Pages.",
              ],
      },
      null,
      2
    )
  );

  process.exit(failures.length ? 1 : 0);
}

main();
