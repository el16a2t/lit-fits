// Route-level error boundary (Expo Router: export it as `ErrorBoundary` from a screen file).
// A rendering error in one screen shows this panel instead of taking the whole app down, and the real error and
// stack are written to the crash-safe log first. React 19 reports uncaught render errors outside ErrorUtils, so
// without a boundary they kill the app with nothing recorded (which is how the Explore crash hid).
import type { ErrorBoundaryProps } from 'expo-router';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Label, Txt } from '@/components/ui';
import { traceNow } from '@/lib/diag';
import { space, useTheme } from '@/theme';

export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const { c } = useTheme();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    traceNow('route:error', { path, name: error?.name, message: String(error?.message ?? error).slice(0, 400), stack: String(error?.stack ?? '').slice(0, 1500) });
  }, [error, path]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, justifyContent: 'center', gap: space.md }}>
      <Label color={c.signal}>Something broke on this screen</Label>
      <Txt v="editorial">That one's on me.</Txt>
      <Txt v="body" color={c.muted}>The rest of the app is fine, and the details have been logged so it can be fixed.</Txt>
      <Txt v="small" color={c.faint} numberOfLines={3}>{String(error?.message ?? error)}</Txt>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Button style={{ flex: 1 }} label="Try again" icon="refresh" onPress={retry} />
        <Button style={{ flex: 1 }} kind="secondary" label="Wardrobe" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}
