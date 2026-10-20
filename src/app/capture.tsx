import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Button, Label, Txt } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useCapture, type CaptureKind, type Shot } from '@/state/capture';
import { motion, space, useTheme } from '@/theme';

const PLANS: Record<CaptureKind, { shot: Shot; label: string; tip: string; optional?: boolean }[]> = {
  garment: [
    { shot: 'front', label: 'Front', tip: 'Lay it flat, collar up, sleeves relaxed. Fill the frame.' },
    { shot: 'back', label: 'Back', tip: 'Flip it over. Same spot, same light.' },
    { shot: 'label', label: 'Label', tip: 'Size / care label, close up. Optional, but it makes the details exact.', optional: true },
  ],
  shoes: [
    { shot: 'side', label: 'Side', tip: 'Outer side profile, toe pointing left. Both shoes if you can.' },
    { shot: 'front', label: 'Front', tip: 'Front three-quarter, at shoe height.' },
    { shot: 'label', label: 'Label', tip: 'Size label inside the tongue. Optional.', optional: true },
  ],
  accessory: [
    { shot: 'front', label: 'Front', tip: 'Centre it on a plain surface.' },
    { shot: 'back', label: 'Back', tip: 'Other side, if it matters. Optional.', optional: true },
  ],
};

export default function Capture() {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [kind, setKind] = useState<CaptureKind>('garment');
  const [step, setStep] = useState(0);
  const [shots, setShots] = useState<Partial<Record<Shot, string>>>({});
  const [torch, setTorch] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const enqueue = useCapture((s) => s.enqueue);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const shutter = useSharedValue(1);
  const shutterStyle = useAnimatedStyle(() => ({ transform: [{ scale: shutter.value }] }));

  const plan = PLANS[kind];
  const cur = plan[step];
  const requiredDone = plan.filter((p) => !p.optional).every((p) => shots[p.shot]);

  const record = (uri: string) => {
    const next = { ...shots, [cur.shot]: uri };
    setShots(next);
    const nextStep = plan.findIndex((p, i) => i > step && !next[p.shot]);
    if (nextStep >= 0) setStep(nextStep);
    else finishPiece(next);
  };

  const snap = async () => {
    if (busy || !cam.current) return;
    setBusy(true);
    haptic.rigid();
    shutter.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, motion.springSnappy));
    flash.value = withSequence(withTiming(0.85, { duration: 40 }), withTiming(0, { duration: 260 }));
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (pic?.uri) record(pic.uri);
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92, allowsMultipleSelection: true, selectionLimit: plan.length });
    if (res.canceled) return;
    const next = { ...shots };
    let s = step;
    for (const a of res.assets) {
      const target = plan.find((p, i) => i >= s && !next[p.shot]);
      if (!target) break;
      next[target.shot] = a.uri;
      s = plan.indexOf(target) + 1;
    }
    setShots(next);
    const rem = plan.findIndex((p) => !next[p.shot] && !p.optional);
    if (rem >= 0) setStep(rem);
    else finishPiece(next);
  };

  const finishPiece = (final = shots) => {
    if (!plan.filter((p) => !p.optional).every((p) => final[p.shot])) return;
    enqueue({ kind, photos: final, hint: kind === 'shoes' ? undefined : undefined });
    haptic.success();
    setCount((n) => n + 1);
    setShots({});
    setStep(0);
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111', padding: space.lg, paddingTop: ins.top + space.xxxl, gap: space.lg }}>
        <Txt v="display" color="#F2F0EB">Camera</Txt>
        <Txt v="body" color="#B9B4AA">Lit Fits needs the camera to photograph your pieces. Photos go to your private storage and the studio turns them into product shots.</Txt>
        <Button label="Allow camera" onPress={request} style={{ backgroundColor: '#F2F0EB' }} fg="#111" />
        <Button kind="ghost" fg="#F2F0EB" label="Import from photos instead" onPress={pickFromLibrary} />
        <Button kind="ghost" fg="#8A867D" label="Close" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} animateShutter={false} />
      {/* frame guide */}
      <View pointerEvents="none" style={{ position: 'absolute', top: ins.top + 120, bottom: 230 + ins.bottom, left: 28, right: 28 }}>
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => (
          <View key={`${x}${y}`} style={{
            position: 'absolute', width: 26, height: 26, [x ? 'right' : 'left']: 0, [y ? 'bottom' : 'top']: 0,
            borderColor: '#F2F0EB', borderTopWidth: y ? 0 : 2, borderBottomWidth: y ? 2 : 0, borderLeftWidth: x ? 0 : 2, borderRightWidth: x ? 2 : 0,
          }} />
        ))}
      </View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />

      {/* top bar */}
      <View style={{ position: 'absolute', top: ins.top + 6, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { if (count) router.replace('/review'); else router.back(); }} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color="#F2F0EB" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 2, backgroundColor: 'rgba(0,0,0,0.45)', padding: 3 }}>
          {(['garment', 'shoes', 'accessory'] as CaptureKind[]).map((k) => (
            <Pressable key={k} onPress={() => { haptic.tick(); setKind(k); setStep(0); setShots({}); }} style={{ paddingHorizontal: 12, height: 30, justifyContent: 'center', backgroundColor: kind === k ? '#F2F0EB' : 'transparent' }}>
              <Label color={kind === k ? '#111' : '#F2F0EB'}>{k === 'garment' ? 'Clothing' : k === 'shoes' ? 'Shoes' : 'Accessory'}</Label>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => { haptic.tick(); setTorch((t) => !t); }} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sun" color={torch ? c.signal : '#F2F0EB'} />
        </Pressable>
      </View>

      {/* step + tip */}
      <Animated.View key={`${kind}-${step}`} entering={FadeIn.duration(250)} style={{ position: 'absolute', top: ins.top + 64, left: space.lg, right: space.lg, gap: 4 }}>
        <Label color="#F2F0EB">{String(step + 1).padStart(2, '0')} / {String(plan.length).padStart(2, '0')} · {cur.label}{cur.optional ? ' · optional' : ''}</Label>
        <Txt v="small" color="#D5D2CB">{cur.tip}</Txt>
      </Animated.View>

      {/* bottom controls */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: ins.bottom + 18, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.55)', gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          {plan.map((p, i) => (
            <Pressable key={p.shot} onPress={() => { haptic.tick(); setStep(i); }} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 52, height: 64, borderWidth: i === step ? 2 : 1, borderColor: i === step ? '#F2F0EB' : 'rgba(242,240,235,0.35)', backgroundColor: '#1a1a1a', overflow: 'hidden' }}>
                {shots[p.shot] ? <Animated.View entering={ZoomIn.springify()} style={{ flex: 1 }}><Image source={{ uri: shots[p.shot] }} style={{ flex: 1 }} contentFit="cover" /></Animated.View> : null}
              </View>
              <Label color={i === step ? '#F2F0EB' : '#8A867D'} style={{ fontSize: 9 }}>{p.label}</Label>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl }}>
          <Pressable onPress={pickFromLibrary} style={{ width: 64, alignItems: 'center', gap: 4 }} hitSlop={8}>
            <Icon name="image" color="#F2F0EB" />
            <Label color="#F2F0EB" style={{ fontSize: 9 }}>Photos</Label>
          </Pressable>
          <Pressable onPress={snap} accessibilityLabel="Take photo">
            <Animated.View style={[{ width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: '#F2F0EB', alignItems: 'center', justifyContent: 'center' }, shutterStyle]}>
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#F2F0EB' }} />
            </Animated.View>
          </Pressable>
          <View style={{ width: 64, alignItems: 'center' }}>
            {cur.optional && requiredDone ? (
              <Pressable onPress={() => finishPiece()} hitSlop={8} style={{ alignItems: 'center', gap: 4 }}>
                <Icon name="arrow" color={c.signal} />
                <Label color={c.signal} style={{ fontSize: 9 }}>Skip</Label>
              </Pressable>
            ) : count ? (
              <Pressable onPress={() => router.replace('/review')} hitSlop={8} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ minWidth: 26, height: 26, backgroundColor: c.signal, alignItems: 'center', justifyContent: 'center' }}>
                  <Label color="#111">{count}</Label>
                </View>
                <Label color="#F2F0EB" style={{ fontSize: 9 }}>Done</Label>
              </Pressable>
            ) : null}
          </View>
        </View>
        {count ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ alignItems: 'center' }}>
            <Label color="#8A867D">{count} {count === 1 ? 'piece' : 'pieces'} sent to the studio · keep going</Label>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
