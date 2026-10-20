import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TwinPhotos } from '@/components/TwinPhotos';
import { Button, Field, Label, Toggle, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItems, useProfile, useUpdateProfile } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const STEPS = ['hello', 'body', 'twin', 'style', 'prefs'] as const;

export default function Onboarding() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { data: p } = useProfile();
  const { data: items = [] } = useItems();
  const update = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [build, setBuild] = useState('Tall, broad-shouldered');
  const [fit, setFit] = useState('Balanced and well-proportioned — never tight');
  const [seed, setSeed] = useState('');
  const [laundry, setLaundry] = useState(false);
  const [location, setLocation] = useState(true);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (p) { setName(p.display_name ?? 'Adam'); setSeed(p.style_seed ?? ''); if (p.height_cm) setHeight(String(p.height_cm)); if (p.weight_kg) setWeight(String(p.weight_kg)); }
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = STEPS[step];
  const next = async () => {
    haptic.light();
    if (key === 'body') await update.mutateAsync({ display_name: name, height_cm: height ? Number(height) : null, weight_kg: weight ? Number(weight) : null, build_notes: build, fit_preference: fit });
    if (key === 'style') await update.mutateAsync({ style_seed: seed });
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setFinishing(true);
    try {
      await update.mutateAsync({ preferences: { ...(p?.preferences ?? {}), laundry_tracking: laundry, location_tracking: location }, onboarded: true });
      // warm up the brain: twin, trend brief and first DNA run in the background
      if (p?.twin?.face_front && p?.twin?.full_body && !p?.twin?.base) api.buildTwin().catch(() => {});
      api.trends().catch(() => {});
      if (items.length) api.dna().catch(() => {});
      queryClient.invalidateQueries({ queryKey: qk.profile });
      haptic.success();
      router.replace(items.length ? '/' : '/capture');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: space.lg, paddingTop: space.md }}>
        {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 3, backgroundColor: i <= step ? c.ink : c.line }} />)}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 140, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Animated.View key={key} entering={FadeInRight.springify().damping(20)} exiting={FadeOutLeft.duration(150)} style={{ gap: space.lg }}>
          {key === 'hello' ? (
            <>
              <Label>01 · Hello</Label>
              <Txt v="display" style={{ fontSize: 56, lineHeight: 56 }}>Right then,{'\n'}{name || 'Adam'}.</Txt>
              <Txt v="body" color={c.inkSoft}>Five quick things and the studio's yours. You'll photograph your pieces, I'll turn them into proper product shots, catalogue them, and style you from what you actually own.</Txt>
              {items.length ? <Txt v="body" color={c.signal}>{items.length} pieces from your first shoot are already catalogued and waiting.</Txt> : null}
            </>
          ) : key === 'body' ? (
            <>
              <Label>02 · Your build</Label>
              <Txt v="editorial">So the clothes fit the twin, and the advice fits you.</Txt>
              <Field label="Name" value={name} onChangeText={setName} />
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 1 }}><Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" placeholder="188" /></View>
                <View style={{ flex: 1 }}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="number-pad" placeholder="85" /></View>
              </View>
              <Field label="Build" value={build} onChangeText={setBuild} />
              <Field label="How you like things to fit" value={fit} onChangeText={setFit} />
            </>
          ) : key === 'twin' ? (
            <>
              <Label>03 · Your twin</Label>
              <Txt v="editorial">Four photos, once. Then "See it on me" works on any look.</Txt>
              <Txt v="small" color={c.muted}>Tap to take a photo, or "From photos" to pick one. Plain background, natural light, no sunglasses.</Txt>
              <TwinPhotos />
            </>
          ) : key === 'style' ? (
            <>
              <Label>04 · Your taste</Label>
              <Txt v="editorial">This is what you told me. Edit anything — the stylist reads it every time.</Txt>
              <Field value={seed} onChangeText={setSeed} multiline style={{ minHeight: 260, textAlignVertical: 'top' }} />
            </>
          ) : (
            <>
              <Label>05 · How you live</Label>
              <Txt v="editorial">Optional admin. Off means everything is always available.</Txt>
              <Toggle label="Track laundry & storage" hint="Mark pieces as in the wash, drying, packed or in the storage unit. The stylist and mixer can then stick to what's wearable." value={laundry} onChange={setLaundry} />
              <Toggle label="Track where things live" hint="Note the drawer, box or rail for each piece — handy for pulling a look together." value={location} onChange={setLocation} />
            </>
          )}
        </Animated.View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: ins.bottom + space.md, flexDirection: 'row', gap: 8, backgroundColor: c.bg }}>
        {step > 0 ? <Button kind="secondary" label="Back" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button label={step === STEPS.length - 1 ? (items.length ? 'Open my wardrobe' : 'Start photographing') : key === 'twin' && !p?.twin?.face_front ? 'Skip for now' : 'Next'}
          onPress={next} loading={update.isPending || finishing} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}
