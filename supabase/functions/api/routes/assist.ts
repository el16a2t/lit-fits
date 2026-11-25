// Structured (non-streaming) stylist tasks: pairings, look completion, trip packing, naming.
import { admin, Caller, HttpError, json, MODELS } from '../lib/core.ts';
import { claude, jsonFrom, type Block, type ClaudeRequest } from '../lib/anthropic.ts';
import { loadContext, resolveRef, todayString, type Ctx, type WardrobeItem } from '../lib/context.ts';
import { stylistSystem } from '../lib/prompts.ts';
import { normaliseLook } from './stylist.ts';
import { SUBTYPE_MAP } from '../lib/taxonomy.ts';
import { ACTIVITIES, budget, dayOfTrip, DEFAULT_SETTINGS, LAUNDRY, LUGGAGE, tripDays, type Budget, type TripSettings } from '../lib/tripRules.ts';

const ref = { type: 'string', description: 'Wardrobe item as #number' };
const missingSchema = {
  type: 'array',
  items: {
    type: 'object', additionalProperties: false, required: ['title', 'slot', 'why'],
    properties: {
      title: { type: 'string' }, slot: { type: 'string', enum: ['head', 'outer', 'mid', 'base', 'bottom', 'feet', 'accessory'] },
      subtype: { type: 'string' }, colour: { type: 'string' }, why: { type: 'string' },
    },
  },
};
const lookSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'why', 'items', 'missing'],
  properties: {
    title: { type: 'string' }, occasion: { type: 'string' }, why: { type: 'string' }, styling: { type: 'string' },
    items: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: ref, mode: { type: 'string' }, note: { type: 'string' } } },
    },
    missing: missingSchema,
  },
};

/** Stylist system prompt + cached wardrobe block, built from a context. */
export function systemBlocks(ctx: Ctx, weather?: string | null): Block[] {
  return [
    { type: 'text', text: stylistSystem({ name: ctx.profile?.display_name || 'Adam', seed: ctx.seed, dna: ctx.profile?.style_dna, body: ctx.body, trend: ctx.trend, today: todayString(), weather }) },
    { type: 'text', text: ctx.text, cache_control: { type: 'ephemeral' } },
  ];
}

async function systemFor(owner: string, weather?: string | null) {
  const ctx = await loadContext(owner);
  return { ctx, system: systemBlocks(ctx, weather) };
}

// ───────────── request builders (pure; shared with the internal dry-run) ─────────────
export function pairingsRequest(item: WardrobeItem, system: Block[]): ClaudeRequest {
  return {
    model: MODELS.fast,
    max_tokens: 6000,
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false, required: ['headline', 'groups', 'avoid', 'missing'],
          properties: {
            headline: { type: 'string', description: 'One editorial line on how to wear this piece.' },
            groups: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['slot', 'picks'],
                properties: {
                  slot: { type: 'string', enum: ['head', 'outer', 'mid', 'base', 'bottom', 'feet', 'accessory'] },
                  picks: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: false, required: ['id', 'why', 'score'], properties: { id: ref, why: { type: 'string' }, score: { type: 'integer', description: '1-5' } } },
                  },
                },
              },
            },
            avoid: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'why'], properties: { id: ref, why: { type: 'string' } } } },
            missing: missingSchema,
          },
        },
      },
    },
    system,
    messages: [{
      role: 'user',
      content: `Focus piece: #${item.number} (${item.name}). For each other relevant slot, rank up to 4 pieces from my wardrobe that pair best with it, with a short reason (colour, texture, proportion, formality). Only include slots that make sense with this piece. Include up to 3 combinations to avoid if any are tempting but wrong, and up to 2 missing pieces worth owning that would unlock this item.`,
    }],
  };
}

export function completeRequest(current: WardrobeItem[], prompt: string | undefined, system: Block[]): ClaudeRequest {
  return {
    model: MODELS.stylist,
    max_tokens: 12000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['looks'], properties: { looks: { type: 'array', items: lookSchema } } } },
    },
    system,
    messages: [{
      role: 'user',
      content: `I've started a look with: ${current.map((i) => `#${i.number} ${i.name}`).join(', ')}.${prompt ? ` Brief: ${prompt}.` : ''} Give me 3 distinct ways to complete it (each look must include all my starting pieces plus what you add). Where one piece I don't own would make it notably better, list it in missing.`,
    }],
  };
}

