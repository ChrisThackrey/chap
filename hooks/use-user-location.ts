import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { UserLocation } from '@/types/route';
import { isValidCoordinate } from '@/lib/coordinate-validation';

/** How long to wait for a fresh GPS fix before falling back to the last known position. */
const POSITION_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // De-duplicate concurrent requests (e.g. map mount + "locate me" tap).
  const inFlightRef = useRef<Promise<UserLocation | null> | null>(null);

  const requestLocation = useCallback(async (): Promise<UserLocation | null> => {
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      setLoading(true);
      setError(null);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Permission to access location was denied');
          return null;
        }

        let position: Location.LocationObject | null = null;
        try {
          position = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            POSITION_TIMEOUT_MS,
            'Location request'
          );
        } catch (positionError) {
          // A slow or unavailable GPS fix should not block the user; use the
          // last known position when the OS has one cached.
          console.warn('Current position unavailable, trying last known position:', positionError);
          position = await Location.getLastKnownPositionAsync();
        }

        if (!position || !isValidCoordinate(position.coords.latitude, position.coords.longitude)) {
          setError('Could not determine your location');
          return null;
        }

        const userLoc: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(userLoc);
        return userLoc;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get location';
        setError(errorMessage);
        console.error('Location error:', err);
        return null;
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, []);

  return {
    location,
    error,
    loading,
    requestLocation,
  };
}
