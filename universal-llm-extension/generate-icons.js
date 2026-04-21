/**
 * generate-icons.js — Gera ícones PNG para a extensão sem dependências externas.
 * Usa apenas Node.js built-in (zlib, fs, path, Buffer).
 * Cria icons/icon-16.png, icons/icon-48.png, icons/icon-128.png
 * dentro da fonte ativa da extensao (extension-app por padrao)
 *
 * Execução: node generate-icons.js
 */

const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");
const { getExtensionSourceDir } = require("./extension-paths");

const OUT_DIR = path.join(getExtensionSourceDir(), "icons");

// ─── CRC32 ────────────────────────────────────────────────────────────────────
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf    = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const payload  = Buffer.concat([typeBytes, data]);
  const crcBuf   = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([lenBuf, payload, crcBuf]);
}

// ─── Gerador de PNG solid-color + ícone simples ───────────────────────────────
function makePng(size) {
  // Desenha o ícone pixel a pixel: fundo azul-escuro + letra "AI" estilizada
  // Pixels: array de [R, G, B, A] por pixel
  const bg  = [15, 23, 42, 255];    // #0f172a — fundo escuro
  const acc = [99, 179, 237, 255];  // #63b3ed — azul claro (acento)
  const wh  = [255, 255, 255, 255]; // branco
  const tr  = [0,   0,   0,   0];   // transparente

  // Cria canvas como array plano [R,G,B,A, ...]
  const pixels = new Array(size * size).fill(null).map(() => [...bg]);

  function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    pixels[y * size + x] = color;
  }

  // Desenha um círculo de fundo com borda suave
  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r) {
        setPixel(x, y, tr); // fora do círculo: transparente
      } else if (dist > r - 1.5) {
        // borda: mistura com acento
        const t = (r - dist) / 1.5;
        setPixel(x, y, [
          Math.round(bg[0] * (1 - t) + acc[0] * t),
          Math.round(bg[1] * (1 - t) + acc[1] * t),
          Math.round(bg[2] * (1 - t) + acc[2] * t),
          255,
        ]);
      }
    }
  }

  // Para tamanhos >= 32, desenha "AI" simplificado com pixels
  if (size >= 32) {
    const scale = Math.max(1, Math.floor(size / 16));
    const ox = Math.floor(size * 0.18);  // offset x
    const oy = Math.floor(size * 0.22);  // offset y

    // Letra A (4×7 pixels escalados)
    const A = [
      [0,1,1,0],
      [1,0,0,1],
      [1,0,0,1],
      [1,1,1,1],
      [1,0,0,1],
      [1,0,0,1],
      [1,0,0,1],
    ];
    // Letra I (4×7 pixels escalados)
    const I = [
      [1,1,1,1],
      [0,1,1,0],
      [0,1,1,0],
      [0,1,1,0],
      [0,1,1,0],
      [0,1,1,0],
      [1,1,1,1],
    ];

    function drawGlyph(glyph, startX) {
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (!glyph[row][col]) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = startX + col * scale + sx;
              const py = oy + row * scale + sy;
              setPixel(px, py, wh);
            }
          }
        }
      }
    }

    drawGlyph(A, ox);
    drawGlyph(I, ox + 5 * scale);
  } else {
    // Para tamanhos pequenos (16px): ponto branco no centro
    const c = Math.floor(size / 2);
    setPixel(c, c, wh);
    setPixel(c - 1, c, wh);
    setPixel(c, c - 1, wh);
    setPixel(c + 1, c, wh);
    setPixel(c, c + 1, wh);
  }

  // ─── Montar PNG ───────────────────────────────────────────────────────────
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT: raw data por linha, filtro 0 (None)
  const rawData = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = pixels[y * size + x];
      const off = rowOffset + 1 + x * 4;
      rawData[off]     = px[0];
      rawData[off + 1] = px[1];
      rawData[off + 2] = px[2];
      rawData[off + 3] = px[3];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Criado: ${OUT_DIR}`);
  }

  for (const size of [16, 48, 128]) {
    const outFile = path.join(OUT_DIR, `icon-${size}.png`);
    const png = makePng(size);
    fs.writeFileSync(outFile, png);
    console.log(`✓ ${outFile}  (${size}×${size}, ${png.length} bytes)`);
  }

  console.log("\nÍcones gerados com sucesso!");
  console.log(`Localização: ${OUT_DIR}`);
}

main();
