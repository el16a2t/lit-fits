// Calendar range picker (pure JS, so it ships over the air): tap the first day, then the last.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Label, Press, Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { localToday } from '@/lib/trips';
import { space, useTheme } from '@/theme';

const p2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${p2(m + 1)}-${p2(d)}`;
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DateRange({ start, end, onChange }: { start: string | null; end: string | null; onChange: (start: string | null, end: string | null) => void }) {
  const { c } = useTheme();
  const today = localToday();
  const anchor = start ?? today;
  const [month, setMonth] = useState(() => ({ y: +anchor.slice(0, 4), m: +anchor.slice(5, 7) - 1 }));

  const cells = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const n = new Date(month.y, month.m + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => isoOf(month.y, month.m, i + 1))];
  }, [month]);

  const tap = (d: string) => {
    haptic.tick();
    if (!start || (start && end) || d < start) onChange(d, null);
    else onChange(start, d);
  };
  const shift = (k: number) => setMonth(({ y, m }) => { const t = new Date(y, m + k, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const title = new Date(month.y, month.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Press onPress={() => shift(-1)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Previous month"><Icon name="back" size={18} /></Press>
        <Txt v="bodyMedium">{title}</Txt>
        <Press onPress={() => shift(1)} hitSlop={10} style={{ padding: 6, transform: [{ rotate: '180deg' }] }} accessibilityLabel="Next month"><Icon name="back" size={18} /></Press>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => <Label key={i} style={{ flex: 1, textAlign: 'center' }}>{w}</Label>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const edge = d === start || d === end;
          const inside = !!start && !!end && d > start && d < end;
          const past = d < today;
          return (
            <Pressable key={d} onPress={() => tap(d)} accessibilityRole="button" accessibilityLabel={d}
              style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: inside ? c.surfaceAlt : 'transparent' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: edge ? c.ink : 'transparent', borderWidth: d === today && !edge ? 1 : 0, borderColor: c.lineStrong }}>
                <Txt v="small" color={edge ? c.bg : past ? c.faint : c.ink}>{+d.slice(8)}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Label color={c.muted}>{!start ? 'Tap the day you leave' : !end ? 'Now tap the day you get back' : 'Tap a day to start again'}</Label>
    </View>
  );
}
