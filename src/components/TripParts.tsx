// Building blocks for the trip screens.
import { ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { ItemImage } from '@/components/ItemImage';
import { Label, Press, Txt } from '@/components/ui';
import { itemTitle } from '@/lib/format';
import type { Assessment } from '@/lib/tripRules';
import { fmtDay, localToday, PHASES, useActiveTrip, type Phase } from '@/lib/trips';
import { usePrefs } from '@/state/prefs';
import type { Item, Trip } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Plan · Capsule · Pack · Away · Home. Every step stays reachable; the natural one is marked. */
export function Stepper({ value, natural, onChange }: { value: Phase; natural: Phase; onChange: (p: Phase) => void }) {
  const { c } = useTheme();
  const at = PHASES.findIndex((p) => p.key === natural);
  return (
    <View style={{ flexDirection: 'row', marginHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong }}>
      {PHASES.map((p, i) => {
        const on = p.key === value;
        return (
          <Press key={p.key} onPress={() => onChange(p.key)} scaleTo={0.98} accessibilityRole="tab" accessibilityLabel={p.label}
            style={{ flex: 1, paddingVertical: 12, alignItems: 'center', gap: 4, borderBottomWidth: 2, borderBottomColor: on ? c.ink : 'transparent', marginBottom: -StyleSheet.hairlineWidth }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < at ? c.ink : i === at ? c.signal : c.line }} />
            <Txt v="label" color={on ? c.ink : c.muted}>{p.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

function Bar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const { c } = useTheme();
  const over = value > max;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>{label}</Label>
        <Label color={over ? c.signal : c.ink}>{value}/{max}{unit ?? ''}</Label>
      </View>
      <View style={{ height: 3, backgroundColor: c.line }}>
        <View style={{ height: 3, width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, backgroundColor: over ? c.signal : c.ink }} />
      </View>
    </View>
  );
}

/** Live read of the bag against the trip's rules, and how many outfits it makes. */
export function Meter({ a, outfits, bagLabel }: { a: Assessment; outfits: number; bagLabel: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginHorizontal: space.lg, borderWidth: 1, borderColor: a.over.length ? c.signal : c.lineStrong, padding: space.md, gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt v="bodyMedium">{a.over.length ? `Too much for ${bagLabel}` : `Fits ${bagLabel}`}</Txt>
        <Label color={c.muted}>{outfits} outfits</Label>
      </View>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Bar label="Clothes" value={a.pieces} max={a.budget.pieces} />
        <Bar label="Shoes" value={a.shoes} max={a.budget.shoes} />
        <Bar label="Layers" value={a.outer} max={a.budget.outer} />
      </View>
      {a.over.map((o) => <Txt key={o} v="small" color={c.signal}>{o}</Txt>)}
      {a.kit ? <Txt v="small" color={c.muted}>+ {a.kit} {a.kit === 1 ? 'piece' : 'pieces'} of gym/swim kit, not styled.</Txt> : null}
    </View>
  );
}

export function PieceRow({ item, why, badges = [], onPress, onRemove, onMore, dim }: {
  item: Item; why?: string; badges?: string[]; onPress?: () => void; onRemove?: () => void; onMore?: () => void; dim?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: dim ? 0.4 : 1 }}>
      <Press onPress={onPress} onLongPress={onMore} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }} scaleTo={0.985}>
        <View style={{ width: 52, height: 62, backgroundColor: c.surface, padding: 4 }}>
          <ItemImage item={item} small shadow={false} showStatus={false} style={{ flex: 1 }} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="smallMedium" numberOfLines={1}>{itemTitle(item)}</Txt>
          {why ? <Txt v="small" color={c.muted} numberOfLines={2}>{why}</Txt> : null}
          {badges.length ? <View style={{ flexDirection: 'row', gap: 8 }}>{badges.map((b) => <Label key={b} color={c.signal} style={{ fontSize: 9 }}>{b}</Label>)}</View> : null}
        </View>
      </Press>
      {onMore ? (
        <Press onPress={onMore} hitSlop={8} accessibilityLabel={`Options for ${itemTitle(item)}`} style={{ padding: 6 }}><Icon name="more" size={18} color={c.muted} /></Press>
      ) : null}
      {onRemove ? (
        <Press onPress={onRemove} hitSlop={8} accessibilityLabel={`Leave ${itemTitle(item)} at home`} style={{ padding: 6 }}><Icon name="close" size={18} /></Press>
      ) : null}
    </View>
  );
}

export function CheckRow({ done, label, sub, item, onToggle, onRemove }: { done: boolean; label: string; sub?: string; item?: Item; onToggle: () => void; onRemove?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <Press onPress={onToggle} scaleTo={0.985} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={label}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: item ? 6 : 14 }}>
        <View style={{ width: 22, height: 22, borderWidth: 1.5, borderColor: done ? c.ink : c.lineStrong, backgroundColor: done ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Icon name="check" size={14} color={c.bg} strokeWidth={2.2} /> : null}
        </View>
        {item ? (
          <View style={{ width: 40, height: 48, backgroundColor: c.surface, padding: 3, opacity: done ? 0.5 : 1 }}>
            <ItemImage item={item} small shadow={false} showStatus={false} style={{ flex: 1 }} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Txt v="small" color={done ? c.muted : c.ink} style={done ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={1}>{label}</Txt>
          {sub ? <Label style={{ fontSize: 9 }}>{sub}</Label> : null}
        </View>
      </Press>
      {onRemove ? <Press onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`} style={{ padding: 6 }}><Icon name="close" size={16} color={c.muted} /></Press> : null}
    </View>
  );
}

export function ForecastStrip({ trip }: { trip: Trip }) {
  const { c } = useTheme();
  const fc = trip.plan?.forecast ?? null;
  const today = localToday();
  if (!fc?.days?.length) {
    return <Txt v="small" color={c.muted}>No live forecast yet: it reaches about 16 days ahead. Packed for the usual weather; I'll refresh it nearer the time.</Txt>;
  }
  return (
    <View style={{ gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {fc.days.map((d) => (
          <View key={d.date} style={{ borderWidth: 1, borderColor: d.date === today ? c.ink : c.lineStrong, backgroundColor: d.date === today ? c.ink : 'transparent', padding: 8, minWidth: 64, alignItems: 'center', gap: 2 }}>
            <Label color={d.date === today ? c.bg : c.muted} style={{ fontSize: 9 }}>{d.date === today ? 'Today' : fmtDay(d.date, { weekday: 'short', day: 'numeric' })}</Label>
            <Txt v="smallMedium" color={d.date === today ? c.bg : c.ink}>{Math.round(d.min)}–{Math.round(d.max)}°</Txt>
            {d.rain >= 30 ? <Label color={c.signal} style={{ fontSize: 9 }}>{d.rain}% rain</Label> : null}
          </View>
        ))}
      </ScrollView>
      {fc.partial ? <Txt v="small" color={c.muted}>The forecast stops at {fmtDay(fc.days[fc.days.length - 1].date)}; the rest is packed for the usual weather.</Txt> : null}
    </View>
  );
}

/**
 * Shown wherever the app is choosing clothes while a trip is under way: makes the scope obvious and one tap to change.
 */
export function AwayBanner({ style }: { style?: object }) {
  const { c } = useTheme();
  const { current } = useActiveTrip();
  const { awayMode, set } = usePrefs();
  if (!current) return null;
  const where = (current.destination ?? 'your trip').trim();
  return (
    <Press onPress={() => { set({ awayMode: !awayMode }); }} scaleTo={0.99} accessibilityRole="switch" accessibilityState={{ checked: awayMode }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingVertical: 8, backgroundColor: awayMode ? c.ink : c.surfaceAlt }, style]}>
      <Icon name="suitcase" size={14} color={awayMode ? c.bg : c.ink} />
      <Txt v="small" color={awayMode ? c.bg : c.ink} style={{ flex: 1 }} numberOfLines={1}>
        {awayMode ? `From your ${where} bag · ${current.item_ids.length} pieces` : `Whole wardrobe · you're in ${where}`}
      </Txt>
      <Label color={awayMode ? c.faint : c.muted}>{awayMode ? 'Use everything' : 'Use the bag'}</Label>
    </Press>
  );
}
