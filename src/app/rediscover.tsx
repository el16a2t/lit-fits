import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { ItemCard } from '@/components/ItemCard';
import { Button, Empty, IconButton, Label, Screen, TopBar, Txt } from '@/components/ui';
import { useItems, useItemUsage } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export default function Rediscover() {
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: all = [] } = useItems();
  const { data: usage = {} } = useItemUsage();
  const never = useMemo(() => all.filter((i) => !usage[i.id] && i.status === 'ready'), [all, usage]);
  const stale = useMemo(() => all.filter((i) => usage[i.id] && i.last_worn_on && Date.now() - new Date(i.last_worn_on).getTime() > 1000 * 60 * 60 * 24 * 60), [all, usage]);
  const colW = (width - space.lg * 2 - space.md) / 2;

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Rediscover</Label>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: space.lg, gap: 6 }}>
          <Txt v="display" style={{ fontSize: 44, lineHeight: 46 }}>Forgotten{'\n'}but not gone</Txt>
          <Txt v="body" color={c.muted}>{never.length} pieces have never made it into a look. Tap one and the stylist will build around it.</Txt>
        </View>
        {never.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg, marginTop: space.lg }}>
            {never.map((it) => (
              <View key={it.id} style={{ width: colW }}>
                <ItemCard item={it} width={colW} usage={0} onPress={() => router.push({ pathname: '/ask', params: { focus: it.id, prompt: `Build me two great looks around my ${it.name ?? 'piece'} (#${it.number}) — I never wear it.` } })} />
              </View>
            ))}
          </View>
        ) : (
          <Empty title="Everything's been styled." body="Properly impressive. Shuffle for new combinations instead." action={<Button label="Shuffle" icon="shuffle" onPress={() => router.replace('/shuffle')} />} />
        )}
        {stale.length ? (
          <View style={{ marginTop: space.xl }}>
            <Label style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>Not worn in two months</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg }}>
              {stale.map((it) => (
                <View key={it.id} style={{ width: colW }}>
                  <ItemCard item={it} width={colW} onPress={() => router.push({ pathname: '/item/[id]', params: { id: it.id } })} />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
