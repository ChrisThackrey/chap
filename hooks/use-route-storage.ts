import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { Route, RouteStop } from '@/types/route';
import { isValidCoordinate } from '@/lib/coordinate-validation';

const ROUTES_KEY = '@chap_routes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalise a persisted stop. Older saves may lack `id`; anything without
 * usable coordinates or a name is dropped rather than rendered as a broken
 * marker.
 */
function sanitizeStop(raw: unknown, index: number): RouteStop | null {
  if (!isRecord(raw)) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!isValidCoordinate(latitude, longitude)) return null;
  if (typeof raw.name !== 'string' || raw.name.length === 0) return null;

  const duration = Number(raw.duration);
  const order = Number(raw.order);

  return {
    ...(raw as unknown as RouteStop),
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : String(uuid.v4()),
    name: raw.name,
    latitude,
    longitude,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : 60,
    order: Number.isFinite(order) ? order : index + 1,
  };
}

/**
 * Validate and migrate a persisted route. Returns null when the record is
 * unusable so a single corrupt entry cannot take down the saved-routes list.
 */
function sanitizeRoute(raw: unknown): Route | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  if (!Array.isArray(raw.stops)) return null;

  const stops = raw.stops
    .map((stop, index) => sanitizeStop(stop, index))
    .filter((stop): stop is RouteStop => stop !== null);
  if (stops.length === 0) return null;

  return {
    ...(raw as unknown as Route),
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title.length > 0 ? raw.title : 'Untitled route',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    stops,
  };
}

function parseStoredRoutes(raw: string | null): Route[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeRoute).filter((route): route is Route => route !== null);
  } catch (error) {
    console.error('Stored routes are corrupt, starting fresh:', error);
    return [];
  }
}

export function useRouteStorage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AsyncStorage.getItem(ROUTES_KEY);
      const loadedRoutes = parseStoredRoutes(data);
      setRoutes(loadedRoutes);
      return loadedRoutes;
    } catch (error) {
      console.error('Failed to load routes:', error);
      setRoutes([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  /**
   * Save (or overwrite) a route. Upserting by id prevents duplicate keys in the
   * list when the same generated route is saved twice.
   */
  const saveRoute = useCallback(async (route: Route) => {
    try {
      const existing = parseStoredRoutes(await AsyncStorage.getItem(ROUTES_KEY));
      const withoutCurrent = existing.filter((r) => r.id !== route.id);
      const nextRoutes = [...withoutCurrent, route];
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(nextRoutes));
      setRoutes(nextRoutes);
    } catch (error) {
      console.error('Failed to save route:', error);
      throw error;
    }
  }, []);

  const deleteRoute = useCallback(async (routeId: string) => {
    try {
      const existing = parseStoredRoutes(await AsyncStorage.getItem(ROUTES_KEY));
      const filtered = existing.filter((r) => r.id !== routeId);
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(filtered));
      setRoutes(filtered);
    } catch (error) {
      console.error('Failed to delete route:', error);
      throw error;
    }
  }, []);

  return {
    routes,
    loading,
    saveRoute,
    loadRoutes,
    deleteRoute,
  };
}
