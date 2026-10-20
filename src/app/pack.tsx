import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { toast } from '@/components/sheet';
import { Button, Chip, Field, IconButton, Label, Press, Screen, Thinking, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { qk, queryClient, useTrips } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Pack() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: trips = [] } = useTrips();
  const [destination, setDestination] = useState('');
  const today = new Date();
  const [start, setStart] = useState(iso(new Date(today.getTime() + 86400000 * 7)));
  const [end, setEnd] = useState(iso(new Date(today.getTime() + 86400000 * 10)));
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const trip = await api.pack({ destination, start_on: start, end_on: end, brief });
      queryClient.invalidateQueries({ queryKey: qk.trips });
      router.replace({ pathname: '/trip/[id]', params: { id: trip.id } });
    } catch (e: any) {
      toast(e?.message ?? 'Could not plan that trip');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Pack</Label>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Txt v="display" style={{ fontSize: 48, lineHeight: 50 }}>One bag.{'\n'}Every outfit.</Txt>
        <Txt v="body" color={c.muted} style={{ marginTop: 6 }}>Tell me where and what's on. I'll check the forecast and build a capsule with a look for each day.</Txt>
        <View style={{ gap: space.lg, marginTop: space.xl }}>
          <Field label="Where" value={destination} onChangeText={setDestination} placeholder="Lisbon, Copenhagen, the Peak District…" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}><Field label="From" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" /></View>
            <View style={{ flex: 1 }}><Field label="To" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" /></View>
          </View>
          <Field label="What's on" value={brief} onChangeText={setBrief} multiline placeholder="Two client meetings, one nice dinner, lots of walking, maybe a swim" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Carry-on only', 'Client meetings', 'Smart dinner', 'Hiking', 'Beach', 'Wedding'].map((s) => (
              <Chip key={s} small label={s} onPress={() => setBrief((b) => (b ? `${b}, ${s.toLowerCase()}` : s))} />
            ))}
          </View>
          {busy ? <Thinking label="Checking the forecast, building the capsule" /> : null}
          <Button label="Build my capsule" icon="suitcase" onPress={go} loading={busy} disabled={!destination} />
        </View>
        {trips.length ? (
          <View style={{ marginTop: space.xxl }}>
            <Label style={{ marginBottom: space.sm }}>Trips</Label>
            {trips.map((t) => (
              <Press key={t.id} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })} style={{ paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt v="bodyMedium">{t.destination}</Txt>
                <Label>{t.start_on ?? ''} · {t.item_ids.length} pieces</Label>
              </Press>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
