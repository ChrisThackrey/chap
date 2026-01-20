import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { UserLocation } from '@/types/route';

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = async (): Promise<UserLocation | null> => {
    setLoading(true);
    setError(null);

    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setError('Permission to access location was denied');
        setLoading(false);
        return null;
      }

      // Get current location
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userLoc: UserLocation = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      setLocation(userLoc);
      setLoading(false);
      return userLoc;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get location';
      setError(errorMessage);
      setLoading(false);
      console.error('Location error:', err);
      return null;
    }
  };

  return {
    location,
    error,
    loading,
    requestLocation,
  };
}
