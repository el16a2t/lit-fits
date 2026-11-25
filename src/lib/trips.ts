// Trip logic on the client: lifecycle phase, away-mode scoping, outfit counting and look repair after capsule edits.
import { useMemo } from 'react';
import { lookScore, rankForSlot } from './outfit';
import { useItems, useTrips } from './queries';
import { assess, dayOfTrip, DEFAULT_SETTINGS, tripDays, type TripSettings } from './tripRules';
import type { Item, StylistLook, Trip, TripCapsulePiece, TripLook } from './types';
import { usePrefs } from '@/state/prefs';

/** Today on the device, as YYYY-MM-DD in local time (not UTC: an evening in Buenos Aires is still today). */
export function localToday(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type Phase = 'curate' | 'pack' | 'away' | 'home';
export const PHASES: { key: Phase; label: string }[] = [
  { key: 'curate', label: 'Capsule' },
  { key: 'pack', label: 'Pack' },
  { key: 'away', label: 'Away' },
  { key: 'home', label: 'Home' },
];

/** Where a trip naturally is today: done → home; inside the dates → away; packed → pack (ready); else curating. */
export function phaseOf(t: Trip, today = localToday()): Phase {
  if (t.status === 'done') return 'home';
  if (t.end_on && today > t.end_on) return 'home';
  if (t.status === 'away' || (t.start_on && today >= t.start_on)) return 'away';
  if (t.status === 'packed') return 'pack';
  return Object.keys(t.packed ?? {}).length ? 'pack' : 'curate';
}

export const settingsOf = (t?: Trip | null): TripSettings => ({ ...DEFAULT_SETTINGS, ...(t?.settings ?? {}) });
export const looksOf = (t?: Trip | null): TripLook[] => t?.plan?.looks ?? t?.plan?.days ?? [];
export const capsuleOf = (t?: Trip | null): TripCapsulePiece[] => {
  const byId = new Map((t?.plan?.capsule ?? []).map((c) => [c.item_id, c]));
  // item_ids is the source of truth for membership; plan.capsule carries the reasons
  return (t?.item_ids ?? []).map((id) => byId.get(id) ?? { item_id: id, why: 'You added this', role: 'core' as const, travel: false });
};

export function tripAssessment(t: Trip, items: Item[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const caps = capsuleOf(t).map((c) => ({ slot: byId.get(c.item_id)?.slot, role: c.role ?? 'core' }));
  return assess(caps, settingsOf(t), tripDays(t.start_on, t.end_on));
}

/** Trip in progress today (dates contain today and not finished), else the soonest upcoming one, else null. */
export function pickActive(trips: Trip[], today = localToday()) {
  const live = trips.filter((t) => t.status !== 'done' && t.item_ids?.length);
  const current = live.find((t) => t.start_on && t.end_on && t.start_on <= today && today <= t.end_on) ?? null;
  const upcoming = live.filter((t) => t.start_on && t.start_on > today).sort((a, b) => (a.start_on! < b.start_on! ? -1 : 1))[0] ?? null;
  return { current, upcoming };
}

export function useActiveTrip() {
  const { data: trips = [] } = useTrips();
  return useMemo(() => pickActive(trips), [trips]);
}

/**
 * The wardrobe the app should work from right now. While a trip is under way (and away mode is on), that's only what
 * was packed: the mixer, shuffle and stylist shouldn't suggest a coat that's 11,000 km away.
 */
export function useWardrobe() {
  const { data: all = [] } = useItems();
  const { current } = useActiveTrip();
  const awayOn = usePrefs((s) => s.awayMode);
  return useMemo(() => {
    if (!current || !awayOn) return { items: all, trip: null as Trip | null, scoped: false, all };
    const kit = new Set(capsuleOf(current).filter((c) => c.role === 'kit').map((c) => c.item_id));
    const keep = new Set(current.item_ids.filter((id) => !kit.has(id)));
    return { items: all.filter((i) => keep.has(i.id)), trip: current, scoped: true, all };
  }, [all, current, awayOn]);
}

const CORE_SLOTS = ['base', 'bottom', 'feet'] as const;

/**
 * How many distinct, decent outfits the capsule makes: top × bottom × shoes combinations that actually work together.
 * Layers aren't multiplied in: a jacket over the same outfit isn't a new outfit, and counting it inflates the number.
 */
export function outfitCount(pieces: Item[]): number {
  const [tops, bottoms, shoes] = CORE_SLOTS.map((s) => pieces.filter((p) => p.slot === s));
  let n = 0;
  for (const t of tops) for (const b of bottoms) for (const s of shoes) if (lookScore([t, b, s]) > 0.55) n++;
  return n;
}

/** Order for packing lists and strips: layers, tops, bottoms, shoes, then the small stuff. */
export const PACK_ORDER = ['outer', 'mid', 'base', 'bottom', 'feet', 'accessory', 'head'];
export const packRank = (slot?: string | null) => { const i = PACK_ORDER.indexOf(slot ?? ''); return i < 0 ? PACK_ORDER.length : i; };

/**
 * Keep looks honest after the capsule changes: any piece that's no longer packed is swapped for the best-matching
 * packed piece in the same slot, or dropped. Returns the repaired looks and whether anything changed.
 */
export function repairLooks(looks: TripLook[], capsuleIds: string[], items: Item[]): { looks: TripLook[]; changed: boolean } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const packed = new Set(capsuleIds);
  let changed = false;
  const out: TripLook[] = [];
  for (const d of looks) {
    const kept = d.look.items.filter((li) => packed.has(li.item_id));
    const lost = d.look.items.filter((li) => !packed.has(li.item_id));
    if (!lost.length) { out.push(d); continue; }
    changed = true;
    const next: StylistLook['items'] = [...kept];
    for (const li of lost) {
      const gone = byId.get(li.item_id);
      const used = new Set(next.map((x) => x.item_id));
      const pool = capsuleIds.map((id) => byId.get(id)).filter((i): i is Item => !!i && !used.has(i.id) && i.slot === gone?.slot);
      const context = next.map((x) => byId.get(x.item_id)).filter(Boolean) as Item[];
      const best = rankForSlot(pool, context)[0]?.item;
      if (best) next.push({ item_id: best.id, number: best.number, slot: best.slot });
    }
    if (next.length >= 2) out.push({ ...d, look: { ...d.look, items: next }, repaired: true });
  }
  return { looks: out, changed };
}

/** The look for today: the dated one in a daily plan, otherwise the next one in the rotation. */
export function todaysLook(t: Trip, today = localToday()): { look: TripLook | null; index: number } {
  const ls = looksOf(t);
  if (!ls.length) return { look: null, index: -1 };
  const dated = ls.findIndex((l) => l.date === today);
  if (dated >= 0) return { look: ls[dated], index: dated };
  const day = dayOfTrip(t.start_on, t.end_on, today) ?? 1;
  const i = (day - 1) % ls.length;
  return { look: ls[i], index: i };
}

export const fmtDay = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  // build in local time so the label never shifts a day across timezones
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
};

export function dateSpan(t: Pick<Trip, 'start_on' | 'end_on'>) {
  if (!t.start_on) return '';
  const days = tripDays(t.start_on, t.end_on);
  return `${fmtDay(t.start_on)}${t.end_on && t.end_on !== t.start_on ? ` – ${fmtDay(t.end_on)}` : ''} · ${days} ${days === 1 ? 'day' : 'days'}`;
}
