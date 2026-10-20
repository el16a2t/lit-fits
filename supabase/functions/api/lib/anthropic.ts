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
  thinking?: { type: 'adaptive' | 'disabled' | 'between_tools' };
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

/**
 * One Messages API call, always streamed under the hood: long requests (web research, big plans) can sit
 * silent for minutes when non-streaming and get their connection reset. Returns the assembled message.
 */
export async function claude(req: ClaudeRequest, meta: { owner: string | null; fn: string }): Promise<ClaudeResponse> {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await streamToMessage(req);
      await meter(meta.owner, meta.fn, req.model, {
        input: (msg.usage.input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) * 0.1,
        output: msg.usage.output_tokens,
      }).catch(() => {});
      return msg;
    } catch (e) {
      const err = e as Error & { status?: number; retryable?: boolean };
      lastErr = err.message;
      if (!err.retryable) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`Claude error: ${lastErr.slice(0, 800)}`);
}

class ClaudeHttpError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) { super(message); }
}

/**
 * "No up-front thinking" is spelled differently per model: Sonnet 5.5 takes `between_tools`, Haiku 5.5 takes
 * `disabled`, and Opus 5.5 always thinks (the field must be left off). Call sites just say `disabled`.
 */
export function normaliseThinking(req: ClaudeRequest): ClaudeRequest {
  if (req.thinking?.type !== 'disabled') return req;
  const m = req.model;
  if (m.startsWith('claude-sonnet-5-5')) return { ...req, thinking: { type: 'between_tools' } };
  if (m.startsWith('claude-opus-5-5') || m.startsWith('claude-fable') || m.startsWith('claude-mythos')) {
    const { thinking: _drop, ...rest } = req;
    return rest;
  }
  return req;
}

async function streamToMessage(req: ClaudeRequest): Promise<ClaudeResponse> {
  let res: Response;
  try {
    res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ ...normaliseThinking(req), stream: true }) });
  } catch (e) {
    throw new ClaudeHttpError(`network: ${(e as Error).message}`, 0, true);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ClaudeHttpError(`${res.status} ${text}`, res.status, [429, 500, 502, 503, 504, 529].includes(res.status));
  }
  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [];
  const json: Record<number, string> = {};
  const usage: ClaudeResponse['usage'] = { input_tokens: 0, output_tokens: 0 };
  let stop = 'end_turn';
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
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
        switch (ev.type) {
          case 'message_start':
            Object.assign(usage, ev.message?.usage ?? {});
            break;
          case 'content_block_start': {
            const cb = { ...ev.content_block };
            if (cb.type === 'text') cb.text = cb.text ?? '';
            if (cb.type === 'thinking') { cb.thinking = cb.thinking ?? ''; cb.signature = cb.signature ?? ''; }
            if (cb.type === 'tool_use' || cb.type === 'server_tool_use') json[ev.index] = '';
            blocks[ev.index] = cb;
            break;
          }
          case 'content_block_delta': {
            const cb = blocks[ev.index];
            const d = ev.delta;
            if (!cb) break;
            if (d.type === 'text_delta') cb.text += d.text;
            else if (d.type === 'input_json_delta') json[ev.index] = (json[ev.index] ?? '') + d.partial_json;
            else if (d.type === 'thinking_delta') cb.thinking += d.thinking;
            else if (d.type === 'signature_delta') cb.signature += d.signature;
            else if (d.type === 'citations_delta') (cb.citations ??= []).push(d.citation);
            break;
          }
          case 'content_block_stop': {
            const cb = blocks[ev.index];
            if (cb && ev.index in json) {
              try { cb.input = json[ev.index] ? JSON.parse(json[ev.index]) : (cb.input ?? {}); } catch { cb.input = cb.input ?? {}; }
            }
            break;
          }
          case 'message_delta':
            stop = ev.delta?.stop_reason ?? stop;
            if (ev.usage) Object.assign(usage, Object.fromEntries(Object.entries(ev.usage).filter(([, v]) => v != null)));
            break;
          case 'error': {
            const type = ev.error?.type ?? 'error';
            throw new ClaudeHttpError(`${type}: ${ev.error?.message ?? ''}`, 0, type === 'overloaded_error' || type === 'api_error');
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof ClaudeHttpError) throw e;
    throw new ClaudeHttpError(`stream: ${(e as Error).message}`, 0, true);
  }
  return { content: blocks.filter(Boolean), stop_reason: stop, usage };
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
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ ...normaliseThinking(req), stream: true }) });
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
