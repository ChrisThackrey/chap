import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VENUE_COUNT_STORAGE_KEY = '@chap_venue_count_preference';
const DEFAULT_VENUE_COUNT = 3;
const MIN_VENUE_COUNT = 2;
const MAX_VENUE_COUNT = 8;

export interface VenueCountPreference {
  count: number; // 2-8 venues
}

export function useVenueCountPreference() {
  const [venueCount, setVenueCount] = useState<VenueCountPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVenueCount();
  }, []);

  const loadVenueCount = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(VENUE_COUNT_STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        setVenueCount(parsed);
      } else {
        setVenueCount({ count: 3 });
      }
    } catch (err) {
      console.error('Failed to load venue count preference:', err);
      setError('Failed to load saved venue count');
      setVenueCount({ count: 3 });
    } finally {
      setLoading(false);
    }
  };

  const saveVenueCount = async (newCount: VenueCountPreference) => {
    try {
      setError(null);
      const clampedCount = {
        count: Math.min(MAX_VENUE_COUNT, Math.max(MIN_VENUE_COUNT, newCount.count)),
      };
      await AsyncStorage.setItem(VENUE_COUNT_STORAGE_KEY, JSON.stringify(clampedCount));
      setVenueCount(clampedCount);
    } catch (err) {
      console.error('Failed to save venue count preference:', err);
      setError('Failed to save venue count');
      throw err;
    }
  };

  const clearVenueCount = async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(VENUE_COUNT_STORAGE_KEY);
      setVenueCount({ count: 3 });
    } catch (err) {
      console.error('Failed to clear venue count preference:', err);
      setError('Failed to clear venue count');
    }
  };

  return {
    venueCount,
    loading,
    error,
    saveVenueCount,
    clearVenueCount,
  };
}
