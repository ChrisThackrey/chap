import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidCoordinate } from '@/lib/coordinate-validation';

const LOCATION_STORAGE_KEY = '@chap_location_preference';

export interface LocationPreference {
  city?: string;
  state?: string;
  county?: string;
  zipCode?: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Validate persisted JSON before trusting it. Storage can contain data written
 * by older app versions or partially written records; a malformed value must
 * degrade to "no preference" rather than crash the planner screen.
 */
function parseLocationPreference(raw: string | null): LocationPreference | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    if (!isValidCoordinate(latitude, longitude)) return null;
    return {
      latitude,
      longitude,
      displayName: optionalString(candidate.displayName) ?? 'Saved location',
      city: optionalString(candidate.city),
      state: optionalString(candidate.state),
      county: optionalString(candidate.county),
      zipCode: optionalString(candidate.zipCode),
    };
  } catch {
    return null;
  }
}

export function useLocationPreference() {
  const [location, setLocation] = useState<LocationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        if (!cancelled) setLocation(parseLocationPreference(stored));
      } catch (err) {
        console.error('Failed to load location preference:', err);
        if (!cancelled) setError('Failed to load saved location');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveLocation = useCallback(async (newLocation: LocationPreference) => {
    if (!isValidCoordinate(newLocation.latitude, newLocation.longitude)) {
      setError('Invalid location coordinates');
      throw new Error('Invalid location coordinates');
    }
    try {
      setError(null);
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
      setLocation(newLocation);
    } catch (err) {
      console.error('Failed to save location preference:', err);
      setError('Failed to save location');
      throw err;
    }
  }, []);

  const clearLocation = useCallback(async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
      setLocation(null);
    } catch (err) {
      console.error('Failed to clear location preference:', err);
      setError('Failed to clear location');
    }
  }, []);

  const getLocationContext = useCallback((): string => {
    if (!location) return '';

    const parts: string[] = [];
    if (location.city) parts.push(location.city);
    if (location.county) parts.push(`${location.county} County`);
    if (location.state) parts.push(location.state);
    if (location.zipCode) parts.push(`(${location.zipCode})`);

    return parts.join(', ');
  }, [location]);

  return {
    location,
    loading,
    error,
    saveLocation,
    clearLocation,
    getLocationContext,
  };
}
