const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "out");
const nextStaticDir = path.join(outDir, "_next", "static");

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

function main() {
  if (!fs.existsSync(outDir) || !fs.existsSync(nextStaticDir)) {
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
}

main();
