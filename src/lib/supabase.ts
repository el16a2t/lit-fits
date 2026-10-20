import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseAnonKey: string };

export const SUPABASE_URL = extra.supabaseUrl;
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey;
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

/** Android's HTTP stack never times out on its own; give every Supabase request a ceiling. */
const fetchWithCeiling: typeof fetch = (input, init) => {
  if (init?.signal) return fetch(input, init);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  return fetch(input, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithCeiling },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh only while the app is in the foreground (recommended for RN).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1/api`;
