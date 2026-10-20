import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemImage } from '@/components/ItemImage';
import { Button, Chip, Empty, IconButton, Label, Pips, Spec, Thinking, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { itemTitle, pad3, processingLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useItems, useUpdateItem } from '@/lib/queries';
import { SUBTYPE_MAP } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { useCapture } from '@/state/capture';
import { space, useTheme } from '@/theme';

function Page({ item, width, onDone }: { item: Item; width: number; onDone: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const update = useUpdateItem();
  const proc = processingLabel(item);
  const st = SUBTYPE_MAP[item.subtype ?? ''];
  const suggested = (item.wear_modes ?? []).filter((m) => m.status === 'suggested');
  const [pickedModes, setPicked] = useState<string[]>([]);
  const confirm = async () => {
    if (pickedModes.length) {
      await update.mutateAsync({ id: item.id, patch: { wear_modes: item.wear_modes.map((m) => (pickedModes.includes(m.key) ? { ...m, status: 'confirmed' as const } : m)) } });
      for (const k of pickedModes) await api.processItem(item.id, 'mode', { mode: k }).catch(() => {});
    }
    haptic.success();
    onDone();
  };
  return (
    <ScrollView style={{ width }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140 }}>
      <View style={{ height: 380, backgroundColor: c.paper, padding: space.lg }}>
        <ItemImage item={item} style={{ flex: 1 }} />
        {proc ? <View style={{ position: 'absolute', left: 12, bottom: 12 }}><Thinking label={proc} /></View> : null}
      </View>
      <View style={{ paddingTop: space.lg, gap: 4 }}>
        <Label>{pad3(item.number)}</Label>
        <Txt v="title">{item.name ? itemTitle(item) : 'Reading your photos…'}</Txt>
        {item.brand ? <Label color={c.inkSoft}>{item.brand}</Label> : null}
      </View>
      <View style={{ marginTop: space.md }}>
        <Spec label="Type" ai>{st?.label ?? '…'}</Spec>
        <Spec label="Colour" ai>{item.colour_name ?? '…'}</Spec>
        <Spec label="Material" ai>{item.materials?.join(', ') || '…'}</Spec>
        <Spec label="Size" ai>{item.size ?? 'No label read'}</Spec>
        <Spec label="Warmth" ai><Pips value={item.warmth} /></Spec>
        <Spec label="Formality" ai><Pips value={item.formality} /></Spec>
      </View>
      {suggested.length ? (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Label>Also shoot it…</Label>
          <Txt v="small" color={c.muted}>Pick any extra ways you wear it. Each gets its own product shot.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggested.map((m) => (
              <Chip key={m.key} label={m.label} icon={pickedModes.includes(m.key) ? 'check' : 'plus'} active={pickedModes.includes(m.key)}
                onPress={() => setPicked((p) => (p.includes(m.key) ? p.filter((x) => x !== m.key) : [...p, m.key]))} />
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: space.xl }}>
        <Button kind="secondary" label="Fix details" icon="edit" onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id, review: '1' } })} style={{ flex: 1 }} />
        <Button label="Looks right" icon="check" onPress={confirm} loading={update.isPending} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

export default function Review() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const reviewIds = useCapture((s) => s.reviewIds);
  const queue = useCapture((s) => s.queue);
  const doneReview = useCapture((s) => s.doneReview);
  const list = useMemo(() => reviewIds.map((id) => all.find((i) => i.id === id)).filter(Boolean) as Item[], [reviewIds, all]);
  const ref = useRef<FlatList<Item>>(null);
  const [idx, setIdx] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <TopBar left={<IconButton name="close" onPress={() => router.back()} />} center={<Label>{list.length ? `Review · ${Math.min(idx + 1, list.length)} of ${list.length}` : 'Review'}</Label>}
        right={<IconButton name="camera" onPress={() => router.push('/capture')} />} />
      {queue.length ? <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}><Thinking label={`Uploading ${queue.length} more`} /></View> : null}
      {list.length ? (
        <FlatList
          ref={ref}
          data={list}
          horizontal
          pagingEnabled
          keyExtractor={(i) => i.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Page item={item} width={width} onDone={() => {
              doneReview(item.id);
              if (list.length <= 1) router.back();
            }} />
          )}
        />
      ) : (
        <Empty title="All caught up." body={queue.length ? 'Photos are still uploading — they will appear here.' : 'Nothing waiting for review.'} action={<Button label="Back to wardrobe" onPress={() => router.back()} />} />
      )}
    </View>
  );
}
