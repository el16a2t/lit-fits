// In-memory demo backend (web previews / screenshots only). Never used in the shipped app unless EXPO_PUBLIC_DEMO=1.
import type { LookDraftInput } from '@/lib/data';
import type { Item, Look, Message, Profile, Render, Thread, TrendBrief, Trip, WishlistItem } from '@/lib/types';

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();

function mk(n: number, p: Partial<Item> & { img: string; back?: string }): Item {
  const url = `/demo/${p.img}.png`;
  const back = p.back ? `/demo/${p.back}.png` : null;
  return {
    id: `demo-${n}`, owner: 'demo', number: n, name: null, category: null, subtype: null, slot: null, brand: null, colour_name: null,
    colours: [], colour_family: null, hue: null, lightness: 50, pattern: 'Solid', materials: [], fabric_weight: 'mid', size: null, size_system: null,
    fit: 'Relaxed', fit_notes: null, warmth: 2, formality: 2, seasons: [], tags: [], description: null, render_notes: null, wear_modes: [],
    photos: {}, images: { front: { url, thumb: url, aspect: 0.85 }, ...(back ? { back: { url: back, thumb: back, aspect: 0.9 } } : {}) },
    cover_url: url, thumb_url: url, aspect: 0.85, processing: {}, status: 'ready', laundry: 'clean', location: null, price: null, currency: 'GBP',
    acquired_on: null, care: null, notes: null, wear_count: 0, last_worn_on: null, favourite: false, archived: false,
    created_at: iso(n * 90), updated_at: iso(n * 60),
    ...p,
  } as Item;
}

let ITEMS: Item[] = [
  mk(1, { img: 'cap', name: 'Washed olive cap', subtype: 'cap_baseball', category: 'headwear', slot: 'head', brand: 'Carhartt WIP', colour_name: 'Washed olive', colour_family: 'olive', hue: 75, colours: [{ name: 'Olive', hex: '#5d5f45', share: 0.9 }], materials: ['Cotton', 'Canvas'], warmth: 1, formality: 1, seasons: ['spring', 'summer', 'autumn'], tags: ['workwear', 'minimal'], description: 'Garment-dyed six-panel cap with a tonal embroidered square logo; soft, broken-in crown.', location: 'Hall shelf' }),
  mk(2, { img: 'chambray', name: 'Slub chambray work shirt', subtype: 'shirt_chambray', category: 'shirts', slot: 'base', colour_name: 'Grey-blue', colour_family: 'denim', hue: 215, colours: [{ name: 'Grey-blue', hex: '#59627a', share: 0.9 }], materials: ['Cotton'], warmth: 2, formality: 2, seasons: ['spring', 'autumn'], tags: ['workwear'], pattern: 'Textured', wear_modes: [{ key: 'base', label: 'Buttoned', description: 'Fully buttoned', status: 'base' }, { key: 'm1', label: 'Sleeves rolled', description: 'Sleeves rolled twice to mid-forearm', status: 'suggested' }] }),
  mk(3, { img: 'grandad', name: 'Olive grandad-collar shirt', subtype: 'shirt_grandad', category: 'shirts', slot: 'base', brand: 'Zara', colour_name: 'Olive', colour_family: 'olive', hue: 70, colours: [{ name: 'Olive', hex: '#5f5c45', share: 0.95 }], materials: ['Linen', 'Cotton'], warmth: 1, formality: 2, seasons: ['spring', 'summer'], tags: ['summer', 'minimal'], wear_modes: [{ key: 'base', label: 'Buttoned', description: 'Placket buttoned', status: 'base' }, { key: 'm1', label: 'Open placket', description: 'Top two buttons undone', status: 'suggested' }] }),
  mk(4, { img: 'tee_front', back: 'tee_back', name: 'Bird-grid graphic tee', subtype: 'tee_graphic', category: 'tops', slot: 'base', brand: "Arc'teryx", colour_name: 'Dark olive', colour_family: 'olive', hue: 60, colours: [{ name: 'Dark olive', hex: '#4c4a3c', share: 0.8 }, { name: 'Orange', hex: '#d0632b', share: 0.1 }], materials: ['Cotton'], warmth: 1, formality: 1, pattern: 'Graphic', seasons: ['spring', 'summer', 'autumn'], tags: ['gorpcore', 'graphic', 'statement'] }),
  mk(5, { img: 'trousers', name: 'Washed black wide work trousers', subtype: 'trousers_work', category: 'trousers', slot: 'bottom', colour_name: 'Washed black', colour_family: 'charcoal', hue: null, lightness: 20, colours: [{ name: 'Washed black', hex: '#3a3936', share: 0.95 }], materials: ['Cotton', 'Twill'], warmth: 3, formality: 2, fit: 'Wide', seasons: ['spring', 'autumn', 'winter'], tags: ['workwear'] }),
  mk(6, { img: 'flannel', name: 'Red & ecru check flannel', subtype: 'overshirt_flannel', category: 'overshirts', slot: 'mid', colour_name: 'Red / ecru', colour_family: 'red', hue: 355, colours: [{ name: 'Red', hex: '#b13a3a', share: 0.45 }, { name: 'Ecru', hex: '#d9cfbd', share: 0.35 }, { name: 'Black', hex: '#1d1d1d', share: 0.2 }], materials: ['Flannel', 'Cotton'], warmth: 3, formality: 2, pattern: 'Check / plaid', seasons: ['autumn', 'winter'], tags: ['heritage', 'statement'], wear_modes: [{ key: 'base', label: 'Buttoned', description: '', status: 'base' }, { key: 'm1', label: 'Open', description: 'Worn open over a tee', status: 'suggested' }] }),
  mk(7, { img: 'shorts', name: 'Black technical shorts', subtype: 'shorts_technical', category: 'shorts', slot: 'bottom', brand: 'Patagonia', colour_name: 'Black', colour_family: 'black', lightness: 12, colours: [{ name: 'Black', hex: '#1e1e1e', share: 1 }], materials: ['Nylon'], warmth: 1, formality: 1, seasons: ['summer'], tags: ['gorpcore', 'technical', 'summer'], laundry: 'wash' }),
  mk(8, { img: 'tee_back', name: 'Bird-grid graphic tee (back)', subtype: 'tee_graphic', category: 'tops', slot: 'base', colour_name: 'Dark olive', colour_family: 'olive', hue: 60, warmth: 1, formality: 1, pattern: 'Graphic', archived: true }),
].filter((i) => !i.archived);

