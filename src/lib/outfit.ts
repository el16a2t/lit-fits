// Local styling heuristics — instant, offline. Powers the mixer's smart ordering, Shuffle and canvas layout.
import { SLOT_ORDER, SUBTYPE_MAP, type Slot } from './taxonomy';
import type { CanvasPiece, Item } from './types';

const NEUTRALS = new Set(['black', 'charcoal', 'grey', 'white', 'ecru', 'beige', 'tan', 'brown', 'olive', 'navy', 'denim']);
const LOUD_PATTERNS = new Set(['Check / plaid', 'Gingham', 'Houndstooth', 'Stripe', 'Pinstripe', 'Graphic', 'Logo', 'Camo', 'Floral', 'Paisley', 'Fair Isle', 'Colour-block']);

export const isNeutral = (i: Item) => !i.colour_family || NEUTRALS.has(i.colour_family);
export const isStatement = (i: Item) =>
  (i.pattern ? LOUD_PATTERNS.has(i.pattern) : false) || i.tags?.some((t) => ['statement', 'graphic', 'logo'].includes(t.toLowerCase())) || (!isNeutral(i) && (i.colours?.[0]?.share ?? 0) > 0.5);

function hueDist(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 0..1 — how well two pieces sit together. */
export function pairScore(a: Item, b: Item): number {
  let s = 0.6;
  // formality coherence
  const fd = Math.abs((a.formality ?? 2) - (b.formality ?? 2));
  s += fd === 0 ? 0.15 : fd === 1 ? 0.1 : fd === 2 ? -0.1 : -0.3;
  // warmth coherence (shorts + parka = no)
  const wd = Math.abs((a.warmth ?? 3) - (b.warmth ?? 3));
  if (wd >= 3) s -= 0.2;
  // colour
  const an = isNeutral(a), bn = isNeutral(b);
  if (an && bn) s += 0.1;
  else if (an || bn) s += 0.08;
  else if (a.hue != null && b.hue != null) {
    const d = hueDist(a.hue, b.hue);
    s += d < 25 ? 0.05 : d > 150 ? -0.05 : -0.15;
  }
  if (a.colour_family && a.colour_family === b.colour_family && an) s += 0.05; // tonal
  // pattern clash
  const ap = a.pattern && a.pattern !== 'Solid' && a.pattern !== 'Marl / heather' && a.pattern !== 'Textured';
  const bp = b.pattern && b.pattern !== 'Solid' && b.pattern !== 'Marl / heather' && b.pattern !== 'Textured';
  if (ap && bp) s -= 0.25;
  // statements
  if (isStatement(a) && isStatement(b)) s -= 0.2;
  // season overlap
  if (a.seasons?.length && b.seasons?.length && !a.seasons.some((x) => b.seasons.includes(x))) s -= 0.1;
  return Math.max(0, Math.min(1, s));
}

export function lookScore(pieces: Item[]): number {
  if (pieces.length < 2) return 0.5;
  let t = 0, n = 0;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) { t += pairScore(pieces[i], pieces[j]); n++; }
  const statements = pieces.filter(isStatement).length;
  return t / n - (statements > 1 ? 0.15 * (statements - 1) : 0);
}

export function targetWarmth(tempC?: number | null): number | null {
  if (tempC == null) return null;
  if (tempC < 5) return 5;
  if (tempC < 10) return 4;
  if (tempC < 15) return 3;
  if (tempC < 20) return 2;
  return 1;
}

