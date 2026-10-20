import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePrefs } from '@/state/prefs';
import { palettes, type Palette, type Scheme } from './tokens';

export * from './tokens';

interface ThemeCtx {
  scheme: Scheme;
  c: Palette;
}

const Ctx = createContext<ThemeCtx>({ scheme: 'light', c: palettes.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = usePrefs((s) => s.theme);
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ scheme, c: palettes[scheme] }), [scheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
