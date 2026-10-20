// Internal-only lab: pre-launch image bake-off and seeding the owner's first pieces.
// Inputs/outputs travel as AES-GCM encrypted bundles (key held in Vault), so nothing personal is ever public.
import { admin, BUCKET_PRIVATE, BUCKET_PUBLIC, Caller, download, HttpError, json, MODELS, publicUrl, rid, upload } from '../lib/core.ts';
import { analysePhotos, makeCutout } from './items.ts';
import { chooseKey, contactSheet, decodeImage, fromBase64, resize, toBase64, toJpeg, type KeyName } from '../lib/image.ts';
import { viewsFor, type View, renderPrompt, SCENES } from '../lib/prompts.ts';
import { SUBTYPE_MAP } from '../lib/taxonomy.ts';
import { generateImage, imagePart, type Part } from '../lib/gemini.ts';

async function labKey(): Promise<CryptoKey> {
  const { data } = await admin.rpc('get_config', { k: 'lab_key' });
  if (!data) throw new HttpError(500, 'lab key missing');
  return crypto.subtle.importKey('raw', fromBase64(data as string) as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function decryptBundle(bytes: Uint8Array) {
  const key = await labKey();
  const iv = bytes.slice(0, 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(12)));
  return JSON.parse(new TextDecoder().decode(plain)) as { files: { name: string; b64: string }[] };
}

async function encryptBundle(obj: unknown) {
  const key = await labKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

async function logRun(kind: string, input: unknown, fn: () => Promise<unknown>) {
  const { data: row } = await admin.from('lab_runs').insert({ kind, input, status: 'running' }).select('id').single();
  const t0 = Date.now();
  try {
    const output = await fn();
    await admin.from('lab_runs').update({ status: 'done', output, ms: Date.now() - t0 }).eq('id', row!.id);
    return { id: row!.id, output };
  } catch (e) {
    await admin.from('lab_runs').update({ status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 800), ms: Date.now() - t0 }).eq('id', row!.id);
    return { id: row!.id, error: String(e) };
  }
}

async function storeCutout(prefix: string, out: Awaited<ReturnType<typeof makeCutout>>) {
  const base = `lab/${prefix}-${rid()}`;
  await Promise.all([
    upload(BUCKET_PUBLIC, `${base}.png`, out.png, 'image/png'),
    upload(BUCKET_PUBLIC, `${base}-t.png`, out.thumbPng, 'image/png'),
    upload(BUCKET_PUBLIC, `${base}-r.jpg`, toJpeg(resize(out.full, 800), 86, [255, 255, 255]), 'image/jpeg'),
  ]);
  return { png: `${base}.png`, thumb: `${base}-t.png`, ref: `${base}-r.jpg`, aspect: Number(out.aspect.toFixed(4)), w: out.full.width, h: out.full.height, coverage: Number(out.coverage.toFixed(3)), gen_ms: out.ms };
}

export async function lab(req: Request, caller: Caller, route: string) {
  if (!caller.internal) throw new HttpError(403, 'Internal only');
  const body = await req.json().catch(() => ({}));

  if (route === 'lab/ingest') {
    const res = await fetch(body.url);
    if (!res.ok) throw new HttpError(400, `fetch ${res.status}`);
    const bundle = await decryptBundle(new Uint8Array(await res.arrayBuffer()));
    const names: string[] = [];
    for (const f of bundle.files) {
      await upload(BUCKET_PRIVATE, `lab/in/${f.name}`, fromBase64(f.b64), f.name.endsWith('.png') ? 'image/png' : 'image/jpeg');
      names.push(`lab/in/${f.name}`);
    }
    return json({ ok: true, names });
  }

  if (route === 'lab/cutout') {
    // {photo, secondary?, subtype, view, model, key?, name?, render_notes?, colour?}
    return json(await logRun('cutout', body, async () => {
      const st = SUBTYPE_MAP[body.subtype] ?? SUBTYPE_MAP.tee_plain;
      const primary = await download(BUCKET_PRIVATE, body.photo);
      const secondary = body.secondary ? await download(BUCKET_PRIVATE, body.secondary) : null;
      const out = await makeCutout({
        kind: st.kind, view: body.view ?? 'front', key: (body.key ?? 'green') as KeyName, name: body.name ?? st.label,
        colourName: body.colour, renderNotes: body.render_notes, state: body.state, primary, secondary,
        model: body.model ?? MODELS.productImage, owner: null,
      });
      return { model: body.model, ...(await storeCutout(`cut-${(body.model ?? 'x').replace(/[^a-z0-9.]/gi, '')}`, out)) };
    }));
  }

  if (route === 'lab/seed-item') {
    // Full pipeline on raw photos → staged item ready for adoption at sign-up.
    // {photos: {front, back?, side?, label?}, model?, hint?}
    return json(await logRun('seed_item', body, async () => {
      const photos = body.photos as Record<string, string>;
      const bytes: Record<string, Uint8Array> = {};
      for (const [k, p] of Object.entries(photos)) bytes[k] = await download(BUCKET_PRIVATE, p);
      const a = await analysePhotos(bytes, body.hint ?? {}, null);
      const st = SUBTYPE_MAP[a.subtype];
      const key = chooseKey(a.colours.map((c) => c.hex));
      const views = viewsFor(a.subtype).filter((v) => (v === 'back' ? !!photos.back : true));
      const images: Record<string, unknown> = {};
      await Promise.all(views.map(async (v: View) => {
        const primary = v === 'back' ? bytes.back : (v === 'side' ? (bytes.side ?? bytes.front) : (bytes.front ?? bytes.side));
        const secondary = v === 'back' ? bytes.front : (bytes.back ?? null);
        const out = await makeCutout({
          kind: st.kind, view: v, key, name: a.name, colourName: a.colour_name, renderNotes: a.render_notes,
          state: v === 'back' ? null : a.current_state, primary, secondary, model: body.model ?? MODELS.productImage, owner: null,
        });
        images[v] = { ...(await storeCutout(`seed-${v}`, out)), model: body.model ?? MODELS.productImage };
      }));
      const cover_view = st.kind === 'shoe' ? 'side' : 'front';
      const main = a.colours?.[0]?.hex;
      let hue: number | null = null, lightness: number | null = null;
      if (main) {
        const r = parseInt(main.slice(1, 3), 16) / 255, g = parseInt(main.slice(3, 5), 16) / 255, b = parseInt(main.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        if (d > 0.04) { let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = Math.round((h * 60 + 360) % 360); }
        lightness = Math.round(((max + min) / 2) * 100);
      }
      return {
        analysis: a,
        cover_view,
        photos,
        images,
        item: {
          name: a.name, subtype: a.subtype, category: st.category, slot: st.slot, brand: a.brand, colour_name: a.colour_name, colours: a.colours,
          colour_family: a.colour_family, pattern: a.pattern, materials: a.materials, fabric_weight: a.fabric_weight, fit: a.fit, size: a.size,
          warmth: a.warmth, formality: a.formality, seasons: a.seasons, tags: a.tags, description: a.description, render_notes: a.render_notes, care: a.care,
          hue, lightness,
          wear_modes: (a.wear_modes ?? []).slice(0, 4).map((m, i) => ({ key: i === 0 ? 'base' : `m${i}`, label: m.label, description: m.description, status: i === 0 ? 'base' : 'suggested' })),
          processing: { key, state: a.current_state, steps: { analysis: 'done' }, views: Object.fromEntries(views.map((v) => [v, 'done'])) },
        },
      };
    }));
  }

  if (route === 'lab/seed-twin') {
    return json(await logRun('seed_twin', body, async () => ({ twin: body.twin })));
  }

  if (route === 'lab/render') {
    // {model, scene, twin:{face_front,face_left,face_right,full_body}, garments:[{ref (public path), label, how}], height_cm, weight_kg, build}
    return json(await logRun('render', body, async () => {
      const parts: Part[] = [];
      const notes: string[] = [];
      let n = 0;
      for (const [k, label] of [['face_front', 'his face, front'], ['face_left', 'his face, three-quarter'], ['face_right', 'his face, other three-quarter'], ['full_body', 'his full body, for proportions only (ignore these clothes)']] as const) {
        const p = body.twin?.[k];
        if (!p) continue;
        parts.push(imagePart(await download(BUCKET_PRIVATE, p)));
        notes.push(`Image ${++n}: identity — ${label}`);
      }
      const garments: { label: string; how?: string }[] = [];
      for (const g of body.garments ?? []) {
        const bytes = new Uint8Array(await (await fetch(publicUrl(g.ref))).arrayBuffer());
        parts.push(imagePart(bytes));
        n++;
        garments.push({ label: `Image ${n} — ${g.label}`, how: g.how });
      }
      const prompt = renderPrompt({
        heightCm: body.height_cm, weightKg: body.weight_kg, build: body.build, appearance: body.appearance,
        garments, scene: SCENES[body.scene ?? 'studio'] ?? body.scene, extra: body.extra, styling: body.styling,
        refsNote: `Reference images in order — ${notes.join('; ')}; then the garments listed below.`,
      });
      const model = body.model ?? MODELS.renderImage;
      const gen = await generateImage({ model, parts: [{ text: prompt }, ...parts], aspectRatio: '2:3', imageSize: model.includes('pro') ? '2K' : '1K', owner: null, fn: 'lab.render' });
      const path = `lab/out/render-${rid()}.${gen.mime.includes('png') ? 'png' : 'jpg'}`;
      await upload(BUCKET_PRIVATE, path, gen.bytes, gen.mime);
      return { path, model, gen_ms: gen.ms, prompt };
    }));
  }

  if (route === 'lab/export') {
    // {ids:[lab_run ids], cell?: number} → encrypted bundle of previews (for review off-platform)
    const { data: runs } = await admin.from('lab_runs').select('*').in('id', body.ids ?? []);
    const files: { name: string; b64: string }[] = [];
    for (const r of runs ?? []) {
      const o = r.output as any;
      if (!o) continue;
      const add = async (bucket: string, path: string, name: string, max = 1100) => {
        try {
          const bytes = await download(bucket, path);
          const jpg = toJpeg(resize(decodeImage(bytes), max), 84, [255, 255, 255]);
          files.push({ name, b64: toBase64(jpg) });
        } catch (e) { console.error('export', path, e); }
      };
      if (r.kind === 'cutout') await add(BUCKET_PUBLIC, o.png, `${r.id}-cutout.jpg`, 700);
      if (r.kind === 'seed_item') for (const [v, img] of Object.entries(o.images ?? {}) as [string, any][]) await add(BUCKET_PUBLIC, img.png, `${r.id}-${v}.jpg`, 700);
      if (r.kind === 'render') await add(BUCKET_PRIVATE, o.path, `${r.id}-render.jpg`, 1100);
      files.push({ name: `${r.id}.json`, b64: toBase64(new TextEncoder().encode(JSON.stringify({ kind: r.kind, input: r.input, output: o, ms: r.ms, error: r.error }))) });
    }
    const enc = await encryptBundle({ files });
    return new Response(enc, { headers: { 'content-type': 'application/octet-stream' } });
  }

  if (route === 'lab/sheet') {
    // tiny inline preview (base64 JPEG) of public cut-outs, for quick checks via SQL
    const tiles = [];
    for (const p of (body.paths ?? []) as string[]) {
      try { tiles.push(decodeImage(await download(body.bucket ?? BUCKET_PUBLIC, p))); } catch { /* skip */ }
    }
    const sheet = contactSheet(tiles, body.cols ?? 4, body.cell ?? 220, 6);
    return json({ b64: toBase64(toJpeg(sheet, body.q ?? 70)) });
  }

  throw new HttpError(404, `Unknown lab route ${route}`);
}
