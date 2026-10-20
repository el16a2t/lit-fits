// Shared runtime: env, Supabase admin client, auth (single owner), HTTP helpers, storage, usage metering.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
export const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

export const MODELS = {
  stylist: 'claude-opus-5-5',
  fast: 'claude-sonnet-5-5',
  light: 'claude-haiku-5-5',
  productImage: 'gemini-nano-banana-2.1',
  productImageHQ: 'gemini-3-pro-image',
  renderImage: 'gemini-3-pro-image',
  embed: 'gemini-embedding-001',
};

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const BUCKET_PUBLIC = 'pieces';
export const BUCKET_PRIVATE = 'private';

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

export const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ───────────── auth ─────────────
let _secret: string | null = null;
let _owner: string | null = null;

export async function internalSecret(): Promise<string> {
  if (_secret) return _secret;
  const { data, error } = await admin.rpc('get_config', { k: 'internal_secret' });
  if (error || !data) throw new HttpError(500, 'Internal secret unavailable');
  _secret = data as string;
  return _secret;
}

export async function ownerId(): Promise<string | null> {
  if (_owner) return _owner;
  const { data } = await admin.from('app_owner').select('user_id').maybeSingle();
  _owner = (data?.user_id as string) ?? null;
  return _owner;
}

export interface Caller {
  userId: string;
  internal: boolean;
}

export async function authenticate(req: Request, opts: { allowNoOwner?: boolean } = {}): Promise<Caller> {
  const internal = req.headers.get('x-internal-secret');
  if (internal) {
    if (internal !== (await internalSecret())) throw new HttpError(403, 'Forbidden');
    const o = await ownerId();
    if (!o && !opts.allowNoOwner) throw new HttpError(409, 'No owner yet');
    return { userId: o ?? '', internal: true };
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired');
  const o = await ownerId();
  if (!o || data.user.id !== o) throw new HttpError(403, 'Not the owner of this wardrobe');
  return { userId: data.user.id, internal: false };
}

// ───────────── background work ─────────────
// deno-lint-ignore no-explicit-any
const runtime = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
export function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error('background task failed', e));
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
}

/** Fire-and-forget a fresh invocation of this function (new wall-clock budget) via pg_net. */
export async function enqueue(route: string, body: Record<string, unknown>) {
  const { error } = await admin.rpc('call_fn', { fn: `api/${route}`, body, timeout_ms: 300000 });
  if (error) throw new Error(`enqueue ${route}: ${error.message}`);
}

// ───────────── storage ─────────────
export async function download(bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function upload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  return path;
}

export const publicUrl = (path: string) => admin.storage.from(BUCKET_PUBLIC).getPublicUrl(path).data.publicUrl;

export async function signedUrl(path: string, seconds = 60 * 60 * 24 * 7) {
  const { data } = await admin.storage.from(BUCKET_PRIVATE).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

// ───────────── usage ─────────────
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.25, 1.25],
};
const IMAGE_PRICE: Record<string, number> = {
  'gemini-3-pro-image': 0.134,
  'gemini-nano-banana-2.1': 0.067,
  'gemini-3.1-flash-image': 0.067,
};

export async function meter(owner: string | null, fn: string, model: string, usage: { input?: number; output?: number; images?: number }) {
  const p = PRICES[model];
  const cost = (p ? ((usage.input ?? 0) * p[0] + (usage.output ?? 0) * p[1]) / 1e6 : 0) + (usage.images ?? 0) * (IMAGE_PRICE[model] ?? 0.1);
  await admin.from('usage').insert({
    owner, fn, model,
    input_tokens: usage.input ?? 0,
    output_tokens: usage.output ?? 0,
    images: usage.images ?? 0,
    est_cost_usd: Number(cost.toFixed(5)),
  });
}
