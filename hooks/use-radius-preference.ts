import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RADIUS_STORAGE_KEY = '@chap_radius_preference';
const DEFAULT_RADIUS_MILES = 25;

export interface RadiusPreference {
  radiusMiles: number; // 1-100 miles
}

export function useRadiusPreference() {
  const [radius, setRadius] = useState<RadiusPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load radius preference on mount
  useEffect(() => {
    loadRadius();
  }, []);

  const loadRadius = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        setRadius(parsed);
      } else {
        // Set default radius if none stored
        setRadius({ radiusMiles: DEFAULT_RADIUS_MILES });
      }
    } catch (err) {
      console.error('Failed to load radius preference:', err);
      setError('Failed to load saved radius');
      // Fall back to default on error
      setRadius({ radiusMiles: DEFAULT_RADIUS_MILES });
    } finally {
      setLoading(false);
    }
  };

  const saveRadius = async (newRadius: RadiusPreference) => {
    try {
      setError(null);
      // Clamp radius to valid range
      const clampedRadius = {
        radiusMiles: Math.min(100, Math.max(1, newRadius.radiusMiles)),
      };
      await AsyncStorage.setItem(RADIUS_STORAGE_KEY, JSON.stringify(clampedRadius));
      setRadius(clampedRadius);
    } catch (err) {
      console.error('Failed to save radius preference:', err);
      setError('Failed to save radius');
      throw err;
    }
  };

  const clearRadius = async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(RADIUS_STORAGE_KEY);
      setRadius({ radiusMiles: DEFAULT_RADIUS_MILES });
    } catch (err) {
      console.error('Failed to clear radius preference:', err);
      setError('Failed to clear radius');
    }
  };

  return {
    radius,
    loading,
    error,
    saveRadius,
    clearRadius,
  };
}
