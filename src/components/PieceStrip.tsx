// Horizontal strip of piece thumbnails (pairings, look contents, capsules).
import { ScrollView, View } from 'react-native';
import { itemTitle, pad3 } from '@/lib/format';
import type { Item } from '@/lib/types';
import { space, useTheme } from '@/theme';
import { ItemImage } from './ItemImage';
import { Label, Press, Txt } from './ui';

export function PieceStrip({ items, onPress, size = 112, notes, modes, caption = true }: {
  items: Item[]; onPress?: (i: Item) => void; size?: number; notes?: Record<string, string | undefined>; modes?: Record<string, string | undefined>; caption?: boolean;
}) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
      {items.map((it) => (
        <Press key={it.id} onPress={() => onPress?.(it)} style={{ width: size }}>
          <View style={{ width: size, height: size * 1.15, backgroundColor: c.surface, padding: 8 }}>
            <ItemImage item={it} small mode={modes?.[it.id]} shadow={0.6} style={{ flex: 1 }} />
          </View>
          {caption ? (
            <View style={{ paddingTop: 6, gap: 2 }}>
              <Label>{pad3(it.number)}</Label>
              <Txt v="small" numberOfLines={2}>{itemTitle(it)}</Txt>
              {notes?.[it.id] ? <Txt v="small" color={c.muted} numberOfLines={3}>{notes[it.id]}</Txt> : null}
            </View>
          ) : null}
        </Press>
      ))}
    </ScrollView>
  );
}
