const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "out");
const nextStaticDir = path.join(outDir, "_next", "static");
// _redirects e _routes.json são gerados automaticamente por generate-cf-pages-redirects.cjs
// e NÃO devem ser copiados da raiz (evita sobrescrever o gerado com o estático antigo)
const passthroughFiles = ["_headers"];
const passthroughDirs = ["functions"];

function walk(dir, bucket = []) {
  if (!fs.existsSync(dir)) return bucket;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, bucket);
    else bucket.push(full);
  }
  return bucket;
}

function normalizeAssetName(name) {
  return name.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
}

function copyPassthroughFiles() {
  if (!fs.existsSync(outDir)) return [];
  const copied = [];

  for (const fileName of passthroughFiles) {
    const source = path.join(root, fileName);
    if (!fs.existsSync(source)) continue;
    const target = path.join(outDir, fileName);
    fs.copyFileSync(source, target);
    copied.push(fileName);
  }

  for (const dirName of passthroughDirs) {
    const source = path.join(root, dirName);
    if (!fs.existsSync(source)) continue;
    const target = path.join(outDir, dirName);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.cpSync(source, target, { recursive: true });
    copied.push(dirName);
  }

  return copied;
}

function main() {
  const copiedPassthrough = copyPassthroughFiles();

  if (!fs.existsSync(outDir) || !fs.existsSync(nextStaticDir)) {
    if (copiedPassthrough.length) {
      console.log(`normalize-pages-export-assets: copied passthrough file(s): ${copiedPassthrough.join(", ")}`);
    }
    console.log("skip: out/_next/static not found");
    return;
  }

  const allFiles = walk(outDir);
  const renamed = [];

  for (const file of walk(nextStaticDir)) {
    const base = path.basename(file);
    if (!base.includes("[") && !base.includes("]")) continue;
    const encodedBase = normalizeAssetName(base);
    if (encodedBase === base) continue;
    const encodedPath = path.join(path.dirname(file), encodedBase);
    fs.copyFileSync(file, encodedPath);
    renamed.push({ raw: base, encoded: encodedBase });
  }

  if (!renamed.length) {
    if (copiedPassthrough.length) {
      console.log(`normalize-pages-export-assets: copied passthrough file(s): ${copiedPassthrough.join(", ")}`);
    }
    console.log("normalize-pages-export-assets: no bracketed assets found");
    return;
  }

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    if (![".html", ".js", ".json", ".txt", ".xml"].includes(ext)) continue;
    let content = fs.readFileSync(file, "utf8");
    let changed = false;
    for (const item of renamed) {
      if (content.includes(item.raw)) {
        content = content.split(item.raw).join(item.encoded);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(file, content, "utf8");
  }

  console.log(`normalize-pages-export-assets: normalized ${renamed.length} asset(s)`);
  for (const item of renamed) {
    console.log(` - ${item.raw} -> ${item.encoded}`);
  }
  if (copiedPassthrough.length) {
    console.log(`normalize-pages-export-assets: copied passthrough file(s): ${copiedPassthrough.join(", ")}`);
  }
}

main();