let LOOKS: Look[] = [
  {
    id: 'look-1', owner: 'demo', name: 'Olive on olive', notes: null, rationale: 'Tonal olive anchored by washed black; the cap repeats the shirt.', occasion: 'Weekend', seasons: ['spring'], source: 'stylist', prompt: null,
    canvas: { pieces: {} }, cover_render_id: null, favourite: true, worn_count: 2, last_worn_on: null, created_at: iso(3000), updated_at: iso(300),
    look_items: [{ look_id: 'look-1', item_id: 'demo-1', slot: 'head', wear_mode: null, ord: 0, note: null }, { look_id: 'look-1', item_id: 'demo-3', slot: 'base', wear_mode: 'Open placket', ord: 1, note: 'untucked' }, { look_id: 'look-1', item_id: 'demo-5', slot: 'bottom', wear_mode: null, ord: 2, note: null }],
  },
  {
    id: 'look-2', owner: 'demo', name: 'Check, black, done', notes: null, rationale: null, occasion: 'Pub', seasons: ['autumn'], source: 'manual', prompt: null,
    canvas: { pieces: {} }, cover_render_id: null, favourite: false, worn_count: 0, last_worn_on: null, created_at: iso(4000), updated_at: iso(900),
    look_items: [{ look_id: 'look-2', item_id: 'demo-6', slot: 'mid', wear_mode: 'Open', ord: 0, note: null }, { look_id: 'look-2', item_id: 'demo-4', slot: 'base', wear_mode: null, ord: 1, note: null }, { look_id: 'look-2', item_id: 'demo-5', slot: 'bottom', wear_mode: null, ord: 2, note: null }],
  },
];

let WISH: WishlistItem[] = [
  { id: 'w1', title: 'Dark brown suede chukka boots', subtype: 'boot_chukka', slot: 'feet', description: 'Unlined suede, crepe or rubber sole, slim but not pointy last.', colour: 'Dark brown', reason: 'Your olive and washed-black pieces have nothing warm to land on — brown suede finishes them.', pairs_with: ['demo-5', 'demo-3', 'demo-6'], look: null, search_query: 'dark brown suede chukka boots', concept_url: null, priority: 1, status: 'wanted', created_at: iso(500) },
];

const PROFILE: Profile = {
  id: 'demo', display_name: 'Adam', height_cm: 188, weight_kg: 86, build_notes: 'Tall, broad-shouldered', fit_preference: 'Balanced, never tight', appearance_notes: null,
  twin: {}, render_settings: { scene: 'studio' }, style_seed: null,
  style_dna: {
    headline: 'Quiet workwear with a technical streak — tonal, textured, one loud thing at most.',
    palette: ['Olive', 'Washed black', 'Ecru', 'Grey-blue'], silhouettes: ['Relaxed top, wide straight trouser', 'Untucked shirting'],
    signatures: ['Tonal olive layering', 'Workwear trousers with technical tops'], formality: 'Lives at 1–2, comfortable stepping to 3.',
    go_to: ['#5 Washed black wide work trousers'], under_used: ['#2 Slub chambray work shirt'], avoid: ['Two patterns at once'],
    next_moves: ['Add a brown suede boot to warm the palette', 'Try the chambray open over the graphic tee'], evolution: 'Moving smarter for autumn.',
  },
  style_dna_updated_at: iso(2000), preferences: { laundry_tracking: true }, onboarded: true,
};

