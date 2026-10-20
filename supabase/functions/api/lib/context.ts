// Builds the compact wardrobe + profile context the stylist reasons over.
import { admin } from './core.ts';
import { SUBTYPE_MAP } from './taxonomy.ts';
import { ADAM_DEFAULT_SEED } from './prompts.ts';

export interface WardrobeItem {
  id: string;
  number: number;
  name: string | null;
  subtype: string | null;
  slot: string | null;
  brand: string | null;
  colour_name: string | null;
  pattern: string | null;
  materials: string[] | null;
  fit: string | null;
  warmth: number | null;
  formality: number | null;
  seasons: string[] | null;
  tags: string[] | null;
  wear_modes: { key: string; label: string; status?: string }[] | null;
  laundry: string;
  location: string | null;
  description: string | null;
  favourite: boolean;
  wear_count: number;
  last_worn_on: string | null;
  thumb_url: string | null;
}

export interface Ctx {
  items: WardrobeItem[];
  byNumber: Map<number, WardrobeItem>;
  byId: Map<string, WardrobeItem>;
  usage: Map<string, number>;
  text: string;
  profile: Record<string, any> | null;
  seed: string;
  body: string;
  trend: string | null;
  laundryTracking: boolean;
}

export async function loadContext(owner: string, opts: { includeDescriptions?: boolean } = {}): Promise<Ctx> {
  const [{ data: items }, { data: usage }, { data: profile }, { data: brief }] = await Promise.all([
    admin.from('items')
      .select('id,number,name,subtype,slot,brand,colour_name,pattern,materials,fit,warmth,formality,seasons,tags,wear_modes,laundry,location,description,favourite,wear_count,last_worn_on,thumb_url')
      .eq('owner', owner).eq('archived', false).neq('status', 'draft').order('number'),
    admin.from('look_items').select('item_id').eq('owner', owner),
    admin.from('profiles').select('*').eq('id', owner).maybeSingle(),
    admin.from('trend_briefs').select('summary,content,created_at').not('summary', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return buildCtx({ items: (items ?? []) as WardrobeItem[], usage: usage ?? [], profile, brief, opts });
}

/** Pure context builder (also used by the internal dry-run against staged pieces). */
export function buildCtx(input: {
  items: WardrobeItem[];
  usage: { item_id: string }[];
  profile: Record<string, any> | null;
  brief: { summary: string | null; content: unknown } | null;
  opts?: { includeDescriptions?: boolean };
}): Ctx {
  const { profile, brief } = input;
  const opts = input.opts ?? {};
  const list = input.items;
  const use = new Map<string, number>();
  for (const r of input.usage) use.set(r.item_id, (use.get(r.item_id) ?? 0) + 1);
  const laundryTracking = !!profile?.preferences?.laundry_tracking;

  const lines = list.map((it) => {
    const st = SUBTYPE_MAP[it.subtype ?? ''];
    const modes = (it.wear_modes ?? []).filter((m) => m.status !== 'suggested').map((m) => m.label);
    const bits = [
      `#${it.number}`,
      it.name ?? st?.label ?? 'piece',
      `[${st?.label ?? it.subtype ?? '?'} · ${it.slot ?? '?'}]`,
      it.brand ? `brand ${it.brand}` : null,
      it.colour_name ? `colour ${it.colour_name}` : null,
      it.pattern && it.pattern !== 'Solid' ? it.pattern.toLowerCase() : null,
      it.materials?.length ? it.materials.join('/').toLowerCase() : null,
      it.fit ? `${it.fit.toLowerCase()} fit` : null,
      `warmth ${it.warmth ?? '?'} formality ${it.formality ?? '?'}`,
      it.seasons?.length ? `seasons ${it.seasons.join(',')}` : null,
      it.tags?.length ? `tags ${it.tags.join(',')}` : null,
      modes.length > 1 ? `modes: ${modes.join(' / ')}` : null,
      laundryTracking && it.laundry !== 'clean' ? `STATE ${it.laundry}` : null,
      `in ${use.get(it.id) ?? 0} looks`,
      it.favourite ? 'favourite' : null,
      opts.includeDescriptions && it.description ? `— ${it.description}` : null,
    ].filter(Boolean);
    return bits.join(' | ');
  });

  const body = [
    profile?.height_cm ? `${profile.height_cm} cm` : null,
    profile?.weight_kg ? `${profile.weight_kg} kg` : null,
    profile?.build_notes,
    profile?.fit_preference ? `fit preference: ${profile.fit_preference}` : null,
  ].filter(Boolean).join(', ');

  let trend: string | null = null;
  if (brief) {
    const c = brief.content as Record<string, unknown>;
    trend = [brief.summary, c?.for_you ? `For him: ${JSON.stringify(c.for_you)}` : null, c?.themes ? `Themes: ${JSON.stringify(c.themes)}` : null]
      .filter(Boolean).join('\n').slice(0, 3500);
  }

  return {
    items: list,
    byNumber: new Map(list.map((i) => [i.number, i])),
    byId: new Map(list.map((i) => [i.id, i])),
    usage: use,
    text: `WARDROBE (${list.length} pieces; refer to items by their #number):\n${lines.join('\n')}`,
    profile,
    seed: profile?.style_seed || ADAM_DEFAULT_SEED,
    body: body || 'tall, broad-shouldered',
    trend,
    laundryTracking,
  };
}

/** Accepts "#12", "12", or a UUID and resolves to an item. */
export function resolveRef(ctx: Ctx, ref: string | number): WardrobeItem | undefined {
  const s = String(ref).trim();
  const m = s.match(/^#?(\d+)$/);
  if (m) return ctx.byNumber.get(Number(m[1]));
  return ctx.byId.get(s);
}

export function todayString(tz = 'Europe/London') {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
}
