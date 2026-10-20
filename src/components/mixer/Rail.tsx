// One mixer row: pieces ride an invisible circular rail that turns in depth (a drum seen from the front).
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture, useLongPressGesture, useExclusiveGestures, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import type { Item } from '@/lib/types';
import { motion, useTheme } from '@/theme';
import { Icon } from '../icons';
import { ItemImage } from '../ItemImage';
import { Label } from '../ui';

export interface RailHandle {
  spinTo: (index: number, opts?: { turns?: number; duration?: number; delay?: number }) => void;
  jumpTo: (index: number) => void;
}

const wrap = (d: number, n: number) => {
  'worklet';
  if (n <= 0) return 0;
  let x = ((d % n) + n) % n;
  if (x > n / 2) x -= n;
  return x;
};

function RailItem({ item, i, n, pos, W, H, spacing, mode, dim }: { item: Item; i: number; n: number; pos: SharedValue<number>; W: number; H: number; spacing: number; mode?: string | null; dim: boolean }) {
  const a = useAnimatedStyle(() => {
    const d = wrap(i - pos.value, n);
    const ad = Math.abs(d);
    const theta = (d * spacing) / (W * 0.42); // radians around the drum
    const clamped = Math.max(-1.45, Math.min(1.45, theta));
    const x = Math.sin(clamped) * W * 0.46;
    const depth = Math.cos(clamped); // 1 front … 0 side
    const scale = interpolate(depth, [0, 1], [0.42, 1]);
    return {
      opacity: ad > 3.6 || Math.abs(theta) > 1.45 ? 0 : interpolate(depth, [0.1, 1], [0.05, dim && ad > 0.5 ? 0.35 : 1]) * (dim && ad < 0.5 ? 0.55 : 1),
      zIndex: Math.round(depth * 100),
      transform: [
        { translateX: x },
        { perspective: 900 },
        { rotateY: `${(-clamped * 180) / Math.PI * 0.55}deg` },
        { scale },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: W / 2 - H * 0.42, top: 0, width: H * 0.84, height: H }, a]}>
      <ItemImage item={item} small mode={mode} shadow={0.9} showStatus={false} style={{ flex: 1 }} transition={180} />
    </Animated.View>
  );
}

export const Rail = forwardRef<RailHandle, {
  slot: string; label: string; items: Item[]; W: number; H: number; locked: boolean; onToggleLock: () => void; onHide: () => void;
  onCenter: (item: Item | null, index: number) => void; initialIndex?: number; modes: Record<string, string | null | undefined>; onCycleMode: (item: Item) => void;
  onOpen: (item: Item) => void; dimIds?: Set<string>; spinning?: boolean;
}>(function Rail({ slot, label, items, W, H, locked, onToggleLock, onHide, onCenter, initialIndex = 0, modes, onCycleMode, onOpen, dimIds }, ref) {
  const { c } = useTheme();
  const n = items.length;
  const pos = useSharedValue(initialIndex);
  const start = useSharedValue(0);
  const last = useSharedValue(Math.round(initialIndex));
  const spacing = Math.min(W * 0.34, H * 0.9);
  const ids = useMemo(() => items.map((i) => i.id).join(','), [items]);

  // keep the centred item stable when the list re-orders (smart mode)
  useEffect(() => {
    const cur = Math.round(pos.value);
    if (cur >= n) pos.value = 0;
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (idx: number) => {
    const k = ((idx % n) + n) % n;
    onCenter(items[k] ?? null, k);
  };

  useAnimatedReaction(() => Math.round(pos.value), (cur, prev) => {
    if (prev !== null && cur !== prev) {
      runOnJS(haptic.tick)();
      last.value = cur;
    }
  });

  const settle = (v: number) => {
    'worklet';
    const target = Math.round(v);
    pos.value = withSpring(target, motion.springSnappy, (done) => { if (done) runOnJS(emit)(target); });
  };

  useImperativeHandle(ref, () => ({
    spinTo: (index, opts = {}) => {
      if (!n) return;
      const cur = Math.round(pos.value);
      const curK = ((cur % n) + n) % n;
      let delta = index - curK;
      if (delta <= 0) delta += n;
      const turns = opts.turns ?? 1;
      const target = cur + delta + n * turns;
      const go = () => { pos.value = withTiming(target, { duration: opts.duration ?? 900, easing: Easing.out(Easing.cubic) }, (d) => { if (d) runOnJS(emit)(target); }); };
      if (opts.delay) setTimeout(go, opts.delay); else go();
    },
    jumpTo: (index) => { pos.value = index; emit(index); },
  }), [n, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    enabled: n > 1,
    onBegin: () => { 'worklet'; start.value = pos.value; },
    onUpdate: (e) => { 'worklet'; pos.value = start.value - e.translationX / spacing; },
    onDeactivate: (e) => {
      'worklet';
      pos.value = withDecay({ velocity: -e.velocityX / spacing, deceleration: 0.992 }, (finished) => { if (finished) settle(pos.value); });
    },
  });
  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      const dx = e.x - W / 2;
      if (Math.abs(dx) < H * 0.45) {
        runOnJS(cycle)();
      } else {
        const target = Math.round(pos.value) + (dx > 0 ? 1 : -1);
        pos.value = withSpring(target, motion.springSnappy, (d) => { if (d) runOnJS(emit)(target); });
      }
    },
  });
  const long = useLongPressGesture({
    minDuration: 420,
    onActivate: () => { 'worklet'; runOnJS(open)(); },
  });

  function cycle() {
    const k = ((Math.round(pos.value) % n) + n) % n;
    const it = items[k];
    if (it) onCycleMode(it);
  }
  function open() {
    const k = ((Math.round(pos.value) % n) + n) % n;
    const it = items[k];
    if (it) { haptic.medium(); onOpen(it); }
  }

  const gesture = useSimultaneousGestures(pan, useExclusiveGestures(long, tap));

  return (
    <View style={{ height: H, width: W }}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }}>
          {n === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Label>No {label.toLowerCase()} pieces yet</Label>
            </View>
          ) : items.map((it, i) => (
            <RailItem key={it.id} item={it} i={i} n={n} pos={pos} W={W} H={H} spacing={spacing} mode={modes[it.id]} dim={!!dimIds?.has(it.id)} />
          ))}
        </View>
      </GestureDetector>
      {/* row controls */}
      <View style={{ position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center', gap: 2 }} pointerEvents="box-none">
        <Pressable onPress={() => { haptic.tick(); onToggleLock(); }} hitSlop={8} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: locked ? c.ink : 'transparent' }}>
          <Icon name={locked ? 'lock' : 'unlock'} size={16} color={locked ? c.bg : c.muted} />
        </Pressable>
        <Label style={{ fontSize: 7.5, width: 44, marginLeft: -7, textAlign: 'center' }}>{label === 'Accessories' ? 'ACC.' : label}</Label>
      </View>
      <Pressable onPress={() => { haptic.tick(); onHide(); }} hitSlop={8} style={{ position: 'absolute', right: 8, top: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="minus" size={14} color={c.faint} />
      </Pressable>
      {n > 1 ? <Label style={{ position: 'absolute', right: 10, bottom: 4, fontSize: 8.5 }} color={c.faint}>{n}</Label> : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: c.line, opacity: slot === 'feet' ? 0 : 0.6 }} />
    </View>
  );
});
