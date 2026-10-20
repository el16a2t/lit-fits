import { SLOTS, SUBTYPE_MAP } from './taxonomy';
import type { Item } from './types';

export const pad3 = (n: number | null | undefined) => `№ ${String(n ?? 0).padStart(3, '0')}`;

export const itemTitle = (i: Pick<Item, 'name' | 'subtype'>) => i.name || SUBTYPE_MAP[i.subtype ?? '']?.label || 'Untitled piece';

export const slotLabel = (s?: string | null) => SLOTS.find((x) => x.key === s)?.label ?? 'Piece';

export function relTime(iso?: string | null) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function processingLabel(i: Item): string | null {
  if (i.status === 'ready') return null;
  if (i.status === 'failed') return 'Needs a retake';
  const steps = i.processing?.steps?.analysis;
  const views = i.processing?.views ?? {};
  if (!steps || steps === 'queued' || steps === 'running') return 'Cataloguing';
  const running = Object.entries(views).find(([, s]) => s === 'running' || s === 'queued');
  if (running) return running[0] === 'back' ? 'Shooting the back' : running[0] === 'side' ? 'Shooting the side' : 'Shooting the front';
  return 'Finishing';
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Late one' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
};

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
