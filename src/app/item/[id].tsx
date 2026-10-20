import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { ItemImage } from '@/components/ItemImage';
import { LookCollage } from '@/components/LookCollage';
import { PieceStrip } from '@/components/PieceStrip';
import { Menu, Sheet, toast } from '@/components/sheet';
import { Button, Chip, Empty, Field, IconButton, Label, Pips, Press, Section, Shimmer, Spec, Thinking, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { items as itemsApi, wishlist } from '@/lib/data';
import { itemTitle, pad3, processingLabel, slotLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItem, useItems, useItemUsage, useLooks, usePairings, useProfile, useSignedUrl, useUpdateItem } from '@/lib/queries';
import { LAUNDRY_STATES, SUBTYPE_MAP } from '@/lib/taxonomy';
import type { Item, WearMode } from '@/lib/types';
import { useDraft } from '@/state/draft';
import { space, useTheme } from '@/theme';

type View3 = 'front' | 'back' | 'side';

function FlipPage({ index, x, width, children }: { index: number; x: SharedValue<number>; width: number; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const p = (x.value - index * width) / width;
    return {
      opacity: interpolate(Math.abs(p), [0, 0.6, 1], [1, 0.4, 0], Extrapolation.CLAMP),
      transform: [{ perspective: 1000 }, { rotateY: `${interpolate(p, [-1, 0, 1], [70, 0, -70], Extrapolation.CLAMP)}deg` }, { scale: interpolate(Math.abs(p), [0, 1], [1, 0.86], Extrapolation.CLAMP) }],
    };
  });
  return <Animated.View style={[{ width, height: '100%' }, a]}>{children}</Animated.View>;
}

