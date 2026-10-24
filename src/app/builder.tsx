import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CanvasPiece, type PieceEvents } from '@/components/canvas/CanvasPiece';
import { Icon } from '@/components/icons';
import { ItemPicker } from '@/components/ItemPicker';
import { LookCard } from '@/components/LookCard';
import { LookVerdict } from '@/components/LookVerdict';
import { Menu, Sheet, toast } from '@/components/sheet';
import { Button, Chip, Field, Grain, IconButton, Label, Press, Thinking, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { itemTitle, pad3 } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { autoLayout, lookScore } from '@/lib/outfit';
import { useItems, useSaveLook } from '@/lib/queries';
import type { CanvasPiece as Pos, Item, StylistLook } from '@/lib/types';
import { weatherLine, useWeather } from '@/lib/weather';
import { useDraft } from '@/state/draft';
import { motion, space, useTheme } from '@/theme';

export default function Builder() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const draft = useDraft();
  const { data: all = [] } = useItems();
  const { data: weather } = useWeather();
  const save = useSaveLook();
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; over: boolean } | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; swap?: string }>({ open: false });
  const [completing, setCompleting] = useState(false);
  const [completions, setCompletions] = useState<StylistLook[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const mounted = useRef(new Set<string>());

  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const pieces = draft.pieces.map((p) => ({ ...p, item: byId.get(p.item_id) })).filter((p) => p.item) as (typeof draft.pieces[number] & { item: Item })[];
  const items = pieces.map((p) => p.item);
  const score = lookScore(items);

  // assign positions to pieces without one (new arrivals) using the auto layout
  useEffect(() => {
    const missing = pieces.filter((p) => !p.pos);
    if (!missing.length || !size.W) return;
    const auto = autoLayout(items, size.W / size.H);
    const maxZ = Math.max(0, ...pieces.map((p) => p.pos?.z ?? 0));
    const m: Record<string, Pos> = {};
    missing.forEach((p, i) => { m[p.item_id] = { ...auto[p.item_id], z: maxZ + i + 1 }; });
    draft.setAllPos(m);
  }, [pieces.length, size.W]); // eslint-disable-line react-hooks/exhaustive-deps

  const binTop = size.H - 96;
  const ev: PieceEvents = useMemo(() => ({
    onSelect: (id) => setSelected(id),
    onFront: (id) => {
      const st = useDraft.getState();
      const maxZ = Math.max(0, ...st.pieces.map((p) => p.pos?.z ?? 0));
      const p = st.pieces.find((x) => x.item_id === id);
      if (p?.pos) st.setPos(id, { ...p.pos, z: maxZ + 1 });
    },
    onCommit: (id, pos) => {
      const p = useDraft.getState().pieces.find((x) => x.item_id === id);
      useDraft.getState().setPos(id, { ...pos, z: p?.pos?.z ?? pos.z });
    },
    onDrag: (id, d, over) => setDragging(d ? { id, over } : null),
    onRemove: (id) => { useDraft.getState().remove(id); setSelected(null); toast('Removed from look', { label: 'Undo', onPress: () => useDraft.getState().add(id) }); },
  }), []);

  const tidy = () => {
    haptic.medium();
    const auto = autoLayout(items, size.W / Math.max(1, size.H));
    draft.setAllPos(Object.fromEntries(Object.entries(auto)));
  };

  const doSave = useCallback(async (then?: 'render') => {
    if (!pieces.length) return null;
    let name = draft.name;
    if (!name) {
      try { name = (await api.nameLook(pieces.map((p) => p.item_id))).title; } catch { name = 'Untitled look'; }
    }
    const look = await save.mutateAsync({
      id: draft.lookId, name, occasion: draft.occasion, notes: draft.notes, rationale: draft.rationale, prompt: draft.prompt, source: draft.source,
      pieces: pieces.map((p) => ({ item_id: p.item_id, wear_mode: p.mode ?? null, note: p.note ?? null, slot: p.item.slot })),
      canvas: Object.fromEntries(pieces.filter((p) => p.pos).map((p) => [p.item_id, p.pos!])),
    });
    haptic.success();
    if (then === 'render') {
      draft.setMeta({ lookId: look.id, name });
      const r = await api.render({ look_id: look.id, items: pieces.map((p) => ({ item_id: p.item_id, mode: p.mode ?? undefined, note: p.note ?? undefined })) });
      router.push({ pathname: '/render/[id]', params: { id: r.id } });
      return look;
    }
    draft.clear();
    router.replace({ pathname: '/look/[id]', params: { id: look.id } });
    toast('Saved to lookbook');
    return look;
  }, [pieces, draft, save, router]);

  const complete = async () => {
    setCompleting(true);
    setCompletions([]);
    try {
      const res = await api.complete(pieces.map((p) => p.item_id), undefined, weatherLine(weather));
      setCompletions(res.looks);
    } catch (e: any) {
      setCompletions(null);
      toast(e?.message ?? 'The stylist is busy — try again');
    } finally {
      setCompleting(false);
    }
  };

  const sel = selected ? pieces.find((p) => p.item_id === selected) : null;
  const selModes = sel?.item.wear_modes?.filter((m) => m.status === 'base' || m.status === 'ready') ?? [];
  const binStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(dragging?.over ? 1.15 : 1, motion.springSnappy) }] }));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: ins.top }}>
      {/* top bar */}
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4, zIndex: 50 }}>
        <IconButton name="back" onPress={() => router.back()} />
        <Pressable onPress={() => setNaming(true)} style={{ flex: 1, paddingHorizontal: 4 }}>
          <Label>{draft.lookId ? 'Editing look' : 'New look'} · {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}</Label>
          <Txt v="editorialSm" numberOfLines={1}>{draft.name || 'Untitled — tap to name'}</Txt>
        </Pressable>
        <IconButton name="more" onPress={() => setMenu(true)} />
        <Button small label="Save" onPress={() => doSave()} loading={save.isPending} disabled={!pieces.length} />
      </View>

      {/* canvas */}
      <View style={{ flex: 1 }} onLayout={(e) => setSize({ W: e.nativeEvent.layout.width, H: e.nativeEvent.layout.height })}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
        <Grain opacity={c.grainOpacity * 1.4} />
        {size.W > 0 && pieces.map((p, i) => {
          const isNew = !mounted.current.has(p.item_id);
          if (isNew) mounted.current.add(p.item_id);
          return p.pos ? (
            <CanvasPiece key={p.item_id} item={p.item} mode={p.mode} pos={p.pos} W={size.W} H={size.H} enterDelay={isNew ? i * 90 : 0}
              selected={selected === p.item_id} binTop={binTop} ev={ev} />
          ) : null;
        })}
        {!pieces.length ? (
          <View style={{ position: 'absolute', top: '30%', left: space.xl, right: space.xl, alignItems: 'flex-start', gap: space.md }}>
            <Txt v="editorial">An empty canvas.</Txt>
            <Txt v="body" color={c.muted}>Add a piece to start. Drag to arrange, pinch to resize, two fingers to rotate, double-tap to bring forward. Drop on the bin to remove.</Txt>
            <Button label="Add a piece" icon="plus" onPress={() => setPicker({ open: true })} />
          </View>
        ) : null}

        {/* score + weather chip */}
        {pieces.length >= 2 ? (
          <Animated.View entering={FadeIn} style={{ position: 'absolute', top: 8, left: space.lg, zIndex: 40 }}>
            <LookVerdict items={items} score={score} clashLabel="Clashing a bit" barWidth={40}
              onSwap={(outId, inId) => { draft.replace(outId, inId); setSelected(inId); toast('Swapped in'); }} />
          </Animated.View>
        ) : null}

        {/* bin */}
        {dragging ? (
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(160)} style={[{ position: 'absolute', bottom: 18, alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: dragging.over ? c.danger : c.ink, alignItems: 'center', justifyContent: 'center' }, binStyle]}>
            <Icon name="trash" color={c.bg} />
          </Animated.View>
        ) : null}
      </View>

      {/* selection toolbar */}
      {sel ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut.duration(120)} style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: ins.bottom + 92, backgroundColor: c.bg, borderWidth: 1, borderColor: c.ink, padding: space.md, gap: 10, zIndex: 60 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Label>{pad3(sel.item.number)}</Label>
              <Txt v="smallMedium" numberOfLines={1}>{itemTitle(sel.item)}</Txt>
            </View>
            <IconButton name="eye" size={36} iconSize={18} onPress={() => router.push({ pathname: '/item/[id]', params: { id: sel.item_id } })} />
            <IconButton name="refresh" size={36} iconSize={18} onPress={() => setPicker({ open: true, swap: sel.item_id })} accessibilityLabel="Swap" />
            <IconButton name="trash" size={36} iconSize={18} onPress={() => ev.onRemove(sel.item_id)} />
          </View>
          {selModes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {selModes.map((m) => {
                const on = (sel.mode ?? selModes[0].label) === m.label;
                return <Chip key={m.key} small label={m.label} active={on} onPress={() => draft.setMode(sel.item_id, m.status === 'base' ? null : m.label)} />;
              })}
            </ScrollView>
          ) : null}
        </Animated.View>
      ) : null}

      {/* dock */}
      <View style={{ paddingBottom: ins.bottom + 10, paddingTop: 10, paddingHorizontal: space.lg, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.ink, flexDirection: 'row', gap: 8 }}>
        <Button label="Add" icon="plus" onPress={() => setPicker({ open: true })} style={{ flex: 1 }} />
        <Button kind="secondary" label="Complete" icon="spark" onPress={complete} disabled={!pieces.length} style={{ flex: 1.2 }} />
        <IconButton name="tidy" size={50} bg={c.surfaceAlt} onPress={tidy} accessibilityLabel="Tidy" />
        <IconButton name="person" size={50} bg={c.signal} color={c.signalInk} onPress={() => doSave('render')} accessibilityLabel="See it on me" />
      </View>

      <ItemPicker
        visible={picker.open}
        onClose={() => setPicker({ open: false })}
        title={picker.swap ? 'Swap for…' : 'Add to look'}
        context={items.filter((i) => i.id !== picker.swap)}
        exclude={pieces.map((p) => p.item_id)}
        slot={picker.swap ? byId.get(picker.swap)?.slot ?? null : null}
        multi={!picker.swap}
        onPick={(picked) => {
          if (picker.swap && picked[0]) { draft.replace(picker.swap, picked[0].id); setSelected(picked[0].id); }
          else picked.forEach((p) => draft.add(p.id));
          haptic.success();
        }}
      />

      <Sheet visible={completions !== null} onClose={() => setCompletions(null)} title="Complete the look" full>
        {completing ? <View style={{ paddingVertical: space.xl }}><Thinking label="The stylist is finishing your look" /></View> : null}
        <View style={{ gap: space.lg }}>
          {(completions ?? []).map((l, i) => (
            <View key={i} style={{ gap: 8 }}>
              <LookCard look={l} index={i} source="complete" />
              <Button small kind="secondary" label="Use these pieces here" icon="layers" onPress={() => {
                l.items.forEach((li) => { if (!draft.pieces.some((p) => p.item_id === li.item_id)) draft.add(li.item_id, li.mode); });
                setCompletions(null);
                haptic.success();
              }} />
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet visible={naming} onClose={() => setNaming(false)} title="Name it" footer={<Button label="Done" onPress={() => setNaming(false)} />}>
        <View style={{ gap: space.lg }}>
          <Field label="Name" value={draft.name ?? ''} onChangeText={(name) => draft.setMeta({ name })} placeholder="Leave blank and the stylist will name it" autoFocus />
          <Field label="Occasion" value={draft.occasion ?? ''} onChangeText={(occasion) => draft.setMeta({ occasion })} placeholder="Drinks, office, weekend…" />
          <Field label="Notes" value={draft.notes ?? ''} onChangeText={(notes) => draft.setMeta({ notes })} multiline />
        </View>
      </Sheet>

      <Menu visible={menu} onClose={() => setMenu(false)} title="This look" actions={[
        { label: 'Open in the mixer', icon: 'shuffle', onPress: () => router.push({ pathname: '/mixer', params: { from: 'draft' } }) },
        { label: 'Ask the stylist about it', icon: 'spark', onPress: () => router.push({ pathname: '/ask', params: { focus: pieces.map((p) => p.item_id).join(',') } }) },
        { label: 'Tidy the canvas', icon: 'tidy', onPress: tidy },
        { label: 'Discard draft', icon: 'trash', danger: true, onPress: () => { draft.clear(); router.back(); } },
      ]} />
    </View>
  );
}
