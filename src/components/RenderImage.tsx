import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';
import { useSignedUrl } from '@/lib/queries';
import { Shimmer } from './ui';

export function RenderImage({ path, style, contentFit = 'cover' }: { path: string | null | undefined; style?: StyleProp<ImageStyle>; contentFit?: 'cover' | 'contain' }) {
  const { data: url } = useSignedUrl(path);
  if (!url) return <Shimmer style={style as any} />;
  return <Image source={{ uri: url, cacheKey: path ?? undefined }} style={style} contentFit={contentFit} transition={300} cachePolicy="memory-disk" />;
}
