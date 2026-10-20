// Minimal line icon set — 1.5px strokes on a 24 grid, drawn to match the editorial UI.
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

export type IconName =
  | 'plus' | 'grid' | 'list' | 'search' | 'filter' | 'sort' | 'close' | 'back' | 'more' | 'camera' | 'image'
  | 'spark' | 'lock' | 'unlock' | 'shuffle' | 'heart' | 'heartFill' | 'trash' | 'check' | 'edit' | 'layers'
  | 'eye' | 'send' | 'refresh' | 'shirt' | 'arrow' | 'down' | 'up' | 'suitcase' | 'bag' | 'flip' | 'wand'
  | 'cloud' | 'sun' | 'rain' | 'person' | 'thumbUp' | 'thumbDown' | 'minus' | 'tidy' | 'hanger' | 'dot' | 'stack' | 'external';

export function Icon({ name, size = 22, color, strokeWidth = 1.5 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const { c } = useTheme();
  const s = color ?? c.ink;
  const p = { stroke: s, strokeWidth, fill: 'none', strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const };
  const body = (() => {
    switch (name) {
      case 'plus': return <><Line x1="12" y1="4" x2="12" y2="20" {...p} /><Line x1="4" y1="12" x2="20" y2="12" {...p} /></>;
      case 'minus': return <Line x1="5" y1="12" x2="19" y2="12" {...p} />;
      case 'grid': return <><Rect x="4" y="4" width="6.5" height="6.5" {...p} /><Rect x="13.5" y="4" width="6.5" height="6.5" {...p} /><Rect x="4" y="13.5" width="6.5" height="6.5" {...p} /><Rect x="13.5" y="13.5" width="6.5" height="6.5" {...p} /></>;
      case 'list': return <><Rect x="4" y="5" width="4" height="4" {...p} /><Line x1="11" y1="7" x2="20" y2="7" {...p} /><Rect x="4" y="15" width="4" height="4" {...p} /><Line x1="11" y1="17" x2="20" y2="17" {...p} /></>;
      case 'search': return <><Circle cx="10.5" cy="10.5" r="6" {...p} /><Line x1="15" y1="15" x2="20" y2="20" {...p} /></>;
      case 'filter': return <><Line x1="4" y1="7" x2="20" y2="7" {...p} /><Line x1="7" y1="12" x2="17" y2="12" {...p} /><Line x1="10" y1="17" x2="14" y2="17" {...p} /></>;
      case 'sort': return <><Path d="M8 5v14M5 16l3 3 3-3" {...p} /><Path d="M16 19V5M13 8l3-3 3 3" {...p} /></>;
      case 'close': return <><Line x1="6" y1="6" x2="18" y2="18" {...p} /><Line x1="18" y1="6" x2="6" y2="18" {...p} /></>;
      case 'back': return <Path d="M15 5l-7 7 7 7" {...p} />;
      case 'arrow': return <><Line x1="4" y1="12" x2="19" y2="12" {...p} /><Path d="M13 6l6 6-6 6" {...p} /></>;
      case 'external': return <><Path d="M14 5h5v5" {...p} /><Line x1="19" y1="5" x2="11" y2="13" {...p} /><Path d="M17 14v5H5V7h5" {...p} /></>;
      case 'down': return <Path d="M6 9l6 6 6-6" {...p} />;
      case 'up': return <Path d="M6 15l6-6 6 6" {...p} />;
      case 'more': return <><Circle cx="6" cy="12" r="1" fill={s} /><Circle cx="12" cy="12" r="1" fill={s} /><Circle cx="18" cy="12" r="1" fill={s} /></>;
      case 'dot': return <Rect x="9" y="9" width="6" height="6" fill={s} />;
      case 'camera': return <><Path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z" {...p} /><Circle cx="12" cy="13" r="3.5" {...p} /></>;
      case 'image': return <><Rect x="4" y="5" width="16" height="14" {...p} /><Path d="M4 16l5-5 4 4 2-2 5 5" {...p} /><Circle cx="15.5" cy="9" r="1.2" {...p} /></>;
      case 'spark': return <Path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" {...p} />;
      case 'wand': return <><Line x1="5" y1="19" x2="15" y2="9" {...p} /><Path d="M17 3v4M15 5h4M19.5 9.5v3M18 11h3" {...p} /></>;
      case 'lock': return <><Rect x="6" y="11" width="12" height="9" {...p} /><Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...p} /></>;
      case 'unlock': return <><Rect x="6" y="11" width="12" height="9" {...p} /><Path d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2" {...p} /></>;
      case 'shuffle': return <><Path d="M4 7h3.5c4 0 5 10 9 10H20" {...p} /><Path d="M4 17h3.5c1.6 0 2.6-1.6 3.4-3.5M13.2 9.5C14 8.1 15 7 16.5 7H20" {...p} /><Path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" {...p} /></>;
      case 'heart': return <Path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z" {...p} />;
      case 'heartFill': return <Path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z" {...p} fill={s} />;
      case 'trash': return <><Line x1="4" y1="7" x2="20" y2="7" {...p} /><Path d="M9 7V4.5h6V7M6.5 7l1 13h9l1-13" {...p} /></>;
      case 'check': return <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
      case 'edit': return <><Path d="M5 19l1-4L16 5l3 3L9 18z" {...p} /><Line x1="14" y1="7" x2="17" y2="10" {...p} /></>;
      case 'layers': return <><Path d="M12 4l8 4-8 4-8-4z" {...p} /><Path d="M4 12l8 4 8-4M4 16l8 4 8-4" {...p} /></>;
      case 'stack': return <><Rect x="6" y="3.5" width="12" height="7" {...p} /><Rect x="4" y="12" width="16" height="8.5" {...p} /></>;
      case 'eye': return <><Path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" {...p} /><Circle cx="12" cy="12" r="2.6" {...p} /></>;
      case 'person': return <><Circle cx="12" cy="7" r="3" {...p} /><Path d="M6 21v-6.5a6 6 0 0 1 12 0V21" {...p} /></>;
      case 'send': return <><Line x1="4" y1="12" x2="19" y2="12" {...p} /><Path d="M13 6l6 6-6 6" {...p} /></>;
      case 'refresh': return <><Path d="M19 12a7 7 0 1 1-2.05-4.95" {...p} /><Path d="M19 4.5V8h-3.5" {...p} /></>;
      case 'shirt': return <Path d="M9 4l-5 3 2 4 2-1v10h8V10l2 1 2-4-5-3c-.5 1.5-1.6 2.3-3 2.3S9.5 5.5 9 4z" {...p} />;
      case 'hanger': return <><Path d="M12 9V8a2 2 0 1 0-2-2" {...p} /><Path d="M12 9l-8.5 6.5h17z" {...p} /></>;
      case 'suitcase': return <><Rect x="4" y="7.5" width="16" height="12" {...p} /><Path d="M9 7.5V4.5h6v3M9 7.5v12M15 7.5v12" {...p} /></>;
      case 'bag': return <><Path d="M5 8h14l-1 12H6z" {...p} /><Path d="M9 8V6a3 3 0 0 1 6 0v2" {...p} /></>;
      case 'flip': return <><Path d="M12 3v18" {...p} strokeDasharray="2 2" /><Path d="M9 7L4 17h5zM15 7l5 10h-5z" {...p} /></>;
      case 'tidy': return <><Rect x="4" y="4" width="7" height="7" {...p} /><Rect x="13" y="4" width="7" height="7" {...p} /><Rect x="8.5" y="13" width="7" height="7" {...p} /></>;
      case 'cloud': return <Path d="M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z" {...p} />;
      case 'sun': return <><Circle cx="12" cy="12" r="4" {...p} /><Path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" {...p} /></>;
      case 'rain': return <><Path d="M7 15h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15z" {...p} /><Path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5" {...p} /></>;
      case 'thumbUp': return <Path d="M7 20H4v-9h3zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19l-1.6 10H7" {...p} />;
      case 'thumbDown': return <Path d="M7 4H4v9h3zM7 13l4 7c1.5 0 2.5-1 2.2-2.6L12.6 14H19l-1.6-10H7" {...p} />;
      default: return null;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
