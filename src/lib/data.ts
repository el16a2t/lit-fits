// Data access layer. Talks to Supabase (RLS: owner-only) — or to the in-memory demo store for previews.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { DEMO, supabase } from './supabase';
import type { CanvasPiece, Item, Look, LookItem, Message, Profile, Render, Thread, TrendBrief, Trip, WishlistItem } from './types';
import { demoStore } from '@/demo/store';

const rid = () => Math.random().toString(36).slice(2, 10);

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ───────────── images ─────────────
export async function prepPhoto(uri: string, max = 1600): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: max });
  const img = await ctx.renderAsync();
  // keep orientation-correct pixels; only downscale if wider than max
  const out = await img.saveAsync({ compress: 0.86, format: SaveFormat.JPEG });
  return out.uri;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' || uri.startsWith('http') || uri.startsWith('blob:') || uri.startsWith('data:')) {
    return await (await fetch(uri)).arrayBuffer();
  }
  const { File } = await import('expo-file-system');
  return await new File(uri).arrayBuffer();
}

export async function uploadPrivate(localUri: string, path: string, contentType = 'image/jpeg') {
  if (DEMO) return path;
  const bytes = await readBytes(localUri);
  const res = await supabase.storage.from('private').upload(path, bytes, { contentType, upsert: true });
  if (res.error) throw new Error(res.error.message);
  return path;
}

// ───────────── items ─────────────
export const items = {
  async list(): Promise<Item[]> {
    if (DEMO) return demoStore.items();
    return check(await supabase.from('items').select('*').eq('archived', false).order('created_at', { ascending: false })) as Item[];
  },
  async get(id: string): Promise<Item> {
    if (DEMO) return demoStore.item(id);
    return check(await supabase.from('items').select('*').eq('id', id).single()) as Item;
  },
  async create(patch: Partial<Item>): Promise<Item> {
    if (DEMO) return demoStore.createItem(patch);
    const owner = await uid();
    return check(await supabase.from('items').insert({ owner, status: 'processing', ...patch }).select('*').single()) as Item;
  },
  async update(id: string, patch: Partial<Item>): Promise<Item> {
    if (DEMO) return demoStore.updateItem(id, patch);
    return check(await supabase.from('items').update(patch).eq('id', id).select('*').single()) as Item;
  },
  async archive(id: string) {
    if (DEMO) return demoStore.updateItem(id, { archived: true });
    return check(await supabase.from('items').update({ archived: true }).eq('id', id).select('id').single());
  },
  async uploadPhotos(itemId: string, photos: Partial<Record<'front' | 'back' | 'side' | 'label', string>>) {
    const owner = DEMO ? 'demo' : await uid();
    const out: Record<string, string> = {};
    await Promise.all(Object.entries(photos).map(async ([k, uri]) => {
      if (!uri) return;
      const prepped = await prepPhoto(uri, k === 'label' ? 1400 : 1600);
      out[k] = await uploadPrivate(prepped, `${owner}/items/${itemId}/${k}-${rid()}.jpg`);
    }));
    return out;
  },
  async usage(): Promise<Record<string, number>> {
    if (DEMO) return demoStore.usage();
    const rows = check(await supabase.from('look_items').select('item_id')) as { item_id: string }[];
    const m: Record<string, number> = {};
    for (const r of rows) m[r.item_id] = (m[r.item_id] ?? 0) + 1;
    return m;
  },
  async markWorn(ids: string[], lookId?: string | null) {
    if (DEMO) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from('wear_log').insert({ owner: await uid(), item_ids: ids, look_id: lookId ?? null, worn_on: today });
    for (const id of ids) {
      const it = check(await supabase.from('items').select('wear_count').eq('id', id).single()) as { wear_count: number };
      await supabase.from('items').update({ wear_count: (it.wear_count ?? 0) + 1, last_worn_on: today }).eq('id', id);
    }
    if (lookId) {
      const lk = check(await supabase.from('looks').select('worn_count').eq('id', lookId).single()) as { worn_count: number };
      await supabase.from('looks').update({ worn_count: (lk.worn_count ?? 0) + 1, last_worn_on: today }).eq('id', lookId);
    }
  },
  async setLaundry(ids: string[], laundry: Item['laundry']) {
    if (DEMO) { ids.forEach((id) => demoStore.updateItem(id, { laundry })); return; }
    check(await supabase.from('items').update({ laundry }).in('id', ids).select('id'));
  },
};

