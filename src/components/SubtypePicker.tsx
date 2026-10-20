import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { CATEGORIES, SUBTYPES, type Subtype } from '@/lib/taxonomy';
import { space, type as T, useTheme } from '@/theme';
import { Icon } from './icons';
import { Sheet } from './sheet';
import { Label, Txt } from './ui';

export function SubtypePicker({ visible, onClose, value, onPick }: { visible: boolean; onClose: () => void; value?: string | null; onPick: (s: Subtype) => void }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CATEGORIES.map((cat) => ({
      cat,
      items: SUBTYPES.filter((s) => s.category === cat.key && (!t || s.label.toLowerCase().includes(t) || cat.label.toLowerCase().includes(t))),
    })).filter((g) => g.items.length);
  }, [q]);
  return (
    <Sheet visible={visible} onClose={onClose} title="What is it?" full>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: c.ink, marginBottom: space.md }}>
        <Icon name="search" size={18} />
        <TextInput value={q} onChangeText={setQ} placeholder="Overshirt, chelsea, quarter-zip…" placeholderTextColor={c.faint} style={[T.body, { flex: 1, height: 44, color: c.ink }]} autoCorrect={false} />
      </View>
      {groups.map(({ cat, items }) => (
        <View key={cat.key} style={{ marginBottom: space.lg }}>
          <Label style={{ marginBottom: 4 }}>{cat.label}</Label>
          {items.map((s) => {
            const on = s.key === value;
            return (
              <Pressable key={s.key} onPress={() => { haptic.tick(); onPick(s); onClose(); setQ(''); }}
                style={({ pressed }) => ({ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.5 : 1 })}>
                <Txt v={on ? 'bodyMedium' : 'body'} style={{ flex: 1 }}>{s.label}</Txt>
                {on ? <Icon name="check" size={18} /> : <Label style={{ fontSize: 9 }}>{s.slot}</Label>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}
