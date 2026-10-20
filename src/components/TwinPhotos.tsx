import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/icons';
import { RenderImage } from '@/components/RenderImage';
import { toast } from '@/components/sheet';
import { Label, Press, Thinking, Txt } from '@/components/ui';
import { profile as profileApi } from '@/lib/data';
import { haptic } from '@/lib/haptics';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import type { Twin } from '@/lib/types';
import { space, useTheme } from '@/theme';

const SLOTS: { key: keyof Twin & ('face_front' | 'face_left' | 'face_right' | 'full_body'); label: string; tip: string }[] = [
  { key: 'face_front', label: 'Face · front', tip: 'Shoulders up, looking at the lens, even light' },
  { key: 'face_left', label: 'Face · three-quarter', tip: 'Turn your head 45°' },
  { key: 'face_right', label: 'Face · other side', tip: 'The other 45°' },
  { key: 'full_body', label: 'Full length', tip: 'Head to toe, plain fitted clothes, standing straight' },
];

export function TwinPhotos({ onChange }: { onChange?: () => void }) {
  const { c } = useTheme();
  const { data: p } = useProfile();
  const update = useUpdateProfile();
  const [busy, setBusy] = useState<string | null>(null);
  const twin = p?.twin ?? {};
  const pick = async (key: (typeof SLOTS)[number]['key'], camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.92, allowsEditing: key !== 'full_body', aspect: [3, 4] };
    const res = camera ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: key === 'full_body' ? ImagePicker.CameraType.back : ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    setBusy(key);
    try {
      const path = await profileApi.uploadTwinPhoto(key, res.assets[0].uri);
      await update.mutateAsync({ twin: { ...(p?.twin ?? {}), [key]: path, base: undefined, base_status: undefined } });
      haptic.success();
      onChange?.();
    } catch (e: any) {
      toast(e?.message ?? 'Upload failed');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {SLOTS.map((s) => (
        <View key={s.key} style={{ width: '47%', gap: 6 }}>
          <Press onPress={() => pick(s.key, true)} onLongPress={() => pick(s.key, false)} style={{ aspectRatio: 3 / 4, backgroundColor: c.surface, borderWidth: 1, borderColor: twin[s.key] ? c.ink : c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            {twin[s.key] ? <RenderImage path={twin[s.key]} style={{ width: '100%', height: '100%' }} /> : busy === s.key ? <Thinking label="Uploading" /> : <Icon name={s.key === 'full_body' ? 'person' : 'camera'} color={c.muted} />}
          </Press>
          <Label color={c.ink}>{s.label}</Label>
          <Txt v="small" color={c.muted}>{s.tip}</Txt>
          <Press onPress={() => pick(s.key, false)}><Label>From photos</Label></Press>
        </View>
      ))}
    </View>
  );
}

