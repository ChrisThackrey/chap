import AsyncStorage from '@react-native-async-storage/async-storage';
import { Route } from '@/types/route';

const ROUTES_KEY = '@chap_routes';

export function useRouteStorage() {
  const saveRoute = async (route: Route) => {
    try {
      const existing = await AsyncStorage.getItem(ROUTES_KEY);
      const routes = existing ? JSON.parse(existing) : [];
      routes.push(route);
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
      console.log('Route saved successfully');
    } catch (error) {
      console.error('Failed to save route:', error);
      throw error;
    }
  };

  const loadRoutes = async (): Promise<Route[]> => {
    try {
      const data = await AsyncStorage.getItem(ROUTES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load routes:', error);
      return [];
    }
  };

  const deleteRoute = async (routeId: string) => {
    try {
      const routes = await loadRoutes();
      const filtered = routes.filter((r) => r.id !== routeId);
      await AsyncStorage.setItem(ROUTES_KEY, JSON.stringify(filtered));
      console.log('Route deleted successfully');
    } catch (error) {
      console.error('Failed to delete route:', error);
      throw error;
    }
  };

  return {
    saveRoute,
    loadRoutes,
    deleteRoute,
  };
}
