/**
 * build.js — Empacota a extensão Chrome/Edge em um .zip instalável.
 * Usa apenas Node.js built-ins (fs, path, zlib, crypto) — sem dependências extras.
 *
 * Execução: node build.js
 * Saída:    dist/universal-llm-assistant-v{versão}.zip
 */

const fs     = require("fs");
const path   = require("path");
const zlib   = require("zlib");
const crypto = require("crypto");

const EXT_DIR  = path.resolve(__dirname, "../_tmp_universal_llm_assistant");
const DIST_DIR = path.resolve(__dirname, "dist");

// Arquivos incluídos no pacote
const INCLUDE_FILES = [
  "manifest.json",
  "bg.js",
  "panel.html",
  "panel.js",
  "panel/bridge.js",
  "panel/browser.js",
  "panel/chat.js",
  "panel/dom.js",
  "panel/error-log.js",
  "panel/lists.js",
  "panel/panel.css",
  "panel/settings.js",
  "panel/state.js",
  "panel/template.js",
  "panel/utils.js",
  "content.js",
  "content/shared.js",
  "content/recording.js",
  "content/replay.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

// ─── Mini implementação de ZIP (PKWARE .zip format) ──────────────────────────
// Suporte: deflate + stored. Suficiente para extensões Chrome/Edge.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf, initial = 0xffffffff) {
  let c = initial;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date: date >>> 0, time: time >>> 0 };
}

function buildZip(entries) {
  // entries: [{ name, data: Buffer }]
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf   = Buffer.from(entry.name, "utf8");
    const data      = entry.data;
    const crc       = crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = compressed.length < data.length;
    const compData   = useDeflate ? compressed : data;
    const method     = useDeflate ? 8 : 0;
    const { date, time } = dosDateTime();

    // Local file header
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      u16LE(20),           // version needed
      u16LE(0),            // flags
      u16LE(method),       // compression
      u16LE(time),
      u16LE(date),
      u32LE(crc),
      u32LE(compData.length),
      u32LE(data.length),
      u16LE(nameBuf.length),
      u16LE(0),            // extra length
      nameBuf,
      compData,
    ]);

    // Central directory header
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      u16LE(20),           // version made by
      u16LE(20),           // version needed
      u16LE(0),            // flags
      u16LE(method),
      u16LE(time),
      u16LE(date),
      u32LE(crc),
      u32LE(compData.length),
      u32LE(data.length),
      u16LE(nameBuf.length),
      u16LE(0),            // extra length
      u16LE(0),            // comment length
      u16LE(0),            // disk start
      u16LE(0),            // int attr
      u32LE(0),            // ext attr
      u32LE(offset),       // local header offset
      nameBuf,
    ]);

    localHeaders.push(local);
    centralHeaders.push(central);
    offset += local.length;
  }

  const centralDir   = Buffer.concat(centralHeaders);
  const centralStart = offset;

  // End of central directory
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
    u16LE(0), u16LE(0),
    u16LE(entries.length),
    u16LE(entries.length),
    u32LE(centralDir.length),
    u32LE(centralStart),
    u16LE(0),
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  // 1. Verifica que os ícones existem; se não, tenta gerá-los
  const iconsDir = path.join(EXT_DIR, "icons");
  const missingIcons = INCLUDE_FILES
    .filter(f => f.startsWith("icons/"))
    .filter(f => !fs.existsSync(path.join(EXT_DIR, f)));

  if (missingIcons.length > 0) {
    console.log("Ícones ausentes. Gerando...");
    try {
      require("./generate-icons.js");
    } catch (e) {
      console.error("Falha ao gerar ícones:", e.message);
      console.error("Execute: node generate-icons.js");
      process.exit(1);
    }
  }

  // 2. Lê a versão do manifest
  const manifestPath = path.join(EXT_DIR, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const version = manifest.version || "0.0.0";

  // 3. Coleta os arquivos
  const missing = INCLUDE_FILES.filter(f => !fs.existsSync(path.join(EXT_DIR, f)));
  if (missing.length > 0) {
    console.error("Arquivos ausentes:", missing.join(", "));
    process.exit(1);
  }

  const entries = INCLUDE_FILES.map(f => ({
    name: f,
    data: fs.readFileSync(path.join(EXT_DIR, f)),
  }));

  // 4. Monta o zip
  const zipBuf = buildZip(entries);

  // 5. Salva
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  const outName = `universal-llm-assistant-v${version}.zip`;
  const outPath = path.join(DIST_DIR, outName);
  const unpackedDir = path.join(DIST_DIR, `universal-llm-assistant-v${version}`);
  fs.writeFileSync(outPath, zipBuf);
  syncUnpacked(entries, unpackedDir);

  const kb = (zipBuf.length / 1024).toFixed(1);
  console.log(`\n✓ Extensão empacotada: ${outPath}  (${kb} KB)`);
  console.log("\nPara instalar no Chrome:");
  console.log("  1. Extraia o zip em uma pasta");
  console.log("  2. Abra chrome://extensions");
  console.log("  3. Ative 'Modo do desenvolvedor'");
  console.log("  4. Clique em 'Carregar sem compactação' → selecione a pasta extraída");
  console.log("\nPara instalar no Edge:");
  console.log("  1. Abra edge://extensions");
  console.log("  2. Ative 'Modo do desenvolvedor'");
  console.log("  3. Clique em 'Carregar sem compactação' → selecione a pasta extraída");
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

main();
