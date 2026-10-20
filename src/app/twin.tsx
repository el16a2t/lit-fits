import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { RenderImage } from '@/components/RenderImage';
import { toast } from '@/components/sheet';
import { Button, IconButton, Label, Screen, Thinking, TopBar, Txt } from '@/components/ui';
import { TwinPhotos } from '@/components/TwinPhotos';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export default function TwinScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: p } = useProfile();
  const twin = p?.twin ?? {};
  const [starting, setStarting] = useState(false);
  const ready = !!twin.face_front && !!twin.full_body;
  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Digital twin</Label>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 60, gap: space.lg }}>
        <Txt v="display" style={{ fontSize: 48, lineHeight: 50 }}>You,{'\n'}modelled.</Txt>
        <Txt v="body" color={c.muted}>Four photos and your measurements. The studio builds a reference of you once, then dresses it in any look. Photos stay in your private storage.</Txt>
        {twin.base || twin.base_status === 'running' ? (
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-end' }}>
            <View style={{ width: 150, height: 225, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' }}>
              {twin.base ? <RenderImage path={twin.base} style={{ width: 150, height: 225 }} /> : <Thinking label="Building" />}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Label color={c.signal}>{twin.base_status === 'running' ? 'Building your twin' : 'Your twin'}</Label>
              <Txt v="small" color={c.muted}>{twin.base_status === 'running' ? 'About a minute. You can leave this screen.' : 'This is the reference every render starts from. Rebuild it if your hair or beard changes.'}</Txt>
            </View>
          </View>
        ) : null}
        <TwinPhotos />
        {twin.base_status === 'failed' ? <Txt v="small" color={c.danger}>Last build failed: {twin.base_error}</Txt> : null}
        <Button kind="signal" label={twin.base ? 'Rebuild my twin' : 'Build my twin'} icon="person" disabled={!ready || twin.base_status === 'running'} loading={starting}
          onPress={async () => { setStarting(true); try { await api.buildTwin(); haptic.success(); toast('Building your twin — about a minute'); } finally { setStarting(false); } }} />
        {!ready ? <Txt v="small" color={c.muted}>Needs at least the front face photo and the full-length photo.</Txt> : null}
      </ScrollView>
    </Screen>
  );
}
