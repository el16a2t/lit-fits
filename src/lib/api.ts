// Calls into the Lit Fits edge API, including the streaming stylist (SSE over fetch).
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { DEMO, FUNCTIONS_URL, SUPABASE_ANON_KEY, supabase } from './supabase';
import type { Look, Pairings, Render, StylistLook, Trip } from './types';
import { demoApi } from '@/demo/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  return { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

export async function call<T>(route: string, body: unknown = {}): Promise<T> {
  if (DEMO) return demoApi(route, body) as Promise<T>;
  const res = await fetch(`${FUNCTIONS_URL}/${route}`, { method: 'POST', headers: await authHeader(), body: JSON.stringify(body) });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  bootstrap: (email: string, password: string, name: string) =>
    call<{ ok: boolean; adopted?: { items: number; twin: boolean } }>('bootstrap', { email, password, name }),
  processItem: (item_id: string, step: 'analyse' | 'view' | 'mode' | 'embed' = 'analyse', extra: Record<string, unknown> = {}) =>
    call<{ ok: boolean }>('item/process', { item_id, step, ...extra }),
  pairings: (item_id: string, refresh = false) => call<Pairings>('item/pairings', { item_id, refresh }),
  complete: (item_ids: string[], prompt?: string, weather?: string | null) => call<{ looks: StylistLook[] }>('look/complete', { item_ids, prompt, weather }),
  nameLook: (item_ids: string[]) => call<{ title: string; occasion: string }>('look/name', { item_ids }),
  pack: (p: { destination: string; start_on?: string; end_on?: string; brief?: string; trip_id?: string }) => call<Trip>('trip/pack', p),
  render: (p: { items: { item_id: string; mode?: string; note?: string }[]; look_id?: string | null; scene?: string; extra?: string; model?: string }) => call<Render>('render', p),
  signedUrls: (paths: string[]) => call<Record<string, string | null>>('render/urls', { paths }),
  buildTwin: () => call<{ ok: boolean }>('twin/build', {}),
  trends: () => call<{ ok: boolean }>('style/trends', {}),
  dna: () => call<{ ok: boolean }>('style/dna', {}),
  wishlistConcept: (id: string) => call<{ ok: boolean }>('wishlist/concept', { id }),
  reshootMissing: () => call<{ ok: boolean; queued: number }>('items/reshoot-missing', {}),
};

export interface StylistHandlers {
  onMeta?: (d: { thread_id: string }) => void;
  onStatus?: (label: string) => void;
  onText?: (delta: string) => void;
  onTextEnd?: () => void;
  onLook?: (look: StylistLook, index: number) => void;
  onDone?: (d: { message_id?: string; thread_id: string }) => void;
  onError?: (message: string) => void;
}

/** Streams the stylist's response. Returns an abort function. */
export function streamStylist(
  body: { prompt: string; thread_id?: string; context?: Record<string, unknown> },
  h: StylistHandlers,
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      if (DEMO) {
        const { demoStylist } = await import('@/demo/api');
        await demoStylist(body, h);
        return;
      }
      const f = Platform.OS === 'web' ? fetch : (expoFetch as unknown as typeof fetch);
      const res = await f(`${FUNCTIONS_URL}/stylist`, {
        method: 'POST',
        headers: { ...(await authHeader()), Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `Stylist unavailable (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message';
          let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          const payload = JSON.parse(data);
          switch (event) {
            case 'meta': h.onMeta?.(payload); break;
            case 'status': h.onStatus?.(payload.label); break;
            case 'text': h.onText?.(payload.delta); break;
            case 'text_end': h.onTextEnd?.(); break;
            case 'look': h.onLook?.(payload.look, payload.index); break;
            case 'done': h.onDone?.(payload); break;
            case 'error': h.onError?.(payload.message); break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      h.onError?.(e?.message ?? 'Connection lost');
    }
  })();
  return () => controller.abort();
}

export type { Look };
