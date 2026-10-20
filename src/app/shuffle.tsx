import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LookCollage } from '@/components/LookCollage';
import { toast } from '@/components/sheet';
import { Button, Chip, Empty, Grain, IconButton, Label, TopBar, Txt } from '@/components/ui';
import { signal } from '@/lib/data';
import { itemTitle } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { generateLooks, lookScore, targetWarmth } from '@/lib/outfit';
import { useItems, useItemUsage, useSaveLook } from '@/lib/queries';
import type { Item } from '@/lib/types';
import { useWeather } from '@/lib/weather';
import { useDraft } from '@/state/draft';
import { motion, space, useTheme } from '@/theme';

function Card({ look, usage, W, H, top, onSwipe }: { look: Item[]; usage: Record<string, number>; W: number; H: number; top: boolean; onSwipe: (dir: 'left' | 'right') => void }) {
  const { c } = useTheme();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const fresh = look.filter((i) => !usage[i.id]);
  const score = lookScore(look);
  const pan = usePanGesture({
    enabled: top,
    onUpdate: (e) => { 'worklet'; x.value = e.translationX; y.value = e.translationY * 0.4; },
    onDeactivate: (e) => {
      'worklet';
      if (Math.abs(x.value) > W * 0.28 || Math.abs(e.velocityX) > 900) {
        const dir = x.value > 0 ? 'right' : 'left';
        x.value = withTiming(Math.sign(x.value || 1) * W * 1.4, { duration: 260 }, () => runOnJS(onSwipe)(dir));
      } else { x.value = withSpring(0, motion.springSnappy); y.value = withSpring(0, motion.springSnappy); }
    },
  });
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${interpolate(x.value, [-W, W], [-14, 14])}deg` }] }));
  const keep = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, W * 0.25], [0, 1], 'clamp') }));
  const skip = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-W * 0.25, 0], [1, 0], 'clamp') }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ position: 'absolute', width: W, height: H, backgroundColor: c.surface, borderWidth: 1, borderColor: c.ink }, a]}>
        <LookCollage items={look} width={W - 2} height={H - 96} bg={c.paper} />
        <View style={{ padding: space.md, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Label>{look.length} pieces · {score > 0.72 ? 'sits well' : score > 0.58 ? 'works' : 'bold'}</Label>
            {fresh.length ? <Label color={c.signal}>{fresh.length} new to you</Label> : null}
          </View>
          <Txt v="small" numberOfLines={2} color={c.inkSoft}>{look.map(itemTitle).join(' · ')}</Txt>
        </View>
        <Animated.View style={[{ position: 'absolute', top: 18, left: 18, borderWidth: 2, borderColor: c.success, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-8deg' }] }, keep]}><Label color={c.success} style={{ fontSize: 14 }}>Keep</Label></Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 18, right: 18, borderWidth: 2, borderColor: c.danger, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '8deg' }] }, skip]}><Label color={c.danger} style={{ fontSize: 14 }}>Next</Label></Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function Shuffle() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const { data: weather } = useWeather();
  const save = useSaveLook();
  const draft = useDraft();
  const [preferUnused, setPreferUnused] = useState(true);
  const [useWx, setUseWx] = useState(true);
  const [deck, setDeck] = useState<Item[][]>([]);
  const [kept, setKept] = useState(0);

  const deal = useCallback(() => {
    setDeck(generateLooks(all, { count: 10, usage, preferUnused, warmth: useWx ? targetWarmth(weather?.temp) : null }));
  }, [all, usage, preferUnused, useWx, weather]);
  useEffect(() => { if (all.length) deal(); }, [all.length, preferUnused, useWx]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = width - space.lg * 2;
  const H = Math.min(height - ins.top - ins.bottom - 250, W * 1.5);
  const top = deck[0];

  const onSwipe = async (dir: 'left' | 'right') => {
    const look = deck[0];
    setDeck((d) => d.slice(1));
    if (!look) return;
    if (dir === 'right') {
      haptic.success();
      setKept((k) => k + 1);
      await save.mutateAsync({ source: 'shuffle', pieces: look.map((i) => ({ item_id: i.id, slot: i.slot })) });
      toast('Kept — in your lookbook');
    } else {
      haptic.tick();
      signal('dislike', { item_ids: look.map((i) => i.id), text: 'shuffle skip' });
    }
    if (deck.length <= 3) setDeck((d) => [...d, ...generateLooks(all, { count: 8, usage, preferUnused, warmth: useWx ? targetWarmth(weather?.temp) : null })]);
  };

  const enough = all.filter((i) => ['base', 'bottom', 'feet'].includes(i.slot ?? '')).length >= 3;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <Grain />
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Shuffle{kept ? ` · ${kept} kept` : ''}</Label>} right={<IconButton name="refresh" onPress={() => { haptic.medium(); deal(); }} />} />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Chip small label="Favour forgotten pieces" active={preferUnused} onPress={() => setPreferUnused((v) => !v)} />
        <Chip small label={weather ? `Weather · ${weather.temp}°` : 'Weather'} active={useWx} onPress={() => setUseWx((v) => !v)} />
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {!enough ? (
          <Empty title="Not enough to shuffle yet." body="Add at least a top, a bottom and some shoes and I'll start dealing." action={<Button label="Add pieces" icon="camera" onPress={() => router.push('/capture')} />} />
        ) : deck.length ? (
          <View style={{ width: W, height: H }}>
            {deck.slice(0, 3).reverse().map((look, i, arr) => {
              const isTop = i === arr.length - 1;
              const depth = arr.length - 1 - i;
              return (
                <View key={look.map((x) => x.id).join('|')} style={{ position: 'absolute', width: W, height: H, transform: [{ translateY: depth * 10 }, { scale: 1 - depth * 0.04 }] }}>
                  <Card look={look} usage={usage} W={W} H={H} top={isTop} onSwipe={onSwipe} />
                </View>
              );
            })}
          </View>
        ) : <Txt v="small" color={c.muted}>Dealing…</Txt>}
      </View>
      {top ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: space.lg, paddingBottom: ins.bottom + 12, paddingTop: 12 }}>
          <Button kind="secondary" label="Next" icon="close" onPress={() => onSwipe('left')} style={{ flex: 1 }} />
          <Button kind="secondary" label="Tweak" icon="layers" onPress={() => { draft.start({ item_ids: top.map((i) => i.id), source: 'shuffle' }); router.push('/builder'); }} style={{ flex: 1 }} />
          <Button label="Keep" icon="check" onPress={() => onSwipe('right')} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}
