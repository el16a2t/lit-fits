// Bottom sheet + action menu + toast, built on Reanimated and Gesture Handler (no third-party sheet libs).
import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { haptic } from '@/lib/haptics';
import { motion, space, useTheme } from '@/theme';
import { Icon, type IconName } from './icons';
import { Label, Txt } from './ui';

const H = Dimensions.get('window').height;

export function Sheet({ visible, onClose, title, children, full, scroll = true, footer, contentStyle }: {
  visible: boolean; onClose: () => void; title?: string; children: ReactNode; full?: boolean; scroll?: boolean; footer?: ReactNode; contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(H);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        y.value = withSpring(0, motion.springSoft);
        backdrop.value = withTiming(1, { duration: 220 });
      });
    } else if (mounted) {
      y.value = withTiming(H, { duration: 240 }, (done) => { if (done) runOnJS(setMounted)(false); });
      backdrop.value = withTiming(0, { duration: 200 });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { Keyboard.dismiss(); onClose(); };

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      y.value = Math.max(0, e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(close)();
      else y.value = withSpring(0, motion.springSnappy);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;
  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }, backStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[{
            position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.bg, maxHeight: H * 0.92,
            height: full ? H * 0.92 : undefined, paddingBottom: ins.bottom, borderTopWidth: 1, borderTopColor: c.ink,
          }, sheetStyle]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ paddingTop: 10, paddingBottom: title ? 6 : 10, paddingHorizontal: space.lg }}>
              <View style={{ alignSelf: 'center', width: 36, height: 3, backgroundColor: c.lineStrong, marginBottom: title ? 14 : 0 }} />
              {title ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt v="displaySm" style={{ fontSize: 26, lineHeight: 30 }}>{title}</Txt>
                  <Pressable onPress={close} hitSlop={12}><Icon name="close" /></Pressable>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: space.lg, paddingBottom: space.xl }, contentStyle]} style={full ? { flex: 1 } : undefined}>
              {children}
            </ScrollView>
          ) : (
            <View style={[{ flex: full ? 1 : undefined }, contentStyle]}>{children}</View>
          )}
          {footer ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>{footer}</View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export interface MenuAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  danger?: boolean;
  hint?: string;
}

export function Menu({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: MenuAction[] }) {
  const { c } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View>
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            onPress={() => { haptic.tick(); onClose(); setTimeout(a.onPress, Platform.OS === 'web' ? 0 : 220); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line, opacity: pressed ? 0.5 : 1 })}
          >
            {a.icon ? <Icon name={a.icon} size={20} color={a.danger ? c.danger : c.ink} /> : null}
            <View style={{ flex: 1 }}>
              <Txt v="bodyMedium" color={a.danger ? c.danger : c.ink}>{a.label}</Txt>
              {a.hint ? <Txt v="small" color={c.muted}>{a.hint}</Txt> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

// ───────────── Toasts ─────────────
interface ToastState { text: string | null; action?: { label: string; onPress: () => void }; key: number; show: (text: string, action?: { label: string; onPress: () => void }) => void; hide: () => void }
export const useToast = create<ToastState>((set) => ({
  text: null,
  key: 0,
  show: (text, action) => set((s) => ({ text, action, key: s.key + 1 })),
  hide: () => set({ text: null, action: undefined }),
}));
export const toast = (text: string, action?: { label: string; onPress: () => void }) => useToast.getState().show(text, action);

export function ToastHost() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const { text, action, key, hide } = useToast();
  const y = useSharedValue(120);
  useEffect(() => {
    if (!text) return;
    y.value = withSpring(0, motion.springSnappy);
    const t = setTimeout(() => { y.value = withTiming(140, { duration: 220 }, (d) => { if (d) runOnJS(hide)(); }); }, action ? 4200 : 2600);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!text) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: space.lg, right: space.lg, bottom: ins.bottom + 76 }, a]}>
      <View style={{ backgroundColor: c.ink, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt v="smallMedium" color={c.bg} style={{ flex: 1 }}>{text}</Txt>
        {action ? (
          <Pressable onPress={() => { hide(); action.onPress(); }} hitSlop={10}>
            <Label color={c.signal}>{action.label}</Label>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
