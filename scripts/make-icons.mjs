// Generate Sahara PWA icons — pure Node, zero dependencies.
// Motif: a white lifebuoy (rescue ring + 4 handles) on an opaque Apple-blue gradient.
// Guarantees alpha=255 everywhere (opaque) — REQUIRED for Android "any" icons,
// otherwise the launcher shows a blank/gray tile.
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });

// ---- PNG primitives ---------------------------------------------------------
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- shape helpers -----------------------------------------------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Smooth ring band with anti-aliased edges.
function ringAlpha(d, inner, outer, aa) {
  const a = Math.min(clamp01((d - (inner - aa)) / aa), clamp01((outer + aa - d) / aa));
  return clamp01(a);
}

// Axis-aligned rectangle coverage with anti-aliased edges.
function rectAlpha(px, py, cx, cy, halfW, halfH, aa) {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  const ax = clamp01((halfW + aa - dx) / aa);
  const ay = clamp01((halfH + aa - dy) / aa);
  return clamp01(Math.min(ax, ay));
}

function render(size, { innerFrac, outerFrac, handleHw, handleHl, top, bottom, aa }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const inner = innerFrac * size;
  const outer = outerFrac * size;
  const handleW = handleHw * size; // half-width of each handle
  const handleL = handleHl * size; // half-length of each handle (radial)
  // handle centers sit on the outer radius, protruding outward
  const hc = outer + handleL * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
      const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
      const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255; // always opaque

      const d = Math.hypot(x - cx, y - cy);
      let a = ringAlpha(d, inner, outer, aa);
      // 4 lifebuoy handles at N / S / E / W
      a = Math.max(
        a,
        rectAlpha(x, y, cx, cy - hc, handleW, handleL, aa),
        rectAlpha(x, y, cx, cy + hc, handleW, handleL, aa),
        rectAlpha(x, y, cx - hc, cy, handleL, handleW, aa),
        rectAlpha(x, y, cx + hc, cy, handleL, handleW, aa)
      );

      if (a > 0) {
        rgba[i] = Math.round(r + (255 - r) * a);
        rgba[i + 1] = Math.round(g + (255 - g) * a);
        rgba[i + 2] = Math.round(b + (255 - b) * a);
      }
    }
  }
  return rgba;
}

const TOP = [30, 143, 255]; // #1E8FFF
const BOTTOM = [0, 96, 223]; // #0060DF

// icon-*/favicon are "any" icons: full-bleed ring, must stay opaque.
// maskable: shrink the buoy into the central ~66% safe zone (glyph ≈ 60% of size).
const targets = [
  { file: 'icon-192.png', size: 192, innerFrac: 0.28, outerFrac: 0.40, handleHw: 0.050, handleHl: 0.10, aa: 1.5 },
  { file: 'icon-512.png', size: 512, innerFrac: 0.28, outerFrac: 0.40, handleHw: 0.050, handleHl: 0.10, aa: 3 },
  { file: 'favicon-192.png', size: 192, innerFrac: 0.28, outerFrac: 0.40, handleHw: 0.050, handleHl: 0.10, aa: 1.5 },
  { file: 'icon-maskable-512.png', size: 512, innerFrac: 0.19, outerFrac: 0.28, handleHw: 0.035, handleHl: 0.07, aa: 3 },
  { file: 'splash.png', size: 512, innerFrac: 0.28, outerFrac: 0.40, handleHw: 0.050, handleHl: 0.10, aa: 3 },
];

for (const tg of targets) {
  const rgba = render(tg.size, { innerFrac: tg.innerFrac, outerFrac: tg.outerFrac, handleHw: tg.handleHw, handleHl: tg.handleHl, top: TOP, bottom: BOTTOM, aa: tg.aa });
  let opaque = true;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) { opaque = false; break; }
  }
  const png = encodePNG(tg.size, tg.size, rgba);
  writeFileSync(join(OUT, tg.file), png);
  console.log(`${tg.file}: ${png.length} bytes, alpha_255_everywhere=${opaque}`);
}