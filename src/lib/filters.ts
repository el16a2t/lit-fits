import type { SortKey } from '@/state/prefs';
import { spectrumKey } from './outfit';
import { SUBTYPE_MAP, type Slot } from './taxonomy';
import type { Item } from './types';

export interface ItemFilter {
  q: string;
  slots: Slot[];
  categories: string[];
  subtypes: string[];
  brands: string[];
  colours: string[];
  sizes: string[];
  tags: string[];
  seasons: string[];
  patterns: string[];
  laundry: string[];
  formality: [number, number];
  warmth: [number, number];
  neverStyled: boolean;
  favourites: boolean;
  hideAccessories: boolean;
}

export const emptyFilter = (): ItemFilter => ({
  q: '', slots: [], categories: [], subtypes: [], brands: [], colours: [], sizes: [], tags: [], seasons: [], patterns: [], laundry: [],
  formality: [1, 5], warmth: [1, 5], neverStyled: false, favourites: false, hideAccessories: false,
});

export function activeCount(f: ItemFilter) {
  return (
    f.slots.length + f.categories.length + f.subtypes.length + f.brands.length + f.colours.length + f.sizes.length + f.tags.length + f.seasons.length +
    f.patterns.length + f.laundry.length + (f.formality[0] > 1 || f.formality[1] < 5 ? 1 : 0) + (f.warmth[0] > 1 || f.warmth[1] < 5 ? 1 : 0) +
    (f.neverStyled ? 1 : 0) + (f.favourites ? 1 : 0) + (f.hideAccessories ? 1 : 0)
  );
}

export function searchText(i: Item) {
  return [
    i.name, i.brand, SUBTYPE_MAP[i.subtype ?? '']?.label, i.colour_name, i.colour_family, i.pattern, i.size, i.fit, i.location,
    ...(i.materials ?? []), ...(i.tags ?? []), ...(i.seasons ?? []), `#${i.number}`, i.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function applyFilter(list: Item[], f: ItemFilter, usage: Record<string, number> = {}) {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((i) => {
    if (terms.length) {
      const t = searchText(i);
      if (!terms.every((x) => t.includes(x))) return false;
    }
    if (f.slots.length && !f.slots.includes(i.slot as Slot)) return false;
    if (f.hideAccessories && i.slot === 'accessory') return false;
    if (f.categories.length && !f.categories.includes(i.category ?? '')) return false;
    if (f.subtypes.length && !f.subtypes.includes(i.subtype ?? '')) return false;
    if (f.brands.length && !f.brands.includes(i.brand ?? '')) return false;
    if (f.colours.length && !f.colours.includes(i.colour_family ?? '')) return false;
    if (f.sizes.length && !f.sizes.includes(i.size ?? '')) return false;
    if (f.tags.length && !f.tags.some((t) => i.tags?.includes(t))) return false;
    if (f.seasons.length && !f.seasons.some((s) => i.seasons?.includes(s))) return false;
    if (f.patterns.length && !f.patterns.includes(i.pattern ?? '')) return false;
    if (f.laundry.length && !f.laundry.includes(i.laundry)) return false;
    if (i.formality != null && (i.formality < f.formality[0] || i.formality > f.formality[1])) return false;
    if (i.warmth != null && (i.warmth < f.warmth[0] || i.warmth > f.warmth[1])) return false;
    if (f.neverStyled && usage[i.id]) return false;
    if (f.favourites && !i.favourite) return false;
    return true;
  });
}

export function sortItems(list: Item[], key: SortKey, usage: Record<string, number> = {}) {
  const arr = [...list];
  switch (key) {
    case 'number': return arr.sort((a, b) => a.number - b.number);
    case 'colour': return arr.sort((a, b) => spectrumKey(a) - spectrumKey(b));
    case 'brand': return arr.sort((a, b) => (a.brand ?? '~').localeCompare(b.brand ?? '~'));
    case 'most': return arr.sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0));
    case 'least': return arr.sort((a, b) => (usage[a.id] ?? 0) - (usage[b.id] ?? 0));
    case 'formality': return arr.sort((a, b) => (b.formality ?? 0) - (a.formality ?? 0));
    case 'warmth': return arr.sort((a, b) => (b.warmth ?? 0) - (a.warmth ?? 0));
    default: return arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'number', label: 'Catalogue number' },
  { key: 'colour', label: 'Colour spectrum' },
  { key: 'brand', label: 'Brand A–Z' },
  { key: 'most', label: 'Most styled' },
  { key: 'least', label: 'Least styled' },
  { key: 'formality', label: 'Smartest first' },
  { key: 'warmth', label: 'Warmest first' },
];
