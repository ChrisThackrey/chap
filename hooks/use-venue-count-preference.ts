import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VENUE_COUNT_STORAGE_KEY = '@chap_venue_count_preference';

export const DEFAULT_VENUE_COUNT = 3;
export const MIN_VENUE_COUNT = 2;
export const MAX_VENUE_COUNT = 8;

export interface VenueCountPreference {
  count: number; // 2-8 venues
}

const DEFAULT_PREFERENCE: VenueCountPreference = { count: DEFAULT_VENUE_COUNT };

export function clampVenueCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VENUE_COUNT;
  return Math.min(MAX_VENUE_COUNT, Math.max(MIN_VENUE_COUNT, Math.round(value)));
}

function parseVenueCountPreference(raw: string | null): VenueCountPreference {
  if (!raw) return DEFAULT_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFERENCE;
    const count = Number((parsed as Record<string, unknown>).count);
    if (!Number.isFinite(count)) return DEFAULT_PREFERENCE;
    return { count: clampVenueCount(count) };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function useVenueCountPreference() {
  const [venueCount, setVenueCount] = useState<VenueCountPreference>(DEFAULT_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(VENUE_COUNT_STORAGE_KEY);
        if (!cancelled) setVenueCount(parseVenueCountPreference(stored));
      } catch (err) {
        console.error('Failed to load venue count preference:', err);
        if (!cancelled) setError('Failed to load saved venue count');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveVenueCount = useCallback(async (newCount: VenueCountPreference) => {
    const clamped: VenueCountPreference = { count: clampVenueCount(newCount.count) };
    try {
      setError(null);
      await AsyncStorage.setItem(VENUE_COUNT_STORAGE_KEY, JSON.stringify(clamped));
      setVenueCount(clamped);
    } catch (err) {
      console.error('Failed to save venue count preference:', err);
      setError('Failed to save venue count');
      throw err;
    }
  }, []);

  const clearVenueCount = useCallback(async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(VENUE_COUNT_STORAGE_KEY);
      setVenueCount(DEFAULT_PREFERENCE);
    } catch (err) {
      console.error('Failed to clear venue count preference:', err);
      setError('Failed to clear venue count');
    }
  }, []);

  return {
    venueCount,
    loading,
    error,
    saveVenueCount,
    clearVenueCount,
  };
}
