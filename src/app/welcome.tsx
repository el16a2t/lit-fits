import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button, Field, Label, Screen, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
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

  const go = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        try {
          await api.bootstrap(email.trim(), password, name.trim());
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            setMode('signin');
            setErr('This Lit Fits already has an owner. Sign in instead.');
            return;
          }
          throw e;
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      haptic.success();
    } catch (e: any) {
      haptic.warn();
      setErr(e?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
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

          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={{ gap: space.lg, marginTop: space.xxl }}>
            <View style={{ backgroundColor: '#F2F0EB', padding: space.lg, gap: space.lg }}>
              <Label color="#111">{mode === 'create' ? 'Set up your wardrobe' : 'Welcome back'}</Label>
              {mode === 'create' && <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" style={{ color: '#111' }} />}
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={{ color: '#111' }} />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'create' ? 'new-password' : 'current-password'} style={{ color: '#111' }} hint={mode === 'create' ? '8+ characters. This app has exactly one user: you.' : undefined} />
              {err ? <Txt v="small" color={c.danger}>{err}</Txt> : null}
              <Button label={mode === 'create' ? 'Create my wardrobe' : 'Sign in'} onPress={go} loading={busy} disabled={!email || password.length < 8} style={{ backgroundColor: '#111' }} fg="#F2F0EB" />
            </View>
            <Button kind="ghost" fg="#F2F0EB" label={mode === 'create' ? 'I already have an account' : 'First time here'} onPress={() => { setErr(null); setMode(mode === 'create' ? 'signin' : 'create'); }} style={{ alignSelf: 'center' }} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
