import { useMemo } from 'react';
import { View } from 'react-native';
import { activeCount, emptyFilter, SORTS, type ItemFilter } from '@/lib/filters';
import { CATEGORIES, COLOUR_FAMILIES, LAUNDRY_STATES, PATTERNS, SEASONS, SLOTS } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { usePrefs } from '@/state/prefs';
import { space, useTheme } from '@/theme';
import { Sheet } from './sheet';
import { Button, Chip, Label, Swatch, Toggle, Txt } from './ui';

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl, gap: space.sm }}>
      <Label>{title}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

function Range({ value, onChange, label }: { value: [number, number]; onChange: (v: [number, number]) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: space.xl, gap: space.sm }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n >= value[0] && n <= value[1];
          return (
            <Chip key={n} label={String(n)} active={on} small
              onPress={() => {
                if (value[0] === value[1] && value[0] === n) onChange([1, 5]);
                else if (n < value[0]) onChange([n, value[1]]);
                else if (n > value[1]) onChange([value[0], n]);
                else onChange([n, n]);
              }}
              style={{ flex: 1, justifyContent: 'center', borderColor: on ? c.ink : c.line }} />
          );
        })}
      </View>
    </View>
  );
}

export function FilterSheet({ visible, onClose, filter, setFilter, items, resultCount }: {
  visible: boolean; onClose: () => void; filter: ItemFilter; setFilter: (f: ItemFilter) => void; items: Item[]; resultCount: number;
}) {
  const { c } = useTheme();
  const sort = usePrefs((s) => s.sort);
  const setPrefs = usePrefs((s) => s.set);
  const facets = useMemo(() => {
    const count = (key: keyof Item) => {
      const m = new Map<string, number>();
      for (const i of items) { const v = i[key] as string | null; if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const tags = new Map<string, number>();
    for (const i of items) for (const t of i.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
    return {
      brands: count('brand'), sizes: count('size'), categories: count('category'), colours: count('colour_family'), patterns: count('pattern'),
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24),
      laundryOn: items.some((i) => i.laundry !== 'clean'),
    };
  }, [items]);
  const set = (p: Partial<ItemFilter>) => setFilter({ ...filter, ...p });
  const n = activeCount(filter);

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter & sort" full
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" label={n ? `Clear ${n}` : 'Clear'} onPress={() => setFilter({ ...emptyFilter(), q: filter.q })} style={{ flex: 1 }} />
          <Button label={`Show ${resultCount}`} onPress={onClose} style={{ flex: 2 }} />
        </View>
      }>
      <Group title="Sort">
        {SORTS.map((s) => <Chip key={s.key} label={s.label} small active={sort === s.key} onPress={() => setPrefs({ sort: s.key })} />)}
      </Group>
      <Group title="Slot">
        {SLOTS.filter((s) => s.key !== 'onepiece').map((s) => <Chip key={s.key} label={s.label} small active={filter.slots.includes(s.key)} onPress={() => set({ slots: toggle(filter.slots, s.key) })} />)}
      </Group>
      <Group title="Category">
        {facets.categories.map(([k, n]) => <Chip key={k} small count={n} label={CATEGORIES.find((x) => x.key === k)?.label ?? k} active={filter.categories.includes(k)} onPress={() => set({ categories: toggle(filter.categories, k) })} />)}
      </Group>
      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Label>Colour</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {COLOUR_FAMILIES.filter((cf) => facets.colours.some(([k]) => k === cf.key)).map((cf) => (
            <View key={cf.key} style={{ alignItems: 'center', width: 56, gap: 2 }}>
              <Swatch hex={cf.hex} size={24} selected={filter.colours.includes(cf.key)} onPress={() => set({ colours: toggle(filter.colours, cf.key) })} label={cf.label} />
              <Txt v="small" color={c.muted} style={{ fontSize: 10 }} numberOfLines={1}>{cf.label.split(' / ')[0]}</Txt>
            </View>
          ))}
        </View>
      </View>
      {facets.brands.length ? (
        <Group title="Brand">
          {facets.brands.map(([k, n]) => <Chip key={k} small count={n} label={k} active={filter.brands.includes(k)} onPress={() => set({ brands: toggle(filter.brands, k) })} />)}
        </Group>
      ) : null}
      {facets.sizes.length ? (
        <Group title="Size">
          {facets.sizes.map(([k, n]) => <Chip key={k} small count={n} label={k} active={filter.sizes.includes(k)} onPress={() => set({ sizes: toggle(filter.sizes, k) })} />)}
        </Group>
      ) : null}
      <Group title="Season">
        {SEASONS.map((s) => <Chip key={s} small label={s} active={filter.seasons.includes(s)} onPress={() => set({ seasons: toggle(filter.seasons, s) })} />)}
      </Group>
      <Range label="Formality (1 lounge – 5 formal)" value={filter.formality} onChange={(v) => set({ formality: v })} />
      <Range label="Warmth (1 light – 5 heavy)" value={filter.warmth} onChange={(v) => set({ warmth: v })} />
      {facets.patterns.length > 1 ? (
        <Group title="Pattern">
          {PATTERNS.filter((p) => facets.patterns.some(([k]) => k === p)).map((p) => <Chip key={p} small label={p} active={filter.patterns.includes(p)} onPress={() => set({ patterns: toggle(filter.patterns, p) })} />)}
        </Group>
      ) : null}
      {facets.tags.length ? (
        <Group title="Tags">
          {facets.tags.map(([k, n]) => <Chip key={k} small count={n} label={k} active={filter.tags.includes(k)} onPress={() => set({ tags: toggle(filter.tags, k) })} />)}
        </Group>
      ) : null}
      {facets.laundryOn ? (
        <Group title="Availability">
          {LAUNDRY_STATES.map((l) => <Chip key={l.key} small label={l.label} active={filter.laundry.includes(l.key)} onPress={() => set({ laundry: toggle(filter.laundry, l.key) })} />)}
        </Group>
      ) : null}
      <View style={{ marginTop: space.lg }}>
        <Toggle label="Never styled" hint="Pieces that aren't in any saved look yet" value={filter.neverStyled} onChange={(v) => set({ neverStyled: v })} />
        <Toggle label="Favourites only" value={filter.favourites} onChange={(v) => set({ favourites: v })} />
        <Toggle label="Hide accessories" value={filter.hideAccessories} onChange={(v) => set({ hideAccessories: v })} />
      </View>
    </Sheet>
  );
}
