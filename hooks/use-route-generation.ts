import { useState, useCallback } from 'react';
import {
  generateRoute,
  generateRoutePlan,
  RouteGenerationOptions,
} from '@/lib/route-generator';
import { Route, RouteStop, RoutePlan } from '@/types/route';
import { ValidationWarning } from '@/types/validation';
import uuid from 'react-native-uuid';

type GenerationState = 'idle' | 'loading' | 'planning' | 'building' | 'success' | 'error';

const MAX_VENUE_COUNT = 20;

export function useRouteGeneration() {
  const [state, setState] = useState<GenerationState>('idle');
  const [route, setRoute] = useState<Route | null>(null);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Remove stop state
  const [isRemovingStop, setIsRemovingStop] = useState(false);

  const generate = async (prompt: string, options?: RouteGenerationOptions) => {
    setState('loading');
    setError(null);
    setWarnings([]);

    try {
      const result = await generateRoute(prompt, options);
      setRoute({
        ...result.route,
        originalPrompt: prompt,
        generationOptions: options,
      });
      setWarnings(result.warnings);
      setState('success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');
      console.error('Route generation error:', err);
    }
  };

  const generatePlan = async (prompt: string, options?: RouteGenerationOptions) => {
    setState('planning');
    setError(null);
    setWarnings([]);
    setRoutePlan(null);
    try {
      const plan = await generateRoutePlan(prompt, options);
      setRoutePlan(plan);
      setState('building');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');
      console.error('Route plan generation error:', err);
    }
  };

  const cancelBuilding = useCallback(() => {
    setState('idle');
    setRoutePlan(null);
  }, []);

  const canAddStop = !!(route && route.stops.length < MAX_VENUE_COUNT);

  const removeStop = useCallback(async (stopId: string) => {
    setIsRemovingStop(true);

    try {
      setRoute(currentRoute => {
        if (!currentRoute) return null;

        const stopToRemove = currentRoute.stops.find(s => s.id === stopId);
        if (!stopToRemove) return currentRoute;

        const remainingStops = currentRoute.stops.filter(s => s.id !== stopId);
        const reorderedStops = remainingStops.map(stop => ({
          ...stop,
          order: stop.order > stopToRemove.order ? stop.order - 1 : stop.order,
        }));

        return { ...currentRoute, stops: reorderedStops, segments: undefined };
      });
    } catch (error) {
      console.error('[RemoveStop] Error:', error);
      throw error;
    } finally {
      setIsRemovingStop(false);
    }
  }, []);

  const reset = () => {
    setState('idle');
    setRoute(null);
    setRoutePlan(null);
    setWarnings([]);
    setError(null);
  };

  const createRouteFromStops = useCallback((stops: RouteStop[], title: string, options?: RouteGenerationOptions, originalPrompt?: string) => {
    setState('success');
    setError(null);
    setWarnings([]);
    const orderedStops = stops.map((s, i) => ({ ...s, order: i + 1 }));
    setRoute({
      id: String(uuid.v4()),
      title,
      stops: orderedStops,
      createdAt: new Date().toISOString(),
      generationOptions: options,
      originalPrompt,
    });
  }, []);

  const loadRoute = useCallback(async (savedRoute: Route) => {
    setRoute(savedRoute);
    setWarnings([]);
    setError(null);
    setState('success');
  }, []);

  return {
    state,
    route,
    routePlan,
    warnings,
    error,
    generate,
    generatePlan,
    cancelBuilding,
    reset,
    loadRoute,
    // Add stop
    canAddStop,
    // Create route from stops
    createRouteFromStops,
    // Remove stop
    removeStop,
    isRemovingStop,
  };
}
