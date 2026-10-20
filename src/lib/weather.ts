// Today's weather via Open-Meteo (no key) + coarse location. Cached for an hour.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { usePrefs } from '@/state/prefs';

export interface Weather {
  temp: number;
  min: number;
  max: number;
  rain: number;
  code: number;
  label: string;
  place: string | null;
}

const CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunder',
};

const LONDON = { latitude: 51.5072, longitude: -0.1276 };

async function coords() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    let ok = status === 'granted';
    if (!ok) ok = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
    if (!ok) return { ...LONDON, place: 'London' };
    const last = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
    let place: string | null = null;
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      place = rev[0]?.city ?? rev[0]?.subregion ?? null;
    } catch { /* optional */ }
    return { latitude: last.coords.latitude, longitude: last.coords.longitude, place };
  } catch {
    return { ...LONDON, place: 'London' };
  }
}

export async function fetchWeather(): Promise<Weather> {
  const cached = await AsyncStorage.getItem('litfits.weather').catch(() => null);
  if (cached) {
    const c = JSON.parse(cached);
    if (Date.now() - c.at < 1000 * 60 * 60) return c.w;
  }
  const { latitude, longitude, place } = await coords();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`;
  const d = await (await fetch(url)).json();
  const w: Weather = {
    temp: Math.round(d.current?.temperature_2m ?? 12),
    min: Math.round(d.daily?.temperature_2m_min?.[0] ?? 8),
    max: Math.round(d.daily?.temperature_2m_max?.[0] ?? 14),
    rain: d.daily?.precipitation_probability_max?.[0] ?? 0,
    code: d.current?.weather_code ?? 3,
    label: CODES[d.current?.weather_code ?? 3] ?? 'Mixed',
    place,
  };
  AsyncStorage.setItem('litfits.weather', JSON.stringify({ at: Date.now(), w })).catch(() => {});
  return w;
}

export function weatherLine(w?: Weather | null) {
  if (!w) return null;
  return `${w.place ? w.place + ', ' : ''}${w.label.toLowerCase()}, ${w.min}–${w.max}°C${w.rain >= 30 ? `, ${w.rain}% chance of rain` : ''}`;
}

export function useWeather() {
  const enabled = usePrefs((s) => s.useWeather);
  return useQuery({ queryKey: ['weather'], queryFn: fetchWeather, enabled, staleTime: 1000 * 60 * 30, retry: 0 });
}
