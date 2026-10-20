import { Image } from 'expo-image';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { processingLabel } from '@/lib/format';
import type { Item } from '@/lib/types';
import { useTheme } from '@/theme';
import { Icon } from './icons';
import { Label, Shimmer, Thinking } from './ui';

export function pieceUrl(item: Pick<Item, 'cover_url' | 'thumb_url' | 'images' | 'wear_modes'>, opts: { mode?: string | null; view?: 'front' | 'back' | 'side'; small?: boolean } = {}) {
  if (opts.mode) {
    const m = item.wear_modes?.find((x) => x.label === opts.mode || x.key === opts.mode);
    if (m?.url) return opts.small ? m.thumb ?? m.url : m.url;
  }
  if (opts.view && item.images?.[opts.view]) {
    const v = item.images[opts.view]!;
    return opts.small ? v.thumb : v.url;
  }
  return opts.small ? item.thumb_url ?? item.cover_url : item.cover_url ?? item.thumb_url;
}

export function shadowStyle(strength = 1): ViewStyle {
  const sd = { offsetX: 0, offsetY: 10 * strength, standardDeviation: 10 * strength, color: `rgba(45,32,20,${0.2 * strength})` };
  if (Platform.OS === 'web') return { filter: `drop-shadow(0px ${sd.offsetY}px ${sd.standardDeviation}px ${sd.color})` } as any;
  if (Platform.OS === 'android') return { filter: [{ dropShadow: sd }] } as any;
  return { shadowColor: '#2d2014', shadowOpacity: 0.2 * strength, shadowRadius: 10 * strength, shadowOffset: { width: 0, height: 8 * strength } };
}

export function ItemImage({ item, mode, view, small, style, shadow = true, showStatus = true, contentPosition = 'center', transition = 220 }: {
  item: Item; mode?: string | null; view?: 'front' | 'back' | 'side'; small?: boolean; style?: StyleProp<ViewStyle>; shadow?: boolean | number;
  showStatus?: boolean; contentPosition?: 'center' | 'bottom' | 'top'; transition?: number;
}) {
  const { c } = useTheme();
  const url = pieceUrl(item, { mode, view, small });
  const label = showStatus ? processingLabel(item) : null;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {url ? (
        <View style={[{ width: '100%', height: '100%' }, shadow ? shadowStyle(typeof shadow === 'number' ? shadow : 1) : null]}>
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            contentPosition={contentPosition}
            transition={transition}
            cachePolicy="memory-disk"
            recyclingKey={url}
          />
        </View>
      ) : item.status === 'failed' ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Icon name="camera" color={c.muted} />
          <Label>Needs a retake</Label>
        </View>
      ) : (
        <Shimmer style={{ width: '62%', height: '72%', borderRadius: 2 }} />
      )}
      {label && !url ? (
        <View style={{ position: 'absolute', bottom: 8, left: 8 }}>
          <Thinking label={label} />
        </View>
      ) : null}
    </View>
  );
}
