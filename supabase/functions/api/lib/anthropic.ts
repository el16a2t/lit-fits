// Minimal Claude Messages API client (fetch-based) with streaming + usage metering.
import { ANTHROPIC_KEY, meter } from './core.ts';

const API = 'https://api.anthropic.com/v1/messages';

export type Block =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface Msg {
  role: 'user' | 'assistant';
  content: string | Block[];
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string | Block[];
  messages: Msg[];
  tools?: unknown[];
  tool_choice?: unknown;
  thinking?: { type: 'adaptive' | 'disabled' };
  output_config?: { effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; format?: unknown };
}

// deno-lint-ignore no-explicit-any
export type ClaudeResponse = { content: any[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };

function headers() {
  return {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
}

export async function claude(req: ClaudeRequest, meta: { owner: string | null; fn: string }): Promise<ClaudeResponse> {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify(req) });
    if (res.ok) {
      const data = (await res.json()) as ClaudeResponse;
      await meter(meta.owner, meta.fn, req.model, {
        input: (data.usage.input_tokens ?? 0) + (data.usage.cache_creation_input_tokens ?? 0) + (data.usage.cache_read_input_tokens ?? 0) * 0.1,
        output: data.usage.output_tokens,
      }).catch(() => {});
      return data;
    }
    lastErr = `${res.status} ${await res.text()}`;
    if (![429, 500, 502, 503, 504, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`Claude error: ${lastErr.slice(0, 800)}`);
}

/** Returns the parsed JSON of the final text block (for output_config.format json_schema requests). */
export function jsonFrom<T>(res: ClaudeResponse): T {
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error('Model did not return JSON');
  }
}

export interface StreamEvent {
  type: string;
  // deno-lint-ignore no-explicit-any
  [k: string]: any;
}

/** Streams raw SSE events from the Messages API. */
export async function* claudeStream(req: ClaudeRequest, meta: { owner: string | null; fn: string }): AsyncGenerator<StreamEvent> {
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ ...req, stream: true }) });
  if (!res.ok || !res.body) throw new Error(`Claude stream error: ${res.status} ${(await res.text()).slice(0, 500)}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let inTok = 0, outTok = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        const ev = JSON.parse(payload) as StreamEvent;
        if (ev.type === 'message_start') inTok = (ev.message?.usage?.input_tokens ?? 0) + (ev.message?.usage?.cache_creation_input_tokens ?? 0);
        if (ev.type === 'message_delta') outTok = ev.usage?.output_tokens ?? outTok;
        yield ev;
      }
    }
  } finally {
    meter(meta.owner, meta.fn, req.model, { input: inTok, output: outTok }).catch(() => {});
  }
}
