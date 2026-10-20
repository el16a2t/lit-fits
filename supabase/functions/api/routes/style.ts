// Style intelligence: weekly trend brief (web research) and the learned Style DNA.
import { admin, background, Caller, enqueue, HttpError, json, MODELS } from '../lib/core.ts';
import { claude, jsonFrom } from '../lib/anthropic.ts';
import { loadContext, todayString } from '../lib/context.ts';
import { ADAM_DEFAULT_SEED, STYLE_CANON } from '../lib/prompts.ts';

// GQ and British Vogue block automated readers, so they're reached through other outlets' coverage.
// Any other domain that starts refusing is dropped automatically and the search retried.
const SOURCES = ['mrporter.com', 'highsnobiety.com', 'opumo.com', 'dieworkwear.com', 'permanentstyle.com', 'putthison.com', 'hypebeast.com', 'esquire.com', 'theguardian.com', 'ft.com', 'businessoffashion.com'];

async function researchWithFallback(req: Parameters<typeof claude>[0], domains: string[]) {
  let allowed = [...domains];
  const meta = { owner: null, fn: 'trends.research' };
  for (let i = 0; i < 4; i++) {
    const tools = [{ type: 'web_search_20260318', name: 'web_search', max_uses: 6, allowed_domains: allowed }];
    try {
      let res = await claude({ ...req, tools }, meta);
      // long server-side search loops can pause; hand the partial turn back so it carries on
      const content = [...res.content];
      for (let k = 0; k < 3 && res.stop_reason === 'pause_turn'; k++) {
        res = await claude({ ...req, tools, messages: [...req.messages, { role: 'assistant', content: content as any }] }, meta);
        content.push(...res.content);
      }
      return { ...res, content };
    } catch (e) {
      const m = String((e as Error).message).match(/not accessible to our user agent: \[([^\]]*)\]/);
      if (!m) throw e;
      const blocked = m[1].split(',').map((x) => x.replace(/['"\s]/g, ''));
      allowed = allowed.filter((d) => !blocked.includes(d));
    }
  }
  throw new Error('web research unavailable');
}

// Two separate invocations (research → distil) so neither leg can outrun the function's time budget.
// Readers only ever see rows that have a summary, i.e. finished briefs.
async function researchTrends(seed: string) {
  const today = todayString();
  const research = await researchWithFallback({
    model: MODELS.fast,
    max_tokens: 10000,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: `Today is ${today}. Research what respected menswear editors are saying RIGHT NOW about this season (and the season ahead): Mr Porter (The Journal), GQ / British GQ, Highsnobiety, British Vogue, Opumo, and Derek Guy (Die, Workwear!) for tailoring and smart dressing. GQ and Vogue can't be searched directly, so pick up their views where the other outlets report them. Focus on wearable, considered menswear — minimal smart-casual, workwear, quiet luxury, technical/gorpcore, good denim, boots, knitwear, outerwear, trainers — not runway costume.\n\nThe reader's taste: ${seed}\n\nWrite concise research notes: key themes, colours, fabrics, silhouettes/fits, pieces, styling moves, and what's fading. Note who said what.`,
    }],
  }, SOURCES);
  // cited answers arrive as many consecutive text segments of one flowing answer
  const notes = research.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const sources: { title: string; url: string }[] = [];
  for (const b of research.content as any[]) {
    for (const c of b.citations ?? []) if (c.url && !sources.find((s) => s.url === c.url)) sources.push({ title: c.title ?? c.url, url: c.url });
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url && sources.length < 30 && !sources.find((s) => s.url === r.url)) sources.push({ title: r.title ?? r.url, url: r.url });
    }
  }
  if (!notes.trim()) throw new Error('research returned no notes');
  const { data: row, error } = await admin.from('trend_briefs').insert({ content: { stage: 'notes', notes, seed }, sources: sources.slice(0, 24) }).select('id').single();
  if (error || !row) throw new Error(`save notes: ${error?.message}`);
  await enqueue('style/trends', { distil: row.id });
  return row.id as string;
}

