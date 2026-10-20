// Structured (non-streaming) stylist tasks: pairings, look completion, trip packing, naming.
import { admin, Caller, HttpError, json, MODELS } from '../lib/core.ts';
import { claude, jsonFrom, type Block, type ClaudeRequest } from '../lib/anthropic.ts';
import { loadContext, resolveRef, todayString, type Ctx, type WardrobeItem } from '../lib/context.ts';
import { stylistSystem } from '../lib/prompts.ts';
import { normaliseLook } from './stylist.ts';
import { SUBTYPE_MAP } from '../lib/taxonomy.ts';

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

export function packRequest(p: { destination: string; start_on?: string; end_on?: string; brief?: string; weather: string }, system: Block[]): ClaudeRequest {
  return {
    model: MODELS.stylist,
    max_tokens: 14000,
    output_config: {
      // low keeps a full trip plan inside the request time budget; Opus is still thorough here
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false, required: ['summary', 'capsule', 'days', 'extras', 'missing'],
          properties: {
            summary: { type: 'string' },
            capsule: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'why'], properties: { id: ref, why: { type: 'string' } } } },
            days: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['label', 'look'],
                properties: { date: { type: 'string' }, label: { type: 'string' }, look: lookSchema },
              },
            },
            extras: { type: 'array', items: { type: 'string' }, description: 'Non-wardrobe things to remember (e.g. swimwear, umbrella)' },
            missing: missingSchema,
          },
        },
      },
    },
    system,
    messages: [{
      role: 'user',
      content: `Pack me a tight capsule for a trip to ${p.destination}${p.start_on ? ` from ${p.start_on}` : ''}${p.end_on ? ` to ${p.end_on}` : ''}. ${p.brief ?? ''}\nWeather: ${p.weather}\nMaximise outfit combinations from the fewest pieces (re-wear bottoms, outerwear and shoes), cover every planned occasion, and keep it to one carry-on unless the brief says otherwise. Give one look per day/occasion using only capsule pieces.`,
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
    return { place: `${place.name}, ${place.country}`, lat: place.latitude, lon: place.longitude, days };
  } catch { return null; }
}

export async function pack(req: Request, caller: Caller) {
  const { trip_id, destination, start_on, end_on, brief } = await req.json();
  const owner = caller.userId;
  if (!destination) throw new HttpError(400, 'destination required');
  const fc = await forecast(destination, start_on, end_on);
  const weather = fc?.days?.length
    ? `${fc.place}: ` + fc.days.map((d: any) => `${d.date} ${Math.round(d.min)}–${Math.round(d.max)}°C rain ${d.rain}%`).join('; ')
    : `${destination} — no live forecast for these dates; use typical climate for the season.`;
  const { ctx, system } = await systemFor(owner, weather);
  const res = await claude(packRequest({ destination, start_on, end_on, brief, weather }, system), { owner, fn: 'pack' });
  const out = jsonFrom<any>(res);
  const capsule = (out.capsule ?? []).map((c: any) => { const it = resolveRef(ctx, c.id); return it ? { item_id: it.id, why: c.why } : null; }).filter(Boolean);
  const days = (out.days ?? []).map((d: any) => ({ date: d.date, label: d.label, look: normaliseLook(ctx, d.look) })).filter((d: any) => d.look);
  const plan = { summary: out.summary, capsule, days, extras: out.extras ?? [], missing: out.missing ?? [], forecast: fc };
  const row = { owner, destination, name: `${destination}${start_on ? ` · ${start_on}` : ''}`, start_on: start_on || null, end_on: end_on || null, brief, weather: fc, plan, item_ids: capsule.map((c: any) => c.item_id) };
  const q = trip_id ? admin.from('trips').update(row).eq('id', trip_id).select().single() : admin.from('trips').insert(row).select().single();
  const { data, error } = await q;
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
