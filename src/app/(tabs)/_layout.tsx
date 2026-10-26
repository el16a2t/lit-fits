import { Redirect, useRouter } from 'expo-router';
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { ItemImage } from '@/components/ItemImage';
import { Label } from '@/components/ui';
import { traceNow } from '@/lib/diag';
import { haptic } from '@/lib/haptics';
import { useItems, useProfile } from '@/lib/queries';
import { DEMO } from '@/lib/supabase';
import { useDraft } from '@/state/draft';
import { motion, useTheme } from '@/theme';

function TabButton({ isFocused, label, ref, ...props }: TabTriggerSlotProps & { label: string }) {
  const { c } = useTheme();
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(isFocused ? 1 : 0, motion.springSnappy) }] }));
  return (
    <Pressable ref={ref as any} {...props} onPress={(e) => { traceNow('tab', { label }); haptic.tick(); props.onPress?.(e); }} style={{ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      <Animated.View style={[{ width: 5, height: 5, backgroundColor: c.signal }, dot]} />
      <Label color={isFocused ? c.ink : c.muted} style={{ fontSize: 10.5, letterSpacing: 1.2 }}>{label}</Label>
    </Pressable>
  );
}

function DraftPill() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const draft = useDraft();
  const { data: items } = useItems();
  if (!draft.active || !draft.pieces.length) return null;
  const pieces = draft.pieces.slice(-4).map((p) => items?.find((i) => i.id === p.item_id)).filter(Boolean);
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={{ position: 'absolute', left: 16, right: 16, bottom: 64 + ins.bottom }}>
      <Pressable onPress={() => { haptic.light(); router.push('/builder'); }}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.ink, height: 52, paddingHorizontal: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', width: 22 + pieces.length * 18 }}>
          {pieces.map((it, i) => (
            <View key={it!.id} style={{ position: 'absolute', left: i * 18, top: -12, width: 34, height: 34, backgroundColor: c.surface, borderWidth: 1, borderColor: c.ink }}>
              <ItemImage item={it!} small shadow={false} showStatus={false} style={{ flex: 1, padding: 2 }} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, paddingLeft: 8 }}>
          <Label color={c.bg}>{draft.lookId ? 'Editing look' : 'Draft look'} · {draft.pieces.length} {draft.pieces.length === 1 ? 'piece' : 'pieces'}</Label>
        </View>
        <Label color={c.signal}>Resume</Label>
        <Icon name="arrow" size={18} color={c.signal} />
      </Pressable>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const { data: profile, isLoading } = useProfile();
  if (!DEMO && !isLoading && profile && !profile.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <DraftPill />
      <TabList asChild>
        <View style={{ flexDirection: 'row', backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, paddingBottom: ins.bottom, paddingHorizontal: 8 }}>
          <TabTrigger name="index" href="/" asChild><TabButton label="Wardrobe" /></TabTrigger>
          <TabTrigger name="lookbook" href="/lookbook" asChild><TabButton label="Lookbook" /></TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild><TabButton label="Explore" /></TabTrigger>
          <TabTrigger name="you" href="/you" asChild><TabButton label="You" /></TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}
