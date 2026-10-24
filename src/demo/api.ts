// Demo stand-ins for the edge API (web previews only).
import type { StylistHandlers } from '@/lib/api';
import type { Pairings, StylistLook } from '@/lib/types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoApi(route: string, body: any): Promise<unknown> {
  await wait(500);
  switch (route) {
    case 'item/pairings':
      return {
        headline: 'Let the piece lead; keep everything around it quiet and tonal.',
        groups: [
          { slot: 'bottom', picks: [{ item_id: 'demo-5', why: 'Washed black grounds the olive and keeps it workwear.', score: 5 }] },
          { slot: 'head', picks: [{ item_id: 'demo-1', why: 'Echoes the olive — tonal, not matchy.', score: 4 }] },
          { slot: 'mid', picks: [{ item_id: 'demo-6', why: 'Open check over it adds the one statement.', score: 3 }] },
        ],
        avoid: [{ item_id: 'demo-7', why: 'Technical shorts read too gym with this collar.' }],
        missing: [{ title: 'Dark brown suede chukka boots', slot: 'feet', why: 'Warms the palette and lifts it a notch.' }],
      } satisfies Pairings;
    case 'look/complete':
      return { looks: [demoLook('Tonal workwear', ['demo-1', 'demo-3', 'demo-5']), demoLook('Check it open', ['demo-6', 'demo-4', 'demo-5'])] };
    case 'look/name':
      return { title: 'Olive, quietly', occasion: 'Weekend' };
    case 'look/critique':
      return { verdict: 'works', headline: 'Easy and coherent; the shoes are the weak link.', working: ['Olive and ecru are a calm, earthy pairing.'], issues: ['The trainers are sportier than everything else.'], swaps: [] };
    case 'render':
      return { id: 'r-demo', status: 'queued', items: body.items };
    default:
      return { ok: true };
  }
}

function demoLook(title: string, ids: string[]): StylistLook {
  return {
    title,
    why: 'Tonal base, one texture shift, shoes do the talking.',
    items: ids.map((id, i) => ({ item_id: id, number: Number(id.split('-')[1]), slot: null, note: i === 1 ? 'untucked' : undefined })),
    missing: [{ title: 'Dark brown suede chukka boots', slot: 'feet', why: 'You have nothing warm underfoot for this palette.' }],
  };
}

export async function demoStylist(body: { prompt: string }, h: StylistHandlers) {
  h.onMeta?.({ thread_id: 't1' });
  h.onStatus?.('Reading your rails');
  await wait(700);
  h.onStatus?.('Thinking it through');
  await wait(900);
  for (const w of 'Three for a grey October. Workwear first, then a smarter turn.'.split(' ')) { h.onText?.(w + ' '); await wait(40); }
  h.onTextEnd?.();
  h.onStatus?.('Pulling pieces');
  await wait(500);
  h.onLook?.(demoLook('Olive on olive, black base', ['demo-1', 'demo-3', 'demo-5']), 0);
  await wait(600);
  h.onLook?.(demoLook('Check over graphic', ['demo-6', 'demo-4', 'demo-5']), 1);
  await wait(600);
  h.onLook?.(demoLook('Chambray, sleeves pushed', ['demo-2', 'demo-5', 'demo-1']), 2);
  h.onDone?.({ thread_id: 't1' });
}
