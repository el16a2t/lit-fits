import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { toast } from '@/components/sheet';
import { Button, IconButton, Label, Press, Screen, Section, Segmented, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { relTime } from '@/lib/format';
import { qk, queryClient, useBrief, useProfile } from '@/lib/queries';
import { space, useTheme } from '@/theme';

function List({ title, items }: { title: string; items?: string[] }) {
  const { c } = useTheme();
  if (!items?.length) return null;
  return (
    <View style={{ gap: 6, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
      <Label>{title}</Label>
      {items.map((x) => <Txt key={x} v="body">— {x}</Txt>)}
    </View>
  );
}

export default function Dna() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: p } = useProfile();
  const { data: brief } = useBrief();
  const [tab, setTab] = useState<'dna' | 'trends'>('dna');
  const [busy, setBusy] = useState(false);
  const dna = p?.style_dna;
  const b = brief?.content;

  return (
    <Screen>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Style intelligence</Label>} />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <Segmented options={[{ key: 'dna', label: 'Your DNA' }, { key: 'trends', label: 'Trend brief' }]} value={tab} onChange={setTab} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 60 }}>
        {tab === 'dna' ? (
          <>
            <Label>{p?.style_dna_updated_at ? `Updated ${relTime(p.style_dna_updated_at)}` : 'Not built yet'}</Label>
            <Txt v="editorial" style={{ fontSize: 32, lineHeight: 35, marginVertical: space.md }}>{dna?.headline ?? 'Save a few looks and I’ll start to see the patterns.'}</Txt>
            {dna ? (
              <>
                <List title="Palette" items={dna.palette} />
                <List title="Silhouettes" items={dna.silhouettes} />
                <List title="Signatures" items={dna.signatures} />
                {dna.formality ? <List title="Formality" items={[dna.formality]} /> : null}
                <List title="Go-to pieces" items={dna.go_to} />
                <List title="Under-used" items={dna.under_used} />
                <List title="Next moves" items={dna.next_moves} />
                <List title="Steer clear" items={dna.avoid} />
                {dna.evolution ? <List title="Evolution" items={[dna.evolution]} /> : null}
              </>
            ) : null}
            <Button kind="secondary" label={dna ? 'Re-read my style' : 'Build my Style DNA'} icon="spark" loading={busy} style={{ marginTop: space.lg }}
              onPress={async () => { setBusy(true); try { await api.dna(); toast('Reading your looks — refresh in a minute'); setTimeout(() => queryClient.invalidateQueries({ queryKey: qk.profile }), 45000); } finally { setBusy(false); } }} />
          </>
        ) : (
          <>
            <Label>{brief ? `${b?.season ?? brief.season} · ${relTime(brief.created_at)}` : 'No brief yet'}</Label>
            <Txt v="editorial" style={{ fontSize: 32, lineHeight: 35, marginVertical: space.md }}>{b?.headline ?? 'The weekly read from Mr Porter, GQ, Highsnobiety, British Vogue, Opumo and Derek Guy.'}</Txt>
            {b?.summary ? <Txt v="body" color={c.inkSoft} style={{ marginBottom: space.md }}>{b.summary}</Txt> : null}
            {b?.themes?.map((t) => (
              <View key={t.name} style={{ gap: 4, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                <Txt v="heading">{t.name}</Txt>
                <Txt v="body" color={c.inkSoft}>{t.what}</Txt>
                <Txt v="small" color={c.muted}>How: {t.how}</Txt>
              </View>
            ))}
            <List title="For you" items={b?.for_you} />
            <List title="Colours" items={b?.colours} />
            <List title="Key pieces" items={b?.key_pieces} />
            <List title="Fading" items={b?.fading} />
            {brief?.sources?.length ? (
              <Section title="Sources" style={{ marginHorizontal: -space.lg }}>
                <View style={{ paddingHorizontal: space.lg, gap: 8 }}>
                  {brief.sources.slice(0, 12).map((s) => (
                    <Press key={s.url} onPress={() => Linking.openURL(s.url)}><Txt v="small" color={c.inkSoft} numberOfLines={1}>↗ {s.title}</Txt></Press>
                  ))}
                </View>
              </Section>
            ) : null}
            <Button kind="secondary" label="Refresh the brief now" icon="refresh" loading={busy} style={{ marginTop: space.lg }}
              onPress={async () => { setBusy(true); try { await api.trends(); toast('Reading the editors — about two minutes'); setTimeout(() => queryClient.invalidateQueries({ queryKey: qk.brief }), 120000); } finally { setBusy(false); } }} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
