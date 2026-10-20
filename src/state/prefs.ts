// Device-local preferences (UI only). Account-level settings live on the profile row.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type WardrobeView = 'grid' | 'list';
export type SortKey = 'recent' | 'number' | 'colour' | 'brand' | 'most' | 'least' | 'formality' | 'warmth';

interface Prefs {
  theme: ThemePref;
  wardrobeView: WardrobeView;
  gridCols: 2 | 3;
  sort: SortKey;
  useWeather: boolean;
  mixerSmart: boolean;
  mixerAvailableOnly: boolean;
  hapticsOn: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      wardrobeView: 'grid',
      gridCols: 2,
      sort: 'recent',
      useWeather: true,
      mixerSmart: true,
      mixerAvailableOnly: false,
      hapticsOn: true,
      set: (p) => set(p),
    }),
    { name: 'litfits.prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
