import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemImage } from '@/components/ItemImage';
import { RenderImage } from '@/components/RenderImage';
import { toast } from '@/components/sheet';
import { Button, Grain, IconButton, Label, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { looks as looksApi } from '@/lib/data';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItems, useRender } from '@/lib/queries';
import type { Item } from '@/lib/types';
import { space, useTheme } from '@/theme';

const LINES = ['Pressing the shirt', 'Finding your light', 'Checking the drape', 'Getting the hair right', 'One more frame'];

function Developing({ items }: { items: Item[] }) {
  const { width } = useWindowDimensions();
  const t = useSharedValue(0);
  const [i, setI] = useState(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
    const h = setInterval(() => setI((x) => x + 1), 2600);
    return () => clearInterval(h);
  }, [t]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.65, transform: [{ scale: 0.96 + t.value * 0.04 }] }));
  const it = items.length ? items[i % items.length] : null;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl }}>
      <Animated.View style={[{ width: width * 0.55, height: width * 0.7 }, a]}>
        {it ? <ItemImage key={it.id} item={it} shadow={1.4} showStatus={false} style={{ flex: 1 }} transition={600} /> : null}
      </Animated.View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Label color="#8A867D">Developing</Label>
        <Txt v="editorial" color="#F2F0EB">{LINES[i % LINES.length]}…</Txt>
      </View>
    </View>
  );
}

export default function RenderView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { data: r } = useRender(id);
  const { data: all = [] } = useItems();
  const [chrome, setChrome] = useState(true);
  const items = useMemo(() => (r?.items ?? []).map((x) => all.find((i) => i.id === x.item_id)).filter(Boolean) as Item[], [r, all]);

  useEffect(() => { if (r?.status === 'done') haptic.success(); }, [r?.status]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0B0A' }}>
      {r?.status === 'done' && r.image_path ? (
        <Pressable style={{ flex: 1 }} onPress={() => setChrome((x) => !x)}>
          <Animated.View entering={FadeIn.duration(700)} style={{ flex: 1 }}>
            <RenderImage path={r.image_path} style={{ width, height }} contentFit="cover" />
          </Animated.View>
        </Pressable>
      ) : r?.status === 'failed' ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
          <Txt v="editorial" color="#F2F0EB">That one didn't develop.</Txt>
          <Txt v="body" color="#B9B4AA">{r.error ?? 'The image model declined or timed out.'}</Txt>
          <Button label="Try again" onPress={async () => { const n = await api.render({ look_id: r.look_id, items: r.items, scene: r.scene ?? undefined, extra: r.extra_prompt ?? undefined }); router.replace({ pathname: '/render/[id]', params: { id: n.id } }); }} style={{ backgroundColor: '#F2F0EB' }} fg="#111" />
        </View>
      ) : (
        <Developing items={items} />
      )}
      <Grain opacity={0.06} />
      {chrome ? (
        <>
          <View style={{ position: 'absolute', top: ins.top + 4, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconButton name="close" color="#F2F0EB" onPress={() => router.back()} />
            {r?.status === 'done' ? <Label color="#F2F0EB" style={{ alignSelf: 'center' }}>{r.scene ?? 'Studio'} · {Math.round((r.duration_ms ?? 0) / 1000)}s</Label> : null}
            <View style={{ width: 40 }} />
          </View>
          {r?.status === 'done' ? (
            <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: ins.bottom + 16, flexDirection: 'row', gap: 8 }}>
              {r.look_id ? (
                <Button small label="Use as cover" onPress={async () => { await looksApi.update(r.look_id!, { cover_render_id: r.id }); queryClient.invalidateQueries({ queryKey: qk.looks }); toast('Cover set'); }} style={{ flex: 1, backgroundColor: '#F2F0EB' }} fg="#111" />
              ) : null}
              <Button small kind="secondary" fg="#F2F0EB" label="Shoot again" onPress={async () => {
                const n = await api.render({ look_id: r.look_id, items: r.items, scene: r.scene ?? undefined, extra: r.extra_prompt ?? undefined });
                router.replace({ pathname: '/render/[id]', params: { id: n.id } });
              }} style={{ flex: 1 }} />
              {r.look_id ? <Button small kind="secondary" fg="#F2F0EB" label="Look" onPress={() => router.replace({ pathname: '/look/[id]', params: { id: r.look_id! } })} style={{ flex: 0.7 }} /> : null}
            </View>
          ) : null}
        </>
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 0, borderColor: c.ink }]} />
    </View>
  );
}
