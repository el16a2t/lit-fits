// Pure-JS image pipeline: decode → chroma-key → trim → resize → encode.
// Runs inside the Supabase Edge runtime (tight CPU budget), so every loop is a flat typed-array pass.
import { decode as decodePng, encode as encodePng } from 'fast-png';
import jpeg from 'jpeg-js';

export interface Raster {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, 8-bit
}

export function sniffMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | 'unknown' {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  return 'unknown';
}

export function decodeImage(bytes: Uint8Array): Raster {
  const mime = sniffMime(bytes);
  if (mime === 'image/jpeg') {
    const j = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    return { width: j.width, height: j.height, data: j.data as Uint8Array };
  }
  if (mime === 'image/png') {
    const p = decodePng(bytes);
    const { width, height } = p;
    const ch = p.channels;
    const src = p.data as Uint8Array | Uint16Array;
    const out = new Uint8Array(width * height * 4);
    const shift = p.depth === 16 ? 8 : 0;
    if (p.palette) {
      const pal = p.palette as number[][];
      for (let i = 0, n = width * height; i < n; i++) {
        const c = pal[src[i]] ?? [0, 0, 0, 255];
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = c[3] ?? 255;
      }
      return { width, height, data: out };
    }
    for (let i = 0, n = width * height; i < n; i++) {
      const s = i * ch;
      if (ch >= 3) {
        out[i * 4] = src[s] >> shift; out[i * 4 + 1] = src[s + 1] >> shift; out[i * 4 + 2] = src[s + 2] >> shift;
        out[i * 4 + 3] = ch === 4 ? src[s + 3] >> shift : 255;
      } else {
        const g = src[s] >> shift;
        out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g;
        out[i * 4 + 3] = ch === 2 ? src[s + 1] >> shift : 255;
      }
    }
    return { width, height, data: out };
  }
  throw new Error(`Unsupported image format (${mime})`);
}

export function toPng(r: Raster): Uint8Array {
  return encodePng({ width: r.width, height: r.height, data: r.data, channels: 4, depth: 8 });
}

export function toJpeg(r: Raster, quality = 82, background = [243, 241, 236]): Uint8Array {
  // flatten alpha onto a background
  const d = new Uint8Array(r.data.length);
  for (let i = 0; i < r.data.length; i += 4) {
    const a = r.data[i + 3] / 255;
    d[i] = r.data[i] * a + background[0] * (1 - a);
    d[i + 1] = r.data[i + 1] * a + background[1] * (1 - a);
    d[i + 2] = r.data[i + 2] * a + background[2] * (1 - a);
    d[i + 3] = 255;
  }
  return jpeg.encode({ width: r.width, height: r.height, data: d }, quality).data as Uint8Array;
}

/** Box/bilinear hybrid downscale (area-average when shrinking a lot, bilinear otherwise). Premultiplied to avoid dark fringes. */
export function resize(r: Raster, maxSide: number): Raster {
  const scale = Math.min(1, maxSide / Math.max(r.width, r.height));
  if (scale >= 0.999) return r;
  const w = Math.max(1, Math.round(r.width * scale));
  const h = Math.max(1, Math.round(r.height * scale));
  const out = new Uint8Array(w * h * 4);
  const sx = r.width / w, sy = r.height / h;
  const src = r.data, sw = r.width;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(r.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(sw, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let rr = 0, gg = 0, bb = 0, aa = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * sw + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          const a = src[p + 3];
          rr += src[p] * a; gg += src[p + 1] * a; bb += src[p + 2] * a; aa += a; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (aa > 0) { out[o] = rr / aa; out[o + 1] = gg / aa; out[o + 2] = bb / aa; }
      out[o + 3] = aa / n;
    }
  }
  return { width: w, height: h, data: out };
}

