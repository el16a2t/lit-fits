// Lightweight remote breadcrumbs: lets the owner's real-device behaviour be inspected without a cable.
// Never throws, never blocks the UI, carries no secrets (no passwords, tokens or photos).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { DEMO, FUNCTIONS_URL, SUPABASE_ANON_KEY } from './supabase';

type Crumb = { t: number; e: string; d?: unknown };
const queue: Crumb[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const session = Math.random().toString(36).slice(2, 10);

// Crash-safe tail: the last crumbs are mirrored to disk, and anything a crash stopped from uploading is sent on the
// next launch. A native crash kills the process before the 1.5s batch goes out, so without this the most useful
// crumbs (the moments before the crash) are exactly the ones lost.
const TAIL_KEY = 'litfits.diag.tail';
let tail: Crumb[] = [];
let sentUpTo = 0;
let tailTimer: ReturnType<typeof setTimeout> | null = null;
let recovered = false; // don't overwrite the previous run's tail until it has been read
const persistTail = () => {
  tailTimer = null;
  if (!recovered) return;
  AsyncStorage.setItem(TAIL_KEY, JSON.stringify({ session, sentUpTo, tail })).catch(() => {});
};
const schedulePersist = () => { if (!tailTimer) tailTimer = setTimeout(persistTail, 250); };

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
    await send(device(), events, ac.signal);
    sentUpTo = Math.max(sentUpTo, ...events.map((e) => e.t));
    schedulePersist();
  } catch {
    /* diagnostics are best-effort */
  } finally {
    clearTimeout(t);
  }
}

function send(dev: unknown, events: Crumb[], signal?: AbortSignal) {
  return fetch(`${FUNCTIONS_URL}/client/log`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: dev, events }),
    signal,
  });
}

/** Upload immediately (used just before a fatal error hands over to the default crash handler). */
export async function flushNow(maxMs = 1500) {
  if (timer) { clearTimeout(timer); timer = null; }
  persistTail();
  await Promise.race([flush(), new Promise((r) => setTimeout(r, maxMs))]);
}

/** On launch: send whatever the previous run recorded but never uploaded (i.e. its last moments before a crash). */
export async function recoverPreviousRun() {
  if (DEMO) { recovered = true; return; }
  try {
    const raw = await AsyncStorage.getItem(TAIL_KEY);
    if (!raw) return;
    const prev = JSON.parse(raw) as { session: string; sentUpTo: number; tail: Crumb[] };
    if (!prev || prev.session === session) return;
    const lost = (prev.tail ?? []).filter((c) => c.t > (prev.sentUpTo ?? 0));
    if (lost.length) send({ ...device(), session: prev.session, recovered: true }, lost).catch(() => {});
  } catch {
    /* best-effort */
  } finally {
    recovered = true;
    schedulePersist();
  }
}

/** Record a breadcrumb; batched and sent within ~1.5s. */
export function trace(e: string, d?: unknown) {
  try {
    const crumb = { t: Date.now(), e, d: d === undefined ? undefined : JSON.parse(JSON.stringify(d)) };
    queue.push(crumb);
    if (queue.length > 200) queue.splice(0, queue.length - 200);
    tail.push(crumb);
    if (tail.length > 60) tail = tail.slice(-60);
    schedulePersist();
    if (!timer) timer = setTimeout(() => { flush(); }, 1500);
  } catch {
    /* ignore */
  }
}

export const errorInfo = (e: unknown) => {
  const err = e as { name?: string; message?: string; status?: number };
  return { name: err?.name ?? typeof e, message: String(err?.message ?? e).slice(0, 300), status: err?.status };
};