export interface PackInput {
  destination: string;
  start_on?: string;
  end_on?: string;
  brief?: string;
  weather: string;
  settings: TripSettings;
  today: string;
  excluded: string[]; // "#n name" of pieces he took out
  pinned: string[]; // "#n name" of pieces he insists on
  unworn?: string[]; // "#n name" of pieces packed on past trips that never came out of the bag
}

const tripLooksSchema = (b: Budget) => ({
  type: 'array',
  description: b.mode === 'daily'
    ? `Exactly one look per trip day (${b.looks}), in date order, each with its date.`
    : `A rotation of ${b.looks} looks that together cover the trip's occasions and weather, re-wearing bottoms, shoes and outer layers.`,
  items: {
    type: 'object', additionalProperties: false, required: ['label', 'look'],
    properties: {
      date: { type: 'string', description: b.mode === 'daily' ? 'YYYY-MM-DD' : 'Leave empty for rotation looks' },
      label: { type: 'string', description: 'Short: the occasion or weather it is for, e.g. "Client day" or "Hot sightseeing". No weekday names in rotation mode.' },
      look: lookSchema,
    },
  },
});

/** Plans a trip capsule under explicit, numeric packing rules. */
export function packRequest(p: PackInput, system: Block[]): ClaudeRequest {
  const days = tripDays(p.start_on, p.end_on);
  const b = budget(p.settings, days);
  const already = p.start_on && p.today > p.start_on ? dayOfTrip(p.start_on, p.end_on, p.today) : null;
  const acts = p.settings.activities.map((k) => ACTIVITIES.find((a) => a.key === k)?.label ?? k);
  const kitActs = p.settings.activities.filter((k) => ACTIVITIES.find((a) => a.key === k)?.kit).map((k) => ACTIVITIES.find((a) => a.key === k)!.label);
  const rules = [
    `Luggage: ${LUGGAGE.find((l) => l.key === p.settings.luggage)?.label}. Laundry: ${LAUNDRY.find((l) => l.key === p.settings.laundry)?.label} (so the bag covers about ${b.cycle} days of wear before a wash).`,
    `HARD LIMITS for role "core": at most ${b.pieces} clothes (tops, mid-layers, bottoms, outer; watches, bags and caps don't count), at most ${b.shoes} pairs of shoes in total INCLUDING any for the gym or beach and the pair worn travelling, at most ${b.outer} outer layers. Fewer is better if every occasion is still covered.`,
    kitActs.length ? `Functional kit for ${kitActs.join(' and ')}: list it in the capsule with role "kit" (e.g. gym shorts, swim shorts). Kit is never styled into looks.` : 'No functional kit is needed: every capsule piece has role "core".',
    p.settings.activities.some((k) => ['gym', 'hiking'].includes(k))
      ? `Shoes: because ${p.settings.activities.includes('gym') ? 'he trains' : 'he hikes'}, one of the ${b.shoes} pairs MUST be trainers or trail shoes he can actually ${p.settings.activities.includes('gym') ? 'run and lift in' : 'hike in'} (role "core" so they're also styled for casual days, and usually the pair to travel in). The other pair(s) cover smarter occasions. Never satisfy the gym with loafers or suede.`
      : null,
    `Mark travel: true on the pieces to wear on the journey (the bulkiest: outer layer, heaviest trousers and shoes).`,
    b.mode === 'daily'
      ? `Looks: one per day (${b.looks}), dated, in order, matched to that day's forecast and plans.`
      : `Looks: this is a ${days}-day trip, so plan a rotation of ${b.looks} looks (not one per day) that covers every occasion and the range of weather, built from capsule core pieces only.`,
    already ? `He is ALREADY on this trip (today is day ${already} of ${days}). He has the bag with him: plan the rotation for the rest of the stay.` : null,
    p.excluded.length ? `He has taken these OUT: never include them: ${p.excluded.join(', ')}.` : null,
    p.pinned.length ? `He has insisted on these: always include them, and build around them: ${p.pinned.join(', ')}.` : null,
    p.unworn?.length ? `On past trips he packed these and never wore them: be sceptical, include one only if this trip clearly needs it: ${p.unworn.join(', ')}.` : null,
  ].filter(Boolean).join('\n');
  return {
    model: MODELS.stylist,
    max_tokens: 14000,
    output_config: {
      // low keeps a full trip plan inside the request time budget; Opus is still thorough here
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false, required: ['summary', 'capsule', 'looks', 'extras', 'missing'],
          properties: {
            summary: { type: 'string', description: '2–3 sentences: the palette, the logic of the bag, and the weather. Plain, no item numbers.' },
            capsule: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['id', 'why', 'role', 'travel'],
                properties: { id: ref, why: { type: 'string', description: 'One short line: what this piece does for the trip' }, role: { type: 'string', enum: ['core', 'kit'] }, travel: { type: 'boolean' } },
              },
            },
            looks: tripLooksSchema(b),
            extras: { type: 'array', items: { type: 'string' }, description: 'Non-wardrobe things to pack (toiletries are assumed; list trip-specific ones: adapter, umbrella, swimwear if not owned, laptop). Short labels, no explanations.' },
            missing: missingSchema,
          },
        },
      },
    },
    system,
    messages: [{
      role: 'user',
      content: `Pack me a tight capsule for ${p.destination}${p.start_on ? ` from ${p.start_on}` : ''}${p.end_on ? ` to ${p.end_on}` : ''} (${days} ${days === 1 ? 'day' : 'days'}).${acts.length ? ` Plans: ${acts.join(', ')}.` : ''}${p.brief ? ` Notes: ${p.brief}` : ''}\nWeather: ${p.weather}\n\nRULES\n${rules}\n\nMaximise outfit combinations from the fewest pieces: neutral, mutually compatible bottoms and shoes; tops that work with every bottom.`,
    }],
  };
}

