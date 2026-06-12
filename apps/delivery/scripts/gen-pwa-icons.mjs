// gen-pwa-icons.mjs — Genera los iconos PWA del repartidor sin dependencias.
// Fondo #ff5c35 + iniciales "MB" en blanco, rasterizadas con una fuente
// bitmap 5x7. Produce: icon-192, icon-512, icon-maskable-512, apple-touch-icon.
//
// Uso:  node apps/delivery/scripts/gen-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public");
mkdirSync(OUT_DIR, { recursive: true });

// Marca
const BG = [0xff, 0x5c, 0x35]; // #ff5c35
const FG = [0xff, 0xff, 0xff]; // blanco

// Fuente bitmap 5x7 para las letras que necesitamos.
const GLYPHS = {
  M: [
    "10001",
    "11011",
    "10101",
    "10101",
    "10001",
    "10001",
    "10001",
  ],
  B: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10001",
    "10001",
    "11110",
  ],
};
const GLYPH_W = 5;
const GLYPH_H = 7;
const SPACE = 1; // columnas en blanco entre letras (en unidades de glifo)

// --- Encoder PNG (RGBA, sin filtros) ---------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0

  // raw: cada scanline precedida de un byte de filtro (0 = none)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Render ----------------------------------------------------------------
// safeRatio: fracción del lado donde se dibuja el texto (maskable necesita
// dejar ~20% de margen seguro porque Android recorta a un círculo/squircle).
function renderIcon(size, text, safeRatio) {
  const rgba = Buffer.alloc(size * size * 4);
  // Fondo
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 0xff;
  }

  // Ancho total del texto en celdas de glifo
  const cells = text.length * GLYPH_W + (text.length - 1) * SPACE;
  const safe = size * safeRatio;
  // escala para que el texto entre en el cuadro seguro (limitado por ancho y alto)
  const scale = Math.floor(Math.min(safe / cells, safe / GLYPH_H));
  const textW = cells * scale;
  const textH = GLYPH_H * scale;
  const offsetX = Math.round((size - textW) / 2);
  const offsetY = Math.round((size - textH) / 2);

  let penX = offsetX;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (glyph[gy][gx] !== "1") continue;
        // pinta el bloque scale x scale
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const x = penX + gx * scale + px;
            const y = offsetY + gy * scale + py;
            const idx = (y * size + x) * 4;
            rgba[idx] = FG[0];
            rgba[idx + 1] = FG[1];
            rgba[idx + 2] = FG[2];
            rgba[idx + 3] = 0xff;
          }
        }
      }
    }
    penX += (GLYPH_W + SPACE) * scale;
  }

  return encodePng(size, size, rgba);
}

const targets = [
  { file: "icon-192.png", size: 192, safe: 0.62 },
  { file: "icon-512.png", size: 512, safe: 0.62 },
  { file: "icon-maskable-512.png", size: 512, safe: 0.44 }, // margen para el recorte
  { file: "apple-touch-icon.png", size: 180, safe: 0.62 },
];

for (const t of targets) {
  const png = renderIcon(t.size, "MB", t.safe);
  writeFileSync(join(OUT_DIR, t.file), png);
  console.log(`✓ ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
console.log(`Iconos generados en ${OUT_DIR}`);
