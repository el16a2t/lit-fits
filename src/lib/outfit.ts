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

export type FactorKind = 'formality' | 'warmth' | 'colour' | 'tonal' | 'pattern' | 'statement' | 'season';
export interface Factor { kind: FactorKind; delta: number }

const isPatterned = (i: Item) => !!i.pattern && i.pattern !== 'Solid' && i.pattern !== 'Marl / heather' && i.pattern !== 'Textured';

/** The individual rules behind pairScore — exposed so the UI can explain a score. */
export function pairFactors(a: Item, b: Item): Factor[] {
  const f: Factor[] = [];
  // formality coherence
  const fd = Math.abs((a.formality ?? 2) - (b.formality ?? 2));
  f.push({ kind: 'formality', delta: fd === 0 ? 0.15 : fd === 1 ? 0.1 : fd === 2 ? -0.1 : -0.3 });
  // warmth coherence (shorts + parka = no)
  const wd = Math.abs((a.warmth ?? 3) - (b.warmth ?? 3));
  if (wd >= 3) f.push({ kind: 'warmth', delta: -0.2 });
  // colour
  const an = isNeutral(a), bn = isNeutral(b);
  if (an && bn) f.push({ kind: 'colour', delta: 0.1 });
  else if (an || bn) f.push({ kind: 'colour', delta: 0.08 });
  else if (a.hue != null && b.hue != null) {
    const d = hueDist(a.hue, b.hue);
    f.push({ kind: 'colour', delta: d < 25 ? 0.05 : d > 150 ? -0.05 : -0.15 });
  }
  if (a.colour_family && a.colour_family === b.colour_family && an) f.push({ kind: 'tonal', delta: 0.05 });
  // pattern clash
  if (isPatterned(a) && isPatterned(b)) f.push({ kind: 'pattern', delta: -0.25 });
  // statements
  if (isStatement(a) && isStatement(b)) f.push({ kind: 'statement', delta: -0.2 });
  // season overlap
  if (a.seasons?.length && b.seasons?.length && !a.seasons.some((x) => b.seasons.includes(x))) f.push({ kind: 'season', delta: -0.1 });
  return f;
}

/** 0..1 — how well two pieces sit together. */
export function pairScore(a: Item, b: Item): number {
  const s = pairFactors(a, b).reduce((t, x) => t + x.delta, 0.6);
  return Math.max(0, Math.min(1, s));
}

export function lookScore(pieces: Item[]): number {
  if (pieces.length < 2) return 0.5;
  let t = 0, n = 0;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) { t += pairScore(pieces[i], pieces[j]); n++; }
  const statements = pieces.filter(isStatement).length;
  return t / n - (statements > 1 ? 0.15 * (statements - 1) : 0);
}

export type Verdict = 'sits' | 'works' | 'clash';
export const verdictOf = (score: number): Verdict => (score > 0.72 ? 'sits' : score > 0.55 ? 'works' : 'clash');

export interface Reason { tone: 'good' | 'warn' | 'bad'; title: string; detail: string; weight: number }

const FORMALITY_WORDS = ['', 'loungewear', 'casual', 'smart-casual', 'smart', 'formal'];
const WARMTH_WORDS = ['', 'hot-weather', 'light', 'mid-weight', 'warm', 'cold-weather'];
const lower = (i: Item) => {
  const t = i.name || SUBTYPE_MAP[i.subtype ?? '']?.label || 'piece';
  // keep brand names capitalised ("the Burberry flannel"), lower-case generic ones ("the chambray shirt")
  if (i.brand && t.toLowerCase().startsWith(i.brand.toLowerCase())) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
};
/** "is"/"are" for a set of pieces: shoes, trousers and Baggies are plural on their own. */
const isAre = (items: Item[]) => {
  if (items.length > 1) return 'are';
  const last = lower(items[0]).split(' ').pop() ?? '';
  return /[^s]s$/i.test(last) ? 'are' : 'is';
};
const anA = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const the = (items: Item[]) => list(items.map((i) => `the ${lower(i)}`));

/**
 * Plain-English reasons behind lookScore, strongest first. Built from the same rules as the score,
 * so the explanation never disagrees with the bar.
 */
