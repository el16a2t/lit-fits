import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FilterSheet } from '@/components/FilterSheet';
import { Icon } from '@/components/icons';
import { ItemCard, ItemRow } from '@/components/ItemCard';
import { Menu, toast, type MenuAction } from '@/components/sheet';
import { Button, Chip, Empty, IconButton, Label, Screen, Txt } from '@/components/ui';
import { items as itemsApi } from '@/lib/data';
import { activeCount, applyFilter, emptyFilter, sortItems, type ItemFilter } from '@/lib/filters';
import { itemTitle } from '@/lib/format';
import { qk, queryClient, useItems, useItemUsage, useProfile } from '@/lib/queries';
import { SLOTS, type Slot } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { useCapture } from '@/state/capture';
import { useDraft } from '@/state/draft';
import { usePrefs } from '@/state/prefs';
import { space, type as T, useTheme } from '@/theme';

const QUICK: (Slot | 'all')[] = ['all', 'outer', 'mid', 'base', 'bottom', 'feet', 'head', 'accessory'];

export default function Wardrobe() {
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: all = [], isLoading, refetch, isRefetching } = useItems();
  const { data: usage = {} } = useItemUsage();
  const { data: profile } = useProfile();
  const { wardrobeView, gridCols, sort, set: setPrefs } = usePrefs();
  const [filter, setFilter] = useState<ItemFilter>(emptyFilter());
  const [showFilters, setShowFilters] = useState(false);
  const [menuFor, setMenuFor] = useState<Item | null>(null);
  const [searching, setSearching] = useState(false);
  const draft = useDraft();
  const reviewIds = useCapture((s) => s.reviewIds);
  const queue = useCapture((s) => s.queue);
  const laundryOn = !!profile?.preferences?.laundry_tracking;

  const list = useMemo(() => sortItems(applyFilter(all, filter, usage), sort, usage), [all, filter, usage, sort]);
  const nFilters = activeCount(filter) - filter.slots.length;
  const slotCounts = useMemo(() => {
    const m: Record<string, number> = { all: all.length };
    for (const i of all) if (i.slot) m[i.slot] = (m[i.slot] ?? 0) + 1;
    return m;
  }, [all]);
  const never = useMemo(() => all.filter((i) => !usage[i.id]).length, [all, usage]);

  const colW = (width - space.lg * 2 - space.md * (gridCols - 1)) / gridCols;

  const actions = (it: Item): MenuAction[] => [
    { label: 'Start a look with this', icon: 'layers', onPress: () => { draft.start({ item_ids: [it.id] }); router.push('/builder'); } },
    ...(draft.active && !draft.pieces.some((p) => p.item_id === it.id)
      ? [{ label: 'Add to draft look', icon: 'plus' as const, onPress: () => { draft.add(it.id); toast(`Added to your draft · ${draft.pieces.length + 1} pieces`, { label: 'Open', onPress: () => router.push('/builder') }); } }]
      : []),
    { label: 'Mix around it', icon: 'shuffle', onPress: () => router.push({ pathname: '/mixer', params: { lock: it.id } }) },
    { label: 'Ask the stylist', icon: 'spark', onPress: () => router.push({ pathname: '/ask', params: { focus: it.id } }) },
    ...(laundryOn
      ? [
        { label: it.laundry === 'clean' ? 'Mark as in the wash' : 'Mark as clean', icon: 'refresh' as const, onPress: async () => {
          const next = it.laundry === 'clean' ? 'wash' : 'clean';
          await itemsApi.setLaundry([it.id], next);
          queryClient.setQueryData<Item[]>(qk.items, (p) => p?.map((x) => (x.id === it.id ? { ...x, laundry: next } : x)));
        } },
      ]
      : []),
    { label: 'Edit details', icon: 'edit', onPress: () => router.push({ pathname: '/edit/[id]', params: { id: it.id } }) },
  ];

  const header = (
    <View>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
          <Label>{all.length} pieces{never ? ` · ${never} never styled` : ''}</Label>
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="search" onPress={() => setSearching((s) => !s)} />
            <IconButton name={wardrobeView === 'grid' ? 'list' : 'grid'} onPress={() => setPrefs({ wardrobeView: wardrobeView === 'grid' ? 'list' : 'grid' })} onLongPress={() => setPrefs({ gridCols: gridCols === 2 ? 3 : 2 })} />
            <IconButton name="plus" onPress={() => router.push('/capture')} bg={c.ink} color={c.bg} style={{ marginLeft: 6 }} accessibilityLabel="Add a piece" />
          </View>
        </View>
        <Txt v="display">Wardrobe</Txt>
      </View>

      {searching || filter.q ? (
        <Animated.View entering={FadeIn} style={{ marginHorizontal: space.lg, marginTop: space.sm, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.ink, gap: 8 }}>
          <Icon name="search" size={18} />
          <TextInput
            autoFocus
            value={filter.q}
            onChangeText={(q) => setFilter({ ...filter, q })}
            placeholder="Olive, linen, #12, Arc'teryx…"
            placeholderTextColor={c.faint}
            style={[T.body, { flex: 1, color: c.ink, height: 44 }]}
            returnKeyType="search"
          />
          {filter.q ? <IconButton name="close" size={32} iconSize={16} onPress={() => setFilter({ ...filter, q: '' })} /> : null}
        </Animated.View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8, paddingVertical: space.md }}>
        <Chip label={nFilters ? `Filters · ${nFilters}` : 'Filter'} icon="filter" active={nFilters > 0} onPress={() => setShowFilters(true)} />
        {QUICK.map((s) => {
          const on = s === 'all' ? filter.slots.length === 0 : filter.slots.length === 1 && filter.slots[0] === s;
          const label = s === 'all' ? 'All' : SLOTS.find((x) => x.key === s)!.label;
          if (s !== 'all' && !slotCounts[s]) return null;
          return <Chip key={s} label={label} count={slotCounts[s]} active={on} onPress={() => setFilter({ ...filter, slots: s === 'all' ? [] : [s] })} />;
        })}
      </ScrollView>

      {reviewIds.length || queue.length ? (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: c.ink, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label color={c.signal}>{queue.length ? `Uploading ${queue.length}` : 'New pieces'}</Label>
            <Txt v="small">{reviewIds.length ? `${reviewIds.length} ${reviewIds.length === 1 ? 'piece is' : 'pieces are'} being catalogued. Give them a once-over.` : 'Sending photos to the studio…'}</Txt>
          </View>
          {reviewIds.length ? <Button small label="Review" onPress={() => router.push('/review')} /> : null}
        </View>
      ) : null}
    </View>
  );

  const empty = isLoading ? null : all.length === 0 ? (
    <Empty
      title="Nothing here yet. Very minimal of you."
      body="Lay a piece flat in good light, shoot the front and back, and the studio does the rest — product shot, details, the lot."
      action={<Button label="Add your first piece" icon="camera" onPress={() => router.push('/capture')} />}
    />
  ) : (
    <Empty title="Nothing matches." body="Loosen a filter or two." action={<Button kind="secondary" small label="Clear filters" onPress={() => setFilter(emptyFilter())} />} />
  );

  return (
    <Screen>
      {wardrobeView === 'grid' ? (
        <FlashList
          key={`grid-${gridCols}`}
          data={list}
          masonry
          numColumns={gridCols}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={c.ink} />}
          renderItem={({ item, index }) => (
            <View style={{ paddingLeft: index % gridCols === 0 ? space.lg : space.md / 2, paddingRight: index % gridCols === gridCols - 1 ? space.lg : space.md / 2 }}>
              <ItemCard
                item={item}
                width={colW}
                usage={usage[item.id] ?? 0}
                showLaundry={laundryOn}
                compact={gridCols === 3}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                onLongPress={() => setMenuFor(item)}
              />
            </View>
          )}
        />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={c.ink} />}
          renderItem={({ item }) => (
            <ItemRow item={item} usage={usage[item.id] ?? 0} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} onLongPress={() => setMenuFor(item)} />
          )}
        />
      )}
      <FilterSheet visible={showFilters} onClose={() => setShowFilters(false)} filter={filter} setFilter={setFilter} items={all} resultCount={list.length} />
      <Menu visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? itemTitle(menuFor) : undefined} actions={menuFor ? actions(menuFor) : []} />
    </Screen>
  );
}
