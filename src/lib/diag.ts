// Lightweight remote breadcrumbs: lets the owner's real-device behaviour be inspected without a cable.
// Never throws, never blocks the UI, carries no secrets (no passwords, tokens or photos).
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { DEMO, FUNCTIONS_URL, SUPABASE_ANON_KEY } from './supabase';

type Crumb = { t: number; e: string; d?: unknown };
const queue: Crumb[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const session = Math.random().toString(36).slice(2, 10);

function device() {
  return {
    session,
    platform: Platform.OS,
    os: String(Platform.Version),
    app: Constants.expoConfig?.version ?? null,
    update: Updates.updateId ?? 'embedded',
    channel: Updates.channel ?? null,
    runtime: Updates.runtimeVersion ?? null,
  };
}

async function flush() {
  timer = null;
  if (!queue.length || DEMO) return;
  const events = queue.splice(0, 40);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(`${FUNCTIONS_URL}/client/log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: device(), events }),
      signal: ac.signal,
    });
  } catch {
    /* diagnostics are best-effort */
  } finally {
    clearTimeout(t);
  }
}

/** Record a breadcrumb; batched and sent within ~1.5s. */
export function trace(e: string, d?: unknown) {
  try {
    queue.push({ t: Date.now(), e, d: d === undefined ? undefined : JSON.parse(JSON.stringify(d)) });
    if (queue.length > 200) queue.splice(0, queue.length - 200);
    if (!timer) timer = setTimeout(() => { flush(); }, 1500);
  } catch {
    /* ignore */
  }
}

export const errorInfo = (e: unknown) => {
  const err = e as { name?: string; message?: string; status?: number };
  return { name: err?.name ?? typeof e, message: String(err?.message ?? e).slice(0, 300), status: err?.status };
};
