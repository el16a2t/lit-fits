// Streaming stylist chat: Claude builds looks from the owner's wardrobe and streams them as cards.
import { admin, Caller, cors, HttpError, MODELS } from '../lib/core.ts';
import { claudeStream, type Block, type Msg } from '../lib/anthropic.ts';
import { loadContext, resolveRef, todayString, type Ctx } from '../lib/context.ts';
import { PRESENT_LOOK_TOOL, stylistSystem } from '../lib/prompts.ts';

export interface LookOut {
  title: string;
  occasion?: string;
  why: string;
  styling?: string;
  items: { item_id: string; number: number; mode?: string; note?: string; slot?: string | null }[];
  missing: { title: string; slot: string; subtype?: string; colour?: string; why: string }[];
}

export function normaliseLook(ctx: Ctx, input: any): LookOut | null {
  const seen = new Set<string>();
  const items = ((input?.items ?? []) as any[]).map((x) => {
    const it = resolveRef(ctx, x.id ?? x.item_id ?? x.number);
    if (!it || seen.has(it.id)) return null;
    seen.add(it.id);
    const modes = (it.wear_modes ?? []).map((m) => m.label.toLowerCase());
    const mode = x.mode && modes.includes(String(x.mode).toLowerCase()) ? x.mode : undefined;
    return { item_id: it.id, number: it.number, mode, note: x.note || undefined, slot: it.slot };
  }).filter(Boolean) as LookOut['items'];
  if (items.length < 2) return null;
  return {
    title: String(input?.title ?? 'Look').slice(0, 80),
    occasion: input?.occasion,
    why: String(input?.why ?? ''),
    styling: input?.styling,
    items,
    missing: Array.isArray(input?.missing) ? input.missing.slice(0, 3) : [],
  };
}

const lookSummary = (l: LookOut) => `[Look "${l.title}": ${l.items.map((i) => `#${i.number}${i.mode ? ` (${i.mode})` : ''}`).join(', ')}]`;

export const stylistTurn = (prompt: string, constraints = '') =>
  `${prompt}${constraints ? `\n\n(${constraints})` : ''}\n\nOpen with at most one short line, then call present_look for each look (default 3 unless I asked otherwise). End with one short closing line only if it adds something.`;

export type StylistBlock = { type: 'text'; text: string } | { type: 'look'; look: LookOut };

export function stylistRequest(system: Block[], convo: Msg[]) {
  return { model: MODELS.stylist, max_tokens: 16000, output_config: { effort: 'medium' as const }, system, messages: convo, tools: [PRESENT_LOOK_TOOL] };
}

/**
 * The stylist's tool loop: streams Claude, turns each present_look call into a validated look,
 * and keeps going (replaying thinking blocks verbatim) until the model stops calling tools.
 */
export async function runStylist(ctx: Ctx, system: Block[], messages: Msg[], owner: string | null, send: (event: string, data: unknown) => void) {
  const blocks: StylistBlock[] = [];
  const looks: LookOut[] = [];
  let convo = messages;
  for (let turn = 0; turn < 4; turn++) {
    const raw: any[] = []; // content blocks by index, replayed verbatim (incl. thinking signatures) on tool turns
    let stop = 'end_turn';
    for await (const ev of claudeStream(stylistRequest(system, convo), { owner, fn: 'stylist' })) {
      if (ev.type === 'content_block_start') {
        const cb = { ...ev.content_block };
        if (cb.type === 'thinking') { cb.thinking = cb.thinking ?? ''; cb.signature = cb.signature ?? ''; send('status', { label: 'Thinking it through' }); }
        if (cb.type === 'text') cb.text = '';
        if (cb.type === 'tool_use') { cb._json = ''; send('status', { label: 'Pulling pieces' }); }
        raw[ev.index] = cb;
      } else if (ev.type === 'content_block_delta') {
        const cb = raw[ev.index];
        if (!cb) continue;
        const d = ev.delta;
        if (d.type === 'text_delta') { cb.text += d.text; send('text', { delta: d.text }); }
        else if (d.type === 'input_json_delta') cb._json += d.partial_json;
        else if (d.type === 'thinking_delta') cb.thinking += d.thinking;
        else if (d.type === 'signature_delta') cb.signature += d.signature;
      } else if (ev.type === 'content_block_stop') {
        const cb = raw[ev.index];
        if (!cb) continue;
        if (cb.type === 'tool_use') {
          try { cb.input = JSON.parse(cb._json || '{}'); } catch { cb.input = {}; }
          delete cb._json;
          const look = normaliseLook(ctx, cb.input);
          if (look) { looks.push(look); blocks.push({ type: 'look', look }); send('look', { look, index: looks.length - 1 }); }
        } else if (cb.type === 'text' && cb.text) {
          blocks.push({ type: 'text', text: cb.text });
          send('text_end', {});
        }
      } else if (ev.type === 'message_delta') {
        stop = ev.delta?.stop_reason ?? stop;
      } else if (ev.type === 'error') {
        throw new Error(`stream error: ${ev.error?.type ?? ''} ${ev.error?.message ?? ''}`);
      }
    }
    const assistantContent = raw.filter(Boolean).filter((b) => !(b.type === 'text' && !b.text));
    if (stop !== 'tool_use') break;
    // acknowledge tool calls and let the model continue (it may present more looks or close)
    const results = assistantContent.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Shown to him.' }));
    convo = [...convo, { role: 'assistant', content: assistantContent }, { role: 'user', content: results as any }];
    if (looks.length >= 6) break;
  }
  return { blocks, looks };
}

