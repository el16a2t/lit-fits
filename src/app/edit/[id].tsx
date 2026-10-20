import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { ItemImage } from '@/components/ItemImage';
import { toast } from '@/components/sheet';
import { SubtypePicker } from '@/components/SubtypePicker';
import { Button, Chip, Field, IconButton, Label, Pips, Press, Swatch, Toggle, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { pad3 } from '@/lib/format';
import { useItem, useItems, useProfile, useUpdateItem } from '@/lib/queries';
import { COLOUR_FAMILIES, FITS, KNOWN_BRANDS, LAUNDRY_STATES, MATERIALS, PATTERNS, SEASONS, SUBTYPE_MAP } from '@/lib/taxonomy';
import type { Item, WearMode } from '@/lib/types';
import { space, useTheme } from '@/theme';

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Block({ title, children, ai }: { title: string; children: React.ReactNode; ai?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Label>{title}</Label>
        {ai ? <View style={{ paddingHorizontal: 4, borderWidth: 1, borderColor: c.signal }}><Label color={c.signal} style={{ fontSize: 8 }}>AI</Label></View> : null}
      </View>
      {children}
    </View>
  );
}

function Suggest({ value, options, onPick }: { value: string; options: string[]; onPick: (v: string) => void }) {
  const t = value.trim().toLowerCase();
  const list = options.filter((o) => (!t || o.toLowerCase().includes(t)) && o.toLowerCase() !== t).slice(0, 8);
  if (!list.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
      {list.map((o) => <Chip key={o} small label={o} onPress={() => onPick(o)} />)}
    </ScrollView>
  );
}

export default function EditItem() {
  const { id, review } = useLocalSearchParams<{ id: string; review?: string }>();
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { data: item } = useItem(id);
  const { data: all = [] } = useItems();
  const { data: profile } = useProfile();
  const update = useUpdateItem();
  const [f, setF] = useState<Partial<Item> | null>(null);
  const [picker, setPicker] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (item && !f) setF({ ...item });
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep AI-filled fields fresh while cataloguing finishes, unless the user has edited them
  useEffect(() => {
    if (!item || !f) return;
    const next: Partial<Item> = {};
    for (const k of Object.keys(item) as (keyof Item)[]) {
      if (!touched.has(k) && JSON.stringify(item[k]) !== JSON.stringify(f[k])) (next as any)[k] = item[k];
    }
    if (Object.keys(next).length) setF((p) => ({ ...p, ...next }));
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const brands = useMemo(() => Array.from(new Set([...all.map((i) => i.brand).filter(Boolean) as string[], ...KNOWN_BRANDS])).sort(), [all]);
  const locations = useMemo(() => Array.from(new Set(all.map((i) => i.location).filter(Boolean) as string[])), [all]);
  const tagPool = useMemo(() => Array.from(new Set(['minimal', 'workwear', 'gorpcore', 'technical', 'streetwear', 'heritage', 'preppy', 'smart', 'statement', 'graphic', 'vintage', 'summer', 'travel', ...all.flatMap((i) => i.tags ?? [])])), [all]);

  if (!item || !f) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const set = (p: Partial<Item>) => { setF((prev) => ({ ...prev, ...p })); setTouched((t) => new Set([...t, ...Object.keys(p)])); };
  const ai = (k: keyof Item) => !touched.has(k as string) && item.processing?.steps?.analysis === 'done' && f[k] != null && f[k] !== '';
  const st = SUBTYPE_MAP[f.subtype ?? ''];
  const modes = (f.wear_modes ?? []) as WearMode[];
  const laundryOn = !!profile?.preferences?.laundry_tracking;
  const locationOn = profile?.preferences?.location_tracking !== false;

  const save = async () => {
    const patch: Partial<Item> = {};
    for (const k of touched) (patch as any)[k] = (f as any)[k];
    if (f.subtype && f.subtype !== item.subtype) { patch.slot = SUBTYPE_MAP[f.subtype]?.slot ?? item.slot; patch.category = SUBTYPE_MAP[f.subtype]?.category ?? item.category; }
    if (Object.keys(patch).length) await update.mutateAsync({ id: item.id, patch });
    // render any newly confirmed wear modes
    for (const m of modes) {
      const was = item.wear_modes?.find((x) => x.key === m.key);
      if (m.status === 'confirmed' && was?.status !== 'confirmed') await api.processItem(item.id, 'mode', { mode: m.key }).catch(() => {});
    }
    toast(review ? 'Looks right — filed' : 'Saved');
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <TopBar
        left={<IconButton name="close" onPress={() => router.back()} />}
        center={<Label>{pad3(item.number)} · {review ? 'Review' : 'Edit'}</Label>}
        right={<Button small label="Save" onPress={save} loading={update.isPending} />}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 80 + ins.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-end', marginTop: space.sm }}>
          <View style={{ width: 120, height: 150, backgroundColor: c.surface, padding: 8 }}>
            <ItemImage item={item} style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="small" color={c.muted}>Fields marked AI were read from your photos. Fix anything that's off — the stylist trusts this.</Txt>
          </View>
        </View>

        <Block title="Name" ai={ai('name')}>
          <Field value={f.name ?? ''} onChangeText={(name) => set({ name })} placeholder="e.g. Olive grandad-collar shirt" />
        </Block>

        <Block title="Type" ai={ai('subtype')}>
          <Press onPress={() => setPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.lineStrong, paddingVertical: 12 }}>
            <Txt v="body">{st?.label ?? 'Choose a type'}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {st ? <Label>{st.slot}</Label> : null}
              <Icon name="down" size={18} />
            </View>
          </Press>
        </Block>

        <Block title="Brand" ai={ai('brand')}>
          <Field value={f.brand ?? ''} onChangeText={(brand) => set({ brand })} placeholder="Unbranded" autoCapitalize="words" />
          <Suggest value={f.brand ?? ''} options={brands} onPick={(brand) => set({ brand })} />
        </Block>

        <Block title="Colour" ai={ai('colour_family')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {COLOUR_FAMILIES.map((cf) => <Swatch key={cf.key} hex={cf.hex} size={22} selected={f.colour_family === cf.key} onPress={() => set({ colour_family: cf.key })} label={cf.label} />)}
          </View>
          <Field value={f.colour_name ?? ''} onChangeText={(colour_name) => set({ colour_name })} placeholder="Colour name, e.g. Washed black" />
        </Block>

        <Block title="Pattern" ai={ai('pattern')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PATTERNS.map((p) => <Chip key={p} small label={p} active={f.pattern === p} onPress={() => set({ pattern: p })} />)}
          </View>
        </Block>

        <Block title="Materials" ai={ai('materials')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from(new Set([...(f.materials ?? []), ...MATERIALS])).map((m) => <Chip key={m} small label={m} active={f.materials?.includes(m)} onPress={() => set({ materials: toggle(f.materials ?? [], m) })} />)}
          </View>
        </Block>

        <Block title="Size & fit" ai={ai('size')}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}><Field label="Size" value={f.size ?? ''} onChangeText={(size) => set({ size })} placeholder="L, 32/32, UK 10" autoCapitalize="characters" /></View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {FITS.map((x) => <Chip key={x} small label={x} active={f.fit === x} onPress={() => set({ fit: f.fit === x ? null : x })} />)}
          </View>
          <Field label="Fit notes" value={f.fit_notes ?? ''} onChangeText={(fit_notes) => set({ fit_notes })} placeholder="e.g. Sleeves a touch long, best untucked" multiline />
        </Block>

        <Block title="Warmth & formality" ai={ai('warmth')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt v="small" color={c.muted} style={{ width: 90 }}>Warmth</Txt>
            <Pips value={f.warmth} onChange={(warmth) => set({ warmth })} size={14} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt v="small" color={c.muted} style={{ width: 90 }}>Formality</Txt>
            <Pips value={f.formality} onChange={(formality) => set({ formality })} size={14} />
          </View>
          <Txt v="small" color={c.faint}>Formality: 1 lounge · 2 casual · 3 smart casual · 4 smart · 5 formal</Txt>
        </Block>

        <Block title="Seasons" ai={ai('seasons')}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {SEASONS.map((s) => <Chip key={s} label={s} active={f.seasons?.includes(s)} onPress={() => set({ seasons: toggle(f.seasons ?? [], s) })} style={{ flex: 1, justifyContent: 'center' }} />)}
          </View>
        </Block>

        <Block title="Tags" ai={ai('tags')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(f.tags ?? []).map((t) => <Chip key={t} small label={`${t} ×`} active onPress={() => set({ tags: (f.tags ?? []).filter((x) => x !== t) })} />)}
          </View>
          <Field value={tagDraft} onChangeText={setTagDraft} placeholder="Add a tag" autoCapitalize="none"
            onSubmitEditing={() => { const t = tagDraft.trim().toLowerCase(); if (t) set({ tags: Array.from(new Set([...(f.tags ?? []), t])) }); setTagDraft(''); }} />
          <Suggest value={tagDraft} options={tagPool.filter((t) => !f.tags?.includes(t))} onPick={(t) => { set({ tags: [...(f.tags ?? []), t] }); setTagDraft(''); }} />
        </Block>

        <Block title="Ways to wear it">
          <Txt v="small" color={c.muted}>Each extra way gets its own studio shot (zipped vs open, sleeves rolled…). Describe it precisely, then confirm — nothing is shot until you do.</Txt>
          {modes.map((m, i) => (
            <View key={m.key} style={{ borderWidth: 1, borderColor: m.status === 'suggested' ? c.lineStrong : c.ink, padding: space.md, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Label color={m.status === 'base' ? c.ink : m.status === 'ready' ? c.success : m.status === 'suggested' ? c.signal : c.muted}>
                  {m.status === 'base' ? 'As photographed' : m.status === 'suggested' ? 'Suggested' : m.status === 'ready' ? 'Shot' : m.status === 'confirmed' ? 'Will shoot on save' : m.status}
                </Label>
                <View style={{ flex: 1 }} />
                {m.status !== 'base' ? <IconButton name="trash" size={30} iconSize={16} onPress={() => set({ wear_modes: modes.filter((x) => x.key !== m.key) })} /> : null}
              </View>
              <Field value={m.label} onChangeText={(label) => set({ wear_modes: modes.map((x, j) => (j === i ? { ...x, label } : x)) })} placeholder="Label, e.g. Unzipped" />
              <Field value={m.description} onChangeText={(description) => set({ wear_modes: modes.map((x, j) => (j === i ? { ...x, description } : x)) })} placeholder="Exactly how it looks" multiline />
              {m.status === 'suggested' || m.status === 'failed' ? (
                <Button small kind="secondary" label="Confirm & shoot" icon="camera" onPress={() => set({ wear_modes: modes.map((x, j) => (j === i ? { ...x, status: 'confirmed' } : x)) })} style={{ alignSelf: 'flex-start' }} />
              ) : null}
            </View>
          ))}
          <Button small kind="ghost" icon="plus" label="Add a way to wear it" style={{ alignSelf: 'flex-start' }}
            onPress={() => set({ wear_modes: [...(modes.length ? modes : [{ key: 'base', label: 'As shot', description: '', status: 'base' as const }]), { key: `m${Date.now() % 100000}`, label: '', description: '', status: 'suggested' as const }] })} />
        </Block>

        {locationOn ? (
          <Block title="Where it lives">
            <Field value={f.location ?? ''} onChangeText={(location) => set({ location })} placeholder="Wardrobe left, under-bed box, storage unit…" />
            <Suggest value={f.location ?? ''} options={locations} onPick={(location) => set({ location })} />
          </Block>
        ) : null}

        {laundryOn ? (
          <Block title="Status">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {LAUNDRY_STATES.map((l) => <Chip key={l.key} small label={l.label} active={f.laundry === l.key} onPress={() => set({ laundry: l.key })} />)}
            </View>
          </Block>
        ) : null}

        <Block title="Extras">
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}><Field label="Price (£)" value={f.price != null ? String(f.price) : ''} onChangeText={(v) => set({ price: v ? Number(v.replace(/[^0-9.]/g, '')) : null })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Bought" value={f.acquired_on ?? ''} onChangeText={(acquired_on) => set({ acquired_on: acquired_on || null })} placeholder="2025-03" /></View>
          </View>
          <Field label="Care" value={f.care ?? ''} onChangeText={(care) => set({ care })} placeholder="30° wash, line dry" />
          <Field label="Notes" value={f.notes ?? ''} onChangeText={(notes) => set({ notes })} multiline placeholder="Anything the stylist should know" />
          <Toggle label="Favourite" value={!!f.favourite} onChange={(favourite) => set({ favourite })} />
        </Block>
      </ScrollView>
      <SubtypePicker visible={picker} onClose={() => setPicker(false)} value={f.subtype} onPick={(s) => set({ subtype: s.key, warmth: f.warmth ?? s.warmth, formality: f.formality ?? s.formality })} />
    </KeyboardAvoidingView>
  );
}
