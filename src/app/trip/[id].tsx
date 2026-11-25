// A trip is a temporary wardrobe with a lifecycle: Capsule (curate) → Pack → Away → Home. Every step stays reachable.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ItemPicker } from '@/components/ItemPicker';
import { LookCard } from '@/components/LookCard';
import { Menu, toast } from '@/components/sheet';
import { CheckRow, ForecastStrip, Meter, PieceRow, Stepper } from '@/components/TripParts';
import { Button, Field, IconButton, Label, Screen, Section, Thinking, Toggle, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { items as itemsApi, trips as tripsApi, wishlist } from '@/lib/data';
import { traceNow } from '@/lib/diag';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItems, useProfile, useTrip } from '@/lib/queries';
import { dayOfTrip, tripDays } from '@/lib/tripRules';
import { capsuleOf, dateSpan, fmtDay, localToday, looksOf, outfitCount, packRank, phaseOf, repairLooks, settingsOf, todaysLook, tripAssessment, type Phase } from '@/lib/trips';
import type { Item, Trip, TripCapsulePiece } from '@/lib/types';
import { usePrefs } from '@/state/prefs';
import { space, useTheme } from '@/theme';

const GROUPS: { title: string; slots: string[] }[] = [
  { title: 'Layers', slots: ['outer', 'mid'] },
  { title: 'Tops', slots: ['base'] },
  { title: 'Bottoms', slots: ['bottom'] },
  { title: 'Shoes', slots: ['feet'] },
  { title: 'Accessories', slots: ['accessory', 'head'] },
];

/** Optimistic trip patch: the screen updates at once, the row follows. */
async function patchTrip(trip: Trip, p: Partial<Trip>) {
  const next = { ...trip, ...p };
  queryClient.setQueryData(qk.trip(trip.id), next);
  try {
    await tripsApi.update(trip.id, p);
    queryClient.invalidateQueries({ queryKey: qk.trips });
  } catch (e: any) {
    queryClient.setQueryData(qk.trip(trip.id), trip);
    toast(e?.message ?? "Couldn't save that");
  }
  return next;
}

export default function TripDetail() {
  const { id, phase: initial } = useLocalSearchParams<{ id: string; phase?: Phase }>();
  const { c } = useTheme();
  const router = useRouter();
  const { data: trip } = useTrip(id);
  const { data: all = [] } = useItems();
  const natural = trip ? phaseOf(trip) : 'curate';
  const [view, setView] = useState<Phase | null>(initial ?? null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (trip) traceNow('trip:open', { phase: natural }); }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip) return <Screen><TopBar left={<IconButton name="back" onPress={() => router.back()} />} /></Screen>;
  const phase = view ?? natural;

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>{dateSpan(trip)}</Label>}
        right={<IconButton name="more" accessibilityLabel="Trip options" onPress={() => setMenu(true)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: space.lg, gap: space.sm, marginBottom: space.md }}>
          <Txt v="display" style={{ fontSize: 46, lineHeight: 48 }}>{(trip.destination ?? 'Trip').trim()}</Txt>
          <ForecastStrip trip={trip} />
        </View>
        <Stepper value={phase} natural={natural} onChange={(p) => { haptic.tick(); setView(p); }} />
        {phase === 'curate' ? <Curate trip={trip} all={all} onNext={() => setView('pack')} /> : null}
        {phase === 'pack' ? <Pack trip={trip} all={all} onNext={() => setView('away')} /> : null}
        {phase === 'away' ? <Away trip={trip} all={all} /> : null}
        {phase === 'home' ? <Home trip={trip} all={all} /> : null}
      </ScrollView>
      <Menu visible={menu} onClose={() => setMenu(false)} title={(trip.destination ?? '').trim()} actions={[
        { label: 'Edit dates, bag and plans', icon: 'edit', onPress: () => router.push({ pathname: '/pack', params: { id: trip.id } }) },
        { label: 'All trips', icon: 'suitcase', onPress: () => router.push('/trips') },
        { label: 'Delete trip', icon: 'trash', onPress: async () => { await tripsApi.remove(trip.id); queryClient.invalidateQueries({ queryKey: qk.trips }); router.back(); } },
      ]} />
    </Screen>
  );
}

