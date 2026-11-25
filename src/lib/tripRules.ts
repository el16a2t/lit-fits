// Packing rules shared by the app and the edge function. Keep this file dependency-free: CI checks it is byte-identical
// to supabase/functions/api/lib/tripRules.ts (the edge function can't import from src/).

export type Luggage = 'carry-on' | 'checked' | 'car';
export type Laundry = 'none' | 'weekly' | 'easy';

export interface TripSettings {
  luggage: Luggage;
  laundry: Laundry;
  activities: string[];
}

export const DEFAULT_SETTINGS: TripSettings = { luggage: 'carry-on', laundry: 'weekly', activities: [] };

export const LUGGAGE: { key: Luggage; label: string; hint: string }[] = [
  { key: 'carry-on', label: 'Carry-on', hint: 'One cabin bag' },
  { key: 'checked', label: 'Checked bag', hint: 'Room to spare' },
  { key: 'car', label: 'Car / train', hint: 'No real limit' },
];

export const LAUNDRY: { key: Laundry; label: string; hint: string }[] = [
  { key: 'none', label: 'No laundry', hint: 'Pack for every day' },
  { key: 'weekly', label: 'Once a week', hint: 'Rotate on a 7-day cycle' },
  { key: 'easy', label: 'Whenever', hint: 'Washer to hand' },
];

/** Activities that change what goes in the bag. `kit` ones need functional pieces that aren't styled into looks. */
export const ACTIVITIES: { key: string; label: string; kit?: boolean }[] = [
  { key: 'work', label: 'Client meetings' },
  { key: 'remote', label: 'Remote work' },
  { key: 'dinner', label: 'Smart dinners' },
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'nightlife', label: 'Nights out' },
  { key: 'wedding', label: 'Wedding / formal' },
  { key: 'hiking', label: 'Hiking' },
  { key: 'beach', label: 'Beach / pool', kit: true },
  { key: 'gym', label: 'Gym / running', kit: true },
];

const DAY = 86400000;
const parse = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Inclusive number of days between two YYYY-MM-DD dates (1 if either is missing). */
export function tripDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 1;
  return Math.max(1, Math.round((parse(end) - parse(start)) / DAY) + 1);
}

/** 1-based day of the trip for `today` (YYYY-MM-DD), or null when today is outside it. */
export function dayOfTrip(start?: string | null, end?: string | null, today?: string): number | null {
  if (!start || !end || !today) return null;
  if (today < start || today > end) return null;
  return Math.round((parse(today) - parse(start)) / DAY) + 1;
}

export interface Budget {
  /** Core (styleable) pieces, excluding kit and accessories. */
  pieces: number;
  /** Pairs of shoes, including the pair worn while travelling. */
  shoes: number;
  outer: number;
  /** How many distinct looks to plan, and whether they map to dates or form a rotation. */
  looks: number;
  mode: 'daily' | 'rotation';
  /** Days of wear the bag has to cover before a wash. */
  cycle: number;
}

export function budget(s: TripSettings, days: number): Budget {
  const cycle = s.laundry === 'easy' ? Math.min(days, 4) : s.laundry === 'weekly' ? Math.min(days, 7) : Math.min(days, 14);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  const b = s.luggage === 'carry-on'
    ? { pieces: clamp(6 + cycle * 1.0, 7, 14), shoes: 2, outer: 2 }
    : s.luggage === 'checked'
      ? { pieces: clamp(8 + cycle * 1.4, 9, 24), shoes: 4, outer: 3 }
      : { pieces: clamp(10 + cycle * 1.6, 11, 30), shoes: 5, outer: 4 };
  const mode = days <= 10 ? 'daily' : 'rotation';
  const looks = mode === 'daily' ? days : clamp(cycle + 1, 6, 10);
  return { ...b, looks, mode, cycle };
}

export interface CapsulePiece { slot?: string | null; role?: 'core' | 'kit' }

export interface Assessment {
  pieces: number;
  shoes: number;
  outer: number;
  kit: number;
  budget: Budget;
  /** Plain-English problems, worst first. Empty when the bag fits. */
  over: string[];
}

const NOT_COUNTED = new Set(['accessory', 'head']);

export function assess(capsule: CapsulePiece[], s: TripSettings, days: number): Assessment {
  const b = budget(s, days);
  const core = capsule.filter((p) => p.role !== 'kit');
  const pieces = core.filter((p) => !NOT_COUNTED.has(p.slot ?? '') && p.slot !== 'feet').length;
  const shoes = capsule.filter((p) => p.slot === 'feet').length;
  const outer = core.filter((p) => p.slot === 'outer').length;
  const kit = capsule.length - core.length;
  const bag = s.luggage === 'carry-on' ? 'a carry-on' : s.luggage === 'checked' ? 'a checked bag' : 'this trip';
  const over: string[] = [];
  if (shoes > b.shoes) over.push(`${shoes} pairs of shoes is too many for ${bag}: aim for ${b.shoes}, counting the pair you travel in.`);
  if (pieces > b.pieces) over.push(`${pieces} clothes against a target of ${b.pieces} for ${bag}${s.laundry !== 'none' ? ` with ${s.laundry === 'weekly' ? 'a weekly wash' : 'easy laundry'}` : ''}.`);
  if (outer > b.outer) over.push(`${outer} outer layers: ${b.outer} is plenty, and wear the heaviest on the way.`);
  return { pieces, shoes, outer, kit, budget: b, over };
}