// ───────────── looks ─────────────
export interface LookDraftInput {
  id?: string;
  name?: string | null;
  notes?: string | null;
  rationale?: string | null;
  occasion?: string | null;
  source?: Look['source'];
  prompt?: string | null;
  favourite?: boolean;
  pieces: { item_id: string; wear_mode?: string | null; note?: string | null; slot?: string | null }[];
  canvas?: Record<string, CanvasPiece>;
}

export const looks = {
  async list(): Promise<Look[]> {
    if (DEMO) return demoStore.looks();
    return check(await supabase.from('looks').select('*, look_items(*)').order('updated_at', { ascending: false })) as Look[];
  },
  async get(id: string): Promise<Look> {
    if (DEMO) return demoStore.look(id);
    return check(await supabase.from('looks').select('*, look_items(*)').eq('id', id).single()) as Look;
  },
  async save(d: LookDraftInput): Promise<Look> {
    if (DEMO) return demoStore.saveLook(d);
    const owner = await uid();
    const row = {
      owner,
      name: d.name ?? null,
      notes: d.notes ?? null,
      rationale: d.rationale ?? null,
      occasion: d.occasion ?? null,
      source: d.source ?? 'manual',
      prompt: d.prompt ?? null,
      favourite: d.favourite ?? false,
      canvas: { pieces: d.canvas ?? {} },
    };
    const look = (d.id
      ? check(await supabase.from('looks').update(row).eq('id', d.id).select('*').single())
      : check(await supabase.from('looks').insert(row).select('*').single())) as Look;
    await supabase.from('look_items').delete().eq('look_id', look.id);
    if (d.pieces.length) {
      const li: Omit<LookItem, 'look_id'>[] & { look_id: string; owner: string }[] = d.pieces.map((p, i) => ({
        look_id: look.id, owner, item_id: p.item_id, wear_mode: p.wear_mode ?? null, note: p.note ?? null, slot: p.slot ?? null, ord: i,
      })) as any;
      check(await supabase.from('look_items').insert(li).select('look_id'));
    }
    await supabase.from('signals').insert({ owner, kind: 'save', look_id: look.id, item_ids: d.pieces.map((p) => p.item_id) });
    return { ...look, look_items: d.pieces.map((p, i) => ({ look_id: look.id, item_id: p.item_id, wear_mode: p.wear_mode ?? null, note: p.note ?? null, slot: p.slot ?? null, ord: i })) };
  },
  async update(id: string, patch: Partial<Look>) {
    if (DEMO) return demoStore.updateLook(id, patch);
    return check(await supabase.from('looks').update(patch).eq('id', id).select('*, look_items(*)').single()) as Look;
  },
  async remove(id: string) {
    if (DEMO) return demoStore.removeLook(id);
    check(await supabase.from('looks').delete().eq('id', id).select('id'));
  },
};

// ───────────── renders ─────────────
export const renders = {
  async forLook(lookId: string): Promise<Render[]> {
    if (DEMO) return [];
    return check(await supabase.from('renders').select('*').eq('look_id', lookId).order('created_at', { ascending: false })) as Render[];
  },
  async get(id: string): Promise<Render> {
    if (DEMO) return demoStore.render(id);
    return check(await supabase.from('renders').select('*').eq('id', id).single()) as Render;
  },
  async recent(): Promise<Render[]> {
    if (DEMO) return [];
    return check(await supabase.from('renders').select('*').order('created_at', { ascending: false }).limit(40)) as Render[];
  },
};

// ───────────── signed URLs for private images (cached in memory) ─────────────
const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (DEMO) return demoStore.privateUrl(path);
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('private').createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 1000 * 60 * 60 * 24 * 6 });
  return data.signedUrl;
}

