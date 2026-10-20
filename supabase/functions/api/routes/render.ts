// "See it on me": digital-twin renders of looks, and building the twin itself.
import { admin, background, BUCKET_PRIVATE, Caller, download, enqueue, HttpError, json, MODELS, rid, signedUrl, upload } from '../lib/core.ts';
import { claude, jsonFrom } from '../lib/anthropic.ts';
import { generateImage, imagePart, type Part } from '../lib/gemini.ts';
import { decodeImage, imageSize, resize, sniffMime, toJpeg, toBase64 } from '../lib/image.ts';
import { renderPrompt, SCENES } from '../lib/prompts.ts';
import { SUBTYPE_MAP, SLOT_ORDER } from '../lib/taxonomy.ts';

interface Twin {
  face_front?: string; face_left?: string; face_right?: string; full_body?: string; extra?: string[];
  base?: string; base_status?: string;
}

async function fetchBytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Garment reference on white: uses the pre-flattened JPEG when available, else flattens the cut-out. */
async function garmentRef(url: string, refUrl?: string | null) {
  if (refUrl) return await fetchBytes(refUrl);
  const r = decodeImage(await fetchBytes(url));
  return toJpeg(resize(r, 900), 88, [255, 255, 255]);
}

async function photoRef(path: string, max = 1024) {
  const bytes = await download(BUCKET_PRIVATE, path);
  const size = imageSize(bytes);
  if (size && Math.max(size.width, size.height) <= max * 1.5 && sniffMime(bytes) === 'image/jpeg') return bytes;
  try { return toJpeg(resize(decodeImage(bytes), max), 88); } catch { return bytes; }
}

export async function identityParts(twin: Twin, opts: { includeBase: boolean }) {
  const parts: Part[] = [];
  const notes: string[] = [];
  let n = 0;
  const add = async (path: string | undefined, label: string, max = 1024) => {
    if (!path) return;
    parts.push(imagePart(await photoRef(path, max)));
    notes.push(`Image ${++n}: ${label}`);
  };
  if (opts.includeBase) await add(twin.base, 'identity — full-length reference of him (body proportions, face, hair)', 1024);
  await add(twin.face_front, 'identity — his face, front');
  await add(twin.face_left, 'identity — his face, three-quarter');
  await add(twin.face_right, 'identity — his face, other three-quarter', 900);
  if (!opts.includeBase) await add(twin.full_body, 'identity — his full body, for proportions only (ignore these clothes)', 1024);
  return { parts, notes, count: n };
}