function RawPhoto({ path }: { path: string }) {
  const { c } = useTheme();
  const { data: url } = useSignedUrl(path);
  return url ? <Image source={{ uri: url }} style={{ width: 84, height: 112, backgroundColor: c.surfaceAlt }} contentFit="cover" /> : <Shimmer style={{ width: 84, height: 112 }} />;
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { data: item } = useItem(id);
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const { data: looks = [] } = useLooks();
  const { data: profile } = useProfile();
  const { data: pairings, isLoading: pairLoading, error: pairErr, refetch: refetchPairs, isRefetching: pairRefetching } = usePairings(item?.status === 'ready' ? id : undefined);
  const update = useUpdateItem();
  const draft = useDraft();
  const [mode, setMode] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [modeSheet, setModeSheet] = useState<WearMode | null>(null);
  const [modeDesc, setModeDesc] = useState('');
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { x.value = e.contentOffset.x; });
  const [page, setPage] = useState(0);

  const views = useMemo<View3[]>(() => {
    if (!item) return [];
    const order: View3[] = SUBTYPE_MAP[item.subtype ?? '']?.kind === 'shoe' ? ['side', 'front'] : ['front', 'back', 'side'];
    return order.filter((v) => item.images?.[v]);
  }, [item]);

  const inLooks = useMemo(() => looks.filter((l) => l.look_items?.some((li) => li.item_id === id)), [looks, id]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);

  if (!item) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const st = SUBTYPE_MAP[item.subtype ?? ''];
  const heroH = Math.min(height * 0.56, width * 1.25);
  const proc = processingLabel(item);
  const laundryOn = !!profile?.preferences?.laundry_tracking;
  const modes = item.wear_modes ?? [];

  const startLook = () => { draft.start({ item_ids: [item.id], modes: mode ? { [item.id]: mode } : undefined }); router.push('/builder'); };
  const confirmMode = async () => {
    if (!modeSheet) return;
    const next = modes.map((m) => (m.key === modeSheet.key ? { ...m, description: modeDesc, status: 'queued' as const } : m));
    await update.mutateAsync({ id: item.id, patch: { wear_modes: next } });
    await api.processItem(item.id, 'mode', { mode: modeSheet.key });
    setModeSheet(null);
    toast(`Shooting "${modeSheet.label}" — about 20 seconds`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + ins.bottom }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ height: heroH + ins.top, paddingTop: ins.top, backgroundColor: c.paper }}>
          {views.length ? (
            <Animated.ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => { const p = Math.round(e.nativeEvent.contentOffset.x / width); if (p !== page) { haptic.tick(); setPage(p); } }}>
              {views.map((v, i) => (
                <FlipPage key={v} index={i} x={x} width={width}>
                  <ItemImage item={item} view={v === 'front' || v === 'side' ? (mode ? undefined : v) : v} mode={i === 0 ? mode : null} style={{ flex: 1, margin: space.xl, marginTop: 56 }} transition={300} />
                </FlipPage>
              ))}
            </Animated.ScrollView>
          ) : (
            <ItemImage item={item} style={{ flex: 1, margin: space.xl, marginTop: 56 }} />
          )}
          <View style={{ position: 'absolute', top: ins.top + 4, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconButton name="back" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row' }}>
              <IconButton name={item.favourite ? 'heartFill' : 'heart'} color={item.favourite ? c.signal : c.ink} onPress={() => update.mutate({ id: item.id, patch: { favourite: !item.favourite } })} />
              <IconButton name="more" onPress={() => setMenu(true)} />
            </View>
          </View>
          {views.length > 1 ? (
            <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 14 }}>
              {views.map((v, i) => <Label key={v} color={i === page ? c.ink : c.faint}>{v}</Label>)}
            </View>
          ) : null}
          {proc ? <View style={{ position: 'absolute', bottom: 14, left: space.lg }}><Thinking label={proc} /></View> : null}
        </View>

        {/* Wear modes */}
        {modes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: 8 }}>
            {modes.map((m) => {
              const ready = m.status === 'base' || m.status === 'ready';
              const busy = m.status === 'queued' || m.status === 'rendering';
              const on = (mode ?? modes[0].label) === m.label;
              return (
                <Chip key={m.key} label={busy ? `${m.label} · shooting` : m.label} icon={ready ? undefined : busy ? undefined : 'plus'} active={ready && on}
                  onPress={() => {
                    if (ready) { setMode(m.status === 'base' ? null : m.label); x.value = 0; }
                    else if (!busy) { setModeDesc(m.description); setModeSheet(m); }
                  }} />
              );
            })}
          </ScrollView>
        ) : null}

        {/* Title block */}
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Label>{pad3(item.number)}</Label>
            <Label>·</Label>
            <Label>{slotLabel(item.slot)}</Label>
            {usage[item.id] ? null : <Label color={c.signal}>· Never styled</Label>}
          </View>
          <Txt v="title" style={{ fontSize: 26, lineHeight: 30 }}>{itemTitle(item)}</Txt>
          {item.brand ? <Txt v="label" color={c.inkSoft} style={{ fontSize: 12 }}>{item.brand}</Txt> : null}
          {item.description ? <Txt v="body" color={c.inkSoft} style={{ marginTop: 6 }}>{item.description}</Txt> : null}
        </View>

        {/* Spec sheet */}
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <Spec label="Type">{st?.label ?? '—'}</Spec>
          <Spec label="Colour">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {(item.colours ?? []).map((cc) => <View key={cc.hex + cc.name} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: cc.hex, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }} />)}
              <Txt v="small">{item.colour_name ?? '—'}</Txt>
            </View>
          </Spec>
          {item.pattern && item.pattern !== 'Solid' ? <Spec label="Pattern">{item.pattern}</Spec> : null}
          <Spec label="Material">{item.materials?.length ? item.materials.join(', ') : '—'}</Spec>
          <Spec label="Size">{[item.size, item.fit].filter(Boolean).join(' · ') || '—'}</Spec>
          {item.fit_notes ? <Spec label="Fit notes">{item.fit_notes}</Spec> : null}
          <Spec label="Warmth"><Pips value={item.warmth} /></Spec>
          <Spec label="Formality"><Pips value={item.formality} /></Spec>
          <Spec label="Seasons">{item.seasons?.length ? item.seasons.join(', ') : '—'}</Spec>
          {item.tags?.length ? (
            <Spec label="Tags">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {item.tags.map((t) => <View key={t} style={{ borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 7, paddingVertical: 2 }}><Label style={{ fontSize: 9.5 }}>{t}</Label></View>)}
              </View>
            </Spec>
          ) : null}
          {item.location ? <Spec label="Lives in">{item.location}</Spec> : null}
          {laundryOn ? (
            <Spec label="Status">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {LAUNDRY_STATES.map((l) => <Chip key={l.key} small label={l.label} active={item.laundry === l.key} onPress={() => update.mutate({ id: item.id, patch: { laundry: l.key } })} />)}
              </ScrollView>
            </Spec>
          ) : null}
          {item.care ? <Spec label="Care">{item.care}</Spec> : null}
          {item.notes ? <Spec label="Notes">{item.notes}</Spec> : null}
        </View>

        {/* Pairings */}
        <Section title="Pairs with" right={pairings ? <Press onPress={() => refetchPairs()} hapticOn="tick"><Label>{pairRefetching ? 'Thinking…' : 'Refresh'}</Label></Press> : null}>
          {item.status !== 'ready' ? (
            <Txt v="small" color={c.muted} style={{ paddingHorizontal: space.lg }}>Pairings arrive once the piece is catalogued.</Txt>
          ) : pairLoading ? (
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              <Thinking label="Asking the stylist" />
              <View style={{ flexDirection: 'row', gap: space.md }}>{[0, 1, 2].map((i) => <Shimmer key={i} style={{ width: 112, height: 130 }} />)}</View>
            </View>
          ) : pairErr ? (
            <View style={{ paddingHorizontal: space.lg, gap: 8 }}>
              <Txt v="small" color={c.muted}>The stylist couldn't be reached.</Txt>
              <Button small kind="secondary" label="Try again" onPress={() => refetchPairs()} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : pairings ? (
            <Animated.View entering={FadeIn} style={{ gap: space.lg }}>
              <Txt v="editorialSm" style={{ paddingHorizontal: space.lg }}>{pairings.headline}</Txt>
              {pairings.groups.map((g) => {
                const its = g.picks.map((p) => byId.get(p.item_id)).filter(Boolean) as Item[];
                if (!its.length) return null;
                return (
                  <View key={g.slot} style={{ gap: space.sm }}>
                    <Label style={{ paddingHorizontal: space.lg }}>{slotLabel(g.slot)}</Label>
                    <PieceStrip items={its} notes={Object.fromEntries(g.picks.map((p) => [p.item_id, p.why]))}
                      onPress={(it) => router.push({ pathname: '/item/[id]', params: { id: it.id } })} />
                  </View>
                );
              })}
              {pairings.missing?.length ? (
                <View style={{ marginHorizontal: space.lg, borderWidth: 1, borderColor: c.lineStrong, padding: space.md, gap: 8 }}>
                  <Label color={c.signal}>Would unlock this piece</Label>
                  {pairings.missing.map((m) => (
                    <View key={m.title} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Txt v="smallMedium">{m.title}</Txt>
                        <Txt v="small" color={c.muted}>{m.why}</Txt>
                      </View>
                      <IconButton name="plus" size={34} iconSize={18} onPress={async () => {
                        await wishlist.add({ title: m.title, slot: m.slot, subtype: m.subtype ?? null, colour: m.colour ?? null, reason: m.why, pairs_with: [item.id] });
                        queryClient.invalidateQueries({ queryKey: qk.wishlist });
                        toast('Added to wishlist', { label: 'View', onPress: () => router.push('/wishlist') });
                      }} />
                    </View>
                  ))}
                </View>
              ) : null}
            </Animated.View>
          ) : null}
        </Section>

        {/* In looks */}
        <Section title={`In ${inLooks.length} ${inLooks.length === 1 ? 'look' : 'looks'}`}>
          {inLooks.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
              {inLooks.map((l) => {
                const its = (l.look_items ?? []).map((li) => byId.get(li.item_id)).filter(Boolean) as Item[];
                return (
                  <Press key={l.id} onPress={() => router.push({ pathname: '/look/[id]', params: { id: l.id } })} style={{ width: 150 }}>
                    <LookCollage items={its} positions={l.canvas?.pieces} width={150} height={190} />
                    <Txt v="editorialSm" numberOfLines={1} style={{ marginTop: 6, fontSize: 17 }}>{l.name ?? 'Untitled look'}</Txt>
                  </Press>
                );
              })}
            </ScrollView>
          ) : (
            <Txt v="small" color={c.muted} style={{ paddingHorizontal: space.lg }}>Not in a look yet. Fix that below.</Txt>
          )}
        </Section>

        {/* Raw photos */}
        {Object.values(item.photos ?? {}).length ? (
          <Section title="Original photos">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8 }}>
              {Object.entries(item.photos).map(([k, p]) => (
                <View key={k} style={{ gap: 4 }}>
                  <RawPhoto path={p!} />
                  <Label>{k}</Label>
                </View>
              ))}
            </ScrollView>
          </Section>
        ) : null}
        {item.status === 'failed' || item.processing?.last_error ? (
          <View style={{ margin: space.lg }}>
            <Empty title="The studio struggled with this one." body="Try regenerating the photos, or retake them in better light." />
          </View>
        ) : null}
      </ScrollView>

      {/* Action bar */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: ins.bottom + 10, paddingTop: 10, paddingHorizontal: space.lg, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, flexDirection: 'row', gap: 8 }}>
        <Button label="Start a look" icon="layers" onPress={startLook} style={{ flex: 1.4 }} />
        <Button kind="secondary" label="Mix" icon="shuffle" onPress={() => router.push({ pathname: '/mixer', params: { lock: item.id } })} style={{ flex: 1 }} />
        <IconButton name="spark" size={50} bg={c.signal} color={c.signalInk} onPress={() => router.push({ pathname: '/ask', params: { focus: item.id } })} accessibilityLabel="Ask the stylist" />
      </View>

      <Menu visible={menu} onClose={() => setMenu(false)} title={itemTitle(item)} actions={[
        { label: 'Edit details', icon: 'edit', onPress: () => router.push({ pathname: '/edit/[id]', params: { id: item.id } }) },
        ...(draft.active && !draft.pieces.some((p) => p.item_id === item.id) ? [{ label: 'Add to draft look', icon: 'plus' as const, onPress: () => { draft.add(item.id, mode); toast('Added to your draft', { label: 'Open', onPress: () => router.push('/builder') }); } }] : []),
        { label: 'Reshoot product photos', icon: 'camera', hint: 'Regenerates the studio shots from your original photos', onPress: async () => { for (const v of views.length ? views : ['front' as View3]) await api.processItem(item.id, 'view', { view: v }); toast('Back in the studio — give it a minute'); } },
        { label: 'Reshoot in high quality', icon: 'wand', hint: 'Slower, more faithful to fine details and logos', onPress: async () => { for (const v of views.length ? views : ['front' as View3]) await api.processItem(item.id, 'view', { view: v, model: 'gemini-3-pro-image' }); toast('High-quality reshoot started'); } },
        ...(laundryOn ? [{ label: 'Wore it today', icon: 'check' as const, onPress: async () => { await itemsApi.markWorn([item.id]); toast('Logged'); } }] : []),
        { label: 'Remove from wardrobe', icon: 'trash', danger: true, onPress: async () => { await itemsApi.archive(item.id); queryClient.setQueryData<Item[]>(qk.items, (p) => p?.filter((i) => i.id !== item.id)); router.back(); toast('Removed'); } },
      ]} />

      <Sheet visible={!!modeSheet} onClose={() => setModeSheet(null)} title={modeSheet?.label}
        footer={<Button label="Shoot this way of wearing it" icon="camera" onPress={confirmMode} loading={update.isPending} />}>
        <Txt v="small" color={c.muted} style={{ marginBottom: space.md }}>Describe exactly how it should look. The studio follows this to the letter, so be specific — it avoids wasted reshoots.</Txt>
        <Field label="Description" value={modeDesc} onChangeText={setModeDesc} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
      </Sheet>
    </View>
  );
}
