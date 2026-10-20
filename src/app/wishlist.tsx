import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { shadowStyle } from '@/components/ItemImage';
import { PieceStrip } from '@/components/PieceStrip';
import { Sheet, toast } from '@/components/sheet';
import { Button, Empty, Field, IconButton, Label, Screen, Thinking, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { wishlist } from '@/lib/data';
import { relTime } from '@/lib/format';
import { qk, queryClient, useItems, useWishlist } from '@/lib/queries';
import type { Item, WishlistItem } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Wishlist() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: wishes = [] } = useWishlist();
  const { data: all = [] } = useItems();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', colour: '', reason: '' });
  const [generating, setGenerating] = useState<string[]>([]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const wanted = wishes.filter((w) => w.status === 'wanted');
  const bought = wishes.filter((w) => w.status === 'bought');

  const patch = async (id: string, p: Partial<WishlistItem>) => {
    queryClient.setQueryData<WishlistItem[]>(qk.wishlist, (prev) => prev?.map((w) => (w.id === id ? { ...w, ...p } : w)).filter((w) => w.status !== 'dismissed'));
    await wishlist.update(id, p);
  };

  const card = (w: WishlistItem, i: number) => {
    const pairs = w.pairs_with.map((id) => byId.get(id)).filter(Boolean) as Item[];
    return (
      <Animated.View key={w.id} entering={FadeInDown.delay(i * 60)} style={{ borderTopWidth: 1, borderTopColor: c.ink, paddingVertical: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
          <View style={{ width: 110, height: 130, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' }}>
            {w.concept_url ? (
              <View style={[{ width: 96, height: 116 }, shadowStyle(0.7)]}><Image source={{ uri: w.concept_url }} style={{ flex: 1 }} contentFit="contain" /></View>
            ) : generating.includes(w.id) ? <Thinking label="Sketching" /> : (
              <Button small kind="ghost" label="Visualise" icon="wand" onPress={async () => { setGenerating((g) => [...g, w.id]); await api.wishlistConcept(w.id); toast('Sketching a concept — back in a moment'); setTimeout(() => queryClient.invalidateQueries({ queryKey: qk.wishlist }), 25000); }} />
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>{w.slot ?? 'Piece'}{w.colour ? ` · ${w.colour}` : ''} · {relTime(w.created_at)}</Label>
            <Txt v="heading">{w.title}</Txt>
            {w.reason ? <Txt v="small" color={c.inkSoft}>{w.reason}</Txt> : null}
          </View>
        </View>
        {pairs.length ? (
          <View style={{ gap: 6 }}>
            <Label style={{ paddingHorizontal: space.lg }}>Unlocks</Label>
            <PieceStrip items={pairs} size={70} caption={false} onPress={(it) => router.push({ pathname: '/item/[id]', params: { id: it.id } })} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: space.lg }}>
          <Button small kind="secondary" label="Find it" icon="external" onPress={() => Linking.openURL(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(w.search_query ?? `${w.colour ?? ''} ${w.title} men`)}`)} style={{ flex: 1 }} />
          <Button small kind="secondary" label="Got it" icon="check" onPress={() => { patch(w.id, { status: 'bought' }); toast('Nice. Photograph it when it lands.', { label: 'Add', onPress: () => router.push('/capture') }); }} style={{ flex: 1 }} />
          <IconButton name="trash" size={36} iconSize={18} onPress={() => patch(w.id, { status: 'dismissed' })} />
        </View>
      </Animated.View>
    );
  };

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Wishlist</Label>} right={<IconButton name="plus" onPress={() => setAdding(true)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 6 }}>
          <Txt v="display" style={{ fontSize: 48, lineHeight: 50 }}>Wanted</Txt>
          <Txt v="body" color={c.muted}>Pieces the stylist reckons would unlock what you already own. No brands pushed, no affiliate links — just the gap.</Txt>
        </View>
        {wanted.length ? wanted.map(card) : <Empty title="Nothing on the list." body="When the stylist spots a missing piece — that brown suede boot you don't own — it lands here." />}
        {bought.length ? (
          <View style={{ paddingHorizontal: space.lg, marginTop: space.xl, gap: 6 }}>
            <Label>Bought</Label>
            {bought.map((w) => <Txt key={w.id} v="small" color={c.muted} style={{ textDecorationLine: 'line-through' }}>{w.title}</Txt>)}
          </View>
        ) : null}
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginTop: space.lg }} />
      </ScrollView>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add a want"
        footer={<Button label="Add" disabled={!draft.title} onPress={async () => {
          await wishlist.add({ title: draft.title, colour: draft.colour || null, reason: draft.reason || null, search_query: `${draft.colour} ${draft.title}` });
          queryClient.invalidateQueries({ queryKey: qk.wishlist });
          setDraft({ title: '', colour: '', reason: '' });
          setAdding(false);
        }} />}>
        <View style={{ gap: space.lg }}>
          <Field label="What" value={draft.title} onChangeText={(title) => setDraft((d) => ({ ...d, title }))} placeholder="Suede chukka boots" autoFocus />
          <Field label="Colour" value={draft.colour} onChangeText={(colour) => setDraft((d) => ({ ...d, colour }))} placeholder="Dark brown" />
          <Field label="Why" value={draft.reason} onChangeText={(reason) => setDraft((d) => ({ ...d, reason }))} placeholder="Optional" multiline />
        </View>
      </Sheet>
    </Screen>
  );
}