const BRIEF: TrendBrief = {
  id: 'b1', season: 'Autumn/Winter 2026', summary: 'Texture over logos.', sources: [{ title: 'Mr Porter — The Journal', url: 'https://www.mrporter.com/en-gb/journal' }], created_at: iso(800),
  content: {
    season: 'Autumn/Winter 2026', headline: 'Texture over logos, workwear grows up.', summary: 'Editors are pushing heavier fabrics, tonal dressing and technical outerwear worn with tailoring. Brown is the neutral of the season; wide, straight trousers remain the default.',
    themes: [{ name: 'Tonal earth', what: 'Olive, brown and stone worn head to toe.', how: 'Vary textures — canvas, suede, brushed wool.' }, { name: 'Technical-tailored', what: 'Shells and fleeces over shirts and pleated trousers.', how: 'Keep one technical piece per look.' }],
    colours: ['Chocolate', 'Olive', 'Stone', 'Navy'], silhouettes: ['Wide straight trousers', 'Dropped-shoulder knitwear'], key_pieces: ['Suede chukka', 'Chore jacket', 'Heavy rollneck'],
    for_you: ['Add a brown suede boot', 'Layer the chambray over the graphic tee'], fading: ['Skinny trousers', 'Loud logo hoodies'],
  },
};

const THREADS: Thread[] = [{ id: 't1', title: '3 perfect outfits with smart touches for autumn', created_at: iso(1200), updated_at: iso(1200) }];

const persistKey = 'litfits.demo';
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(persistKey) : null;
  if (raw) {
    const d = JSON.parse(raw);
    if (d.v === 2) { ITEMS = d.items; LOOKS = d.looks; WISH = d.wish; }
  }
} catch { /* ignore */ }
const save = () => { try { localStorage.setItem(persistKey, JSON.stringify({ v: 2, items: ITEMS, looks: LOOKS, wish: WISH })); } catch { /* ignore */ } };

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const demoStore = {
  items: () => delay([...ITEMS]),
  item: (id: string) => delay(ITEMS.find((i) => i.id === id)!),
  createItem: (p: Partial<Item>) => {
    const n = Math.max(...ITEMS.map((i) => i.number)) + 1;
    const it = mk(n, { img: 'tee_front', status: 'processing', cover_url: null, thumb_url: null, images: {}, ...p } as any);
    ITEMS = [it, ...ITEMS]; save();
    return delay(it);
  },
  updateItem: (id: string, patch: Partial<Item>) => { ITEMS = ITEMS.map((i) => (i.id === id ? { ...i, ...patch } : i)).filter((i) => !i.archived); save(); return delay(ITEMS.find((i) => i.id === id)!); },
  usage: () => {
    const m: Record<string, number> = {};
    for (const l of LOOKS) for (const li of l.look_items ?? []) m[li.item_id] = (m[li.item_id] ?? 0) + 1;
    return delay(m);
  },
  looks: () => delay([...LOOKS]),
  look: (id: string) => delay(LOOKS.find((l) => l.id === id)!),
  saveLook: (d: LookDraftInput) => {
    const id = d.id ?? `look-${Date.now()}`;
    const look: Look = {
      id, owner: 'demo', name: d.name ?? null, notes: d.notes ?? null, rationale: d.rationale ?? null, occasion: d.occasion ?? null, seasons: [],
      source: d.source ?? 'manual', prompt: d.prompt ?? null, canvas: { pieces: d.canvas ?? {} }, cover_render_id: null, favourite: d.favourite ?? false,
      worn_count: 0, last_worn_on: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      look_items: d.pieces.map((p, i) => ({ look_id: id, item_id: p.item_id, slot: p.slot ?? null, wear_mode: p.wear_mode ?? null, note: p.note ?? null, ord: i })),
    };
    LOOKS = [look, ...LOOKS.filter((l) => l.id !== id)]; save();
    return delay(look);
  },
  updateLook: (id: string, patch: Partial<Look>) => { LOOKS = LOOKS.map((l) => (l.id === id ? { ...l, ...patch } : l)); save(); return delay(LOOKS.find((l) => l.id === id)!); },
  removeLook: (id: string) => { LOOKS = LOOKS.filter((l) => l.id !== id); save(); return delay(undefined); },
  render: (id: string) => delay({ id, status: 'running' } as Render),
  privateUrl: (p: string) => delay(p),
  wishlist: () => delay([...WISH]),
  addWish: (w: Partial<WishlistItem>) => { const x = { id: `w${Date.now()}`, title: w.title ?? 'Wish', status: 'wanted', pairs_with: [], priority: 2, created_at: new Date().toISOString(), ...w } as WishlistItem; WISH = [x, ...WISH]; save(); return delay(x); },
  updateWish: (id: string, patch: Partial<WishlistItem>) => { WISH = WISH.map((w) => (w.id === id ? { ...w, ...patch } : w)).filter((w) => w.status !== 'dismissed'); save(); return delay(WISH.find((w) => w.id === id)!); },
  threads: () => delay([...THREADS]),
  messages: (_id: string) => delay([] as Message[]),
  trips: () => delay([] as Trip[]),
  trip: (id: string) => delay({ id } as Trip),
  profile: () => delay({ ...PROFILE }),
  updateProfile: (p: Partial<Profile>) => { Object.assign(PROFILE, p); return delay({ ...PROFILE }); },
  brief: () => delay(BRIEF),
};
