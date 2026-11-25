// Demo stand-ins for the edge API (web previews only).
import type { StylistHandlers } from '@/lib/api';
import { generateLooks } from '@/lib/outfit';
import { budget, DEFAULT_SETTINGS, tripDays, type TripSettings } from '@/lib/tripRules';
import type { Item, Pairings, StylistLook, Trip, TripLook } from '@/lib/types';
import { demoStore } from './store';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoApi(route: string, body: any): Promise<unknown> {
  await wait(500);
  switch (route) {
    case 'item/pairings':
      return {
        headline: 'Let the piece lead; keep everything around it quiet and tonal.',
        groups: [
          { slot: 'bottom', picks: [{ item_id: 'demo-5', why: 'Washed black grounds the olive and keeps it workwear.', score: 5 }] },
          { slot: 'head', picks: [{ item_id: 'demo-1', why: 'Echoes the olive — tonal, not matchy.', score: 4 }] },
          { slot: 'mid', picks: [{ item_id: 'demo-6', why: 'Open check over it adds the one statement.', score: 3 }] },
        ],
        avoid: [{ item_id: 'demo-7', why: 'Technical shorts read too gym with this collar.' }],
        missing: [{ title: 'Dark brown suede chukka boots', slot: 'feet', why: 'Warms the palette and lifts it a notch.' }],
      } satisfies Pairings;
    case 'look/complete':
      return { looks: [demoLook('Tonal workwear', ['demo-1', 'demo-3', 'demo-5']), demoLook('Check it open', ['demo-6', 'demo-4', 'demo-5'])] };
    case 'look/name':
      return { title: 'Olive, quietly', occasion: 'Weekend' };
    case 'look/critique':
      return { verdict: 'works', headline: 'Easy and coherent; the shoes are the weak link.', working: ['Olive and ecru are a calm, earthy pairing.'], issues: ['The trainers are sportier than everything else.'], swaps: [] };
    case 'render':
      return { id: 'r-demo', status: 'queued', items: body.items };
    case 'trip/pack':
      return demoPack(body);
    case 'trip/looks': {
      const t = (await demoStore.trip(body.trip_id))!;
      const looks = demoTripLooks(t, demoStore.allItems().filter((i) => t.item_ids.includes(i.id)));
      return demoStore.updateTrip(t.id, { plan: { ...(t.plan ?? {}), looks, days: looks, stale: false } });
    }
    default:
      return { ok: true };
  }
}

function demoLook(title: string, ids: string[]): StylistLook {
  return {
    title,
    why: 'Tonal base, one texture shift, shoes do the talking.',
    items: ids.map((id, i) => ({ item_id: id, number: Number(id.split('-')[1]), slot: null, note: i === 1 ? 'untucked' : undefined })),
    missing: [{ title: 'Dark brown suede chukka boots', slot: 'feet', why: 'You have nothing warm underfoot for this palette.' }],
  };
}

export async function demoStylist(body: { prompt: string }, h: StylistHandlers) {
  h.onMeta?.({ thread_id: 't1' });
  h.onStatus?.('Reading your rails');
  await wait(700);
  h.onStatus?.('Thinking it through');
  await wait(900);
  for (const w of 'Three for a grey October. Workwear first, then a smarter turn.'.split(' ')) { h.onText?.(w + ' '); await wait(40); }
  h.onTextEnd?.();
  h.onStatus?.('Pulling pieces');
  await wait(500);
  h.onLook?.(demoLook('Olive on olive, black base', ['demo-1', 'demo-3', 'demo-5']), 0);
  await wait(600);
  h.onLook?.(demoLook('Check over graphic', ['demo-6', 'demo-4', 'demo-5']), 1);
  await wait(600);
  h.onLook?.(demoLook('Chambray, sleeves pushed', ['demo-2', 'demo-5', 'demo-1']), 2);
  h.onDone?.({ thread_id: 't1' });
}

