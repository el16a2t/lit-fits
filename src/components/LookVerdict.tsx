// The "Sits well / Works / Clashing" indicator, tappable: opens a sheet explaining why, instantly from the
// local rules, with an optional one-tap stylist read (and swaps from the wardrobe) on top.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { ItemImage } from '@/components/ItemImage';
import { Sheet } from '@/components/sheet';
import { Button, Label, Thinking, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { trace } from '@/lib/diag';
import { itemTitle } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { explainLook, verdictOf, type Reason } from '@/lib/outfit';
import { useItems } from '@/lib/queries';
import type { Item, LookCritique } from '@/lib/types';
import { useWeather, weatherLine } from '@/lib/weather';
import { space, useTheme } from '@/theme';

// one stylist read per exact combination, for the life of the app session
const takes = new Map<string, LookCritique>();
const keyOf = (items: Item[]) => items.map((i) => i.id).sort().join('|');

export function LookVerdict({ items, score, clashLabel = 'Clashing', barWidth = 34, small, onSwap }: {
  items: Item[]; score: number; clashLabel?: string; barWidth?: number; small?: boolean;
  /** Apply a stylist-suggested swap in the host screen. Omit to hide the "Try it" buttons. */
  onSwap?: (outId: string, inId: string) => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const verdict = verdictOf(score);
  const label = verdict === 'sits' ? 'Sits well' : verdict === 'works' ? 'Works' : clashLabel;
  const colour = verdict === 'sits' ? c.success : verdict === 'works' ? c.ink : c.signal;

  return (
    <>
      <Pressable
        onPress={() => { haptic.tick(); trace('verdict:open', { verdict, n: items.length }); setOpen(true); }}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 16 }}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Why?`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.55 : 1 })}
      >
        <View style={{ width: barWidth, height: 3, backgroundColor: c.line }}>
          <View style={{ width: `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`, height: 3, backgroundColor: colour }} />
        </View>
        <Label style={small ? { fontSize: 9 } : undefined}>{label}</Label>
        <View style={{ width: small ? 13 : 15, height: small ? 13 : 15, borderRadius: 8, borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="label" color={c.muted} style={{ fontSize: small ? 7.5 : 8.5, lineHeight: small ? 9 : 10, letterSpacing: 0 }}>?</Txt>
        </View>
      </Pressable>
      <VerdictSheet visible={open} onClose={() => setOpen(false)} items={items} score={score} label={label} colour={colour} onSwap={onSwap} />
    </>
  );
}

function VerdictSheet({ visible, onClose, items, score, label, colour, onSwap }: {
  visible: boolean; onClose: () => void; items: Item[]; score: number; label: string; colour: string; onSwap?: (outId: string, inId: string) => void;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const { data: all = [] } = useItems();
  const { data: weather } = useWeather();
  const verdict = verdictOf(score);
  const reasons = useMemo(() => explainLook(items), [items]);
  const issues = reasons.filter((r) => r.tone !== 'good');
  const working = reasons.filter((r) => r.tone === 'good');
  const key = keyOf(items);

  const [take, setTake] = useState<LookCritique | null>(() => takes.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setTake(takes.get(key) ?? null); setErr(null); }, [key]);

  const askStylist = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.critique(items.map((i) => i.id), label.toLowerCase(), weatherLine(weather));
      takes.set(key, r);
      setTake(r);
      haptic.success();
    } catch (e: any) {
      setErr(e?.message ?? 'The stylist is busy. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const sections: { title: string; list: Reason[] }[] = verdict === 'clash'
    ? [{ title: 'Holding it back', list: issues }, { title: 'Working', list: working }]
    : [{ title: 'Working', list: working }, { title: 'Worth knowing', list: issues }];

  return (
    <Sheet visible={visible} onClose={onClose} title={label} footer={
      <Button kind="ghost" label="Ask the stylist more" icon="spark" onPress={() => { onClose(); setTimeout(() => router.push({ pathname: '/ask', params: { focus: items.map((i) => i.id).join(',') } }), 220); }} />
    }>
      <View style={{ gap: space.lg }}>
        <View style={{ gap: 8 }}>
          <View style={{ height: 4, backgroundColor: c.line }}>
            <View style={{ width: `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`, height: 4, backgroundColor: colour }} />
          </View>
          <Txt v="small" color={c.muted}>Quick check of {items.length} pieces against colour, dress code, pattern, weather and season rules. Instant and free.</Txt>
        </View>

        {sections.filter((s) => s.list.length).map((s) => (
          <View key={s.title} style={{ gap: 10 }}>
            <Label>{s.title}</Label>
            {s.list.map((r) => <ReasonRow key={r.title} r={r} />)}
          </View>
        ))}

        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, paddingTop: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="spark" size={16} color={c.signal} />
            <Label>The stylist's take</Label>
          </View>
          {take ? (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: 10 }}>
              <Txt v="editorialSm">{take.headline}</Txt>
              {take.working.map((t, i) => <Bullet key={`w${i}`} tone="good" text={t} />)}
              {take.issues.map((t, i) => <Bullet key={`i${i}`} tone="bad" text={t} />)}
              {take.swaps.length ? <Label style={{ marginTop: 6 }}>Try instead</Label> : null}
              {take.swaps.map((s, i) => {
                const out = byId.get(s.out_id), inn = byId.get(s.in_id);
                if (!out || !inn) return null;
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, padding: 10 }}>
                    <View style={{ width: 52, height: 52, backgroundColor: c.surfaceAlt }}><ItemImage item={inn} small shadow={false} showStatus={false} style={{ width: 52, height: 52 }} /></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt v="smallMedium" numberOfLines={1}>{itemTitle(inn)}</Txt>
                      <Txt v="small" color={c.muted} numberOfLines={1}>instead of {itemTitle(out)}</Txt>
                      <Txt v="small" numberOfLines={3}>{s.why}</Txt>
                    </View>
                    {onSwap ? <Button small kind="secondary" label="Try it" onPress={() => { haptic.medium(); onSwap(s.out_id, s.in_id); onClose(); }} /> : null}
                  </View>
                );
              })}
            </Animated.View>
          ) : loading ? (
            <Thinking label="Reading the look" />
          ) : (
            <View style={{ gap: 8 }}>
              <Txt v="small" color={c.muted}>A considered read on these exact pieces, with swaps from your wardrobe if something's off.</Txt>
              <Button small kind="secondary" label="Get the stylist's take" icon="spark" onPress={askStylist} style={{ alignSelf: 'flex-start' }} />
              {err ? <Txt v="small" color={c.danger}>{err}</Txt> : null}
            </View>
          )}
        </View>
      </View>
    </Sheet>
  );
}

function ReasonRow({ r }: { r: Reason }) {
  const { c } = useTheme();
  const tint = r.tone === 'good' ? c.success : r.tone === 'warn' ? c.ink : c.signal;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 18, alignItems: 'center', paddingTop: 2 }}>
        {r.tone === 'good' ? <Icon name="check" size={16} color={tint} /> : <Icon name={r.tone === 'bad' ? 'close' : 'minus'} size={16} color={tint} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="smallMedium">{r.title}</Txt>
        <Txt v="small" color={c.muted}>{r.detail}</Txt>
      </View>
    </View>
  );
}

function Bullet({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 18, alignItems: 'center', paddingTop: 2 }}>
        <Icon name={tone === 'good' ? 'check' : 'minus'} size={16} color={tone === 'good' ? c.success : c.signal} />
      </View>
      <Txt v="small" style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}