export function currentSeason(d = new Date()): string {
  const m = d.getMonth();
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

/** Order a slot's items by compatibility with locked/selected pieces (best first). */
export function rankForSlot(candidates: Item[], context: Item[], opts: { warmth?: number | null } = {}): { item: Item; score: number }[] {
  return candidates
    .map((item) => {
      let score = context.length ? context.reduce((a, c) => a + pairScore(item, c), 0) / context.length : 0.6;
      if (opts.warmth != null && item.warmth != null && item.slot !== 'accessory') {
        const d = Math.abs(item.warmth - opts.warmth);
        score -= d >= 3 ? 0.25 : d === 2 ? 0.1 : 0;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
}

function pickWeighted<T>(arr: { v: T; w: number }[], rand = Math.random): T | undefined {
  const total = arr.reduce((a, x) => a + Math.max(0, x.w), 0);
  if (total <= 0) return arr[0]?.v;
  let r = rand() * total;
  for (const x of arr) { r -= Math.max(0, x.w); if (r <= 0) return x.v; }
  return arr[arr.length - 1]?.v;
}

export interface GenOptions {
  count?: number;
  warmth?: number | null;
  usage?: Record<string, number>;
  focus?: Item | null;
  availableOnly?: boolean;
  preferUnused?: boolean;
}

/** Generate plausible complete looks from the wardrobe (randomised, compatibility-weighted). */
export function generateLooks(all: Item[], o: GenOptions = {}): Item[][] {
  const pool = all.filter((i) => i.status !== 'draft' && i.slot && (!o.availableOnly || ['clean', 'worn'].includes(i.laundry)));
  const by = (s: Slot) => pool.filter((i) => i.slot === s);
  const season = currentSeason();
  const out: Item[][] = [];
  const seen = new Set<string>();
  const warm = o.warmth ?? (season === 'winter' ? 4 : season === 'summer' ? 1 : 3);
  for (let attempt = 0; attempt < (o.count ?? 8) * 6 && out.length < (o.count ?? 8); attempt++) {
    const chosen: Item[] = [];
    const add = (slot: Slot, prob = 1) => {
      if (Math.random() > prob) return;
      const cands = by(slot).filter((c) => !chosen.includes(c));
      if (!cands.length) return;
      const ranked = rankForSlot(cands, chosen, { warmth: warm });
      const pick = pickWeighted(ranked.map(({ item, score }) => {
        const unusedBoost = o.preferUnused && !(o.usage?.[item.id]) ? 1.6 : 1;
        const seasonBoost = item.seasons?.includes(season) ? 1.2 : item.seasons?.length ? 0.8 : 1;
        return { v: item, w: Math.pow(score, 3) * unusedBoost * seasonBoost };
      }));
      if (pick) chosen.push(pick);
    };
    if (o.focus) chosen.push(o.focus);
    const order: [Slot, number][] = [
      ['base', 1], ['bottom', 1], ['feet', 1],
      ['mid', warm >= 3 ? 0.85 : warm === 2 ? 0.35 : 0.08],
      ['outer', warm >= 4 ? 0.9 : warm === 3 ? 0.5 : 0.08],
      ['head', warm >= 4 ? 0.45 : 0.25],
      ['accessory', 0.3],
    ];
    // start from a random anchor slot for variety
    const anchorIdx = Math.floor(Math.random() * 3);
    const seq = [...order.slice(anchorIdx, 3), ...order.slice(0, anchorIdx), ...order.slice(3)];
    for (const [slot, p] of seq) if (!chosen.some((c) => c.slot === slot)) add(slot, p);
    if (chosen.filter((c) => ['base', 'mid', 'outer', 'onepiece'].includes(c.slot!)).length === 0) continue;
    if (!chosen.some((c) => c.slot === 'bottom' || c.slot === 'onepiece')) continue;
    const key = chosen.map((c) => c.id).sort().join('|');
    if (seen.has(key)) continue;
    if (lookScore(chosen) < 0.5) continue;
    seen.add(key);
    out.push(sortBySlot(chosen));
  }
  return out;
}

export function sortBySlot<T extends { slot?: string | null }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => SLOT_ORDER.indexOf((a.slot ?? 'accessory') as Slot) - SLOT_ORDER.indexOf((b.slot ?? 'accessory') as Slot));
}

/** Default canvas arrangement: an outfit "flat lay" in vertical bands (head, tops, bottoms, feet), accessories orbiting right. */
export function autoLayout(pieces: Item[], canvasAspect = 0.72): Record<string, CanvasPiece> {
  const out: Record<string, CanvasPiece> = {};
  const sorted = sortBySlot(pieces);
  const tops = sorted.filter((p) => ['outer', 'mid', 'base', 'onepiece'].includes(p.slot ?? ''));
  const acc = sorted.filter((p) => p.slot === 'accessory');
  const has = (s: string) => sorted.some((p) => p.slot === s);
  const bands: { key: string; w: number }[] = [
    ...(has('head') ? [{ key: 'head', w: 0.13 }] : []),
    ...(tops.length ? [{ key: 'tops', w: 0.4 }] : []),
    ...(has('bottom') ? [{ key: 'bottom', w: 0.37 }] : []),
    ...(has('feet') ? [{ key: 'feet', w: 0.12 }] : []),
  ];
  const total = bands.reduce((a, b) => a + b.w, 0) || 1;
  const margin = 0.05;
  let cursor = margin;
  const band: Record<string, { mid: number; h: number }> = {};
  for (const b of bands) {
    const h = (b.w / total) * (1 - margin * 2);
    band[b.key] = { mid: cursor + h / 2, h };
    cursor += h;
  }
  const baseH = Math.min(canvasAspect, 1) * 0.62; // piece base size as a fraction of canvas height
  const fit = (p: Item, targetH: number, maxW = 0.82) => {
    const a = Math.max(0.55, Math.min(1.5, p.aspect ?? 0.8));
    const sH = (targetH * a) / baseH;
    const sW = (maxW * canvasAspect) / baseH;
    return Math.max(0.2, Math.min(sH, sW));
  };
  const hasAcc = acc.length > 0;
  const cx = hasAcc ? 0.45 : 0.5;
  let z = 1;
  for (const p of sorted) {
    const slot = p.slot as Slot;
    if (slot === 'head' && band.head) out[p.id] = { x: cx + 0.02, y: band.head.mid, s: fit(p, band.head.h * 1.25, 0.4), r: -4, z: z++ };
    else if (slot === 'bottom' && band.bottom) out[p.id] = { x: cx, y: band.bottom.mid, s: fit(p, band.bottom.h * 1.02, 0.62), r: 0, z: z++ };
    else if (slot === 'feet' && band.feet) out[p.id] = { x: cx, y: band.feet.mid, s: fit(p, band.feet.h * 1.4, 0.6), r: 0, z: z++ };
    else if (slot === 'accessory') {
      const i = acc.indexOf(p);
      out[p.id] = { x: 0.85, y: 0.2 + i * 0.17, s: fit(p, 0.13, 0.26), r: 6 - i * 5, z: 100 + i };
    } else if (band.tops) {
      const i = tops.indexOf(p);
      const n = tops.length;
      const spread = n > 1 ? (i - (n - 1) / 2) * 0.13 : 0;
      out[p.id] = { x: cx + spread, y: band.tops.mid + (n > 1 ? (i - (n - 1) / 2) * 0.012 : 0), s: fit(p, band.tops.h * (1.06 - i * 0.05), 0.66), r: spread * 14, z: z++ };
    } else {
      out[p.id] = { x: cx, y: 0.5, s: 0.6, r: 0, z: z++ };
    }
  }
  return out;
}

export function usageLabel(n?: number) {
  if (!n) return 'Never styled';
  return n === 1 ? 'In 1 look' : `In ${n} looks`;
}

/** Spectrum sort key: neutrals by lightness first, then hue wheel. */
export function spectrumKey(i: Item) {
  if (i.hue == null || isNeutral(i)) return -1000 + (100 - (i.lightness ?? 50));
  return i.hue;
}