/** Restyles a trip's looks from the capsule as it stands (after he has edited it). Only capsule pieces exist here. */
export function tripLooksRequest(p: { destination: string; start_on?: string; end_on?: string; weather: string; settings: TripSettings; today: string; brief?: string }, system: Block[]): ClaudeRequest {
  const days = tripDays(p.start_on, p.end_on);
  const b = budget(p.settings, days);
  const acts = p.settings.activities.map((k) => ACTIVITIES.find((a) => a.key === k)?.label ?? k);
  return {
    model: MODELS.fast,
    max_tokens: 9000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['looks'], properties: { looks: tripLooksSchema(b) } } },
    },
    system,
    messages: [{
      role: 'user',
      content: `The wardrobe above is EXACTLY what I've packed for ${p.destination}${p.start_on ? ` (${p.start_on} to ${p.end_on})` : ''}; nothing else exists. ${acts.length ? `Plans: ${acts.join(', ')}. ` : ''}${p.brief ? `Notes: ${p.brief}. ` : ''}Weather: ${p.weather}\nStyle the trip from these pieces only: ${b.mode === 'daily' ? `one look per day (${b.looks}), dated, in order` : `a rotation of ${b.looks} looks covering every occasion and the weather range`}. Don't style gym or swim kit.`,
    }],
  };
}

/** A short, honest read on why a specific combination works or clashes — the "why" behind the score bar. */
export function critiqueRequest(current: WardrobeItem[], heuristic: string | undefined, system: Block[]): ClaudeRequest {
  return {
    model: MODELS.fast,
    max_tokens: 3000,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false, required: ['verdict', 'headline', 'working', 'issues', 'swaps'],
          properties: {
            verdict: { type: 'string', enum: ['sits well', 'works', 'clashes'] },
            headline: { type: 'string', description: 'One plain sentence: the overall read.' },
            working: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short points on what works (colour, proportion, texture, formality, season).' },
            issues: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short points on what holds it back. Empty if nothing does.' },
            swaps: {
              type: 'array',
              description: 'Up to 2 swaps using pieces I already own that would fix the issues. Empty if the look is already right.',
              items: { type: 'object', additionalProperties: false, required: ['out', 'in', 'why'], properties: { out: ref, in: ref, why: { type: 'string' } } },
            },
          },
        },
      },
    },
    system,
    messages: [{
      role: 'user',
      content: `I'm looking at this combination: ${current.map((i) => `#${i.number} ${i.name}`).join(', ')}.${heuristic ? ` The app's quick rule-based check (colour wheel, formality, pattern and season rules) rated it "${heuristic}".` : ''} Tell me why it works or clashes, specifically for these pieces. Be direct and concrete. In the text, refer to pieces by a short plain name ("the flannel", "the Baggies"), never by #number, and never mention internal scales like formality or warmth numbers. Keep each point to one short sentence (under 25 words). If you disagree with the quick check, say so in the headline. Only suggest swaps for the same slot, from my own wardrobe.`,
    }],
  };
}

