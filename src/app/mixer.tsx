import { Accelerometer } from 'expo-sensors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rail, type RailHandle } from '@/components/mixer/Rail';
import { Menu, toast } from '@/components/sheet';
import { Button, Chip, Grain, IconButton, Label, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { itemTitle } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { lookScore, rankForSlot, targetWarmth } from '@/lib/outfit';
import { useItems, useItemUsage, useSaveLook } from '@/lib/queries';
import { SLOTS, type Slot } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';
import { useWeather } from '@/lib/weather';
import { useDraft } from '@/state/draft';
import { usePrefs } from '@/state/prefs';
import { space, useTheme } from '@/theme';

const ROW_SLOTS: Slot[] = ['head', 'outer', 'mid', 'base', 'bottom', 'feet', 'accessory'];
const WEIGHT: Record<string, number> = { head: 0.62, outer: 1.18, mid: 1.08, base: 1.05, bottom: 1.3, feet: 0.68, accessory: 0.6 };

export default function Mixer() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ lock?: string; from?: string }>();
  const { width, height } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const { data: weather } = useWeather();
  const { mixerSmart, mixerAvailableOnly, set: setPrefs } = usePrefs();
  const draft = useDraft();
  const save = useSaveLook();

  const warmth = targetWarmth(weather?.temp);
  const pool = useMemo(() => all.filter((i) => i.status !== 'draft' && i.cover_url && (!mixerAvailableOnly || ['clean', 'worn'].includes(i.laundry))), [all, mixerAvailableOnly]);
  const bySlot = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const s of ROW_SLOTS) m[s] = pool.filter((i) => i.slot === s);
    return m;
  }, [pool]);

  const lockItem = params.lock ? all.find((i) => i.id === params.lock) : undefined;
  const draftItems = params.from === 'draft' ? draft.pieces.map((p) => all.find((i) => i.id === p.item_id)).filter(Boolean) as Item[] : [];

  // visible rows: weather + content aware defaults, user can add/remove
  const [visible, setVisible] = useState<Slot[]>(() => {
    const cold = (warmth ?? 3) >= 4, mild = (warmth ?? 3) === 3;
    const v: Slot[] = ['base', 'bottom', 'feet'];
    if (cold || mild) v.unshift('mid');
    if (cold) v.unshift('outer');
    if ((warmth ?? 3) >= 4) v.unshift('head');
    for (const it of [lockItem, ...draftItems]) if (it?.slot && !v.includes(it.slot as Slot) && ROW_SLOTS.includes(it.slot as Slot)) v.push(it.slot as Slot);
    return ROW_SLOTS.filter((s) => v.includes(s));
  });
  const [locked, setLocked] = useState<Set<Slot>>(() => new Set([...(lockItem?.slot ? [lockItem.slot as Slot] : []), ...(draftItems.map((d) => d.slot as Slot))]));
  const [centre, setCentre] = useState<Record<string, Item | null>>(() => {
    const m: Record<string, Item | null> = {};
    for (const it of [lockItem, ...draftItems]) if (it?.slot) m[it.slot] = it;
    return m;
  });
  const [modes, setModes] = useState<Record<string, string | null>>({});
  const [menu, setMenu] = useState(false);
  const rails = useRef<Record<string, RailHandle | null>>({});

  // Smart ordering: re-rank unlocked rows by compatibility with locked pieces
  const lockedItems = useMemo(() => [...locked].map((s) => centre[s]).filter(Boolean) as Item[], [locked, centre]);
  const ordered = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const s of ROW_SLOTS) {
      const list = bySlot[s] ?? [];
      if (!mixerSmart || locked.has(s) || !lockedItems.length) { m[s] = list; continue; }
      m[s] = rankForSlot(list, lockedItems, { warmth }).map((r) => r.item);
    }
    return m;
  }, [bySlot, mixerSmart, locked, lockedItems, warmth]);
  const dim = useMemo(() => {
    const set = new Set<string>();
    if (!mixerSmart || !lockedItems.length) return set;
    for (const s of ROW_SLOTS) {
      if (locked.has(s)) continue;
      for (const r of rankForSlot(bySlot[s] ?? [], lockedItems, { warmth })) if (r.score < 0.42) set.add(r.item.id);
    }
    return set;
  }, [bySlot, mixerSmart, locked, lockedItems, warmth]);

  const current = useMemo(() => visible.map((s) => centre[s]).filter(Boolean) as Item[], [visible, centre]);
  const score = lookScore(current);

  // jump rails to their seeded centre on first layout
  useEffect(() => {
    const t = setTimeout(() => {
      for (const s of visible) {
        const it = centre[s];
        const list = ordered[s] ?? [];
        if (it) { const k = list.findIndex((x) => x.id === it.id); if (k >= 0) rails.current[s]?.jumpTo(k); }
        else if (list[0]) setCentre((p) => ({ ...p, [s]: list[0] }));
      }
    }, 50);
    return () => clearTimeout(t);
  }, [visible.join(','), ordered]); // eslint-disable-line react-hooks/exhaustive-deps

  const shuffle = useCallback(() => {
    haptic.heavy();
    const chosen: Item[] = [...lockedItems];
    const order: Slot[] = ['base', 'bottom', 'feet', 'mid', 'outer', 'head', 'accessory'];
    let delay = 0;
    for (const s of order) {
      if (!visible.includes(s) || locked.has(s)) continue;
      const list = ordered[s] ?? [];
      if (list.length < 2) continue;
      const ranked = rankForSlot(list, chosen, { warmth });
      const top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.4)));
      const weights = top.map((r) => Math.pow(r.score, 3) * (usage[r.item.id] ? 1 : 1.5));
      let x = Math.random() * weights.reduce((a, b) => a + b, 0);
      let pick = top[0].item;
      for (let i = 0; i < top.length; i++) { x -= weights[i]; if (x <= 0) { pick = top[i].item; break; } }
      chosen.push(pick);
      const k = list.findIndex((i) => i.id === pick.id);
      rails.current[s]?.spinTo(k, { turns: 1, duration: 900 + delay * 1.3, delay: 0 });
      delay += 110;
    }
  }, [lockedItems, visible, locked, ordered, warmth, usage]);

  // shake to shuffle
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let lastShake = 0;
    Accelerometer.setUpdateInterval(120);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      if (g > 2.3 && Date.now() - lastShake > 1400) { lastShake = Date.now(); shuffle(); }
    });
    return () => sub.remove();
  }, [shuffle]);

  const cycleMode = (it: Item) => {
    const ready = (it.wear_modes ?? []).filter((m) => m.status === 'base' || m.status === 'ready');
    if (ready.length < 2) { haptic.tick(); return; }
    const cur = modes[it.id] ?? ready[0].label;
    const idx = ready.findIndex((m) => m.label === cur);
    const next = ready[(idx + 1) % ready.length];
    haptic.medium();
    setModes((m) => ({ ...m, [it.id]: next.status === 'base' ? null : next.label }));
    toast(`${itemTitle(it)} · ${next.label}`);
  };

  const pieces = () => current.map((it) => ({ item_id: it.id, wear_mode: modes[it.id] ?? null, slot: it.slot }));
  const saveLook = async (andRender = false) => {
    if (current.length < 2) return;
    let name: string | null = null;
    try { name = (await api.nameLook(current.map((i) => i.id))).title; } catch { /* optional */ }
    const look = await save.mutateAsync({ name, source: 'mixer', pieces: pieces() });
    haptic.success();
    if (andRender) {
      const r = await api.render({ look_id: look.id, items: current.map((i) => ({ item_id: i.id, mode: modes[i.id] ?? undefined })) });
      router.push({ pathname: '/render/[id]', params: { id: r.id } });
    } else toast(`Saved · ${name ?? 'new look'}`, { label: 'Open', onPress: () => router.push({ pathname: '/look/[id]', params: { id: look.id } }) });
  };

  const hidden = ROW_SLOTS.filter((s) => !visible.includes(s) && (bySlot[s]?.length ?? 0) > 0);
  const topH = 56, bottomH = 74 + ins.bottom, addH = hidden.length ? 40 : 0;
  const avail = height - ins.top - topH - bottomH - addH - 8;
  const totalW = visible.reduce((a, s) => a + WEIGHT[s], 0);
  const label = (s: Slot) => SLOTS.find((x) => x.key === s)?.label ?? s;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: ins.top }}>
      <Grain opacity={c.grainOpacity * 1.4} />
      <View style={{ height: topH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
        <IconButton name="close" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Txt v="displaySm" style={{ fontSize: 24, lineHeight: 26 }}>Mixer</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 34, height: 3, backgroundColor: c.line }}><View style={{ width: `${Math.round(score * 100)}%`, height: 3, backgroundColor: score > 0.72 ? c.success : score > 0.55 ? c.ink : c.signal }} /></View>
            <Label style={{ fontSize: 9 }}>{current.length < 2 ? 'Swipe each row' : score > 0.72 ? 'Sits well' : score > 0.55 ? 'Works' : 'Clashing'}</Label>
          </View>
        </View>
        <Chip small label="Smart" active={mixerSmart} onPress={() => setPrefs({ mixerSmart: !mixerSmart })} />
        <IconButton name="shuffle" bg={c.ink} color={c.bg} onPress={shuffle} accessibilityLabel="Shuffle" />
        <IconButton name="more" onPress={() => setMenu(true)} />
      </View>

      <View style={{ flex: 1 }}>
        {visible.map((s) => (
          <Animated.View key={s} entering={FadeIn.duration(250)}>
            <Rail
              ref={(r) => { rails.current[s] = r; }}
              slot={s}
              label={label(s)}
              items={ordered[s] ?? []}
              W={width}
              H={Math.max(64, (avail * WEIGHT[s]) / totalW)}
              locked={locked.has(s)}
              onToggleLock={() => setLocked((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
              onHide={() => { setVisible((v) => v.filter((x) => x !== s)); setLocked((p) => { const n = new Set(p); n.delete(s); return n; }); }}
              onCenter={(it) => setCentre((p) => (p[s]?.id === it?.id ? p : { ...p, [s]: it }))}
              modes={modes}
              onCycleMode={cycleMode}
              onOpen={(it) => router.push({ pathname: '/item/[id]', params: { id: it.id } })}
              dimIds={dim}
            />
          </Animated.View>
        ))}
      </View>

      {hidden.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: addH }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 6, alignItems: 'center' }}>
          {hidden.map((s) => <Chip key={s} small icon="plus" label={label(s)} onPress={() => setVisible((v) => ROW_SLOTS.filter((x) => v.includes(x) || x === s))} />)}
        </ScrollView>
      ) : null}

      <View style={{ height: bottomH, paddingBottom: ins.bottom, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, backgroundColor: c.bg }}>
        <Button label="Save" icon="plus" onPress={() => saveLook()} loading={save.isPending} disabled={current.length < 2} style={{ flex: 1 }} />
        <Button kind="secondary" label="Canvas" icon="layers" onPress={() => {
          draft.start({ item_ids: current.map((i) => i.id), modes: Object.fromEntries(current.map((i) => [i.id, modes[i.id] ?? undefined])), source: 'mixer' });
          router.replace('/builder');
        }} disabled={!current.length} style={{ flex: 1 }} />
        <IconButton name="person" size={50} bg={c.signal} color={c.signalInk} onPress={() => saveLook(true)} accessibilityLabel="See it on me" />
      </View>

      <Menu visible={menu} onClose={() => setMenu(false)} title="Mixer" actions={[
        { label: mixerAvailableOnly ? 'Show everything' : 'Only what\'s available', icon: 'eye', hint: 'Hide pieces in the wash, drying or in storage', onPress: () => setPrefs({ mixerAvailableOnly: !mixerAvailableOnly }) },
        { label: 'Unlock all rows', icon: 'unlock', onPress: () => setLocked(new Set()) },
        { label: 'Show every row', icon: 'stack', onPress: () => setVisible(ROW_SLOTS.filter((s) => (bySlot[s]?.length ?? 0) > 0)) },
        { label: 'Ask the stylist about this', icon: 'spark', onPress: () => router.push({ pathname: '/ask', params: { focus: current.map((i) => i.id).join(',') } }) },
      ]} />
    </View>
  );
}
