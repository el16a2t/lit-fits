import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { RenderImage } from '@/components/RenderImage';
import { toast } from '@/components/sheet';
import { Button, Chip, Field, Label, Press, Screen, Section, Segmented, Toggle, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useItems, useProfile, useSpend, useUpdateProfile } from '@/lib/queries';
import { DEMO, supabase } from '@/lib/supabase';
import { usePrefs } from '@/state/prefs';
import { space, useTheme } from '@/theme';
import { SCENE_OPTIONS } from '@/lib/scenes';

function useDebounced<T>(value: T, onCommit: (v: T) => void, ms = 700) {
  useEffect(() => {
    const t = setTimeout(() => onCommit(value), ms);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function You() {
  const { c } = useTheme();
  const router = useRouter();
  const { data: p } = useProfile();
  const { data: spend } = useSpend();
  const update = useUpdateProfile();
  const prefs = usePrefs();
  const [name, setName] = useState(p?.display_name ?? '');
  const [height, setHeight] = useState(p?.height_cm ? String(p.height_cm) : '');
  const [weight, setWeight] = useState(p?.weight_kg ? String(p.weight_kg) : '');
  const [build, setBuild] = useState(p?.build_notes ?? '');
  const [fit, setFit] = useState(p?.fit_preference ?? '');
  const [extra, setExtra] = useState(p?.render_settings?.extra_prompt ?? '');
  const [seed, setSeed] = useState(p?.style_seed ?? '');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (p && !hydrated) {
      setName(p.display_name ?? ''); setHeight(p.height_cm ? String(p.height_cm) : ''); setWeight(p.weight_kg ? String(p.weight_kg) : '');
      setBuild(p.build_notes ?? ''); setFit(p.fit_preference ?? ''); setExtra(p.render_settings?.extra_prompt ?? ''); setSeed(p.style_seed ?? '');
      setHydrated(true);
    }
  }, [p, hydrated]);

  const commit = (patch: Parameters<typeof update.mutate>[0]) => { if (hydrated) update.mutate(patch); };
  useDebounced(name, (v) => v !== p?.display_name && commit({ display_name: v }));
  useDebounced(height, (v) => Number(v) !== p?.height_cm && commit({ height_cm: v ? Number(v) : null }));
  useDebounced(weight, (v) => Number(v) !== p?.weight_kg && commit({ weight_kg: v ? Number(v) : null }));
  useDebounced(build, (v) => v !== p?.build_notes && commit({ build_notes: v }));
  useDebounced(fit, (v) => v !== p?.fit_preference && commit({ fit_preference: v }));
  useDebounced(extra, (v) => v !== (p?.render_settings?.extra_prompt ?? '') && commit({ render_settings: { ...(p?.render_settings ?? {}), extra_prompt: v } }), 1000);
  useDebounced(seed, (v) => v !== (p?.style_seed ?? '') && commit({ style_seed: v }), 1200);

  const { data: allItems } = useItems();
  const missingShots = (allItems ?? []).filter((i) => !i.cover_url && i.status !== 'processing' && i.status !== 'draft').length;
  const twin = p?.twin ?? {};
  const prefsRow = p?.preferences ?? {};
  const setPref = (k: 'laundry_tracking' | 'location_tracking', v: boolean) => update.mutate({ preferences: { ...prefsRow, [k]: v } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <View style={{ height: 40, justifyContent: 'center' }}><Label>Settings & profile</Label></View>
          <Txt v="display">You</Txt>
        </View>

        {/* Twin */}
        <Press onPress={() => router.push('/twin')} scaleTo={0.98} style={{ marginHorizontal: space.lg, marginTop: space.md, borderWidth: 1, borderColor: c.ink, flexDirection: 'row' }}>
          <View style={{ width: 110, height: 150, backgroundColor: c.paper }}>
            {twin.base ? <RenderImage path={twin.base} style={{ width: 110, height: 150 }} /> : twin.face_front ? <RenderImage path={twin.face_front} style={{ width: 110, height: 150 }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="person" size={34} color={c.faint} /></View>}
          </View>
          <View style={{ flex: 1, padding: space.md, gap: 4, justifyContent: 'center' }}>
            <Label color={c.signal}>Digital twin</Label>
            <Txt v="heading">{twin.base ? 'Ready to model' : twin.face_front ? 'Photos in — build your twin' : 'Not set up yet'}</Txt>
            <Txt v="small" color={c.muted}>Face, build and proportions used whenever you tap "See it on me".</Txt>
          </View>
        </Press>

        <Section title="Body">
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <Field label="Name" value={name} onChangeText={setName} />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}><Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="number-pad" /></View>
            </View>
            <Field label="Build" value={build} onChangeText={setBuild} placeholder="Tall, broad-shouldered" />
            <Field label="How you like things to fit" value={fit} onChangeText={setFit} placeholder="Balanced, never tight" />
          </View>
        </Section>

        <Section title="Your style, in your words">
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Field value={seed} onChangeText={setSeed} multiline placeholder="What you like, what you'd never wear, who you rate" style={{ minHeight: 140, textAlignVertical: 'top' }} />
            <Press onPress={() => router.push('/dna')} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Txt v="bodyMedium">Style DNA & trend brief</Txt>
              <Label>Open →</Label>
            </Press>
          </View>
        </Section>

        <Section title="See it on me">
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <View style={{ gap: 8 }}>
              <Label>Default scene</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SCENE_OPTIONS.map((s) => <Chip key={s.key} label={s.label} active={(p?.render_settings?.scene ?? 'studio') === s.key} onPress={() => update.mutate({ render_settings: { ...(p?.render_settings ?? {}), scene: s.key } })} />)}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Label>Quality</Label>
              <Segmented options={[{ key: 'gemini-3-pro-image', label: 'Best' }, { key: 'gemini-nano-banana-2.1', label: 'Fast' }]} value={(p?.render_settings?.model ?? 'gemini-3-pro-image') as string}
                onChange={(model) => update.mutate({ render_settings: { ...(p?.render_settings ?? {}), model } })} />
            </View>
            <Field label="Always add to every render" value={extra} onChangeText={setExtra} multiline placeholder="e.g. natural relaxed pose, hair as it is now, no smile, 35mm film look" hint="Injected into every image prompt." />
          </View>
        </Section>

        <Section title="Wardrobe">
          <View style={{ paddingHorizontal: space.lg }}>
            <Toggle label="Track laundry & storage" hint="Mark pieces as in the wash, drying or in storage. Off = everything is always available." value={!!prefsRow.laundry_tracking} onChange={(v) => setPref('laundry_tracking', v)} />
            <Toggle label="Track where things live" hint="A location field on each piece (wardrobe, box, storage unit)." value={prefsRow.location_tracking !== false} onChange={(v) => setPref('location_tracking', v)} />
            <Toggle label="Use today's weather" hint="The stylist and mixer dress you for the forecast." value={prefs.useWeather} onChange={(v) => prefs.set({ useWeather: v })} />
            <Toggle label="Haptics" value={prefs.hapticsOn} onChange={(v) => prefs.set({ hapticsOn: v })} />
            {missingShots > 0 ? (
              <View style={{ marginTop: space.md, gap: 6 }}>
                <Txt v="small" color={c.muted}>{missingShots === 1 ? '1 piece is' : `${missingShots} pieces are`} still showing your original photo.</Txt>
                <Button kind="secondary" label="Reshoot missing studio photos" icon="camera" onPress={async () => {
                  try { const r = await api.reshootMissing(); toast(r.queued ? `Back in the studio: ${r.queued} piece${r.queued === 1 ? '' : 's'}` : 'Nothing to reshoot'); }
                  catch (e) { toast((e as Error).message); }
                }} />
              </View>
            ) : null}
          </View>
        </Section>

        <Section title="Appearance">
          <View style={{ paddingHorizontal: space.lg }}>
            <Segmented options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} value={prefs.theme} onChange={(theme) => prefs.set({ theme })} />
          </View>
        </Section>

        <Section title="This month">
          <View style={{ paddingHorizontal: space.lg, flexDirection: 'row', gap: space.md }}>
            {[{ k: 'AI spend', v: spend ? `$${spend.usd.toFixed(2)}` : '—' }, { k: 'Images', v: spend?.images ?? '—' }, { k: 'Calls', v: spend?.calls ?? '—' }].map((x) => (
              <View key={x.k} style={{ flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, padding: space.md, gap: 4 }}>
                <Label>{x.k}</Label>
                <Txt v="displaySm" style={{ fontSize: 28, lineHeight: 30 }}>{String(x.v)}</Txt>
              </View>
            ))}
          </View>
        </Section>

        <Section title="App">
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Txt v="small" color={c.muted}>Lit Fits {Constants.expoConfig?.version} · {Updates.updateId ? `update ${Updates.updateId.slice(0, 8)}` : 'embedded build'}{DEMO ? ' · demo' : ''}</Txt>
            <Button kind="secondary" label="Check for updates" icon="refresh" onPress={async () => {
              try {
                const r = await Updates.checkForUpdateAsync();
                if (r.isAvailable) { toast('Downloading update…'); await Updates.fetchUpdateAsync(); await Updates.reloadAsync(); }
                else toast("You're on the latest version");
              } catch { toast('Updates are unavailable in this build'); }
            }} />
            <Button kind="ghost" label="Sign out" onPress={() => supabase.auth.signOut()} />
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}
