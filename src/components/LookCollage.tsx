// Static stacked composition of a look's pieces — uses saved canvas positions, else the auto layout.
import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { autoLayout } from '@/lib/outfit';
import type { CanvasPiece, Item } from '@/lib/types';
import { useTheme } from '@/theme';
import { ItemImage } from './ItemImage';

export function LookCollage({ items, positions, modes, width, height, style, small = true, bg }: {
  items: Item[]; positions?: Record<string, CanvasPiece>; modes?: Record<string, string | null | undefined>; width: number; height: number;
  style?: StyleProp<ViewStyle>; small?: boolean; bg?: string;
}) {
  const { c } = useTheme();
  const layout = useMemo(() => {
    const auto = autoLayout(items, width / height);
    const out: Record<string, CanvasPiece> = {};
    for (const it of items) out[it.id] = positions?.[it.id] ?? auto[it.id];
    return out;
  }, [items, positions, width, height]);
  const base = Math.min(width, height) * 0.62;
  const ordered = [...items].sort((a, b) => (layout[a.id]?.z ?? 0) - (layout[b.id]?.z ?? 0));
  return (
    <View style={[{ width, height, backgroundColor: bg ?? c.paper, overflow: 'hidden' }, style]}>
      {ordered.map((it) => {
        const p = layout[it.id];
        if (!p) return null;
        const w = base * p.s;
        const h = w / Math.max(0.55, Math.min(1.5, it.aspect ?? 0.8));
        return (
          <View key={it.id} style={{ position: 'absolute', left: p.x * width - w / 2, top: p.y * height - h / 2, width: w, height: h, transform: [{ rotate: `${p.r}deg` }] }}>
            <ItemImage item={it} small={small} mode={modes?.[it.id] ?? undefined} shadow={0.7} showStatus={false} style={{ flex: 1 }} />
          </View>
        );
      })}
    </View>
  );
}
