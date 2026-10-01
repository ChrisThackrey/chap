import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIUS_STORAGE_KEY = '@chap_radius_preference';

export const DEFAULT_RADIUS_MILES = 25;
export const MIN_RADIUS_MILES = 1;
export const MAX_RADIUS_MILES = 100;

export interface RadiusPreference {
  radiusMiles: number; // 1-100 miles
}

const DEFAULT_RADIUS: RadiusPreference = { radiusMiles: DEFAULT_RADIUS_MILES };

export function clampRadiusMiles(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Math.round(value)));
}

function parseRadiusPreference(raw: string | null): RadiusPreference {
  if (!raw) return DEFAULT_RADIUS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_RADIUS;
    const radiusMiles = Number((parsed as Record<string, unknown>).radiusMiles);
    if (!Number.isFinite(radiusMiles)) return DEFAULT_RADIUS;
    return { radiusMiles: clampRadiusMiles(radiusMiles) };
  } catch {
    return DEFAULT_RADIUS;
  }
}

export function useRadiusPreference() {
  const [radius, setRadius] = useState<RadiusPreference>(DEFAULT_RADIUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);
        if (!cancelled) setRadius(parseRadiusPreference(stored));
      } catch (err) {
        console.error('Failed to load radius preference:', err);
        if (!cancelled) setError('Failed to load saved radius');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveRadius = useCallback(async (newRadius: RadiusPreference) => {
    const clamped: RadiusPreference = { radiusMiles: clampRadiusMiles(newRadius.radiusMiles) };
    try {
      setError(null);
      await AsyncStorage.setItem(RADIUS_STORAGE_KEY, JSON.stringify(clamped));
      setRadius(clamped);
    } catch (err) {
      console.error('Failed to save radius preference:', err);
      setError('Failed to save radius');
      throw err;
    }
  }, []);

  const clearRadius = useCallback(async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(RADIUS_STORAGE_KEY);
      setRadius(DEFAULT_RADIUS);
    } catch (err) {
      console.error('Failed to clear radius preference:', err);
      setError('Failed to clear radius');
    }
  }, []);

  return {
    radius,
    loading,
    error,
    saveRadius,
    clearRadius,
  };
}