export async function stylist(req: Request, caller: Caller) {
  const body = await req.json();
  const prompt: string = String(body.prompt ?? '').trim();
  if (!prompt) throw new HttpError(400, 'prompt required');
  const owner = caller.userId;

  // thread
  let threadId: string | undefined = body.thread_id;
  if (!threadId) {
    const { data, error } = await admin.from('threads').insert({ owner, title: prompt.slice(0, 80), kind: 'stylist' }).select('id').single();
    if (error) throw new HttpError(500, error.message);
    threadId = data.id;
  } else {
    await admin.from('threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  }
  const [{ data: history }, ctx] = await Promise.all([
    admin.from('messages').select('role,content,looks').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(12),
    loadContext(owner),
  ]);
  await admin.from('messages').insert({ thread_id: threadId, owner, role: 'user', content: prompt, meta: { context: body.context ?? null } });

  const weather: string | null = body.context?.weather ?? null;
  const focus: string[] = Array.isArray(body.context?.focus_item_ids) ? body.context.focus_item_ids : [];
  const focusNums = focus.map((id) => ctx.byId.get(id)).filter(Boolean).map((i) => `#${i!.number}`);
  const constraints = [
    body.context?.available_only ? 'Only use pieces that are currently available (not in wash/drying/storage).' : null,
    focusNums.length ? `Build around: ${focusNums.join(', ')}.` : null,
    body.context?.count ? `Give ${body.context.count} looks.` : null,
  ].filter(Boolean).join(' ');

  const system: Block[] = [
    { type: 'text', text: stylistSystem({ name: ctx.profile?.display_name || 'Adam', seed: ctx.seed, dna: ctx.profile?.style_dna, body: ctx.body, trend: ctx.trend, today: todayString(), weather }) },
    { type: 'text', text: ctx.text, cache_control: { type: 'ephemeral' } },
  ];
  const messages: Msg[] = [];
  for (const m of (history ?? []).reverse()) {
    const looks = (m.looks ?? []) as LookOut[];
    const text = [m.content ?? '', ...looks.map(lookSummary)].filter(Boolean).join('\n');
    if (text) messages.push({ role: m.role as 'user' | 'assistant', content: text });
  }
  messages.push({ role: 'user', content: stylistTurn(prompt, constraints) });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('meta', { thread_id: threadId });
      send('status', { label: 'Reading your rails' });
      try {
        const { blocks, looks } = await runStylist(ctx, system, messages, owner, send);
        const content = blocks.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n\n').trim();
        const { data: msg } = await admin.from('messages').insert({ thread_id: threadId, owner, role: 'assistant', content, looks, meta: { blocks } }).select('id').single();
        await admin.from('signals').insert({ owner, kind: 'prompt', text: prompt });
        send('done', { message_id: msg?.id, thread_id: threadId });
      } catch (e) {
        console.error('stylist failed', e);
        send('error', { message: 'The stylist hit a snag. Try again in a moment.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