// ───────────── wishlist ─────────────
export const wishlist = {
  async list(): Promise<WishlistItem[]> {
    if (DEMO) return demoStore.wishlist();
    return check(await supabase.from('wishlist').select('*').neq('status', 'dismissed').order('created_at', { ascending: false })) as WishlistItem[];
  },
  async add(w: Partial<WishlistItem>): Promise<WishlistItem> {
    if (DEMO) return demoStore.addWish(w);
    const owner = await uid();
    return check(await supabase.from('wishlist').insert({ owner, ...w }).select('*').single()) as WishlistItem;
  },
  async update(id: string, patch: Partial<WishlistItem>) {
    if (DEMO) return demoStore.updateWish(id, patch);
    return check(await supabase.from('wishlist').update(patch).eq('id', id).select('*').single()) as WishlistItem;
  },
};

// ───────────── stylist threads ─────────────
export const threads = {
  async list(): Promise<Thread[]> {
    if (DEMO) return demoStore.threads();
    return check(await supabase.from('threads').select('*').order('updated_at', { ascending: false }).limit(30)) as Thread[];
  },
  async messages(threadId: string): Promise<Message[]> {
    if (DEMO) return demoStore.messages(threadId);
    return check(await supabase.from('messages').select('*').eq('thread_id', threadId).order('created_at')) as Message[];
  },
  async remove(id: string) {
    if (DEMO) return;
    check(await supabase.from('threads').delete().eq('id', id).select('id'));
  },
};

export async function signal(kind: 'like' | 'dislike' | 'save' | 'wear', p: { item_ids?: string[]; look_id?: string; text?: string; value?: number }) {
  if (DEMO) return;
  try {
    await supabase.from('signals').insert({ owner: await uid(), kind, item_ids: p.item_ids ?? [], look_id: p.look_id ?? null, text: p.text ?? null, value: p.value ?? null });
  } catch { /* best effort */ }
}

// ───────────── trips ─────────────
export const trips = {
  async list(): Promise<Trip[]> {
    if (DEMO) return demoStore.trips();
    return check(await supabase.from('trips').select('*').order('created_at', { ascending: false })) as Trip[];
  },
  async get(id: string): Promise<Trip> {
    if (DEMO) return demoStore.trip(id);
    return check(await supabase.from('trips').select('*').eq('id', id).single()) as Trip;
  },
  async update(id: string, patch: Partial<Trip>) {
    if (DEMO) return demoStore.trip(id);
    return check(await supabase.from('trips').update(patch).eq('id', id).select('*').single()) as Trip;
  },
  async remove(id: string) {
    if (DEMO) return;
    check(await supabase.from('trips').delete().eq('id', id).select('id'));
  },
};

// ───────────── profile & knowledge ─────────────
export const profile = {
  async get(): Promise<Profile | null> {
    if (DEMO) return demoStore.profile();
    const id = await uid();
    return check(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null;
  },
  async update(patch: Partial<Profile>) {
    if (DEMO) return demoStore.updateProfile(patch);
    const id = await uid();
    return check(await supabase.from('profiles').update(patch).eq('id', id).select('*').single()) as Profile;
  },
  async uploadTwinPhoto(kind: 'face_front' | 'face_left' | 'face_right' | 'full_body', uri: string) {
    const owner = DEMO ? 'demo' : await uid();
    const prepped = await prepPhoto(uri, kind === 'full_body' ? 1280 : 1024);
    return uploadPrivate(prepped, `${owner}/twin/${kind}-${rid()}.jpg`);
  },
};

export async function latestBrief(): Promise<TrendBrief | null> {
  if (DEMO) return demoStore.brief();
  return check(await supabase.from('trend_briefs').select('*').not('summary', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()) as TrendBrief | null;
}

export async function monthSpend(): Promise<{ usd: number; images: number; calls: number }> {
  if (DEMO) return { usd: 3.42, images: 31, calls: 64 };
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const rows = check(await supabase.from('usage').select('est_cost_usd,images').gte('created_at', since.toISOString())) as { est_cost_usd: number; images: number }[];
  return {
    usd: rows.reduce((a, r) => a + Number(r.est_cost_usd || 0), 0),
    images: rows.reduce((a, r) => a + (r.images || 0), 0),
    calls: rows.length,
  };
}
