// A single floating garment on the look canvas: drag, pinch, rotate, double-tap to bring forward, drop on the bin to remove.
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useRotationGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import type { CanvasPiece as Pos, Item } from '@/lib/types';
import { motion, useTheme } from '@/theme';
import { ItemImage } from '../ItemImage';

export interface PieceEvents {
  onSelect: (id: string) => void;
  onFront: (id: string) => void;
  onCommit: (id: string, pos: Pos) => void;
  onDrag: (id: string, dragging: boolean, overBin: boolean) => void;
  onRemove: (id: string) => void;
}

export function CanvasPiece({ item, mode, pos, W, H, enterDelay, selected, binTop, ev }: {
  item: Item; mode?: string | null; pos: Pos; W: number; H: number; enterDelay: number; selected: boolean; binTop: number; ev: PieceEvents;
}) {
  const { c } = useTheme();
  const base = Math.min(W, H) * 0.62;
  const aspect = Math.max(0.55, Math.min(1.5, item.aspect ?? 0.8));
  const w = base, h = base / aspect;

  const x = useSharedValue(W / 2);
  const y = useSharedValue(H + h);
  const s = useSharedValue(0.4);
  const r = useSharedValue(18);
  const bob = useSharedValue(0);
  const calm = useSharedValue(1);
  const lift = useSharedValue(0);
  const doom = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0, s: 1, r: 0 });
  const over = useSharedValue(false);

  // fly in on mount, then follow external position changes (e.g. Tidy)
  useEffect(() => {
    x.value = withDelay(enterDelay, withSpring(pos.x * W, motion.springBouncy));
    y.value = withDelay(enterDelay, withSpring(pos.y * H, motion.springBouncy));
    s.value = withDelay(enterDelay, withSpring(pos.s, motion.springBouncy));
    r.value = withDelay(enterDelay, withSpring(pos.r, motion.springBouncy));
  }, [pos.x, pos.y, pos.s, pos.r, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bob.value = withDelay(Math.random() * 1200, withRepeat(withTiming(1, { duration: 2600 + Math.random() * 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [bob]);

  const commit = () => ev.onCommit(item.id, { x: x.value / W, y: y.value / H, s: s.value, r: r.value, z: pos.z });

  const pan = usePanGesture({
    minDistance: 2,
    onBegin: () => {
      'worklet';
      start.value = { x: x.value, y: y.value, s: s.value, r: r.value };
      calm.value = withTiming(0, { duration: 150 });
      lift.value = withSpring(1, motion.springSnappy);
      runOnJS(ev.onSelect)(item.id);
      runOnJS(haptic.light)();
    },
    onUpdate: (e) => {
      'worklet';
      x.value = start.value.x + e.translationX;
      y.value = start.value.y + e.translationY;
      const isOver = y.value + (h * s.value) * 0.15 > binTop;
      if (isOver !== over.value) {
        over.value = isOver;
        doom.value = withSpring(isOver ? 1 : 0, motion.springSnappy);
        runOnJS(ev.onDrag)(item.id, true, isOver);
        if (isOver) runOnJS(haptic.medium)();
      }
    },
    onActivate: () => {
      'worklet';
      runOnJS(ev.onDrag)(item.id, true, false);
    },
    onFinalize: () => {
      'worklet';
      calm.value = withTiming(1, { duration: 600 });
      lift.value = withSpring(0, motion.springSoft);
      if (over.value) {
        s.value = withTiming(0, { duration: 180 });
        runOnJS(haptic.heavy)();
        runOnJS(ev.onRemove)(item.id);
      } else {
        // keep pieces on canvas
        x.value = withSpring(Math.min(W - 20, Math.max(20, x.value)), motion.springSoft);
        y.value = withSpring(Math.min(binTop - 30, Math.max(20, y.value)), motion.springSoft);
        runOnJS(commit)();
      }
      over.value = false;
      doom.value = 0;
      runOnJS(ev.onDrag)(item.id, false, false);
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => { 'worklet'; start.value = { x: x.value, y: y.value, s: s.value, r: r.value }; },
    onUpdate: (e) => { 'worklet'; s.value = Math.max(0.25, Math.min(2.2, start.value.s * e.scale)); },
    onFinalize: () => { 'worklet'; runOnJS(commit)(); },
  });

  const rotate = useRotationGesture({
    onBegin: () => { 'worklet'; start.value = { ...start.value, r: r.value }; },
    onUpdate: (e) => { 'worklet'; r.value = start.value.r + (e.rotation * 180) / Math.PI; },
    onFinalize: () => { 'worklet'; runOnJS(commit)(); },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: () => {
      'worklet';
      runOnJS(ev.onFront)(item.id);
      runOnJS(haptic.tick)();
      lift.value = withSpring(1, motion.springSnappy, () => { lift.value = withSpring(0, motion.springSoft); });
    },
  });
  const tap = useTapGesture({
    onDeactivate: () => { 'worklet'; runOnJS(ev.onSelect)(item.id); runOnJS(haptic.tick)(); },
  });

  const gesture = useSimultaneousGestures(pan, pinch, rotate, useExclusiveGestures(doubleTap, tap));

  const style = useAnimatedStyle(() => {
    const b = (bob.value - 0.5) * 2 * calm.value;
    return {
      transform: [
        { translateX: x.value - w / 2 },
        { translateY: y.value - h / 2 + b * 4 - lift.value * 6 },
        { scale: s.value * (1 + lift.value * 0.04) * (1 - doom.value * 0.25) },
        { rotate: `${r.value + b * 0.8}deg` },
      ],
      opacity: 1 - doom.value * 0.45,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, zIndex: pos.z }, style]}>
        <ItemImage item={item} mode={mode} shadow={1.2} showStatus={false} style={{ flex: 1 }} transition={300} />
        {selected ? <View pointerEvents="none" style={{ position: 'absolute', inset: -6, borderWidth: 1, borderColor: c.ink, borderStyle: 'dashed' } as any} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}
