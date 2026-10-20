import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { InterTight_400Regular } from '@expo-google-fonts/inter-tight/400Regular';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { ToastHost } from '@/components/sheet';
import { queryClient, useRealtimeSync } from '@/lib/queries';
import { DEMO, supabase } from '@/lib/supabase';
import { useCaptureWorker } from '@/state/capture';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'litfits.cache', throttleTime: 2000 });

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(DEMO ? ({ user: { id: 'demo' } } as Session) : undefined);
  useEffect(() => {
    if (DEMO) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function Navigator() {
  const { c, scheme } = useTheme();
  const session = useSession();
  const signedIn = !!session;
  useRealtimeSync(signedIn);
  useCaptureWorker(signedIn);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  useEffect(() => {
    if (session !== undefined) SplashScreen.hideAsync().catch(() => {});
  }, [session]);

  if (session === undefined) return <View style={{ flex: 1, backgroundColor: '#111111' }} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right', animationDuration: 260 }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="edit/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="review" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="builder" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="mixer" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="look/[id]" />
          <Stack.Screen name="ask" />
          <Stack.Screen name="render/[id]" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="shuffle" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="rediscover" />
          <Stack.Screen name="wishlist" />
          <Stack.Screen name="pack" />
          <Stack.Screen name="trip/[id]" />
          <Stack.Screen name="twin" />
          <Stack.Screen name="dna" />
        </Stack.Protected>
      </Stack>
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Anton_400Regular,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#111111' }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 14, dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && !String(q.queryKey[0]).startsWith('signed') } }}
        >
          <ThemeProvider>
            <Navigator />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
