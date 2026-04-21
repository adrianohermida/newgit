/**
 * build.js - Empacota a extensao Chrome/Edge em um .zip instalavel.
 * Usa apenas Node.js built-ins (fs, path, zlib).
 *
 * Execucao: node build.js
 * Saida:    dist/universal-llm-assistant-v{versao}.zip
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { getExtensionSourceDir } = require("./extension-paths");

const EXT_DIR = getExtensionSourceDir();
const DIST_DIR = path.resolve(__dirname, "dist");

const ROOT_FILES = [
  "manifest.json",
  "bg.js",
  "panel.html",
  "panel.js",
  "content.js",
];

const RECURSIVE_DIRS = [
  "panel",
  "content",
  "icons",
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf, initial = 0xffffffff) {
  let c = initial;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16LE(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32LE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date: date >>> 0, time: time >>> 0 };
}

function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const compData = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;
    const { date, time } = dosDateTime();

    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16LE(20),
      u16LE(0),
      u16LE(method),
      u16LE(time),
      u16LE(date),
      u32LE(crc),
      u32LE(compData.length),
      u32LE(data.length),
      u16LE(nameBuf.length),
      u16LE(0),
      nameBuf,
      compData,
    ]);

    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16LE(20),
      u16LE(20),
      u16LE(0),
      u16LE(method),
      u16LE(time),
      u16LE(date),
      u32LE(crc),
      u32LE(compData.length),
      u32LE(data.length),
      u16LE(nameBuf.length),
      u16LE(0),
      u16LE(0),
      u16LE(0),
      u16LE(0),
      u32LE(0),
      u32LE(offset),
      nameBuf,
    ]);

    localHeaders.push(local);
    centralHeaders.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centralHeaders);
  const centralStart = offset;
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16LE(0),
    u16LE(0),
    u16LE(entries.length),
    u16LE(entries.length),
    u32LE(centralDir.length),
    u32LE(centralStart),
    u16LE(0),
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

function collectIncludeFiles() {
  const output = [];
  ROOT_FILES.forEach((file) => output.push(file));
  RECURSIVE_DIRS.forEach((dir) => walkDir(path.join(EXT_DIR, dir), dir, output));
  return [...new Set(output)].sort((a, b) => a.localeCompare(b));
}

function walkDir(absDir, relDir, output) {
  if (!fs.existsSync(absDir)) return;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    const relPath = path.posix.join(relDir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      walkDir(absPath, relPath, output);
      continue;
    }
    output.push(relPath);
  }
}

function syncUnpacked(entries, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of entries) {
    const target = path.join(outDir, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
}

function main() {
  const includeFiles = collectIncludeFiles();
  const manifestPath = path.join(EXT_DIR, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const version = manifest.version || "0.0.0";
  const missing = includeFiles.filter((file) => !fs.existsSync(path.join(EXT_DIR, file)));
  if (missing.length) {
    console.error("Arquivos ausentes:", missing.join(", "));
    process.exit(1);
  }

  const entries = includeFiles.map((file) => ({
    name: file,
    data: fs.readFileSync(path.join(EXT_DIR, file)),
  }));

  const zipBuf = buildZip(entries);
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  const outName = `universal-llm-assistant-v${version}.zip`;
  const outPath = path.join(DIST_DIR, outName);
  const unpackedDir = path.join(DIST_DIR, `universal-llm-assistant-v${version}`);
  fs.writeFileSync(outPath, zipBuf);
  syncUnpacked(entries, unpackedDir);

  const kb = (zipBuf.length / 1024).toFixed(1);
  console.log(`\nExtensao empacotada: ${outPath} (${kb} KB)`);
}

main();