// ───────────── Capsule: decide what goes ─────────────
function Curate({ trip, all, onNext }: { trip: Trip; all: Item[]; onNext: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [restyling, setRestyling] = useState(false);
  const [more, setMore] = useState<TripCapsulePiece | null>(null);
  const [wished, setWished] = useState<string[]>([]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const caps = capsuleOf(trip);
  const pieces = caps.map((cp) => ({ cp, item: byId.get(cp.item_id) })).filter((x): x is { cp: TripCapsulePiece; item: Item } => !!x.item);
  const core = pieces.filter((p) => p.cp.role !== 'kit');
  const kit = pieces.filter((p) => p.cp.role === 'kit');
  const a = tripAssessment(trip, all);
  const outfits = useMemo(() => outfitCount(core.map((p) => p.item)), [core.map((p) => p.item.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = settingsOf(trip);
  const bag = settings.luggage === 'carry-on' ? 'a carry-on' : settings.luggage === 'checked' ? 'a checked bag' : 'the car';
  const looks = looksOf(trip);

  const writeCapsule = (nextCaps: TripCapsulePiece[], extra: Partial<Trip> = {}) => {
    const ids = nextCaps.map((x) => x.item_id);
    const coreIds = nextCaps.filter((x) => x.role !== 'kit').map((x) => x.item_id);
    const { looks: repaired, changed } = repairLooks(looksOf(trip), coreIds, all);
    return patchTrip(trip, {
      item_ids: ids,
      plan: { ...(trip.plan ?? {}), capsule: nextCaps, looks: repaired, days: repaired, stale: changed || !!extra.pinned_ids || !!trip.plan?.stale },
      ...extra,
    });
  };

  const remove = async (cp: TripCapsulePiece) => {
    haptic.medium();
    const before = trip;
    await writeCapsule(caps.filter((x) => x.item_id !== cp.item_id), {
      excluded_ids: [...new Set([...(trip.excluded_ids ?? []), cp.item_id])],
      pinned_ids: (trip.pinned_ids ?? []).filter((x) => x !== cp.item_id),
    });
    const it = byId.get(cp.item_id);
    toast(`${it?.name ?? 'Piece'} stays home`, { label: 'Undo', onPress: () => patchTrip(before, before) });
  };

  const add = (picked: Item[]) => {
    if (!picked.length) return;
    const fresh = picked.filter((p) => !caps.some((x) => x.item_id === p.id)).map((p) => ({ item_id: p.id, why: 'You added this', role: 'core' as const, travel: false }));
    writeCapsule([...caps, ...fresh], {
      pinned_ids: [...new Set([...(trip.pinned_ids ?? []), ...fresh.map((f) => f.item_id)])],
      excluded_ids: (trip.excluded_ids ?? []).filter((x) => !fresh.some((f) => f.item_id === x)),
    });
  };

  const setPiece = (cp: TripCapsulePiece, p: Partial<TripCapsulePiece>) => writeCapsule(caps.map((x) => (x.item_id === cp.item_id ? { ...x, ...p } : x)));

  const restyle = async () => {
    setRestyling(true);
    try {
      const t = await api.restyleTrip(trip.id);
      queryClient.setQueryData(qk.trip(trip.id), t);
      haptic.success();
    } catch (e: any) {
      toast(e?.message ?? 'Restyle failed');
    } finally { setRestyling(false); }
  };

  return (
    <View style={{ paddingTop: space.lg }}>
      <Meter a={a} outfits={outfits} bagLabel={bag} />
      {trip.plan?.summary ? <Txt v="body" color={c.inkSoft} style={{ paddingHorizontal: space.lg, marginTop: space.md }}>{trip.plan.summary}</Txt> : null}

      {GROUPS.map((g) => {
        const rows = core.filter((p) => g.slots.includes(p.item.slot ?? ''));
        if (!rows.length) return null;
        return (
          <Section key={g.title} title={`${g.title} · ${rows.length}`} style={{ marginTop: space.lg }}>
            {rows.map(({ cp, item }) => (
              <PieceRow key={item.id} item={item} why={cp.why} badges={cp.travel ? ['Wear on the journey'] : []}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} onMore={() => setMore(cp)} onRemove={() => remove(cp)} />
            ))}
          </Section>
        );
      })}
      {kit.length ? (
        <Section title={`Kit · not styled · ${kit.length}`} style={{ marginTop: space.lg }}>
          {kit.map(({ cp, item }) => <PieceRow key={item.id} item={item} why={cp.why} onMore={() => setMore(cp)} onRemove={() => remove(cp)} />)}
        </Section>
      ) : null}

      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg, gap: space.sm }}>
        <Button kind="secondary" label="Add pieces it missed" icon="plus" onPress={() => setPicker(true)} />
        {(trip.excluded_ids ?? []).length ? <Txt v="small" color={c.muted} style={{ textAlign: 'center' }}>{trip.excluded_ids!.length} left at home: they won't be suggested again for this trip.</Txt> : null}
      </View>

      {trip.plan?.missing?.length ? (
        <Section title="Worth buying for this trip">
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            {trip.plan.missing.map((m) => (
              <View key={m.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="smallMedium">{m.title}</Txt>
                  <Txt v="small" color={c.muted}>{m.why}</Txt>
                </View>
                <Button small kind={wished.includes(m.title) ? 'ghost' : 'secondary'} label={wished.includes(m.title) ? 'On wishlist' : 'Wishlist'} disabled={wished.includes(m.title)}
                  onPress={async () => {
                    await wishlist.add({ title: m.title, slot: m.slot, subtype: m.subtype ?? null, colour: m.colour ?? null, reason: m.why, pairs_with: trip.item_ids.slice(0, 6) });
                    setWished((w) => [...w, m.title]);
                    queryClient.invalidateQueries({ queryKey: qk.wishlist });
                    haptic.success();
                  }} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={`Looks · ${tripDays(trip.start_on, trip.end_on) > 10 ? `a rotation of ${looks.length}` : `${looks.length} days`}`}
        right={<Button small kind={trip.plan?.stale ? 'primary' : 'ghost'} icon="spark" label={trip.plan?.stale ? 'Restyle' : 'Restyle'} onPress={restyle} loading={restyling} />}>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          {trip.plan?.stale ? <Txt v="small" color={c.signal}>You've changed the capsule. Looks have been patched; restyle to rebuild them around what's in the bag now.</Txt> : null}
          {restyling ? <Thinking label="Restyling from what's packed" /> : null}
          {looks.map((d, i) => (
            <View key={`${d.label}-${i}`} style={{ gap: 6 }}>
              <Label color={c.ink}>{d.date ? `${fmtDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ` : `Look ${i + 1} · `}{d.label}{d.repaired ? '  ·  adjusted' : ''}</Label>
              <LookCard look={d.look} index={i} source="pack" />
            </View>
          ))}
        </View>
      </Section>

      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <Button label={a.over.length ? 'Pack anyway' : 'Looks right: start packing'} icon="suitcase" onPress={onNext} />
      </View>

      <ItemPicker visible={picker} onClose={() => setPicker(false)} onPick={add} exclude={trip.item_ids} context={core.map((p) => p.item)} title="Add to the bag" />
      <Menu visible={!!more} onClose={() => setMore(null)} title={more ? byId.get(more.item_id)?.name ?? 'Piece' : ''} actions={more ? [
        { label: more.travel ? 'Pack it instead of wearing it' : 'Wear it on the journey', icon: 'suitcase', onPress: () => setPiece(more, { travel: !more.travel }) },
        { label: more.role === 'kit' ? 'Style it into looks' : 'Kit: pack it, never style it', icon: 'layers', onPress: () => setPiece(more, { role: more.role === 'kit' ? 'core' : 'kit' }) },
        { label: 'Open the piece', icon: 'eye', onPress: () => router.push({ pathname: '/item/[id]', params: { id: more.item_id } }) },
        { label: 'Leave it at home', icon: 'close', onPress: () => remove(more) },
      ] : []} />
    </View>
  );
}

// ───────────── Pack: tick it into the bag (saved) ─────────────
function Pack({ trip, all, onNext }: { trip: Trip; all: Item[]; onNext: () => void }) {
  const { c } = useTheme();
  const { data: profile } = useProfile();
  const [newThing, setNewThing] = useState('');
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const caps = capsuleOf(trip);
  const packed = trip.packed ?? {};
  const list = trip.checklist?.length ? trip.checklist : (trip.plan?.extras ?? []).map((label) => ({ id: `x-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, label, source: 'ai' as const }));
  const total = caps.length + list.length;
  const done = caps.filter((x) => packed[x.item_id]).length + list.filter((x) => packed[x.id]).length;
  const travel = caps.filter((x) => x.travel);
  const bag = caps.filter((x) => !x.travel).sort((a, b) => packRank(byId.get(a.item_id)?.slot) - packRank(byId.get(b.item_id)?.slot));

  const toggle = (key: string) => { haptic.tick(); patchTrip(trip, { packed: { ...packed, [key]: !packed[key] } }); };
  const addThing = () => {
    const label = newThing.trim();
    if (!label) return;
    setNewThing('');
    patchTrip(trip, { checklist: [...list, { id: `me-${Date.now()}`, label, source: 'me' }] });
  };
  const finish = async () => {
    await patchTrip(trip, { status: 'packed', packed: Object.fromEntries([...caps.map((x) => [x.item_id, true]), ...list.map((x) => [x.id, true])]) });
    if (profile?.preferences?.laundry_tracking) {
      await itemsApi.setLaundry(caps.map((x) => x.item_id), 'packed');
      queryClient.invalidateQueries({ queryKey: qk.items });
    }
    haptic.success();
    toast('Packed. Bon voyage.');
    onNext();
  };
  const row = (x: TripCapsulePiece) => {
    const it = byId.get(x.item_id);
    return it ? <CheckRow key={x.item_id} item={it} label={it.name ?? 'Piece'} sub={x.role === 'kit' ? 'Kit' : undefined} done={!!packed[x.item_id]} onToggle={() => toggle(x.item_id)} /> : null;
  };

  return (
    <View style={{ paddingTop: space.lg }}>
      <View style={{ paddingHorizontal: space.lg, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="bodyMedium">{done === total ? 'All packed' : `${done} of ${total} packed`}</Txt>
          <Label color={c.muted}>Saved as you go</Label>
        </View>
        <View style={{ height: 3, backgroundColor: c.line }}><View style={{ height: 3, width: `${(done / Math.max(1, total)) * 100}%`, backgroundColor: c.ink }} /></View>
      </View>
      {travel.length ? <Section title="Wear on the journey" style={{ marginTop: space.lg }}>{travel.map(row)}</Section> : null}
      <Section title="In the bag" style={{ marginTop: space.lg }}>{bag.map(row)}</Section>
      <Section title="Don't forget" style={{ marginTop: space.lg }}>
        {list.map((x) => <CheckRow key={x.id} label={x.label} done={!!packed[x.id]} onToggle={() => toggle(x.id)} onRemove={() => patchTrip(trip, { checklist: list.filter((y) => y.id !== x.id) })} />)}
        <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field value={newThing} onChangeText={setNewThing} placeholder="Add something: passport, charger…" onSubmitEditing={addThing} returnKeyType="done" /></View>
          <IconButton name="plus" onPress={addThing} accessibilityLabel="Add to list" />
        </View>
      </Section>
      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <Button label={trip.status === 'packed' ? 'Packed' : done === total ? 'Done: close the bag' : 'Mark it all packed'} icon="check" onPress={finish} />
      </View>
    </View>
  );
}

// ───────────── Away: dress from the bag ─────────────
function Away({ trip, all }: { trip: Trip; all: Item[] }) {
  const { c } = useTheme();
  const router = useRouter();
  const { awayMode, set } = usePrefs();
  const today = localToday();
  const day = dayOfTrip(trip.start_on, trip.end_on, today);
  const days = tripDays(trip.start_on, trip.end_on);
  const looks = looksOf(trip);
  const base = todaysLook(trip, today);
  const [offset, setOffset] = useState(0);
  const index = looks.length ? (base.index + offset + looks.length) % looks.length : -1;
  const look = index >= 0 ? looks[index] : null;
  const fc = trip.plan?.forecast?.days?.find((d) => d.date === today);
  const worn = trip.worn ?? {};

  if (!day) {
    const until = trip.start_on ? Math.round((Date.parse(trip.start_on) - Date.parse(today)) / 86400000) : null;
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Txt v="editorial">{until != null && until > 0 ? `${until} ${until === 1 ? 'day' : 'days'} to go.` : 'Trip over.'}</Txt>
        <Txt v="body" color={c.muted}>Once you're there, this becomes your wardrobe: today's look from the bag, and the mixer, shuffle and stylist work only from what you packed.</Txt>
      </View>
    );
  }

  const woreIt = async () => {
    if (!look) return;
    const ids = look.look.items.map((i) => i.item_id);
    const next = { ...worn };
    for (const i of ids) next[i] = (next[i] ?? 0) + 1;
    await patchTrip(trip, { worn: next, status: trip.status === 'done' ? 'done' : 'away' });
    itemsApi.markWorn(ids).then(() => queryClient.invalidateQueries({ queryKey: qk.items })).catch(() => {});
    haptic.success();
    toast('Logged. Enjoy the day.');
  };

  return (
    <View style={{ paddingTop: space.lg }}>
      <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
        <Label color={c.signal}>Day {day} of {days}</Label>
        <Txt v="editorial">{look ? look.label : 'Today'}</Txt>
        {fc ? <Txt v="small" color={c.muted}>{Math.round(fc.min)}–{Math.round(fc.max)}°C{fc.rain >= 30 ? ` · ${fc.rain}% chance of rain` : ''}</Txt> : null}
      </View>
      {look ? (
        <View style={{ paddingHorizontal: space.lg, marginTop: space.md, gap: space.sm }}>
          <LookCard look={look.look} index={index} source="pack" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} label="Wearing this" icon="check" onPress={woreIt} />
            <Button style={{ flex: 1 }} kind="secondary" label="Another" icon="shuffle" onPress={() => { haptic.tick(); setOffset((o) => o + 1); }} />
          </View>
        </View>
      ) : <Txt v="body" color={c.muted} style={{ padding: space.lg }}>No looks yet: restyle from the Capsule step.</Txt>}

      <Section title="Dress from the bag">
        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <Toggle value={awayMode} onChange={(v) => set({ awayMode: v })} label="Only use what I packed" hint={`While you're in ${(trip.destination ?? '').trim()}, the mixer, shuffle and stylist work from these ${trip.item_ids.length} pieces.`} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} kind="secondary" small label="Mixer" icon="layers" onPress={() => router.push('/mixer')} />
            <Button style={{ flex: 1 }} kind="secondary" small label="Shuffle" icon="shuffle" onPress={() => router.push('/shuffle')} />
            <Button style={{ flex: 1 }} kind="secondary" small label="Stylist" icon="spark" onPress={() => router.push({ pathname: '/ask', params: { prompt: `Dress me for today in ${(trip.destination ?? '').trim()}${fc ? ` (${Math.round(fc.min)}–${Math.round(fc.max)}°C)` : ''}` } })} />
          </View>
        </View>
      </Section>
    </View>
  );
}

// ───────────── Home: what earned its place ─────────────
function Home({ trip, all }: { trip: Trip; all: Item[] }) {
  const { c } = useTheme();
  const router = useRouter();
  const { data: profile } = useProfile();
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const today = localToday();
  const worn = trip.worn ?? {};
  const core = capsuleOf(trip).filter((x) => x.role !== 'kit').map((x) => byId.get(x.item_id)).filter(Boolean) as Item[];
  const used = core.filter((i) => worn[i.id]).sort((a, b) => (worn[b.id] ?? 0) - (worn[a.id] ?? 0));
  const unused = core.filter((i) => !worn[i.id]);
  const logged = Object.keys(worn).length > 0;
  const over = !!trip.end_on && today > trip.end_on;

  const finish = async () => {
    await patchTrip(trip, { status: 'done', wrap: { unworn: logged ? unused.map((i) => i.id) : [], at: new Date().toISOString() } });
    if (profile?.preferences?.laundry_tracking) {
      await itemsApi.setLaundry(trip.item_ids, 'wash');
      queryClient.invalidateQueries({ queryKey: qk.items });
    }
    haptic.success();
    toast(profile?.preferences?.laundry_tracking ? 'Welcome back. Wash pile updated.' : 'Welcome back.');
  };

  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <Txt v="editorial">{trip.status === 'done' ? 'Unpacked.' : over ? 'Welcome back.' : `Back on ${fmtDay(trip.end_on)}.`}</Txt>
      {logged ? (
        <>
          <Txt v="body" color={c.muted}>You wore {used.length} of {core.length} pieces. {unused.length ? "Next time I'll be sceptical about the ones that never came out of the bag." : 'Every piece earned its place.'}</Txt>
          {used.length ? <View style={{ gap: 4 }}><Label>Earned its place</Label>{used.map((i) => <Txt key={i.id} v="small">{i.name} · worn {worn[i.id]}×</Txt>)}</View> : null}
          {unused.length ? <View style={{ gap: 4 }}><Label color={c.signal}>Never came out of the bag</Label>{unused.map((i) => <Txt key={i.id} v="small">{i.name}</Txt>)}</View> : null}
        </>
      ) : (
        <Txt v="body" color={c.muted}>Tap "Wearing this" on the Away step each day and I'll tell you what earned its place, and pack smarter next time.</Txt>
      )}
      {trip.status !== 'done' && (!trip.start_on || today >= trip.start_on) ? <Button label="Unpack and finish the trip" icon="check" onPress={finish} /> : null}
      <Button kind="ghost" label="Plan the next trip" icon="suitcase" onPress={() => router.push('/pack')} />
      <View style={{ height: StyleSheet.hairlineWidth }} />
    </View>
  );
}


export { RouteError as ErrorBoundary } from '@/components/RouteError';
