import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { usePrefs } from '@/state/prefs';

const on = () => { try { return Platform.OS !== 'web' && usePrefs.getState().hapticsOn; } catch { return false; } };
// a haptic must never break the action it decorates
const safe = (f: () => Promise<unknown>) => { try { if (on()) f().catch(() => {}); } catch { /* ignore */ } };

export const haptic = {
  tick: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  rigid: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
