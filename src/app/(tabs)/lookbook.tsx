import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { ItemPicker } from '@/components/ItemPicker';
import { LookCollage } from '@/components/LookCollage';
import { RenderImage } from '@/components/RenderImage';
import { Button, Chip, Empty, IconButton, Label, Press, Screen, Txt } from '@/components/ui';
import { relTime } from '@/lib/format';
import { useItems, useLooks, useRecentRenders } from '@/lib/queries';
import type { Item, Look } from '@/lib/types';
import { useDraft } from '@/state/draft';
import { space, useTheme } from '@/theme';

type FilterKey = 'all' | 'fav' | 'stylist' | 'renders' | string;

export default function Lookbook() {
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: looks = [], refetch, isRefetching, isLoading } = useLooks();
  const { data: all = [] } = useItems();
  const { data: renders = [] } = useRecentRenders();
  const draft = useDraft();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [pick, setPick] = useState(false);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const coverFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of renders) if (r.look_id && r.status === 'done' && r.image_path && !m.has(r.look_id)) m.set(r.look_id, r.image_path);
    return m;
  }, [renders]);
  const occasions = useMemo(() => Array.from(new Set(looks.map((l) => l.occasion).filter(Boolean) as string[])).slice(0, 8), [looks]);
  const list = useMemo(() => looks.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'fav') return l.favourite;
    if (filter === 'stylist') return l.source === 'stylist' || l.source === 'complete';
    if (filter === 'renders') return coverFor.has(l.id);
    return l.occasion === filter;
  }), [looks, filter, coverFor]);

  const colW = (width - space.lg * 2 - space.md) / 2;

  const card = (l: Look, i: number) => {
    const its = (l.look_items ?? []).sort((a, b) => a.ord - b.ord).map((li) => byId.get(li.item_id)).filter(Boolean) as Item[];
    const modes = Object.fromEntries((l.look_items ?? []).map((li) => [li.item_id, li.wear_mode]));
    const cover = coverFor.get(l.id);
    const h = colW * (i % 3 === 0 ? 1.5 : 1.28);
    return (
      <Press onPress={() => router.push({ pathname: '/look/[id]', params: { id: l.id } })} scaleTo={0.97} style={{ width: colW, marginBottom: space.lg }}>
        {cover ? (
          <View>
            <RenderImage path={cover} style={{ width: colW, height: h }} />
            <View style={{ position: 'absolute', right: 6, bottom: 6, width: colW * 0.36, height: colW * 0.46, backgroundColor: c.paper, borderWidth: 1, borderColor: c.ink }}>
              <LookCollage items={its} positions={l.canvas?.pieces} modes={modes} width={colW * 0.36 - 2} height={colW * 0.46 - 2} />
            </View>
          </View>
        ) : (
          <LookCollage items={its} positions={l.canvas?.pieces} modes={modes} width={colW} height={h} />
        )}
        <View style={{ paddingTop: 8, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label>{its.length} pieces{l.occasion ? ` · ${l.occasion}` : ''}</Label>
            {l.favourite ? <Label color={c.signal}>★</Label> : null}
          </View>
          <Txt v="editorialSm" numberOfLines={2}>{l.name ?? 'Untitled look'}</Txt>
          <Label color={c.faint}>{l.source === 'stylist' ? 'Stylist' : l.source === 'mixer' ? 'Mixer' : 'Yours'} · {relTime(l.updated_at)}</Label>
        </View>
      </Press>
    );
  };

  return (
    <Screen>
      <FlashList
        data={list}
        numColumns={2}
        masonry
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={c.ink} />}
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
                <Label>{looks.length} looks</Label>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <IconButton name="shuffle" onPress={() => router.push('/mixer')} accessibilityLabel="Open the mixer" />
                  <IconButton name="plus" bg={c.ink} color={c.bg} onPress={() => setPick(true)} accessibilityLabel="New look" />
                </View>
              </View>
              <Txt v="display">Lookbook</Txt>
            </View>
            <Press onPress={() => router.push('/mixer')} scaleTo={0.98} style={{ marginHorizontal: space.lg, marginTop: space.md, backgroundColor: c.ink, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Label color={c.signal}>The mixer</Label>
                <Txt v="heading" color={c.bg}>Spin every rail. Lock what you love. Shake for luck.</Txt>
              </View>
              <Txt v="display" color={c.bg} style={{ fontSize: 40, lineHeight: 42 }}>→</Txt>
            </Press>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8, paddingVertical: space.lg }}>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Favourites" active={filter === 'fav'} onPress={() => setFilter('fav')} />
              <Chip label="Stylist" active={filter === 'stylist'} onPress={() => setFilter('stylist')} />
              <Chip label="Seen on me" active={filter === 'renders'} onPress={() => setFilter('renders')} />
              {occasions.map((o) => <Chip key={o} label={o} active={filter === o} onPress={() => setFilter(o)} />)}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={isLoading ? null : (
          <Empty title={looks.length ? 'None of those yet.' : 'No looks yet.'} body="Start from any piece, spin the mixer, or ask the stylist for three." action={<Button label="Start a look" icon="plus" onPress={() => setPick(true)} />} />
        )}
        renderItem={({ item, index }) => (
          <View style={{ paddingLeft: index % 2 === 0 ? space.lg : space.md / 2, paddingRight: index % 2 === 1 ? space.lg : space.md / 2 }}>{card(item, index)}</View>
        )}
      />
      <ItemPicker visible={pick} onClose={() => setPick(false)} title="Pick your first piece" multi={false}
        onPick={(its) => { if (its[0]) { draft.start({ item_ids: [its[0].id] }); router.push('/builder'); } }} />
    </Screen>
  );
}
