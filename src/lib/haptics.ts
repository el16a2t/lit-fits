import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { usePrefs } from '@/state/prefs';

const on = () => Platform.OS !== 'web' && usePrefs.getState().hapticsOn;

export const haptic = {
  tick: () => { if (on()) Haptics.selectionAsync().catch(() => {}); },
  light: () => { if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  medium: () => { if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  heavy: () => { if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); },
  rigid: () => { if (on()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}); },
  success: () => { if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warn: () => { if (on()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
};
