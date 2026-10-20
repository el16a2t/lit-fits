import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button, Field, Label, Screen, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { errorInfo, trace } from '@/lib/diag';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

export default function Welcome() {
  const { c } = useTheme();
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [name, setName] = useState('Adam');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [step, setStep] = useState<string | null>(null);

  const ready = email.trim().includes('@') && password.length >= 8;
  const inFlight = useRef(false);

  // Diagnostic: records where touches land in the form (capture phase, never claims the touch).
  const probe = (where: string) => ({
    onStartShouldSetResponderCapture: (e: GestureResponderEvent) => {
      trace('touch', { where, x: Math.round(e.nativeEvent.locationX), y: Math.round(e.nativeEvent.locationY), pageY: Math.round(e.nativeEvent.pageY) });
      return false;
    },
  });

  const go = async () => {
    trace('welcome:tap', { mode, emailLen: email.trim().length, pwLen: password.length });
    if (busy || inFlight.current) return;
    if (!ready) {
      haptic.warn();
      setErr(!email.trim().includes('@') ? 'Enter your email address.' : 'Your password needs at least 8 characters.');
      return;
    }
    setErr(null);
    inFlight.current = true;
    setBusy(true);
    try {
      if (mode === 'create') {
        setStep('Setting up your wardrobe…');
        try {
          const r = await api.bootstrap(email.trim(), password, name.trim());
          trace('welcome:bootstrap:ok', { adopted: r?.adopted });
        } catch (e) {
          trace('welcome:bootstrap:error', errorInfo(e));
          if (e instanceof ApiError && e.status === 409) {
            setMode('signin');
            setErr('This Lit Fits already has an owner. Sign in instead.');
            return;
          }
          throw e;
        }
      }
      setStep('Signing you in…');
      const res = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Couldn't reach Lit Fits in time. Check your connection and try again.")), 45_000)),
      ]);
      if (res.error) throw res.error;
      trace('welcome:signin:ok');
      haptic.success();
    } catch (e: any) {
      trace('welcome:error', errorInfo(e));
      haptic.warn();
      setErr(e?.message ?? 'Something went wrong');
    } finally {
      inFlight.current = false;
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <Screen style={{ backgroundColor: '#111111' }} grain>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: 'space-between' }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.duration(700)} style={{ marginTop: space.xxxl }}>
            <Label color="#8A867D">Est. at university · rebuilt 2026</Label>
            <Txt v="display" color="#F2F0EB" style={{ fontSize: 112, lineHeight: 104, marginTop: space.md }}>LIT{'\n'}FITS<Txt v="display" color={c.signal} style={{ fontSize: 112 }}>.</Txt></Txt>
            <Txt v="editorialSm" color="#B9B4AA" style={{ marginTop: space.lg, maxWidth: 300 }}>
              Every piece you own, photographed properly, styled by someone with taste.
            </Txt>
          </Animated.View>

          <Animated.View {...probe('form')} entering={FadeInDown.delay(200).duration(600)} style={{ gap: space.lg, marginTop: space.xxl }}>
            <View {...probe('card')} style={{ backgroundColor: '#F2F0EB', padding: space.lg, gap: space.lg }}>
              <Label color="#111">{mode === 'create' ? 'Set up your wardrobe' : 'Welcome back'}</Label>
              {mode === 'create' && <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" style={{ color: '#111' }} />}
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={{ color: '#111' }} />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'create' ? 'new-password' : 'current-password'} style={{ color: '#111' }} hint={mode === 'create' ? '8+ characters. This app has exactly one user: you.' : undefined} />
              {err ? <Txt v="small" color={c.danger}>{err}</Txt> : null}
              {/* Native (Gesture Handler) button: handles the touch on the native side, like the text fields do. */}
              <RectButton
                onPress={() => { trace('cta:press'); go(); }}
                onActiveStateChange={(active) => { if (active) trace('cta:active'); }}
                underlayColor="#3A3A38"
                style={{ height: 52, backgroundColor: '#111', borderRadius: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: ready || busy ? 1 : 0.45 }}
              >
                {busy ? <ActivityIndicator color="#F2F0EB" size="small" /> : null}
                <Txt v="label" color="#F2F0EB" style={{ fontSize: 11.5, letterSpacing: 1.1 }}>
                  {busy ? (step ?? 'Working…') : mode === 'create' ? 'Create my wardrobe' : 'Sign in'}
                </Txt>
              </RectButton>
            </View>
            <Button kind="ghost" fg="#F2F0EB" label={mode === 'create' ? 'I already have an account' : 'First time here'} onPress={() => { trace('toggle:press'); setErr(null); setMode(mode === 'create' ? 'signin' : 'create'); }} style={{ alignSelf: 'center' }} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
