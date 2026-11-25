// Phase 1 · Plan: where, when, and the shape of the trip. Structured inputs become hard packing rules.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { DateRange } from '@/components/DateRange';
import { toast } from '@/components/sheet';
import { Button, Chip, Field, IconButton, Label, Press, Screen, Segmented, Thinking, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { qk, queryClient, useTrip } from '@/lib/queries';
import { ACTIVITIES, budget, DEFAULT_SETTINGS, LAUNDRY, LUGGAGE, tripDays, type Laundry, type Luggage } from '@/lib/tripRules';
import { dateSpan, localToday, settingsOf } from '@/lib/trips';
import { space, useTheme } from '@/theme';

const STEPS = ['Checking the forecast', 'Reading your wardrobe', 'Choosing what earns a place', 'Styling the looks'];

export default function PlanTrip() {
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: existing } = useTrip(id);
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [luggage, setLuggage] = useState<Luggage>(DEFAULT_SETTINGS.luggage);
  const [laundry, setLaundry] = useState<Laundry>(DEFAULT_SETTINGS.laundry);
  const [activities, setActivities] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [showCal, setShowCal] = useState(true);
  const loaded = useRef(false);

  // editing: start from the trip as it is
  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    const s = settingsOf(existing);
    setDestination((existing.destination ?? '').trim());
    setStart(existing.start_on); setEnd(existing.end_on);
    setLuggage(s.luggage); setLaundry(s.laundry); setActivities(s.activities);
    setNotes(existing.brief ?? '');
    setShowCal(false);
  }, [existing]);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [busy]);

  const days = tripDays(start, end);
  const b = useMemo(() => budget({ luggage, laundry, activities }, days), [luggage, laundry, activities, days]);
  const ready = !!destination.trim() && !!start && !!end;
  const already = !!start && start < localToday();

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const trip = await api.pack({ trip_id: id, destination: destination.trim(), start_on: start!, end_on: end!, brief: notes.trim() || undefined, settings: { luggage, laundry, activities } });
      queryClient.setQueryData(qk.trip(trip.id), trip);
      queryClient.invalidateQueries({ queryKey: qk.trips });
      router.replace({ pathname: '/trip/[id]', params: { id: trip.id, phase: 'curate' } });
    } catch (e: any) {
      toast(e?.message ?? 'Could not plan that trip');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (k: string) => setActivities((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>{id ? 'Edit trip' : 'New trip'}</Label>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Txt v="display" style={{ fontSize: 48, lineHeight: 50 }}>{id ? 'Change\nof plan.' : 'One bag.\nEvery outfit.'}</Txt>
        <Txt v="body" color={c.muted} style={{ marginTop: 6 }}>
          {id ? "Change anything and I'll rebuild the capsule. Pieces you added stay; pieces you took out stay out." : "Tell me where, when and what's on. I'll check the forecast and build the smallest bag that covers it, then you edit it."}
        </Txt>

        <View style={{ gap: space.xl, marginTop: space.xl }}>
          <Field label="Where" value={destination} onChangeText={setDestination} placeholder="Lisbon, Copenhagen, the Peak District…" autoCapitalize="words" />

          <View style={{ gap: space.sm }}>
            <Label>When</Label>
            {showCal ? (
              <DateRange start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
            ) : (
              <Press onPress={() => setShowCal(true)} style={{ borderWidth: 1, borderColor: c.lineStrong, padding: space.md, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt v="bodyMedium">{dateSpan({ start_on: start, end_on: end })}</Txt>
                <Label color={c.muted}>Change</Label>
              </Press>
            )}
            {already && end ? <Txt v="small" color={c.muted}>Already under way: I'll plan from today with what you've got.</Txt> : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Label>Bag</Label>
            <Segmented options={LUGGAGE.map((l) => ({ key: l.key, label: l.label }))} value={luggage} onChange={setLuggage} />
            <Txt v="small" color={c.muted}>{LUGGAGE.find((l) => l.key === luggage)?.hint}</Txt>
          </View>

          <View style={{ gap: space.sm }}>
            <Label>Laundry</Label>
            <Segmented options={LAUNDRY.map((l) => ({ key: l.key, label: l.label }))} value={laundry} onChange={setLaundry} />
            <Txt v="small" color={c.muted}>{LAUNDRY.find((l) => l.key === laundry)?.hint}</Txt>
          </View>

          <View style={{ gap: space.sm }}>
            <Label>What's on</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ACTIVITIES.map((a) => <Chip key={a.key} small label={a.label} active={activities.includes(a.key)} onPress={() => toggle(a.key)} />)}
            </View>
          </View>

          <Field label="Anything else" value={notes} onChangeText={setNotes} multiline placeholder="New client, so sharp but not suited. Lots of walking. Hates being cold." />

          {start && end ? (
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, paddingVertical: space.md, gap: 4 }}>
              <Label>The brief I'll pack to</Label>
              <Txt v="body">
                {b.pieces} clothes, {b.shoes} {b.shoes === 1 ? 'pair' : 'pairs'} of shoes (incl. the pair you travel in), {b.mode === 'daily' ? `a look for each of the ${days} days` : `a rotation of ${b.looks} looks for ${days} days`}.
              </Txt>
              {activities.some((k) => ACTIVITIES.find((a) => a.key === k)?.kit) ? <Txt v="small" color={c.muted}>Gym and swim kit is packed separately and never styled.</Txt> : null}
            </View>
          ) : null}

          {busy ? <Thinking label={STEPS[step]} /> : null}
          <Button label={id ? 'Rebuild the capsule' : 'Build my capsule'} icon="suitcase" onPress={go} loading={busy} disabled={!ready || busy} />
          {!ready && !busy ? <Txt v="small" color={c.muted} style={{ textAlign: 'center' }}>{!destination.trim() ? 'Add where you are going.' : 'Pick your dates.'}</Txt> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

export { RouteError as ErrorBoundary } from '@/components/RouteError';