export function crop(r: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= r.height) continue;
    for (let col = 0; col < w; col++) {
      const sx = x + col;
      if (sx < 0 || sx >= r.width) continue;
      const si = (sy * r.width + sx) * 4, di = (row * w + col) * 4;
      out[di] = r.data[si]; out[di + 1] = r.data[si + 1]; out[di + 2] = r.data[si + 2]; out[di + 3] = r.data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** Trim fully transparent margins, then pad by `padFrac` of the larger side. */
export function trim(r: Raster, padFrac = 0.04, threshold = 24): Raster {
  let minX = r.width, minY = r.height, maxX = -1, maxY = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.data[(y * r.width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return r;
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * padFrac);
  return crop(r, minX - pad, minY - pad, maxX - minX + 1 + pad * 2, maxY - minY + 1 + pad * 2);
}

export const KEY_COLOURS = {
  green: { hex: '#00FF00', name: 'pure chroma-key green', hue: 120 },
  magenta: { hex: '#FF00FF', name: 'pure magenta', hue: 300 },
  blue: { hex: '#0000FF', name: 'pure chroma-key blue', hue: 240 },
} as const;
export type KeyName = keyof typeof KEY_COLOURS;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Pick the key colour whose hue is furthest from the garment's saturated colours. */
export function chooseKey(garmentHexes: string[]): KeyName {
  const hues: number[] = [];
  for (const hex of garmentHexes) {
    try {
      const [r, g, b] = hexToRgb(hex);
      const [h, s, v] = rgbToHsv(r, g, b);
      if (s > 0.18 && v > 0.12) hues.push(h);
    } catch { /* ignore */ }
  }
  if (!hues.length) return 'green';
  let best: KeyName = 'green', bestScore = -1;
  for (const k of Object.keys(KEY_COLOURS) as KeyName[]) {
    const score = Math.min(...hues.map((h) => hueDist(h, KEY_COLOURS[k].hue)));
    // gentle preference for green (best-behaved spill), then magenta
    const bias = k === 'green' ? 6 : k === 'magenta' ? 3 : 0;
    if (score + bias > bestScore) { bestScore = score + bias; best = k; }
  }
  return best;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Chroma-key the background out. Samples the actual backdrop colour from the border (models never
 * render the exact hex), scores pixels by hue proximity + saturation, removes spill on edges, and
 * only clears key-coloured regions connected to the border so interior details survive.
 */
export function keyOut(r: Raster, key: KeyName): { raster: Raster; coverage: number } {
  const { width: w, height: h, data } = r;
  const n = w * h;
  // 1. sample border to find the real backdrop hue
  let hs = 0, hc = 0, sx = 0, sy2 = 0;
  const sample = (i: number) => {
    const [hh, s, v] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s > 0.3 && v > 0.2 && hueDist(hh, KEY_COLOURS[key].hue) < 50) {
      sx += Math.cos((hh * Math.PI) / 180); sy2 += Math.sin((hh * Math.PI) / 180); hs += s; hc++;
    }
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));
  for (let x = 0; x < w; x += step) { sample(x); sample((h - 1) * w + x); sample(Math.floor(h * 0.02) * w + x); }
  for (let y = 0; y < h; y += step) { sample(y * w); sample(y * w + w - 1); sample(y * w + Math.floor(w * 0.02)); }
  let keyHue: number = KEY_COLOURS[key].hue;
  if (hc > 10) { keyHue = (Math.atan2(sy2, sx) * 180) / Math.PI; if (keyHue < 0) keyHue += 360; }
  const keySat = hc > 10 ? hs / hc : 0.9;

  // 2. per-pixel key score (1 = definitely backdrop)
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const [hh, s, v] = rgbToHsv(data[p], data[p + 1], data[p + 2]);
    const hueScore = 1 - smooth(16, 40, hueDist(hh, keyHue));
    const satScore = smooth(keySat * 0.28, keySat * 0.62, s);
    const valScore = smooth(0.06, 0.2, v);
    score[i] = hueScore * satScore * valScore;
  }

  // 3. flood from border through strongly-keyed pixels → "connected backdrop"
  const bg = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => { if (!bg[i] && score[i] > 0.5) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  // dilate the connected region by 2px so soft edges are included in keying
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) near[yy * w + xx] = 1;
    }
  }

  // 4. alpha + despill
  const out = new Uint8Array(n * 4);
  let opaque = 0;
  const [kr, kg, kb] = key === 'green' ? [0, 1, 0] : key === 'blue' ? [0, 0, 1] : [1, 0, 1];
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let rr = data[p], gg = data[p + 1], bb = data[p + 2];
    let a = 1;
    if (bg[i]) a = 0;
    else if (near[i]) a = 1 - score[i];
    else if (score[i] > 0.92) a = 1 - score[i]; // enclosed holes (e.g. between straps) that are pure key
    if (a > 0 && (near[i] || score[i] > 0.15)) {
      // spill suppression, weighted by proximity to key hue
      const [hh] = rgbToHsv(rr, gg, bb);
      const wgt = 1 - smooth(25, 70, hueDist(hh, keyHue));
      if (wgt > 0) {
        if (kg && !kr) { const lim = Math.max(rr, bb); if (gg > lim) gg = gg - (gg - lim) * wgt; }
        else if (kb && !kr) { const lim = Math.max(rr, gg); if (bb > lim) bb = bb - (bb - lim) * wgt; }
        else { const m = Math.min(rr, bb); if (m > gg) { rr -= (m - gg) * wgt; bb -= (m - gg) * wgt; } }
      }
    }
    out[p] = rr; out[p + 1] = gg; out[p + 2] = bb; out[p + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    if (a > 0.5) opaque++;
  }
  return { raster: { width: w, height: h, data: out }, coverage: opaque / n };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Simple contact sheet for QA: tiles rasters on a light background with fixed cell size. */
export function contactSheet(tiles: Raster[], cols: number, cell = 320, gap = 8): Raster {
  const rows = Math.ceil(tiles.length / cols);
  const W = cols * cell + (cols + 1) * gap, H = rows * cell + (rows + 1) * gap;
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = 236; data[i * 4 + 1] = 233; data[i * 4 + 2] = 226; data[i * 4 + 3] = 255; }
  // checkerboard under each cell so transparency is visible
  tiles.forEach((t, idx) => {
    const r = resize(t, cell);
    const cx = gap + (idx % cols) * (cell + gap), cy = gap + Math.floor(idx / cols) * (cell + gap);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const o = ((cy + y) * W + cx + x) * 4;
      const c = ((x >> 4) + (y >> 4)) % 2 ? 250 : 228;
      data[o] = c; data[o + 1] = c; data[o + 2] = c;
    }
    const ox = cx + Math.floor((cell - r.width) / 2), oy = cy + Math.floor((cell - r.height) / 2);
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      const s = (y * r.width + x) * 4, o = ((oy + y) * W + ox + x) * 4;
      const a = r.data[s + 3] / 255;
      data[o] = r.data[s] * a + data[o] * (1 - a);
      data[o + 1] = r.data[s + 1] * a + data[o + 1] * (1 - a);
      data[o + 2] = r.data[s + 2] * a + data[o + 2] * (1 - a);
    }
  });
  return { width: W, height: H, data };
}

/** Read width/height from PNG/JPEG headers without decoding pixels. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}
