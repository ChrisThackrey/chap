import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function useLocationPreference() {
  const [location, setLocation] = useState<LocationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load location preference on mount
  useEffect(() => {
    loadLocation();
  }, []);

  const loadLocation = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        setLocation(parsed);
      }
    } catch (err) {
      console.error('Failed to load location preference:', err);
      setError('Failed to load saved location');
    } finally {
      setLoading(false);
    }
  };

  const saveLocation = async (newLocation: LocationPreference) => {
    try {
      setError(null);
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
      setLocation(newLocation);
    } catch (err) {
      console.error('Failed to save location preference:', err);
      setError('Failed to save location');
      throw err;
    }
  };

  const clearLocation = async () => {
    try {
      setError(null);
      await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
      setLocation(null);
    } catch (err) {
      console.error('Failed to clear location preference:', err);
      setError('Failed to clear location');
    }
  };

  const getLocationContext = (): string => {
    if (!location) return '';

    const parts: string[] = [];

    if (location.city) parts.push(location.city);
    if (location.county) parts.push(`${location.county} County`);
    if (location.state) parts.push(location.state);
    if (location.zipCode) parts.push(`(${location.zipCode})`);

    return parts.join(', ');
  };

  return {
    location,
    loading,
    error,
    saveLocation,
    clearLocation,
    getLocationContext,
  };
}
