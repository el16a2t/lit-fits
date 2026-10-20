// Bootstrap (single-owner account creation), wishlist concepts, signals.
import { admin, background, BUCKET_PRIVATE, BUCKET_PUBLIC, Caller, enqueue, HttpError, json, MODELS, ownerId, publicUrl, rid, upload } from '../lib/core.ts';
import { generateImage } from '../lib/gemini.ts';
import { decodeImage, keyOut, resize, toPng, trim, chooseKey } from '../lib/image.ts';
import { productShotPrompt, aspectFor, viewsFor } from '../lib/prompts.ts';
import { SUBTYPE_MAP } from '../lib/taxonomy.ts';
import { ADAM_DEFAULT_SEED } from '../lib/prompts.ts';

export async function bootstrap(req: Request) {
  const { email, password, name } = await req.json();
  if (await ownerId()) throw new HttpError(409, 'This Lit Fits already has an owner. Sign in instead.');
  if (!email || !password || String(password).length < 8) throw new HttpError(400, 'Email and a password of 8+ characters required');
  const { data: allowed } = await admin.rpc('get_config', { k: 'owner_email' });
  if (allowed && String(allowed).toLowerCase().trim() !== String(email).toLowerCase().trim()) {
    throw new HttpError(403, 'This Lit Fits is reserved for its owner. Use the email it was set up for.');
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new HttpError(400, error?.message ?? 'Could not create account');
  const uid = data.user.id;
  const { error: oe } = await admin.from('app_owner').insert({ user_id: uid });
  if (oe) {
    await admin.auth.admin.deleteUser(uid);
    throw new HttpError(409, 'Owner already set');
  }
  await admin.from('profiles').upsert({ id: uid, display_name: name || 'Adam', style_seed: ADAM_DEFAULT_SEED, preferences: { theme: 'system', laundry_tracking: false, location_tracking: false } });
  // adopt anything prepared before the account existed (bake-off items, twin photos)
  const adopted = await adoptLab(uid).catch((e) => { console.error('adopt failed', e); return { items: 0, twin: false }; });
  return json({ ok: true, user_id: uid, adopted });
}

/** Moves pre-launch lab outputs (catalogued seed items + twin photos) into the new owner's account. */
async function adoptLab(owner: string) {
  const { data: seeds } = await admin.from('lab_runs').select('*').eq('kind', 'seed_item').eq('status', 'done');
  let items = 0;
  for (const s of seeds ?? []) {
    const o = s.output as any;
    const { data: item, error } = await admin.from('items').insert({ owner, ...o.item, status: 'ready' }).select('id').single();
    if (error || !item) { console.error(error); continue; }
    // copy photos + images under the owner's folders
    const photos: Record<string, string> = {};
    for (const [k, p] of Object.entries(o.photos ?? {})) {
      const dest = `${owner}/items/${item.id}/${k}-${rid()}.jpg`;
      const { error: ce } = await admin.storage.from(BUCKET_PRIVATE).copy(p as string, dest);
      if (!ce) photos[k] = dest;
    }
    const images: Record<string, any> = {};
    let cover: any = null;
    for (const [view, img] of Object.entries(o.images ?? {}) as [string, any][]) {
      const base = `${owner}/${item.id}/${view}-${rid()}`;
      const copies = [[img.png, `${base}.png`], [img.thumb, `${base}-t.png`], [img.ref, `${base}-r.jpg`]].filter(([a]) => a);
      for (const [from, to] of copies) await admin.storage.from(BUCKET_PUBLIC).copy(from, to);
      images[view] = { url: publicUrl(`${base}.png`), thumb: publicUrl(`${base}-t.png`), ref: img.ref ? publicUrl(`${base}-r.jpg`) : null, aspect: img.aspect, w: img.w, h: img.h, model: img.model };
      if (view === o.cover_view) cover = images[view];
    }
    const modes = (o.item.wear_modes ?? []).map((m: any) => (m.key === 'base' && cover ? { ...m, url: cover.url, thumb: cover.thumb, ref: cover.ref, aspect: cover.aspect } : m));
    await admin.from('items').update({ photos, images, wear_modes: modes, cover_url: cover?.url ?? null, thumb_url: cover?.thumb ?? null, aspect: cover?.aspect ?? null }).eq('id', item.id);
    await admin.from('lab_runs').update({ status: 'adopted' }).eq('id', s.id);
    // any studio shot that didn't make it pre-launch gets another go now
    const missing = Object.keys(o.item.processing?.views ?? {}).filter((v) => !images[v]);
    if (missing.length) await queueViews(item.id, missing).catch((e) => console.error('requeue', e));
    items++;
  }
  let twin = false;
  const { data: t } = await admin.from('lab_runs').select('*').eq('kind', 'seed_twin').eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (t) {
    const out: Record<string, string> = {};
    for (const [k, p] of Object.entries((t.output as any)?.twin ?? {})) {
      const dest = `${owner}/twin/${k}-${rid()}.jpg`;
      const { error } = await admin.storage.from(BUCKET_PRIVATE).copy(p as string, dest);
      if (!error) out[k] = dest;
    }
    await admin.from('profiles').update({ twin: out }).eq('id', owner);
    await admin.from('lab_runs').update({ status: 'adopted' }).eq('id', t.id);
    twin = true;
  }
  return { items, twin };
}

export async function wishlistConcept(req: Request, caller: Caller) {
  const { id } = await req.json();
  const { data: w } = await admin.from('wishlist').select('*').eq('id', id).single();
  if (!w || w.owner !== caller.userId) throw new HttpError(404, 'Not found');
  background((async () => {
    try {
      const st = SUBTYPE_MAP[w.subtype ?? ''];
      const kind = st?.kind ?? (w.slot === 'feet' ? 'shoe' : w.slot === 'bottom' ? 'bottom' : w.slot === 'head' ? 'cap' : 'top');
      const view = kind === 'shoe' ? 'side' : 'front';
      const key = chooseKey([]);
      const prompt = productShotPrompt({
        kind, view, key,
        name: w.title,
        colourName: w.colour,
        renderNotes: w.description,
        referenceNote: 'No reference photo: design a realistic, understated, high-quality version of this piece as a premium menswear retailer would sell it. No visible branding.',
      });
      const gen = await generateImage({ model: MODELS.productImage, parts: [{ text: prompt }], aspectRatio: aspectFor(kind, view), imageSize: '1K', owner: caller.userId, fn: 'wishlist.concept' });
      const { raster } = keyOut(resize(decodeImage(gen.bytes), 1200), key);
      const png = toPng(resize(trim(raster), 800));
      const path = `${caller.userId}/wishlist/${id}-${rid()}.png`;
      await upload(BUCKET_PUBLIC, path, png, 'image/png');
      await admin.from('wishlist').update({ concept_url: publicUrl(path) }).eq('id', id);
    } catch (e) { console.error('concept failed', e); }
  })());
  return json({ ok: true });
}

/** Marks views as queued and fans out one studio-shot job per view. */
async function queueViews(itemId: string, views: string[]) {
  for (const v of views) await admin.rpc('item_proc_set', { p_id: itemId, p_group: 'views', p_key: v, p_value: 'queued', p_error: null });
  await admin.from('items').update({ status: 'processing' }).eq('id', itemId);
  for (const v of views) await enqueue('item/process', { item_id: itemId, step: 'view', view: v });
}

/** Re-shoots every piece that has no studio photo yet (e.g. after image generation was unavailable). */
export async function reshootMissing(_req: Request, caller: Caller) {
  const { data: items } = await admin.from('items').select('id,subtype,photos,images,processing').eq('owner', caller.userId).eq('archived', false).is('cover_url', null).neq('status', 'draft');
  let queued = 0;
  for (const it of items ?? []) {
    const photos = (it.photos ?? {}) as Record<string, string>;
    if (!photos.front && !photos.side) continue;
    const views = viewsFor(it.subtype).filter((v) => (v === 'back' ? !!photos.back : true)).filter((v) => !(it.images ?? {})[v]);
    if (!views.length) continue;
    await queueViews(it.id, views);
    queued++;
  }
  return json({ ok: true, queued });
}

/** Breadcrumbs from the app (pre-auth allowed). Small, schema-light, service-role write only. */
export async function clientLog(req: Request) {
  const raw = await req.text();
  if (raw.length > 24_000) throw new HttpError(413, 'Too large');
  let body: any = {};
  try { body = JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Bad JSON'); }
  const events = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
  const device = body.device && typeof body.device === 'object' ? body.device : {};
  if (events.length) await admin.from('client_logs').insert({ device, events });
  return json({ ok: true });
}