export function explainLook(pieces: Item[]): Reason[] {
  if (pieces.length < 2) return [];
  const pairs: { a: Item; b: Item; f: Factor[] }[] = [];
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) pairs.push({ a: pieces[i], b: pieces[j], f: pairFactors(pieces[i], pieces[j]) });
  const n = pairs.length;
  const withKind = (k: FactorKind, pred: (d: number) => boolean = () => true) => pairs.filter((p) => p.f.some((x) => x.kind === k && pred(x.delta)));
  const total = (k: FactorKind) => pairs.reduce((t, p) => t + p.f.filter((x) => x.kind === k).reduce((a, x) => a + x.delta, 0), 0) / n;
  const out: Reason[] = [];

  // formality
  const forms = pieces.map((p) => p.formality ?? 2);
  const fMin = Math.min(...forms), fMax = Math.max(...forms);
  if (fMax - fMin <= 1) {
    out.push({ tone: 'good', title: 'Same dress code', detail: fMax === fMin ? `Everything is ${FORMALITY_WORDS[fMax] ?? 'on the same level'}, so nothing looks out of place.` : `Everything sits between ${FORMALITY_WORDS[fMin]} and ${FORMALITY_WORDS[fMax]}, which reads as one intention.`, weight: Math.abs(total('formality')) });
  } else {
    const hi = pieces.filter((p) => (p.formality ?? 2) === fMax), lo = pieces.filter((p) => (p.formality ?? 2) === fMin);
    out.push({
      tone: fMax - fMin >= 3 ? 'bad' : 'warn', title: 'Mixed dress codes',
      detail: `${cap(the(hi))} ${isAre(hi)} ${FORMALITY_WORDS[fMax]}, while ${the(lo)} ${isAre(lo)} ${FORMALITY_WORDS[fMin]}. ${fMax - fMin >= 3 ? 'That gap usually looks accidental.' : 'A deliberate high-low mix can work, but it needs to look intentional.'}`,
      weight: Math.abs(total('formality')) + 0.1,
    });
  }

  // warmth
  const cold = withKind('warmth');
  if (cold.length) {
    const ws = pieces.map((p) => p.warmth ?? 3);
    const warm = pieces.filter((p) => (p.warmth ?? 3) === Math.max(...ws)), light = pieces.filter((p) => (p.warmth ?? 3) === Math.min(...ws));
    out.push({ tone: 'bad', title: 'Different weather', detail: `${cap(the(warm))} ${isAre(warm)} ${WARMTH_WORDS[Math.max(...ws)]} kit, but ${the(light)} ${isAre(light)} ${WARMTH_WORDS[Math.min(...ws)]}. One of them is dressed for a different day.`, weight: Math.abs(total('warmth')) + 0.15 });
  }

  // colour
  const coloured = pieces.filter((p) => !isNeutral(p));
  const neutrals = pieces.filter(isNeutral);
  const harsh = withKind('colour', (d) => d <= -0.15);
  const contrast = withKind('colour', (d) => d === -0.05);
  if (harsh.length) {
    const p = harsh[0];
    out.push({ tone: 'bad', title: 'Colours compete', detail: `The ${colourOf(p.a)} of the ${lower(p.a)} and the ${colourOf(p.b)} of the ${lower(p.b)} sit awkwardly apart on the colour wheel: neither matching nor a clean contrast.${neutrals.length ? '' : ' A neutral between them would calm it down.'}`, weight: Math.abs(total('colour')) + 0.1 });
  } else if (coloured.length === 0) {
    out.push({ tone: 'good', title: 'All neutrals', detail: `${cap(list(unique(pieces.map(colourOf))))}: a palette that can't really go wrong. Texture and fit do the talking.`, weight: Math.abs(total('colour')) });
  } else if (coloured.length === 1) {
    out.push({ tone: 'good', title: 'One colour, grounded', detail: `The ${colourOf(coloured[0])} ${lower(coloured[0])} is the only colour, and the neutrals around it let it stand out.`, weight: Math.abs(total('colour')) + 0.02 });
  } else if (contrast.length) {
    out.push({ tone: 'warn', title: 'Strong contrast', detail: `${cap(list(unique(coloured.map(colourOf))))} are near-opposites. That's bold rather than wrong; keep everything else quiet.`, weight: Math.abs(total('colour')) });
  } else {
    out.push({ tone: 'good', title: 'Related colours', detail: `${cap(list(unique(coloured.map(colourOf))))} are close on the colour wheel, so they flow into each other.`, weight: Math.abs(total('colour')) });
  }
  if (withKind('tonal').length && coloured.length === 0) {
    const fam = pieces.find((p) => withKind('tonal').some((x) => x.a === p))?.colour_family;
    if (fam) out.push({ tone: 'good', title: 'Tonal', detail: `Repeating ${fam} across pieces gives it a considered, put-together feel.`, weight: 0.05 });
  }

  // pattern
  const patterned = pieces.filter(isPatterned);
  if (patterned.length >= 2) {
    out.push({ tone: 'bad', title: 'Patterns fighting', detail: `${cap(list(patterned.map((p) => `the ${(p.pattern ?? '').toLowerCase()} ${lower(p)}`)))} pull the eye in different directions. Keep one pattern and make the rest plain.`, weight: Math.abs(total('pattern')) + 0.15 });
  } else if (patterned.length === 1) {
    out.push({ tone: 'good', title: 'One pattern', detail: `The ${(patterned[0].pattern ?? '').toLowerCase()} on the ${lower(patterned[0])} is the only pattern, so it has room to work.`, weight: 0.03 });
  }

  // statements
  const statements = pieces.filter(isStatement);
  if (statements.length > 1) {
    out.push({ tone: 'bad', title: 'Too many statements', detail: `${cap(the(statements))} ${statements.length === 2 ? 'both' : 'all'} want to be the focal point. Pick one hero and tone the rest down.`, weight: 0.15 * (statements.length - 1) + Math.abs(total('statement')) });
  }

  // season
  const off = withKind('season');
  if (off.length) {
    const p = off[0];
    out.push({ tone: 'warn', title: 'Different seasons', detail: `The ${lower(p.a)} ${isAre([p.a])} ${anA(p.a.seasons[0])} ${p.a.seasons.join('/')} piece and the ${lower(p.b)} ${isAre([p.b])} ${p.b.seasons.join('/')}. They rarely meet in the same week.`, weight: Math.abs(total('season')) });
  }

  return out.sort((x, y) => toneRank(x.tone) - toneRank(y.tone) || y.weight - x.weight);
}

const toneRank = (t: Reason['tone']) => (t === 'bad' ? 0 : t === 'warn' ? 1 : 2);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const colourOf = (i: Item) => (i.colour_name || i.colour_family || 'colour').toLowerCase();

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
