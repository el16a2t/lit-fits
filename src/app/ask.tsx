import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemImage } from '@/components/ItemImage';
import { LookCard } from '@/components/LookCard';
import { Chip, IconButton, Label, Thinking, TopBar, Txt } from '@/components/ui';
import { streamStylist } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { qk, queryClient, useItems, useMessages, useProfile } from '@/lib/queries';
import type { StylistLook } from '@/lib/types';
import { useWeather, weatherLine } from '@/lib/weather';
import { usePrefs } from '@/state/prefs';
import { space, type as T, useTheme } from '@/theme';

type Block = { type: 'text'; text: string } | { type: 'look'; look: StylistLook };
interface Turn { role: 'user' | 'assistant'; text?: string; blocks?: Block[]; prompt?: string; live?: boolean }

export default function Ask() {
  const params = useLocalSearchParams<{ prompt?: string; thread?: string; focus?: string }>();
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  const router = useRouter();
  const { data: weather } = useWeather();
  const { data: profile } = useProfile();
  const { data: all = [] } = useItems();
  const useWeatherPref = usePrefs((s) => s.useWeather);
  const [threadId, setThreadId] = useState<string | undefined>(params.thread);
  const { data: history } = useMessages(params.thread);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [focus, setFocus] = useState<string[]>(params.focus ? params.focus.split(',').filter(Boolean) : []);
  const scroll = useRef<ScrollViewInstance>(null);
  const abort = useRef<(() => void) | null>(null);
  const sentInitial = useRef(false);
  const laundryOn = !!profile?.preferences?.laundry_tracking;
  const focusItems = useMemo(() => focus.map((id) => all.find((i) => i.id === id)).filter(Boolean), [focus, all]);

  useEffect(() => {
    if (history && !turns.length) {
      setTurns(history.map((m) => (m.role === 'user' ? { role: 'user', text: m.content ?? '' } : { role: 'assistant', blocks: (m.meta?.blocks as Block[]) ?? [{ type: 'text', text: m.content ?? '' }, ...m.looks.map((l) => ({ type: 'look' as const, look: l }))] })));
    }
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    haptic.light();
    setInput('');
    setBusy(true);
    setStatus('Reading your rails');
    setTurns((t) => [...t, { role: 'user', text: prompt }, { role: 'assistant', blocks: [], live: true, prompt }]);
    const patchLive = (fn: (blocks: Block[]) => Block[]) => setTurns((t) => {
      const copy = [...t];
      const last = copy[copy.length - 1];
      if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, blocks: fn(last.blocks ?? []) };
      return copy;
    });
    abort.current = streamStylist(
      {
        prompt,
        thread_id: threadId,
        context: {
          weather: useWeatherPref ? weatherLine(weather) : null,
          available_only: availableOnly,
          focus_item_ids: focus,
        },
      },
      {
        onMeta: (d) => setThreadId(d.thread_id),
        onStatus: setStatus,
        onText: (delta) => patchLive((b) => {
          const last = b[b.length - 1];
          if (last?.type === 'text') return [...b.slice(0, -1), { type: 'text', text: last.text + delta }];
          return [...b, { type: 'text', text: delta }];
        }),
        onLook: (look) => { haptic.medium(); setStatus(null); patchLive((b) => [...b, { type: 'look', look }]); },
        onDone: () => {
          setBusy(false); setStatus(null);
          setTurns((t) => t.map((x) => ({ ...x, live: false })));
          queryClient.invalidateQueries({ queryKey: qk.threads });
          haptic.success();
        },
        onError: (m) => { setBusy(false); setStatus(null); patchLive((b) => [...b, { type: 'text', text: `\n${m}` }]); },
      },
    );
  };

  useEffect(() => {
    if (params.prompt && !sentInitial.current) { sentInitial.current = true; setTimeout(() => send(params.prompt!), 250); }
    return () => abort.current?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [turns]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.bg, paddingTop: ins.top }}>
      <TopBar left={<IconButton name="back" onPress={() => router.back()} />} center={<Label>Stylist</Label>}
        right={<IconButton name="plus" onPress={() => { abort.current?.(); setTurns([]); setThreadId(undefined); setBusy(false); setStatus(null); }} accessibilityLabel="New conversation" />} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        {!turns.length ? (
          <Animated.View entering={FadeIn} style={{ gap: space.md, paddingTop: space.xl }}>
            <Txt v="display" style={{ fontSize: 44, lineHeight: 46 }}>What are{'\n'}we dressing{'\n'}for?</Txt>
            <Txt v="body" color={c.muted}>I only use what's in your wardrobe. I know the weather, your taste and what you haven't worn in a while.</Txt>
            <View style={{ gap: 8, marginTop: space.md }}>
              {['Three looks for the office this week, none of them boring', 'Something for a first date at a wine bar', 'Use my most neglected piece in a great outfit', 'Smart casual wedding guest, outdoors, September'].map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} style={{ alignSelf: 'flex-start', height: undefined, paddingVertical: 8 }} />
              ))}
            </View>
          </Animated.View>
        ) : null}
        {turns.map((t, i) => t.role === 'user' ? (
          <Animated.View key={i} entering={FadeInUp.duration(250)} style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: c.ink, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Txt v="body" color={c.bg}>{t.text}</Txt>
          </Animated.View>
        ) : (
          <View key={i} style={{ gap: space.lg }}>
            {(t.blocks ?? []).map((b, j) => b.type === 'text' ? (
              <Txt key={j} v="body" style={{ fontSize: 16, lineHeight: 23 }}>{b.text.trim()}</Txt>
            ) : (
              <LookCard key={j} look={b.look} index={(t.blocks ?? []).slice(0, j).filter((x) => x.type === 'look').length} prompt={t.prompt} />
            ))}
            {t.live && status ? <Thinking label={status} /> : null}
          </View>
        ))}
      </ScrollView>

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong, paddingHorizontal: space.lg, paddingTop: 8, paddingBottom: ins.bottom + 8, gap: 8, backgroundColor: c.bg }}>
        {focusItems.length || laundryOn ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
            {focusItems.map((it) => (
              <Chip key={it!.id} small label={`${it!.name ?? 'Piece'} ×`} onPress={() => setFocus((f) => f.filter((x) => x !== it!.id))} />
            ))}
            {laundryOn ? <Chip small label="Available only" active={availableOnly} onPress={() => setAvailableOnly((v) => !v)} /> : null}
          </ScrollView>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          {focusItems.length === 1 ? (
            <View style={{ width: 40, height: 48, backgroundColor: c.surface, padding: 3 }}><ItemImage item={focusItems[0]!} small shadow={false} style={{ flex: 1 }} /></View>
          ) : null}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={turns.length ? 'Refine, swap, or ask for more…' : 'Ask for looks, advice, anything'}
            placeholderTextColor={c.faint}
            multiline
            style={[T.body, { flex: 1, color: c.ink, maxHeight: 120, minHeight: 44, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.ink }]}
          />
          <IconButton name="send" bg={busy ? c.surfaceAlt : c.signal} color={c.signalInk} size={44} onPress={() => send(input)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