/** A rule-following stand-in for the trip planner: fills each slot up to the budget from the most versatile pieces. */
async function demoPack(body: any): Promise<Trip> {
  const settings: TripSettings = { ...DEFAULT_SETTINGS, ...(body.settings ?? {}) };
  const days = tripDays(body.start_on, body.end_on);
  const b = budget(settings, days);
  const existing = body.trip_id ? await demoStore.trip(body.trip_id) : null;
  const excluded = new Set(existing?.excluded_ids ?? []);
  const pool = demoStore.allItems().filter((i) => i.status !== 'draft' && !excluded.has(i.id));
  const take = (slot: string, n: number) => pool.filter((i) => i.slot === slot).slice(0, Math.max(0, n));
  const bottoms = take('bottom', Math.ceil(b.pieces * 0.3));
  const outer = take('outer', Math.min(1, b.outer));
  const mids = take('mid', 1);
  const tops = take('base', b.pieces - bottoms.length - outer.length - mids.length);
  const shoes = take('feet', b.shoes);
  const core = [...outer, ...mids, ...tops, ...bottoms, ...shoes, ...take('accessory', 1)];
  for (const id of existing?.pinned_ids ?? []) { const it = pool.find((i) => i.id === id); if (it && !core.includes(it)) core.push(it); }
  const capsule = core.map((i) => ({ item_id: i.id, why: `Works with most of the bag (${i.colour_name ?? 'neutral'}).`, role: 'core' as const, travel: i.slot === 'outer' }));
  const looks = demoTripLooks({ start_on: body.start_on, end_on: body.end_on, settings } as Trip, core);
  const trip: Trip = {
    id: existing?.id ?? `t${Date.now()}`, name: body.destination, destination: body.destination, start_on: body.start_on ?? null, end_on: body.end_on ?? null,
    brief: body.brief ?? null, settings, status: existing?.status ?? 'planning', created_at: existing?.created_at ?? new Date().toISOString(),
    item_ids: capsule.map((x) => x.item_id), excluded_ids: [...excluded], pinned_ids: existing?.pinned_ids ?? [], packed: existing?.packed ?? {}, worn: existing?.worn ?? {},
    checklist: existing?.checklist?.filter((x) => x.source === 'me').concat([{ id: 'x-adapter', label: 'Plug adapter', source: 'ai' }, { id: 'x-umbrella', label: 'Compact umbrella', source: 'ai' }]) ?? [{ id: 'x-adapter', label: 'Plug adapter', source: 'ai' }, { id: 'x-umbrella', label: 'Compact umbrella', source: 'ai' }],
    plan: {
      summary: `A ${settings.luggage} bag in tonal neutrals: ${b.pieces} clothes and ${b.shoes} pairs of shoes that all work together, with ${b.mode === 'daily' ? 'a look for each day' : `a rotation of ${b.looks} looks`}.`,
      capsule, looks, days: looks, missing: [{ title: 'Packable rain shell', slot: 'outer', why: 'Showers forecast and nothing light and waterproof in the bag.' }],
      forecast: { place: body.destination, partial: days > 16, days: Array.from({ length: Math.min(days, 16) }, (_, k) => ({ date: addDays(body.start_on, k), min: 14 + (k % 3), max: 22 + (k % 5), rain: k % 4 === 0 ? 45 : 10 })) },
      version: 2,
    },
  };
  return demoStore.upsertTrip(trip);
}

function demoTripLooks(t: Trip, pieces: Item[]): TripLook[] {
  const days = tripDays(t.start_on, t.end_on);
  const b = budget({ ...DEFAULT_SETTINGS, ...(t.settings ?? {}) }, days);
  const sets = generateLooks(pieces, { count: b.looks });
  const labels = ['Client day', 'Sightseeing', 'Dinner out', 'Remote work', 'Hot afternoon', 'Rainy day', 'Coffee and a walk', 'Night out', 'Travel day', 'Lazy Sunday'];
  return sets.map((s, k) => ({
    date: b.mode === 'daily' && t.start_on ? addDays(t.start_on, k) : undefined,
    label: labels[k % labels.length],
    look: { title: labels[k % labels.length], why: 'Built from the bag.', items: s.map((i) => ({ item_id: i.id, number: i.number, slot: i.slot })), missing: [] },
  }));
}

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
