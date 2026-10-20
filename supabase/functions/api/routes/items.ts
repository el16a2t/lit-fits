// Item pipeline: AI cataloguing → product cut-outs per view → wear-mode variants.
import { admin, background, BUCKET_PRIVATE, BUCKET_PUBLIC, Caller, download, enqueue, HttpError, json, MODELS, publicUrl, rid, upload } from '../lib/core.ts';
import { claude, jsonFrom } from '../lib/anthropic.ts';
import { generateImage, imagePart, type Part } from '../lib/gemini.ts';
import { chooseKey, decodeImage, keyOut, resize, toBase64, toJpeg, toPng, trim, type KeyName, type Raster } from '../lib/image.ts';
import { ANALYSIS_SYSTEM, analysisSchema, aspectFor, productShotPrompt, viewsFor, type Analysis, type View } from '../lib/prompts.ts';
import { SUBTYPE_MAP, type ImagingKind } from '../lib/taxonomy.ts';

type Photos = Partial<Record<'front' | 'back' | 'side' | 'label' | 'detail', string>>;

// ───────────────────────── pure pipeline steps (reused by the lab) ─────────────────────────

export async function analysePhotos(
  photos: Partial<Record<keyof Photos, Uint8Array>>,
  hint: { subtype?: string | null; brand?: string | null; notes?: string | null },
  owner: string | null,
): Promise<Analysis> {
  const content: unknown[] = [];
  const order: (keyof Photos)[] = ['front', 'side', 'back', 'label', 'detail'];
  for (const k of order) {
    const b = photos[k];
    if (!b) continue;
    content.push({ type: 'text', text: `Photo: ${k.toUpperCase()}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(b) } });
  }
  const hints = [
    hint.subtype ? `Owner says the type is: ${SUBTYPE_MAP[hint.subtype]?.label ?? hint.subtype}.` : '',
    hint.brand ? `Owner says the brand is: ${hint.brand}.` : '',
    hint.notes ? `Owner notes: ${hint.notes}` : '',
  ].filter(Boolean).join(' ');
  content.push({ type: 'text', text: `Catalogue this piece.${hints ? ' ' + hints : ''}` });
  const res = await claude({
    model: MODELS.fast,
    max_tokens: 4000,
    thinking: { type: 'disabled' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: analysisSchema() } },
    system: ANALYSIS_SYSTEM,
    // deno-lint-ignore no-explicit-any
    messages: [{ role: 'user', content: content as any }],
  }, { owner, fn: 'item.analyse' });
  const a = jsonFrom<Analysis>(res);
  a.brand = a.brand?.trim() || null;
  a.size = a.size?.trim() || null;
  a.care = a.care?.trim() || null;
  if (!a.fit || a.fit === 'Unknown') a.fit = null;
  a.warmth = Math.min(5, Math.max(1, Math.round(a.warmth || 3)));
  a.formality = Math.min(5, Math.max(1, Math.round(a.formality || 2)));
  return a;
}

/** Composite a cut-out onto flat white (for feeding back into image models). */
export function flatten(r: Raster, bg: [number, number, number] = [255, 255, 255]): Uint8Array {
  return toJpeg(r, 90, bg);
}

export async function makeCutout(args: {
  kind: ImagingKind;
  view: View;
  key: KeyName;
  name: string;
  colourName?: string | null;
  renderNotes?: string | null;
  state?: string | null;
  primary: Uint8Array; // photo of this view (or base product shot for modes)
  secondary?: Uint8Array | null;
  editInstruction?: string; // for wear modes
  model: string;
  owner: string | null;
}) {
  const parts: Part[] = [];
  let referenceNote: string;
  if (args.editInstruction) {
    referenceNote = `Image 1 is the approved product photo of this item. Image 2 is a phone photo of the real item for detail reference. Re-shoot Image 1 with ONE change only: ${args.editInstruction}. Everything else (colour, fabric, logos, proportions, lighting, framing) stays identical.`;
  } else {
    const vName = args.view.toUpperCase();
    referenceNote = args.secondary
      ? `Image 1 is a phone photo of the item's ${vName} — this is the side to show. Image 2 shows the other side, for detail reference only. The photos were taken on a bed/floor in mixed light; ignore the surroundings, creases and lighting.`
      : `Image 1 is a phone photo of the item (${vName}). It was taken on a bed/floor in mixed light; ignore the surroundings, creases and lighting.`;
  }
  parts.push({ text: productShotPrompt({ ...args, referenceNote }) });
  parts.push(imagePart(args.primary));
  if (args.secondary) parts.push(imagePart(args.secondary));

  const gen = await generateImage({
    model: args.model,
    parts,
    aspectRatio: aspectFor(args.kind, args.view),
    imageSize: '1K',
    owner: args.owner,
    fn: 'item.cutout',
  });
  const raw = decodeImage(gen.bytes);
  const { raster, coverage } = keyOut(resize(raw, 1400), args.key);
  const trimmed = trim(raster, 0.03);
  const full = resize(trimmed, 1024);
  const thumb = resize(trimmed, 420);
  return {
    full,
    png: toPng(full),
    thumbPng: toPng(thumb),
    aspect: full.width / full.height,
    coverage,
    ms: gen.ms,
    rawBytes: gen.bytes,
    rawMime: gen.mime,
  };
}

// ───────────────────────── route handlers ─────────────────────────

async function loadItem(id: string) {
  const { data, error } = await admin.from('items').select('*').eq('id', id).single();
  if (error || !data) throw new HttpError(404, 'Item not found');
  return data;
}

const procSet = (id: string, group: string, key: string, value: string, err?: string) =>
  admin.rpc('item_proc_set', { p_id: id, p_group: group, p_key: key, p_value: value, p_error: err ?? null });

async function stepAnalyse(item: Record<string, any>) {
  const photos = (item.photos ?? {}) as Photos;
  await admin.from('items').update({ status: 'processing' }).eq('id', item.id);
  await procSet(item.id, 'steps', 'analysis', 'running');
  try {
    const bytes: Partial<Record<keyof Photos, Uint8Array>> = {};
    await Promise.all(Object.entries(photos).map(async ([k, p]) => {
      if (p) bytes[k as keyof Photos] = await download(BUCKET_PRIVATE, p);
    }));
    const a = await analysePhotos(bytes, { subtype: item.subtype, brand: item.brand, notes: item.notes }, item.owner);
    const subtype = item.subtype || a.subtype;
    const st = SUBTYPE_MAP[subtype];
    const patch: Record<string, unknown> = {};
    const fill = (k: string, v: unknown) => {
      const cur = item[k];
      if (cur === null || cur === undefined || cur === '' || (Array.isArray(cur) && cur.length === 0)) patch[k] = v;
    };
    fill('name', a.name);
    fill('subtype', subtype);
    fill('category', st?.category ?? null);
    fill('slot', st?.slot ?? null);
    fill('brand', a.brand);
    fill('colour_name', a.colour_name);
    fill('colours', a.colours);
    fill('colour_family', a.colour_family);
    fill('pattern', a.pattern);
    fill('materials', a.materials);
    fill('fabric_weight', a.fabric_weight);
    fill('fit', a.fit);
    fill('size', a.size);
    fill('warmth', a.warmth);
    fill('formality', a.formality);
    fill('seasons', a.seasons);
    fill('tags', a.tags);
    fill('care', a.care);
    patch.description = a.description;
    patch.render_notes = a.render_notes;
    // hue/lightness for spectrum sorting
    const main = a.colours?.[0]?.hex;
    if (main) {
      const r = parseInt(main.slice(1, 3), 16) / 255, g = parseInt(main.slice(3, 5), 16) / 255, b = parseInt(main.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d > 0.04) {
        h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        patch.hue = Math.round(h);
      } else patch.hue = null;
      patch.lightness = Math.round(((max + min) / 2) * 100);
    }
    if (!Array.isArray(item.wear_modes) || item.wear_modes.length === 0) {
      const modes = (a.wear_modes ?? []).slice(0, 4);
      patch.wear_modes = modes.length
        ? modes.map((m, i) => ({
          key: i === 0 ? 'base' : `m${i}`,
          label: m.label,
          description: m.description,
          status: i === 0 ? 'base' : 'suggested',
        }))
        : [];
    }
    const key = chooseKey((a.colours ?? []).map((c) => c.hex));
    const views = viewsFor(subtype).filter((v) => {
      if (v === 'front') return !!(photos.front || photos.side);
      if (v === 'back') return !!photos.back;
      if (v === 'side') return !!(photos.side || photos.front);
      return false;
    });
    patch.processing = {
      ...(item.processing ?? {}),
      key,
      state: a.current_state,
      analysis: a,
      views: Object.fromEntries(views.map((v) => [v, 'queued'])),
      steps: { analysis: 'running' },
    };
    await admin.from('items').update(patch).eq('id', item.id);
    await procSet(item.id, 'steps', 'analysis', 'done');
    for (const v of views) await enqueue('item/process', { item_id: item.id, step: 'view', view: v });
  } catch (e) {
    console.error('analyse failed', e);
    // still try to produce images with a default key so the item is usable
    const views = viewsFor(item.subtype).filter((v) => (v === 'back' ? !!photos.back : true));
    await admin.from('items').update({
      processing: { ...(item.processing ?? {}), key: 'green', views: Object.fromEntries(views.map((v) => [v, 'queued'])), steps: { analysis: 'running' } },
    }).eq('id', item.id);
    await procSet(item.id, 'steps', 'analysis', 'failed', String(e).slice(0, 300));
    for (const v of views) await enqueue('item/process', { item_id: item.id, step: 'view', view: v });
  }
}

async function stepView(item: Record<string, any>, view: View, model?: string) {
  const photos = (item.photos ?? {}) as Photos;
  await procSet(item.id, 'views', view, 'running');
  try {
    const st = SUBTYPE_MAP[item.subtype ?? ''];
    const kind: ImagingKind = st?.kind ?? 'top';
    const primaryPath = view === 'back' ? photos.back : view === 'side' ? (photos.side ?? photos.front) : (photos.front ?? photos.side);
    if (!primaryPath) throw new Error(`No ${view} photo`);
    const secondaryPath = view === 'back' ? (photos.front ?? photos.side) : view === 'side' ? (photos.side ? photos.front : null) : (photos.back ?? (photos.side && photos.front ? photos.side : null));
    const [primary, secondary] = await Promise.all([
      download(BUCKET_PRIVATE, primaryPath),
      secondaryPath && secondaryPath !== primaryPath ? download(BUCKET_PRIVATE, secondaryPath) : Promise.resolve(null),
    ]);
    const key: KeyName = item.processing?.key ?? 'green';
    const out = await makeCutout({
      kind, view, key,
      name: item.name ?? st?.label ?? 'garment',
      colourName: item.colour_name,
      renderNotes: item.render_notes,
      state: view === 'back' ? null : item.processing?.state ?? null,
      primary, secondary,
      model: model ?? item.processing?.model ?? MODELS.productImage,
      owner: item.owner,
    });
    const base = `${item.owner}/${item.id}/${view}-${rid()}`;
    await Promise.all([
      upload(BUCKET_PUBLIC, `${base}.png`, out.png, 'image/png'),
      upload(BUCKET_PUBLIC, `${base}-t.png`, out.thumbPng, 'image/png'),
      upload(BUCKET_PUBLIC, `${base}-r.jpg`, toJpeg(resize(out.full, 800), 86, [255, 255, 255]), 'image/jpeg'),
    ]);
    const isCover = kind === 'shoe' ? view === 'side' : view === 'front';
    await admin.rpc('item_set_image', {
      p_id: item.id,
      p_view: view,
      p_value: { url: publicUrl(`${base}.png`), thumb: publicUrl(`${base}-t.png`), ref: publicUrl(`${base}-r.jpg`), aspect: Number(out.aspect.toFixed(4)), w: out.full.width, h: out.full.height, coverage: Number(out.coverage.toFixed(3)), model: model ?? MODELS.productImage },
      p_cover: isCover,
    });
    // the as-photographed wear mode uses the front image
    if (isCover) await admin.rpc('item_set_mode', { p_id: item.id, p_key: 'base', p_patch: { url: publicUrl(`${base}.png`), thumb: publicUrl(`${base}-t.png`), ref: publicUrl(`${base}-r.jpg`), aspect: Number(out.aspect.toFixed(4)) } });
    await procSet(item.id, 'views', view, 'done');
  } catch (e) {
    console.error('view failed', view, e);
    await procSet(item.id, 'views', view, 'failed', String(e).slice(0, 300));
  }
}

async function stepMode(item: Record<string, any>, modeKey: string, model?: string) {
  const mode = (item.wear_modes ?? []).find((m: { key: string }) => m.key === modeKey);
  if (!mode) throw new HttpError(404, 'Wear mode not found');
  await admin.rpc('item_set_mode', { p_id: item.id, p_key: modeKey, p_patch: { status: 'rendering' } });
  try {
    const st = SUBTYPE_MAP[item.subtype ?? ''];
    const kind: ImagingKind = st?.kind ?? 'top';
    const coverView: View = kind === 'shoe' ? 'side' : 'front';
    const img = item.images?.[coverView];
    if (!img?.url) throw new Error('Product photo not ready yet');
    const base = img.ref
      ? new Uint8Array(await (await fetch(img.ref)).arrayBuffer())
      : flatten(decodeImage(new Uint8Array(await (await fetch(img.url)).arrayBuffer())));
    const photoPath = item.photos?.front ?? item.photos?.side;
    const photo = photoPath ? await download(BUCKET_PRIVATE, photoPath) : null;
    const out = await makeCutout({
      kind, view: coverView, key: item.processing?.key ?? 'green',
      name: item.name ?? 'garment', colourName: item.colour_name, renderNotes: item.render_notes,
      state: mode.description,
      primary: base, secondary: photo,
      editInstruction: `show it ${mode.label.toLowerCase()} — ${mode.description}`,
      model: model ?? MODELS.productImage,
      owner: item.owner,
    });
    const path = `${item.owner}/${item.id}/mode-${modeKey}-${rid()}`;
    await Promise.all([
      upload(BUCKET_PUBLIC, `${path}.png`, out.png, 'image/png'),
      upload(BUCKET_PUBLIC, `${path}-t.png`, out.thumbPng, 'image/png'),
      upload(BUCKET_PUBLIC, `${path}-r.jpg`, toJpeg(resize(out.full, 800), 86, [255, 255, 255]), 'image/jpeg'),
    ]);
    await admin.rpc('item_set_mode', {
      p_id: item.id, p_key: modeKey,
      p_patch: { status: 'ready', url: publicUrl(`${path}.png`), thumb: publicUrl(`${path}-t.png`), ref: publicUrl(`${path}-r.jpg`), aspect: Number(out.aspect.toFixed(4)) },
    });
  } catch (e) {
    console.error('mode failed', e);
    await admin.rpc('item_set_mode', { p_id: item.id, p_key: modeKey, p_patch: { status: 'failed', error: String(e).slice(0, 200) } });
  }
}

async function stepEmbed(item: Record<string, any>) {
  const { embed } = await import('../lib/gemini.ts');
  const text = [item.name, item.brand, SUBTYPE_MAP[item.subtype ?? '']?.label, item.colour_name, item.pattern, (item.materials ?? []).join(' '), (item.tags ?? []).join(' '), item.description].filter(Boolean).join('. ');
  const [v] = await embed([text]);
  if (v) await admin.from('items').update({ embedding: v as unknown as string }).eq('id', item.id);
}

export async function itemProcess(req: Request, caller: Caller) {
  const body = await req.json();
  const { item_id, step = 'analyse', view, mode, model } = body as { item_id: string; step?: string; view?: View; mode?: string; model?: string };
  if (!item_id) throw new HttpError(400, 'item_id required');
  const item = await loadItem(item_id);
  if (item.owner !== caller.userId) throw new HttpError(403, 'Not yours');

  if (step === 'analyse') {
    background(stepAnalyse(item));
    return json({ ok: true, step });
  }
  if (step === 'view') {
    if (!view) throw new HttpError(400, 'view required');
    if (caller.internal) await stepView(item, view, model);
    else {
      // user-triggered regeneration: mark queued and fan out
      await admin.from('items').update({ status: 'processing' }).eq('id', item.id);
      await procSet(item.id, 'views', view, 'queued');
      await enqueue('item/process', { item_id, step: 'view', view, model });
    }
    return json({ ok: true, step, view });
  }
  if (step === 'mode') {
    if (!mode) throw new HttpError(400, 'mode required');
    if (caller.internal) await stepMode(item, mode, model);
    else {
      await admin.rpc('item_set_mode', { p_id: item.id, p_key: mode, p_patch: { status: 'queued' } });
      await enqueue('item/process', { item_id, step: 'mode', mode, model });
    }
    return json({ ok: true, step, mode });
  }
  if (step === 'embed') {
    background(stepEmbed(item));
    return json({ ok: true, step });
  }
  throw new HttpError(400, `Unknown step ${step}`);
}
