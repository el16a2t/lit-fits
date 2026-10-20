import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemRow } from '@/components/ItemCard';
import { LookCollage } from '@/components/LookCollage';
import { RenderImage } from '@/components/RenderImage';
import { Menu, Sheet, toast } from '@/components/sheet';
import { Button, Chip, Field, IconButton, Label, Press, Section, Thinking, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { items as itemsApi, looks as looksApi } from '@/lib/data';
import { relTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { sortBySlot } from '@/lib/outfit';
import { qk, queryClient, useItems, useLook, useProfile, useRenders, useSaveLook } from '@/lib/queries';
import type { Item, Look } from '@/lib/types';
import { SCENE_OPTIONS } from '@/lib/scenes';
import { useDraft } from '@/state/draft';
import { space, useTheme } from '@/theme';


export default function LookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: look } = useLook(id);
  const { data: all = [] } = useItems();
  const { data: renders = [] } = useRenders(id);
  const { data: profile } = useProfile();
  const save = useSaveLook();
  const draft = useDraft();
  const [menu, setMenu] = useState(false);
  const [renderSheet, setRenderSheet] = useState(false);
  const [scene, setScene] = useState<string>(profile?.render_settings?.scene ?? 'studio');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  const its = useMemo(() => sortBySlot((look?.look_items ?? []).map((li) => all.find((i) => i.id === li.item_id)).filter(Boolean) as Item[]), [look, all]);
  if (!look) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const modes = Object.fromEntries((look.look_items ?? []).map((li) => [li.item_id, li.wear_mode]));
  const notes = Object.fromEntries((look.look_items ?? []).map((li) => [li.item_id, li.note]));
  const done = renders.filter((r) => r.status === 'done' && r.image_path);
  const pending = renders.find((r) => r.status === 'queued' || r.status === 'running');
  const heroH = Math.min(width * 1.32, 560);
  const update = async (patch: Partial<Look>) => {
    queryClient.setQueryData<Look>(qk.look(look.id), { ...look, ...patch });
    await looksApi.update(look.id, patch);
    queryClient.invalidateQueries({ queryKey: qk.looks });
  };

  const startRender = async () => {
    setBusy(true);
    try {
      const r = await api.render({ look_id: look.id, items: (look.look_items ?? []).map((li) => ({ item_id: li.item_id, mode: li.wear_mode ?? undefined, note: li.note ?? undefined })), scene, extra: extra || undefined });
      setRenderSheet(false);
      haptic.success();
      router.push({ pathname: '/render/[id]', params: { id: r.id } });
    } catch (e: any) {
      toast(e?.message ?? 'Could not start the render');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + ins.bottom }}>
        <View style={{ paddingTop: ins.top, backgroundColor: c.paper }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            <LookCollage items={its} positions={look.canvas?.pieces} modes={modes} width={width} height={heroH} small={false} />
            {done.map((r) => (
              <Press key={r.id} onPress={() => router.push({ pathname: '/render/[id]', params: { id: r.id } })} scaleTo={0.99}>
                <RenderImage path={r.image_path} style={{ width, height: heroH }} />
              </Press>
            ))}
          </ScrollView>
          <View style={{ position: 'absolute', top: ins.top + 4, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <IconButton name="back" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row' }}>
              <IconButton name={look.favourite ? 'heartFill' : 'heart'} color={look.favourite ? c.signal : c.ink} onPress={() => update({ favourite: !look.favourite })} />
              <IconButton name="more" onPress={() => setMenu(true)} />
            </View>
          </View>
          {done.length ? <Label style={{ position: 'absolute', bottom: 10, right: space.lg }}>Swipe · {done.length} on you</Label> : null}
          {pending ? <View style={{ position: 'absolute', bottom: 12, left: space.lg }}><Thinking label="Shooting you in it" /></View> : null}
        </View>

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: 6 }}>
          <Label>{its.length} pieces{look.occasion ? ` · ${look.occasion}` : ''} · {look.source === 'stylist' ? 'Stylist' : look.source === 'mixer' ? 'Mixer' : 'Yours'} · {relTime(look.updated_at)}</Label>
          <Txt v="editorial" style={{ fontSize: 34, lineHeight: 36 }}>{look.name ?? 'Untitled look'}</Txt>
          {look.rationale ? <Txt v="body" color={c.inkSoft}>{look.rationale}</Txt> : null}
          {look.notes ? <Txt v="small" color={c.muted}>{look.notes}</Txt> : null}
          {look.worn_count ? <Label color={c.success}>Worn {look.worn_count}×</Label> : null}
        </View>

        <Section title="The pieces">
          {its.map((it) => (
            <ItemRow key={it.id} item={it} onPress={() => router.push({ pathname: '/item/[id]', params: { id: it.id } })}
              right={modes[it.id] || notes[it.id] ? <Label style={{ maxWidth: 110, textAlign: 'right' }}>{[modes[it.id], notes[it.id]].filter(Boolean).join(' · ')}</Label> : undefined} />
          ))}
        </Section>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: ins.bottom + 10, paddingTop: 10, paddingHorizontal: space.lg, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" label="Edit" icon="layers" onPress={() => { draft.loadLook(look); router.push('/builder'); }} style={{ flex: 1 }} />
        <Button kind="signal" label="See it on me" icon="person" onPress={() => setRenderSheet(true)} style={{ flex: 1.6 }} />
      </View>

      <Sheet visible={renderSheet} onClose={() => setRenderSheet(false)} title="See it on me"
        footer={<Button kind="signal" label="Shoot it" icon="camera" onPress={startRender} loading={busy} />}>
        <View style={{ gap: space.lg }}>
          {!profile?.twin?.face_front && !profile?.twin?.base ? (
            <View style={{ borderWidth: 1, borderColor: c.signal, padding: space.md, gap: 8 }}>
              <Txt v="small">You haven't added your face photos yet, so this can't be you.</Txt>
              <Button small label="Set up my twin" onPress={() => { setRenderSheet(false); router.push('/twin'); }} />
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Label>Scene</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SCENE_OPTIONS.map((s) => <Chip key={s.key} label={s.label} active={scene === s.key} onPress={() => setScene(s.key)} />)}
            </View>
          </View>
          <Field label="Direction (optional)" value={extra} onChangeText={setExtra} placeholder="e.g. hands in pockets, walking, overcast" multiline />
          <Txt v="small" color={c.muted}>Takes 20–40 seconds. You can leave — it'll be waiting on the look.</Txt>
        </View>
      </Sheet>

      <Menu visible={menu} onClose={() => setMenu(false)} title={look.name ?? 'Look'} actions={[
        { label: 'Open in the mixer', icon: 'shuffle', onPress: () => { draft.loadLook(look); router.push({ pathname: '/mixer', params: { from: 'draft' } }); } },
        { label: 'Wore it today', icon: 'check', onPress: async () => { await itemsApi.markWorn(its.map((i) => i.id), look.id); queryClient.invalidateQueries({ queryKey: qk.look(look.id) }); toast('Logged — nice choice'); } },
        { label: 'Duplicate', icon: 'stack', onPress: async () => {
          const copy = await save.mutateAsync({ name: `${look.name ?? 'Look'} (copy)`, occasion: look.occasion, notes: look.notes, source: 'manual', pieces: (look.look_items ?? []).map((li) => ({ item_id: li.item_id, wear_mode: li.wear_mode, note: li.note, slot: li.slot })), canvas: look.canvas?.pieces });
          router.replace({ pathname: '/look/[id]', params: { id: copy.id } });
        } },
        { label: 'Ask the stylist to riff on it', icon: 'spark', onPress: () => router.push({ pathname: '/ask', params: { focus: its.map((i) => i.id).join(','), prompt: `Riff on my look "${look.name ?? ''}" — keep the spirit, give me two variations with different pieces.` } }) },
        { label: 'Delete look', icon: 'trash', danger: true, onPress: async () => { await looksApi.remove(look.id); queryClient.invalidateQueries({ queryKey: qk.looks }); router.back(); toast('Deleted'); } },
      ]} />
    </View>
  );
}
