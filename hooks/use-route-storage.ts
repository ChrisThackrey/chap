import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Route } from '@/types/route';

const ROUTES_KEY = '@chap_routes';

export function useRouteStorage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AsyncStorage.getItem(ROUTES_KEY);
      const loadedRoutes = data ? JSON.parse(data) : [];
      setRoutes(loadedRoutes);
      return loadedRoutes as Route[];
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

  const saveRoute = async (route: Route) => {
    try {
      const existing = await AsyncStorage.getItem(ROUTES_KEY);
      const currentRoutes = existing ? JSON.parse(existing) : [];
      currentRoutes.push(route);
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(currentRoutes));
      setRoutes(currentRoutes);
      console.log('Route saved successfully');
    } catch (error) {
      console.error('Failed to save route:', error);
      throw error;
    }
  };

  const deleteRoute = async (routeId: string) => {
    try {
      const filtered = routes.filter((r) => r.id !== routeId);
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(filtered));
      setRoutes(filtered);
      console.log('Route deleted successfully');
    } catch (error) {
      console.error('Failed to delete route:', error);
      throw error;
    }
  };

  return {
    routes,
    loading,
    saveRoute,
    loadRoutes,
    deleteRoute,
  };
}
