import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Chip, IconButton, Label, Press, Screen, Txt } from '@/components/ui';
import { greeting, relTime } from '@/lib/format';
import { currentSeason } from '@/lib/outfit';
import { useItems, useItemUsage, useProfile, useThreads, useWishlist } from '@/lib/queries';
import { useWeather, weatherLine } from '@/lib/weather';
import { space, type as T, useTheme } from '@/theme';

export default function Explore() {
  const { c } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data: weather } = useWeather();
  const { data: profile } = useProfile();
  const { data: threads = [] } = useThreads();
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const { data: wishes = [] } = useWishlist();
  const never = useMemo(() => all.filter((i) => !usage[i.id]).length, [all, usage]);
  const season = currentSeason();

  const suggestions = useMemo(() => [
    `3 perfect outfits with smart touches for ${season}`,
    'A perfect smart-casual outfit for networking drinks',
    weather ? `Dress me for today — ${weather.label.toLowerCase()}, ${weather.max}°C` : 'Dress me for today',
    'Something built around a piece I never wear',
    'Client meeting, but I don\'t want to look like a banker',
    'Weekend in the Peaks — walking, then a pub',
  ], [season, weather]);

  const ask = (prompt: string) => { if (!prompt.trim()) return; router.push({ pathname: '/ask', params: { prompt } }); setQ(''); };

  const Mode = ({ icon, kicker, title, body, onPress, dark }: { icon: IconName; kicker: string; title: string; body: string; onPress: () => void; dark?: boolean }) => (
    <Press onPress={onPress} scaleTo={0.98} style={{ borderWidth: 1, borderColor: c.ink, backgroundColor: dark ? c.ink : 'transparent', padding: space.lg, gap: 6, flex: 1, minHeight: 150 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label color={dark ? c.signal : c.muted}>{kicker}</Label>
        <Icon name={icon} size={20} color={dark ? c.bg : c.ink} />
      </View>
      <Txt v="displaySm" color={dark ? c.bg : c.ink} style={{ fontSize: 26, lineHeight: 28, marginTop: 'auto' }}>{title}</Txt>
      <Txt v="small" color={dark ? c.faint : c.muted}>{body}</Txt>
    </Press>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>{greeting()}, {profile?.display_name ?? 'Adam'}</Label>
            {weather ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={weather.rain >= 40 ? 'rain' : weather.code <= 1 ? 'sun' : 'cloud'} size={18} />
                <Label color={c.ink}>{weather.temp}°</Label>
              </View>
            ) : null}
          </View>
          <Txt v="display">Explore</Txt>
          {weather ? <Txt v="small" color={c.muted} style={{ marginTop: 2 }}>{weatherLine(weather)}</Txt> : null}
        </View>

        {/* Ask */}
        <View style={{ marginHorizontal: space.lg, marginTop: space.lg, backgroundColor: c.ink, padding: space.lg, gap: space.md }}>
          <Label color={c.signal}>Ask your stylist</Label>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1, borderBottomColor: c.faint }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Give me three looks for…" placeholderTextColor={c.muted} multiline
              style={[T.heading, { flex: 1, color: c.bg, minHeight: 48, paddingVertical: 10 }]} onSubmitEditing={() => ask(q)} blurOnSubmit />
            <IconButton name="send" color={c.ink} bg={c.signal} size={40} onPress={() => ask(q)} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {suggestions.map((s) => (
              <Press key={s} onPress={() => ask(s)} style={{ borderWidth: 1, borderColor: c.faint, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 220 }}>
                <Txt v="small" color={c.bg} numberOfLines={2}>{s}</Txt>
              </Press>
            ))}
          </ScrollView>
        </View>

        {/* Modes */}
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Mode icon="shuffle" kicker="Shuffle" title="Deal me looks" body="Swipe through outfits built from your rails. Right to keep." onPress={() => router.push('/shuffle')} dark />
            <Mode icon="eye" kicker={`${never} never styled`} title="Rediscover" body="Pieces you forgot you own, put to work." onPress={() => router.push('/rediscover')} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Mode icon="suitcase" kicker="Pack" title="Trip capsule" body="Fewest pieces, most outfits, right weather." onPress={() => router.push('/pack')} />
            <Mode icon="bag" kicker={`${wishes.length} wanted`} title="Wishlist" body="What would unlock your wardrobe." onPress={() => router.push('/wishlist')} />
          </View>
          <Press onPress={() => router.push('/dna')} scaleTo={0.98} style={{ borderWidth: 1, borderColor: c.ink, padding: space.lg, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label>Style DNA · trend brief</Label>
              <Icon name="spark" size={20} />
            </View>
            <Txt v="editorialSm">{profile?.style_dna?.headline ?? 'What the stylist has learned about you, and what the editors are saying this season.'}</Txt>
          </Press>
        </View>

        {/* Threads */}
        {threads.length ? (
          <View style={{ marginTop: space.xl }}>
            <Label style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>Recent conversations</Label>
            {threads.slice(0, 8).map((t) => (
              <Press key={t.id} onPress={() => router.push({ pathname: '/ask', params: { thread: t.id } })} scaleTo={0.99}
                style={{ paddingHorizontal: space.lg, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>{t.title}</Txt>
                <Label>{relTime(t.updated_at)}</Label>
              </Press>
            ))}
          </View>
        ) : null}
        <View style={{ height: space.xl }} />
        <View style={{ paddingHorizontal: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip small label="Open the mixer" icon="shuffle" onPress={() => router.push('/mixer')} />
          <Chip small label="Add pieces" icon="camera" onPress={() => router.push('/capture')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