async function runRender(renderId: string) {
  const { data: r } = await admin.from('renders').select('*').eq('id', renderId).single();
  if (!r) return;
  const t0 = Date.now();
  await admin.from('renders').update({ status: 'running' }).eq('id', renderId);
  try {
    const { data: profile } = await admin.from('profiles').select('*').eq('id', r.owner).single();
    const twin = (profile?.twin ?? {}) as Twin;
    if (!twin.face_front && !twin.base) throw new Error('Add your face photos in Settings → Digital twin first.');
    const id = await identityParts(twin, { includeBase: !!twin.base });
    const refs = r.items as { item_id: string; mode?: string; note?: string }[];
    const { data: items } = await admin.from('items').select('id,name,subtype,slot,colour_name,brand,images,wear_modes,cover_url,render_notes').in('id', refs.map((x) => x.item_id));
    const ordered = (items ?? []).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const garments: { label: string; how?: string }[] = [];
    const gParts: Part[] = [];
    let n = id.count;
    for (const it of ordered) {
      const ref = refs.find((x) => x.item_id === it.id);
      const mode = ref?.mode ? (it.wear_modes ?? []).find((m: any) => m.label?.toLowerCase() === ref.mode!.toLowerCase()) : null;
      const coverView = it.images?.side && SUBTYPE_MAP[it.subtype]?.kind === 'shoe' ? 'side' : 'front';
      const url = mode?.url ?? it.cover_url ?? it.images?.front?.url ?? it.images?.side?.url;
      if (!url) continue;
      gParts.push(imagePart(await garmentRef(url, mode?.url ? mode?.ref : it.images?.[coverView]?.ref)));
      n++;
      const label = `${it.colour_name ? it.colour_name + ' ' : ''}${it.name ?? SUBTYPE_MAP[it.subtype]?.label ?? 'garment'}${it.brand ? ` (${it.brand})` : ''}`;
      const how = [mode ? `worn ${mode.label.toLowerCase()}` : null, ref?.note, it.render_notes ? `details: ${String(it.render_notes).slice(0, 280)}` : null].filter(Boolean).join('; ');
      garments.push({ label: `Image ${n} — ${label}`, how });
    }
    if (!garments.length) throw new Error('No garment images available for this look yet.');
    const settings = profile?.render_settings ?? {};
    const sceneKey = r.scene || settings.scene || 'studio';
    const scene = SCENES[sceneKey] ?? sceneKey;
    const prompt = renderPrompt({
      heightCm: profile?.height_cm, weightKg: profile?.weight_kg,
      build: [profile?.build_notes, profile?.fit_preference].filter(Boolean).join('; '),
      appearance: profile?.appearance_notes,
      garments, scene,
      extra: [settings.extra_prompt, r.extra_prompt].filter(Boolean).join(' '),
      styling: null,
      refsNote: `Reference images in order — ${id.notes.join('; ')}; then the garments listed below.`,
    });
    const model = r.model || settings.model || MODELS.renderImage;
    const gen = await generateImage({
      model,
      parts: [{ text: prompt }, ...id.parts, ...gParts],
      aspectRatio: '2:3',
      imageSize: model.includes('pro') ? '2K' : '1K',
      owner: r.owner, fn: 'render',
    });
    const ext = sniffMime(gen.bytes) === 'image/png' ? 'png' : 'jpg';
    const path = `${r.owner}/renders/${renderId}-${rid()}.${ext}`;
    await upload(BUCKET_PRIVATE, path, gen.bytes, ext === 'png' ? 'image/png' : 'image/jpeg');
    const dims = imageSize(gen.bytes);
    const w = dims?.width ?? null, h = dims?.height ?? null;
    await admin.from('renders').update({ status: 'done', image_path: path, width: w, height: h, model, duration_ms: Date.now() - t0 }).eq('id', renderId);
    if (r.look_id) {
      const { data: look } = await admin.from('looks').select('cover_render_id').eq('id', r.look_id).single();
      if (look && !look.cover_render_id) await admin.from('looks').update({ cover_render_id: renderId }).eq('id', r.look_id);
    }
  } catch (e) {
    console.error('render failed', e);
    await admin.from('renders').update({ status: 'failed', error: String((e as Error).message ?? e).slice(0, 400), duration_ms: Date.now() - t0 }).eq('id', renderId);
  }
}

export async function render(req: Request, caller: Caller) {
  const body = await req.json();
  if (caller.internal && body.render_id) {
    await runRender(body.render_id);
    return json({ ok: true });
  }
  const items = (body.items ?? []) as { item_id: string; mode?: string; note?: string }[];
  if (!items.length) throw new HttpError(400, 'items required');
  const { data, error } = await admin.from('renders').insert({
    owner: caller.userId, look_id: body.look_id ?? null, items, scene: body.scene ?? null, extra_prompt: body.extra ?? null, model: body.model ?? null, status: 'queued',
  }).select('*').single();
  if (error) throw new HttpError(500, error.message);
  await enqueue('render', { render_id: data.id });
  return json(data);
}

export async function renderUrl(req: Request, caller: Caller) {
  const { paths } = await req.json();
  const out: Record<string, string | null> = {};
  for (const p of (paths ?? []) as string[]) {
    if (!p.startsWith(caller.userId + '/')) continue;
    out[p] = await signedUrl(p, 60 * 60 * 24 * 30);
  }
  return json(out);
}

