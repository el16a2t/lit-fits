import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { itemTitle, pad3, processingLabel } from '@/lib/format';
import { SUBTYPE_MAP } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { space, useTheme } from '@/theme';
import { ItemImage } from './ItemImage';
import { Label, Press, Thinking, Txt } from './ui';

export const ItemCard = memo(function ItemCard({ item, onPress, onLongPress, width, selected, dim, usage, showLaundry, compact }: {
  item: Item; onPress?: () => void; onLongPress?: () => void; width: number; selected?: boolean; dim?: boolean; usage?: number; showLaundry?: boolean; compact?: boolean;
}) {
  const { c } = useTheme();
  const aspect = Math.max(0.6, Math.min(1.35, item.aspect ?? 0.8));
  const imgH = (width - 20) / aspect;
  const proc = processingLabel(item);
  const away = showLaundry && item.laundry !== 'clean' && item.laundry !== 'worn';
  return (
    <Press onPress={onPress} onLongPress={onLongPress} scaleTo={0.96} style={{ width, opacity: dim ? 0.35 : 1 }}>
      <View style={{ backgroundColor: c.surface, padding: 10, borderWidth: selected ? 1.5 : 0, borderColor: c.ink }}>
        <ItemImage item={item} small={width < 220} style={{ width: '100%', height: Math.min(imgH, width * 1.45) }} />
        {proc && item.cover_url ? (
          <View style={{ position: 'absolute', left: 8, bottom: 8 }}><Thinking label={proc} /></View>
        ) : null}
        {away ? (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: c.bg, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Label style={{ fontSize: 8.5 }}>{item.laundry === 'storage' ? 'Storage' : item.laundry === 'wash' ? 'In wash' : item.laundry === 'drying' ? 'Drying' : 'Packed'}</Label>
          </View>
        ) : null}
        {usage === 0 && !proc ? <View style={{ position: 'absolute', top: 10, left: 10, width: 6, height: 6, backgroundColor: c.signal }} /> : null}
      </View>
      {!compact ? (
        <View style={{ paddingTop: 8, paddingBottom: space.md, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>{pad3(item.number)}</Label>
            {item.brand ? <Label numberOfLines={1} style={{ maxWidth: width * 0.55, textAlign: 'right' }}>{item.brand}</Label> : null}
          </View>
          <Txt v="smallMedium" numberOfLines={2}>{itemTitle(item)}</Txt>
        </View>
      ) : <View style={{ height: 8 }} />}
    </Press>
  );
});

export const ItemRow = memo(function ItemRow({ item, onPress, onLongPress, right, usage }: { item: Item; onPress?: () => void; onLongPress?: () => void; right?: React.ReactNode; usage?: number }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} onLongPress={onLongPress} scaleTo={0.985}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <View style={{ width: 64, height: 76, backgroundColor: c.surface, padding: 5 }}>
        <ItemImage item={item} small shadow={0.5} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Label>{pad3(item.number)}</Label>
          {usage === 0 ? <Label color={c.signal}>Never styled</Label> : null}
        </View>
        <Txt v="bodyMedium" numberOfLines={1}>{itemTitle(item)}</Txt>
        <Txt v="small" color={c.muted} numberOfLines={1}>
          {[SUBTYPE_MAP[item.subtype ?? '']?.label, item.brand, item.size].filter(Boolean).join(' · ') || processingLabel(item) || ''}
        </Txt>
      </View>
      {item.colours?.[0] ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.colours[0].hex, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }} /> : null}
      {right}
    </Press>
  );
});
