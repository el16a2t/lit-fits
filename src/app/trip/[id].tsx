import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ItemCard } from '@/components/ItemCard';
import { LookCard } from '@/components/LookCard';
import { toast } from '@/components/sheet';
import { Button, IconButton, Label, Screen, Section, TopBar, Txt } from '@/components/ui';
import { items as itemsApi, trips } from '@/lib/data';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItems, useProfile, useTrip } from '@/lib/queries';
import type { Item } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: trip } = useTrip(id);
  const { data: all = [] } = useItems();
  const { data: profile } = useProfile();
  const [checked, setChecked] = useState<string[]>([]);
  const capsule = useMemo(() => (trip?.plan?.capsule ?? []).map((cp) => ({ ...cp, item: all.find((i) => i.id === cp.item_id) })).filter((x) => x.item) as { item_id: string; why: string; item: Item }[], [trip, all]);
  if (!trip) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const colW = (width - space.lg * 2 - space.md * 2) / 3;
  const laundryOn = !!profile?.preferences?.laundry_tracking;

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>{trip.destination}</Label>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: space.lg, gap: 6 }}>
          <Label>{trip.start_on} → {trip.end_on} · {capsule.length} pieces</Label>
          <Txt v="display" style={{ fontSize: 46, lineHeight: 48 }}>{trip.destination}</Txt>
          {trip.plan?.summary ? <Txt v="body" color={c.inkSoft}>{trip.plan.summary}</Txt> : null}
          {trip.plan?.forecast?.days?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: space.sm }}>
              {trip.plan.forecast.days.map((d) => (
                <View key={d.date} style={{ borderWidth: 1, borderColor: c.lineStrong, padding: 8, minWidth: 64, alignItems: 'center', gap: 2 }}>
                  <Label style={{ fontSize: 9 }}>{new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</Label>
                  <Txt v="smallMedium">{Math.round(d.min)}–{Math.round(d.max)}°</Txt>
                  {d.rain >= 30 ? <Label color={c.signal} style={{ fontSize: 9 }}>{d.rain}% rain</Label> : null}
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <Section title="Capsule · tick as you pack">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg }}>
            {capsule.map(({ item }) => (
              <View key={item.id} style={{ width: colW, opacity: checked.includes(item.id) ? 0.35 : 1 }}>
                <ItemCard item={item} width={colW} compact onPress={() => { haptic.tick(); setChecked((c) => (c.includes(item.id) ? c.filter((x) => x !== item.id) : [...c, item.id])); }} onLongPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />
              </View>
            ))}
          </View>
          {trip.plan?.extras?.length ? (
            <View style={{ paddingHorizontal: space.lg, marginTop: space.lg, gap: 4 }}>
              <Label>Also bring</Label>
              {trip.plan.extras.map((e) => <Txt key={e} v="small">— {e}</Txt>)}
            </View>
          ) : null}
        </Section>

        <Section title="Day by day">
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            {(trip.plan?.days ?? []).map((d, i) => (
              <View key={i} style={{ gap: 6 }}>
                <Label color={c.ink}>{d.label}{d.date ? ` · ${d.date}` : ''}</Label>
                <LookCard look={d.look} index={i} source="pack" />
              </View>
            ))}
          </View>
        </Section>

        <View style={{ paddingHorizontal: space.lg, marginTop: space.xl, gap: 8 }}>
          {laundryOn ? (
            <>
              <Button label="Mark everything packed" icon="suitcase" onPress={async () => {
                await itemsApi.setLaundry(capsule.map((x) => x.item_id), 'packed');
                await trips.update(trip.id, { status: 'packed' });
                queryClient.invalidateQueries({ queryKey: qk.items });
                toast('Packed. Bon voyage.');
              }} />
              <Button kind="secondary" label="Home — send it all to the wash" icon="refresh" onPress={async () => {
                await itemsApi.setLaundry(capsule.map((x) => x.item_id), 'wash');
                await trips.update(trip.id, { status: 'done' });
                queryClient.invalidateQueries({ queryKey: qk.items });
                toast('Welcome back. Wash pile updated.');
              }} />
            </>
          ) : null}
          <Button kind="ghost" label="Delete trip" icon="trash" onPress={async () => { await trips.remove(trip.id); queryClient.invalidateQueries({ queryKey: qk.trips }); router.back(); }} />
        </View>
        <View style={{ height: StyleSheet.hairlineWidth }} />
      </ScrollView>
    </Screen>
  );
}
