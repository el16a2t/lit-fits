// A look proposed by the stylist (chat, completion, packing): pieces, reasoning, missing pieces and actions.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { api } from '@/lib/api';
import { signal, wishlist } from '@/lib/data';
import { haptic } from '@/lib/haptics';
import { sortBySlot } from '@/lib/outfit';
import { qk, queryClient, useItems, useSaveLook } from '@/lib/queries';
import type { Item, StylistLook } from '@/lib/types';
import { useDraft } from '@/state/draft';
import { space, useTheme } from '@/theme';
import { Icon } from './icons';
import { LookCollage } from './LookCollage';
import { PieceStrip } from './PieceStrip';
import { toast } from './sheet';
import { Button, IconButton, Label, Press, Txt } from './ui';

export function LookCard({ look, index = 0, prompt, source = 'stylist', compact }: { look: StylistLook; index?: number; prompt?: string; source?: 'stylist' | 'complete' | 'pack'; compact?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const save = useSaveLook();
  const draft = useDraft();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const [wished, setWished] = useState<string[]>([]);
  const pieces = useMemo(() => sortBySlot(look.items.map((li) => ({ ...all.find((i) => i.id === li.item_id)!, _li: li })).filter((x) => x.id)) as (Item & { _li: StylistLook['items'][number] })[], [look, all]);
  const modes = Object.fromEntries(look.items.map((li) => [li.item_id, li.mode]));
  const notes = Object.fromEntries(look.items.map((li) => [li.item_id, li.note]));

  const persist = async () => {
    if (savedId) return savedId;
    const l = await save.mutateAsync({
      name: look.title, rationale: look.why + (look.styling ? ` ${look.styling}` : ''), occasion: look.occasion ?? null, source, prompt: prompt ?? null,
      pieces: pieces.map((p) => ({ item_id: p.id, wear_mode: p._li.mode ?? null, note: p._li.note ?? null, slot: p.slot })),
    });
    setSavedId(l.id);
    return l.id;
  };

  const collageW = width - space.lg * 2;
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify().damping(18)} style={{ borderWidth: 1, borderColor: c.ink, backgroundColor: c.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.md, paddingTop: space.md }}>
        <Label>Look {String(index + 1).padStart(2, '0')}{look.occasion ? ` · ${look.occasion}` : ''}</Label>
        <View style={{ flexDirection: 'row' }}>
          <IconButton name="thumbUp" size={32} iconSize={17} color={vote === 1 ? c.signal : c.muted} onPress={() => { setVote(1); signal('like', { item_ids: look.items.map((i) => i.item_id), text: look.title }); }} />
          <IconButton name="thumbDown" size={32} iconSize={17} color={vote === -1 ? c.signal : c.muted} onPress={() => { setVote(-1); signal('dislike', { item_ids: look.items.map((i) => i.item_id), text: look.title }); }} />
        </View>
      </View>
      <Txt v="editorial" style={{ paddingHorizontal: space.md, marginTop: 2 }}>{look.title}</Txt>
      {!compact ? (
        <Press onPress={() => { draft.start({ item_ids: pieces.map((p) => p.id), modes, notes, name: look.title, source, rationale: look.why, prompt }); router.push('/builder'); }} scaleTo={0.99} style={{ marginTop: space.md }}>
          <LookCollage items={pieces} modes={modes} width={collageW - 2} height={Math.min(380, collageW * 1.05)} bg={c.paper} />
        </Press>
      ) : null}
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md, gap: 6 }}>
        <Txt v="body" color={c.inkSoft}>{look.why}</Txt>
        {look.styling ? <Txt v="small" color={c.muted}>{look.styling}</Txt> : null}
      </View>
      <View style={{ marginTop: space.md, marginHorizontal: -space.lg + space.md }}>
        <PieceStrip items={pieces} size={86} notes={notes} modes={modes} onPress={(it) => router.push({ pathname: '/item/[id]', params: { id: it.id } })} />
      </View>
      {look.missing?.length ? (
        <View style={{ margin: space.md, marginBottom: 0, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, gap: 8 }}>
          <Label color={c.signal}>Missing piece</Label>
          {look.missing.map((m) => (
            <View key={m.title} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Txt v="smallMedium">{m.title}</Txt>
                <Txt v="small" color={c.muted}>{m.why}</Txt>
              </View>
              {wished.includes(m.title) ? <Icon name="check" size={18} color={c.success} /> : (
                <Button small kind="secondary" label="Wishlist" icon="plus" onPress={async () => {
                  await wishlist.add({ title: m.title, slot: m.slot, subtype: m.subtype ?? null, colour: m.colour ?? null, reason: m.why, pairs_with: look.items.map((i) => i.item_id), look: { title: look.title, item_ids: look.items.map((i) => i.item_id) } as any });
                  setWished((w) => [...w, m.title]);
                  queryClient.invalidateQueries({ queryKey: qk.wishlist });
                  haptic.success();
                }} />
              )}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, padding: space.md }}>
        <Button small kind={savedId ? 'secondary' : 'primary'} label={savedId ? 'Saved' : 'Save'} icon={savedId ? 'check' : 'plus'} loading={save.isPending}
          onPress={async () => { const id = await persist(); haptic.success(); toast('Saved to lookbook', { label: 'Open', onPress: () => router.push({ pathname: '/look/[id]', params: { id } }) }); }} style={{ flex: 1 }} />
        <Button small kind="secondary" label="Edit" icon="layers" onPress={() => { draft.start({ item_ids: pieces.map((p) => p.id), modes, notes, name: look.title, source, rationale: look.why, prompt }); router.push('/builder'); }} style={{ flex: 1 }} />
        <Button small kind="signal" label="On me" icon="person" onPress={async () => {
          const id = await persist();
          const r = await api.render({ look_id: id, items: look.items.map((i) => ({ item_id: i.item_id, mode: i.mode, note: i.note })) });
          router.push({ pathname: '/render/[id]', params: { id: r.id } });
        }} style={{ flex: 1 }} />
      </View>
    </Animated.View>
  );
}