export function nameRequest(desc: string): ClaudeRequest {
  return {
    model: MODELS.light,
    max_tokens: 300,
    thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['title', 'occasion'], properties: { title: { type: 'string' }, occasion: { type: 'string' } } } } },
    messages: [{ role: 'user', content: `Name this menswear outfit in 2-4 words, editorial and understated (like a lookbook caption, no puns, no emojis), and give a one-to-three word occasion. Pieces: ${desc}` }],
  };
}

/** Maps a pairings response onto real item ids. */
export function shapePairings(ctx: Ctx, item: WardrobeItem, out: any) {
  const groups = (out.groups ?? []).map((g: any) => ({
    slot: g.slot,
    picks: (g.picks ?? []).map((p: any) => {
      const it = resolveRef(ctx, p.id);
      return it && it.id !== item.id ? { item_id: it.id, why: p.why, score: p.score } : null;
    }).filter(Boolean),
  })).filter((g: any) => g.picks.length);
  const avoid = (out.avoid ?? []).map((p: any) => { const it = resolveRef(ctx, p.id); return it ? { item_id: it.id, why: p.why } : null; }).filter(Boolean);
  return { headline: out.headline, groups, avoid, missing: out.missing ?? [] };
}

// ───────────── pairings for one item ─────────────
export async function pairings(req: Request, caller: Caller) {
  const { item_id, refresh } = await req.json();
  const owner = caller.userId;
  const { data: cached } = await admin.from('pairings').select('*').eq('item_id', item_id).maybeSingle();
  const { count } = await admin.from('items').select('id', { count: 'exact', head: true }).eq('owner', owner).eq('archived', false);
  const fresh = cached && !refresh && cached.wardrobe_size === count && Date.now() - new Date(cached.created_at).getTime() < 1000 * 60 * 60 * 24 * 21;
  if (fresh) return json({ ...cached.result, cached: true });

  const { ctx, system } = await systemFor(owner);
  const item = ctx.byId.get(item_id);
  if (!item) throw new HttpError(404, 'Item not found');
  const res = await claude(pairingsRequest(item, system), { owner, fn: 'pairings' });
  const result = shapePairings(ctx, item, jsonFrom<any>(res));
  await admin.from('pairings').upsert({ item_id, owner, result, wardrobe_size: count, created_at: new Date().toISOString() });
  return json(result);
}

// ───────────── complete a partial look ─────────────
export async function complete(req: Request, caller: Caller) {
  const { item_ids = [], prompt, weather } = await req.json();
  const owner = caller.userId;
  const { ctx, system } = await systemFor(owner, weather);
  const current = (item_ids as string[]).map((id) => ctx.byId.get(id)).filter(Boolean);
  if (!current.length) throw new HttpError(400, 'Start with at least one piece');
  const res = await claude(completeRequest(current as WardrobeItem[], prompt, system), { owner, fn: 'complete' });
  const out = jsonFrom<{ looks: any[] }>(res);
  const looks = (out.looks ?? []).map((l) => normaliseLook(ctx, l)).filter(Boolean);
  return json({ looks });
}

// ───────────── why a look works / clashes ─────────────
export async function critique(req: Request, caller: Caller) {
  const { item_ids = [], heuristic, weather } = await req.json();
  const owner = caller.userId;
  const { ctx, system } = await systemFor(owner, weather);
  const current = (item_ids as string[]).map((id) => ctx.byId.get(id)).filter(Boolean) as WardrobeItem[];
  if (current.length < 2) throw new HttpError(400, 'Pick at least two pieces');
  const res = await claude(critiqueRequest(current, heuristic, system), { owner, fn: 'critique' });
  const out = jsonFrom<any>(res);
  const swaps = (out.swaps ?? []).map((s: any) => {
    const a = resolveRef(ctx, s.out), b = resolveRef(ctx, s.in);
    return a && b && a.id !== b.id && current.some((c) => c.id === a.id) && !current.some((c) => c.id === b.id) ? { out_id: a.id, in_id: b.id, why: s.why } : null;
  }).filter(Boolean);
  return json({ verdict: out.verdict, headline: out.headline, working: out.working ?? [], issues: out.issues ?? [], swaps });
}

