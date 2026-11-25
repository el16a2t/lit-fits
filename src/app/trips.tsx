// Trips home: the trip you're on (or the next one) up top, then everything else. Trips are found here, not lost under a form.
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PieceStrip } from '@/components/PieceStrip';
import { Button, Empty, IconButton, Label, Press, Screen, TopBar, Txt } from '@/components/ui';
import { useItems, useTrips } from '@/lib/queries';
import { dayOfTrip, tripDays } from '@/lib/tripRules';
import { capsuleOf, dateSpan, localToday, packRank, phaseOf, pickActive, PHASES } from '@/lib/trips';
import type { Item, Trip } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Trips() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: trips = [], isLoading } = useTrips();
  const { data: all = [] } = useItems();
  const today = localToday();
  const { current, upcoming } = useMemo(() => pickActive(trips, today), [trips, today]);
  const hero = current ?? upcoming;
  const rest = trips.filter((t) => t.id !== hero?.id);
  const later = rest.filter((t) => phaseOf(t, today) !== 'home');
  const past = rest.filter((t) => phaseOf(t, today) === 'home');
  const open = (t: Trip) => router.push({ pathname: '/trip/[id]', params: { id: t.id } });

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Trips</Label>}
        right={<IconButton name="plus" accessibilityLabel="New trip" onPress={() => router.push('/pack')} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <Txt v="display" style={{ fontSize: 48, lineHeight: 50 }}>Trips</Txt>
        </View>

        {hero ? <Hero trip={hero} items={all} today={today} onPress={() => open(hero)} /> : null}

        {!isLoading && !trips.length ? (
          <View style={{ padding: space.lg }}>
            <Empty title="Nowhere yet" body="Plan a trip and I'll build the smallest bag that covers it, with a look for every day."
              action={<Button label="Plan a trip" icon="suitcase" onPress={() => router.push('/pack')} />} />
          </View>
        ) : null}

        {later.length ? <List title="Coming up" trips={later} today={today} onOpen={open} /> : null}
        {past.length ? <List title="Been" trips={past} today={today} onOpen={open} /> : null}

        {trips.length ? (
          <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
            <Button kind="secondary" label="Plan another trip" icon="plus" onPress={() => router.push('/pack')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Hero({ trip, items, today, onPress }: { trip: Trip; items: Item[]; today: string; onPress: () => void }) {
  const { c } = useTheme();
  const day = dayOfTrip(trip.start_on, trip.end_on, today);
  const days = tripDays(trip.start_on, trip.end_on);
  // one of each kind first (top, bottom, shoes, layer…) so the strip reads as a wardrobe, not a row of trousers
  const all = (capsuleOf(trip).map((cp) => items.find((i) => i.id === cp.item_id)).filter(Boolean) as Item[]).sort((a, b) => packRank(a.slot) - packRank(b.slot));
  const pieces = [...new Map(all.map((i) => [i.slot, i])).values(), ...all].filter((i, k, arr) => arr.indexOf(i) === k);
  const until = trip.start_on ? Math.round((Date.parse(trip.start_on) - Date.parse(today)) / 86400000) : null;
  return (
    <Press onPress={onPress} style={{ margin: space.lg, backgroundColor: c.ink, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label color={c.signal}>{day ? `Away · day ${day} of ${days}` : until != null ? `In ${until} ${until === 1 ? 'day' : 'days'}` : 'Next trip'}</Label>
        <Icon name="arrow" size={18} color={c.bg} />
      </View>
      <Txt v="display" color={c.bg} style={{ fontSize: 40, lineHeight: 42 }}>{(trip.destination ?? '').trim()}</Txt>
      <Txt v="small" color={c.faint}>{dateSpan(trip)} · {pieces.length} pieces</Txt>
      {pieces.length ? <PieceStrip items={pieces.slice(0, 8)} size={56} caption={false} /> : null}
    </Press>
  );
}

function List({ title, trips, today, onOpen }: { title: string; trips: Trip[]; today: string; onOpen: (t: Trip) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: space.lg }}>
      <Label style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>{title}</Label>
      {trips.map((t) => {
        const phase = phaseOf(t, today);
        return (
          <Press key={t.id} onPress={() => onOpen(t)} style={{ paddingHorizontal: space.lg, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="bodyMedium">{(t.destination ?? 'Trip').trim()}</Txt>
              <Txt v="small" color={c.muted}>{dateSpan(t)} · {t.item_ids.length} pieces</Txt>
            </View>
            <Label color={phase === 'home' ? c.muted : c.ink}>{PHASES.find((p) => p.key === phase)?.label}</Label>
          </Press>
        );
      })}
    </View>
  );
}

export { RouteError as ErrorBoundary } from '@/components/RouteError';
