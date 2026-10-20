// Sheet for choosing pieces from the wardrobe — searchable, slot-filtered, ranked by how well they pair with the current look.
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { applyFilter, emptyFilter } from '@/lib/filters';
import { pad3 } from '@/lib/format';
import { rankForSlot } from '@/lib/outfit';
import { useItems, useItemUsage } from '@/lib/queries';
import { SLOTS, type Slot } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { space, type as T, useTheme } from '@/theme';
import { Icon } from './icons';
import { ItemImage } from './ItemImage';
import { Sheet } from './sheet';
import { Button, Chip, Label, Press } from './ui';

export function ItemPicker({ visible, onClose, onPick, context = [], exclude = [], title = 'Add a piece', slot: initialSlot, multi = true }: {
  visible: boolean; onClose: () => void; onPick: (items: Item[]) => void; context?: Item[]; exclude?: string[]; title?: string; slot?: Slot | null; multi?: boolean;
}) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState<Slot | 'all'>(initialSlot ?? 'all');
  const [sel, setSel] = useState<string[]>([]);

  const list = useMemo(() => {
    const base = applyFilter(all.filter((i) => !exclude.includes(i.id) && i.status !== 'draft'), { ...emptyFilter(), q, slots: slot === 'all' ? [] : [slot] }, usage);
    return rankForSlot(base, context).map((r) => ({ ...r, best: context.length > 0 && r.score >= 0.78 }));
  }, [all, exclude, q, slot, context, usage]);

  const cols = 3;
  const w = (width - space.lg * 2 - space.sm * (cols - 1)) / cols;
  const close = () => { setSel([]); setQ(''); onClose(); };
  const done = (ids = sel) => { const picked = ids.map((id) => all.find((i) => i.id === id)).filter(Boolean) as Item[]; onPick(picked); close(); };

  return (
    <Sheet visible={visible} onClose={close} title={title} full scroll={false}
      footer={multi ? <Button label={sel.length ? `Add ${sel.length} ${sel.length === 1 ? 'piece' : 'pieces'}` : 'Tap pieces to add'} disabled={!sel.length} onPress={() => done()} /> : undefined}>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: c.ink }}>
          <Icon name="search" size={18} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search your wardrobe" placeholderTextColor={c.faint} style={[T.body, { flex: 1, height: 42, color: c.ink }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
          <Chip small label="All" active={slot === 'all'} onPress={() => setSlot('all')} />
          {SLOTS.filter((s) => s.key !== 'onepiece').map((s) => <Chip key={s.key} small label={s.label} active={slot === s.key} onPress={() => setSlot(s.key)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {list.map(({ item, best }) => {
          const on = sel.includes(item.id);
          return (
            <Press key={item.id} onPress={() => (multi ? setSel((s) => (on ? s.filter((x) => x !== item.id) : [...s, item.id])) : done([item.id]))} style={{ width: w }}>
              <View style={{ height: w * 1.2, backgroundColor: c.surface, padding: 6, borderWidth: on ? 2 : 0, borderColor: c.ink }}>
                <ItemImage item={item} small shadow={0.5} style={{ flex: 1 }} />
                {best ? <View style={{ position: 'absolute', top: 4, left: 4, backgroundColor: c.signal, paddingHorizontal: 4 }}><Label color={c.signalInk} style={{ fontSize: 8 }}>Pairs well</Label></View> : null}
                {on ? <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: c.ink, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color={c.bg} /></View> : null}
              </View>
              <Label style={{ marginTop: 3, fontSize: 9 }} numberOfLines={1}>{pad3(item.number)} {item.name ? `· ${item.name}` : ''}</Label>
            </Press>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