// ───────────── packing capsule for a trip ─────────────
export async function forecast(destination: string, start?: string, end?: string) {
  try {
    const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(destination)}`)).json();
    const place = g?.results?.[0];
    if (!place) return null;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=16`;
    const f = await (await fetch(url)).json();
    const days = (f?.daily?.time ?? []).map((t: string, i: number) => ({
      date: t, max: f.daily.temperature_2m_max[i], min: f.daily.temperature_2m_min[i], rain: f.daily.precipitation_probability_max[i],
    })).filter((d: any) => (!start || d.date >= start) && (!end || d.date <= end));
    // the live forecast only reaches ~16 days out: flag when the trip runs past it, so the UI and the prompt can say so
    const partial = !!end && (!days.length || days[days.length - 1].date < end);
    return { place: `${place.name}, ${place.country}`, lat: place.latitude, lon: place.longitude, days, partial };
  } catch { return null; }
}

const todayIn = (tz?: string) => {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz || 'Europe/London' }); } catch { return new Date().toISOString().slice(0, 10); }
};

function weatherText(fc: any, destination: string) {
  return fc?.days?.length
    ? `${fc.place}: ` + fc.days.map((d: any) => `${d.date} ${Math.round(d.min)}–${Math.round(d.max)}°C rain ${d.rain}%`).join('; ') + (fc.partial ? ' (live forecast only covers these days; use typical climate for the rest)' : '')
    : `${destination}: no live forecast for these dates; use the typical climate for the season.`;
}

const settingsOf = (s: any): TripSettings => ({
  luggage: ['carry-on', 'checked', 'car'].includes(s?.luggage) ? s.luggage : DEFAULT_SETTINGS.luggage,
  laundry: ['none', 'weekly', 'easy'].includes(s?.laundry) ? s.laundry : DEFAULT_SETTINGS.laundry,
  activities: Array.isArray(s?.activities) ? s.activities.filter((x: unknown) => typeof x === 'string').slice(0, 12) : [],
});

const mapLooks = (ctx: Ctx, looks: any[], allowed: Set<string>) => (looks ?? []).map((d: any) => {
  const look = normaliseLook(ctx, d.look);
  if (!look) return null;
  look.items = look.items.filter((li: any) => allowed.has(li.item_id));
  return look.items.length >= 2 ? { date: d.date || undefined, label: d.label, look } : null;
}).filter(Boolean);