async function distilTrends(id: string) {
  const { data: row } = await admin.from('trend_briefs').select('*').eq('id', id).single();
  if (!row) throw new HttpError(404, 'brief not found');
  if (row.summary) return row.content;
  const { notes, seed } = row.content as { notes: string; seed: string };
  const brief = await claude({
    model: MODELS.fast,
    max_tokens: 6000,
    thinking: { type: 'disabled' },
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false,
          required: ['season', 'headline', 'summary', 'themes', 'colours', 'silhouettes', 'key_pieces', 'for_you', 'fading'],
          properties: {
            season: { type: 'string' },
            headline: { type: 'string', description: 'One editorial line' },
            summary: { type: 'string', description: '3-4 sentences' },
            themes: {
              type: 'array',
              items: { type: 'object', additionalProperties: false, required: ['name', 'what', 'how'], properties: { name: { type: 'string' }, what: { type: 'string' }, how: { type: 'string' }, source: { type: 'string' } } },
            },
            colours: { type: 'array', items: { type: 'string' } },
            silhouettes: { type: 'array', items: { type: 'string' } },
            key_pieces: { type: 'array', items: { type: 'string' } },
            for_you: { type: 'array', items: { type: 'string' }, description: 'Concrete moves tailored to the reader’s taste and build' },
            fading: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    messages: [{ role: 'user', content: `Reader's taste: ${seed}\n\nResearch notes:\n${notes}\n\nTurn this into a tight, practical trend brief for the reader. Keep only what suits him.` }],
  }, { owner: null, fn: 'trends.distil' });
  const content = jsonFrom<any>(brief);
  await admin.from('trend_briefs').update({ season: content.season, summary: `${content.headline}\n${content.summary}`, content }).eq('id', id);
  return content;
}

export async function trends(req: Request, caller: Caller) {
  const body = await req.json().catch(() => ({}));
  if (body.distil) {
    if (!caller.internal) throw new HttpError(403, 'Internal only');
    return json(await distilTrends(String(body.distil)));
  }
  const owner = caller.userId;
  const { data: profile } = owner ? await admin.from('profiles').select('style_seed').eq('id', owner).maybeSingle() : { data: null };
  const seed = profile?.style_seed || ADAM_DEFAULT_SEED;
  background(researchTrends(seed));
  return json({ ok: true, queued: true });
}

async function buildDna(owner: string) {
  const ctx = await loadContext(owner);
  const [{ data: looks }, { data: signals }, { data: wear }] = await Promise.all([
    admin.from('looks').select('name,occasion,source,favourite,worn_count,look_items(item_id,wear_mode)').eq('owner', owner).order('updated_at', { ascending: false }).limit(60),
    admin.from('signals').select('kind,text,item_ids,value,created_at').eq('owner', owner).order('created_at', { ascending: false }).limit(120),
    admin.from('wear_log').select('worn_on,item_ids').eq('owner', owner).order('worn_on', { ascending: false }).limit(60),
  ]);
  const num = (id: string) => ctx.byId.get(id)?.number;
  const lookLines = (looks ?? []).map((l: any) => `${l.favourite ? '★ ' : ''}${l.name ?? 'Untitled'} (${l.source}${l.occasion ? `, ${l.occasion}` : ''}${l.worn_count ? `, worn ${l.worn_count}x` : ''}): ${(l.look_items ?? []).map((x: any) => `#${num(x.item_id)}`).join(' ')}`);
  const prompts = (signals ?? []).filter((s: any) => s.kind === 'prompt').map((s: any) => `- ${s.text}`).slice(0, 40);
  const reactions = (signals ?? []).filter((s: any) => s.kind === 'like' || s.kind === 'dislike').map((s: any) => `${s.kind}: ${(s.item_ids ?? []).map((i: string) => `#${num(i)}`).join(' ')}${s.text ? ` (${s.text})` : ''}`).slice(0, 60);
  const worn = (wear ?? []).map((w: any) => `${w.worn_on}: ${(w.item_ids ?? []).map((i: string) => `#${num(i)}`).join(' ')}`).slice(0, 40);
  const res = await claude({
    model: MODELS.stylist,
    max_tokens: 12000,
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object', additionalProperties: false,
          required: ['headline', 'palette', 'silhouettes', 'signatures', 'formality', 'go_to', 'under_used', 'avoid', 'next_moves', 'evolution'],
          properties: {
            headline: { type: 'string', description: 'His style in one sharp line' },
            palette: { type: 'array', items: { type: 'string' } },
            silhouettes: { type: 'array', items: { type: 'string' } },
            signatures: { type: 'array', items: { type: 'string' }, description: 'Recurring moves that define him' },
            formality: { type: 'string', description: 'Typical formality range and where he is most comfortable' },
            go_to: { type: 'array', items: { type: 'string' }, description: 'Most-used pieces as "#n name"' },
            under_used: { type: 'array', items: { type: 'string' }, description: 'Good pieces he neglects, as "#n name"' },
            avoid: { type: 'array', items: { type: 'string' } },
            next_moves: { type: 'array', items: { type: 'string' }, description: 'How to push his style forward with what he owns' },
            evolution: { type: 'string', description: 'How his taste is shifting, if visible' },
          },
        },
      },
    },
    system: `You are a perceptive menswear stylist building a living profile of a client's taste from evidence.\n${STYLE_CANON}`,
    messages: [{
      role: 'user',
      content: `Stated taste (his own words):\n${ctx.seed}\n\n${ctx.text}\n\nSaved looks:\n${lookLines.join('\n') || '(none yet)'}\n\nReactions to stylist suggestions:\n${reactions.join('\n') || '(none yet)'}\n\nRecent requests:\n${prompts.join('\n') || '(none yet)'}\n\nWear log:\n${worn.join('\n') || '(not tracked)'}\n\nBuild his Style DNA. Ground every claim in the evidence; where evidence is thin, lean on his stated taste and say less.`,
    }],
  }, { owner, fn: 'dna' });
  const dna = jsonFrom<any>(res);
  await admin.from('profiles').update({ style_dna: dna, style_dna_updated_at: new Date().toISOString() }).eq('id', owner);
  return dna;
}

export async function dna(req: Request, caller: Caller) {
  if (!caller.userId) throw new HttpError(409, 'No owner');
  const body = await req.json().catch(() => ({}));
  if (body.wait) return json(await buildDna(caller.userId));
  background(buildDna(caller.userId));
  return json({ ok: true, queued: true });
}