// ───────────── Digital twin ─────────────
export async function buildTwin(req: Request, caller: Caller) {
  const owner = caller.userId;
  const { data: profile } = await admin.from('profiles').select('*').eq('id', owner).single();
  const twin = (profile?.twin ?? {}) as Twin;
  if (!twin.face_front) throw new HttpError(400, 'Add a front face photo first');
  await admin.from('profiles').update({ twin: { ...twin, base_status: 'running' } }).eq('id', owner);
  background((async () => {
    try {
      // 1. appearance notes (Claude reads the photos)
      const imgs: any[] = [];
      for (const k of ['face_front', 'face_left', 'full_body'] as const) {
        if (!twin[k]) continue;
        imgs.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(await photoRef(twin[k]!, 900)) } });
      }
      const res = await claude({
        model: MODELS.fast, max_tokens: 800, thinking: { type: 'disabled' },
        output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['appearance', 'build'], properties: { appearance: { type: 'string' }, build: { type: 'string' } } } } },
        messages: [{ role: 'user', content: [...imgs, { type: 'text', text: 'Describe this man\'s visible appearance for an image model to reproduce him faithfully: hair (length, colour, texture, parting), facial hair, eye colour, skin tone and features like freckles, approximate age range. Then his build/proportions as seen (shoulders, frame, leg length). Neutral, factual, no judgement.' }] }],
      }, { owner, fn: 'twin.describe' });
      const desc = jsonFrom<{ appearance: string; build: string }>(res);
      // 2. base twin portrait
      const id = await identityParts(twin, { includeBase: false });
      const prompt = [
        'Create a photorealistic full-length studio photograph of the man shown in the reference images, as a clean identity reference for virtual try-on.',
        `Reference images: ${id.notes.join('; ')}.`,
        'Keep his face, hair, beard, skin, freckles and eye colour exactly — he must be unmistakably the same person. Do not beautify.',
        `Body: ${[profile?.height_cm ? `${profile.height_cm} cm tall` : null, profile?.weight_kg ? `${profile.weight_kg} kg` : null, profile?.build_notes, desc.build].filter(Boolean).join(', ')}.`,
        'He wears a plain fitted white crew-neck T-shirt, mid-grey straight-leg trousers and plain white low-top trainers. Standing straight, relaxed, arms by his sides, facing the camera, neutral expression.',
        'Plain light-grey seamless studio background, soft even lighting, full body head to toe in frame with margin, 50mm lens, no text.',
      ].join('\n');
      const gen = await generateImage({ model: MODELS.renderImage, parts: [{ text: prompt }, ...id.parts], aspectRatio: '2:3', imageSize: '2K', owner, fn: 'twin.base' });
      const path = `${owner}/twin/base-${rid()}.${sniffMime(gen.bytes) === 'image/png' ? 'png' : 'jpg'}`;
      await upload(BUCKET_PRIVATE, path, gen.bytes, sniffMime(gen.bytes) === 'image/png' ? 'image/png' : 'image/jpeg');
      const { data: latest } = await admin.from('profiles').select('twin').eq('id', owner).single();
      await admin.from('profiles').update({
        twin: { ...(latest?.twin ?? {}), base: path, base_status: 'done' },
        appearance_notes: desc.appearance,
        build_notes: profile?.build_notes || desc.build,
      }).eq('id', owner);
    } catch (e) {
      console.error('twin failed', e);
      const { data: latest } = await admin.from('profiles').select('twin').eq('id', owner).single();
      await admin.from('profiles').update({ twin: { ...(latest?.twin ?? {}), base_status: 'failed', base_error: String(e).slice(0, 200) } }).eq('id', owner);
    }
  })());
  return json({ ok: true });
}

export { enqueue };