// ───────────── plan (or re-plan) a trip ─────────────
export async function pack(req: Request, caller: Caller) {
  const body = await req.json();
  const owner = caller.userId;
  const destination = String(body.destination ?? '').trim();
  if (!destination) throw new HttpError(400, 'destination required');
  const { trip_id, start_on, end_on, brief } = body;
  const settings = settingsOf(body.settings);
  const today = todayIn(body.tz);

  let existing: any = null;
  if (trip_id) {
    const { data } = await admin.from('trips').select('*').eq('id', trip_id).eq('owner', owner).maybeSingle();
    existing = data;
  }
  const fc = await forecast(destination, start_on, end_on);
  const weather = weatherText(fc, destination);
  const { ctx, system } = await systemFor(owner, weather);
  const excluded: string[] = existing?.excluded_ids ?? [];
  const pinned: string[] = existing?.pinned_ids ?? [];
  const label = (id: string) => { const i = ctx.byId.get(id); return i ? `#${i.number} ${i.name}` : null; };

  // learn from past trips: what came home unworn
  const { data: past } = await admin.from('trips').select('wrap').eq('owner', owner).eq('status', 'done').not('wrap', 'is', null).order('updated_at', { ascending: false }).limit(3);
  const unworn = [...new Set((past ?? []).flatMap((t: any) => t.wrap?.unworn ?? []))].filter((id) => !pinned.includes(id));

  const res = await claude(packRequest({
    destination, start_on, end_on, brief, weather, settings, today,
    excluded: excluded.map(label).filter(Boolean) as string[], pinned: pinned.map(label).filter(Boolean) as string[],
    unworn: unworn.map(label).filter(Boolean) as string[],
  }, system), { owner, fn: 'pack' });
  const out = jsonFrom<any>(res);

  // capsule: drop anything he excluded, then make sure everything he pinned is there
  const seen = new Set<string>();
  const capsule: any[] = [];
  for (const c of out.capsule ?? []) {
    const it = resolveRef(ctx, c.id);
    if (!it || seen.has(it.id) || excluded.includes(it.id)) continue;
    seen.add(it.id);
    capsule.push({ item_id: it.id, why: c.why, role: c.role === 'kit' ? 'kit' : 'core', travel: !!c.travel });
  }
  for (const id of pinned) if (!seen.has(id) && ctx.byId.has(id)) { seen.add(id); capsule.push({ item_id: id, why: 'You added this', role: 'core', travel: false }); }

  const core = new Set(capsule.filter((c) => c.role === 'core').map((c) => c.item_id));
  const looks = mapLooks(ctx, out.looks, core);

  // checklist: keep his own additions and anything already ticked; refresh the suggested ones
  const oldList: any[] = existing?.checklist ?? [];
  const mine = oldList.filter((x) => x.source === 'me');
  const suggested = (out.extras ?? []).map((label: string) => ({ id: `x-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, label, source: 'ai' }));
  const checklist = [...suggested.filter((x: any) => !mine.some((m) => m.label.toLowerCase() === x.label.toLowerCase())), ...mine];

  const plan = { summary: out.summary, capsule, looks, days: looks /* read by app builds before trips v2 */, missing: out.missing ?? [], forecast: fc, planned_at: new Date().toISOString(), version: 2 };
  const row: Record<string, unknown> = {
    owner, destination, name: destination, start_on: start_on || null, end_on: end_on || null, brief: brief || null,
    weather: fc, plan, settings, item_ids: capsule.map((c) => c.item_id), checklist,
  };
  if (!existing) row.status = 'planning';
  const q = existing ? admin.from('trips').update(row).eq('id', existing.id).select().single() : admin.from('trips').insert(row).select().single();
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  return json(data);
}

// ───────────── restyle a trip's looks from its capsule as edited ─────────────
export async function tripLooks(req: Request, caller: Caller) {
  const body = await req.json();
  const owner = caller.userId;
  const { data: trip } = await admin.from('trips').select('*').eq('id', body.trip_id).eq('owner', owner).maybeSingle();
  if (!trip) throw new HttpError(404, 'Trip not found');
  const plan = trip.plan ?? {};
  const kit = new Set<string>((plan.capsule ?? []).filter((c: any) => c.role === 'kit').map((c: any) => c.item_id));
  const coreIds: string[] = (trip.item_ids ?? []).filter((id: string) => !kit.has(id));
  if (coreIds.length < 2) throw new HttpError(400, 'Add a few more pieces first');
  const fc = trip.weather ?? plan.forecast ?? null;
  const weather = weatherText(fc, trip.destination);
  const full = await loadContext(owner);
  const ctx = full.scope(coreIds);
  const system = systemBlocks(ctx, weather);
  const res = await claude(tripLooksRequest({ destination: trip.destination, start_on: trip.start_on ?? undefined, end_on: trip.end_on ?? undefined, weather, settings: settingsOf(trip.settings), today: todayIn(body.tz), brief: trip.brief ?? undefined }, system), { owner, fn: 'trip.looks' });
  const out = jsonFrom<any>(res);
  const looks = mapLooks(ctx, out.looks, new Set(coreIds));
  const { data, error } = await admin.from('trips').update({ plan: { ...plan, looks, days: looks, looks_at: new Date().toISOString(), stale: false } }).eq('id', trip.id).select().single();
  if (error) throw new HttpError(500, error.message);
  return json(data);
}

// ───────────── name / describe a look ─────────────
export async function nameLook(req: Request, caller: Caller) {
  const { item_ids = [] } = await req.json();
  const { data: items } = await admin.from('items').select('number,name,subtype,colour_name,brand').in('id', item_ids);
  const desc = (items ?? []).map((i) => `${i.name ?? SUBTYPE_MAP[i.subtype ?? '']?.label} (${i.colour_name ?? ''}${i.brand ? `, ${i.brand}` : ''})`).join('; ');
  const res = await claude(nameRequest(desc), { owner: caller.userId, fn: 'name' });
  return json(jsonFrom(res));
}
