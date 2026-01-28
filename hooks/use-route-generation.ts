import { useState, useCallback } from 'react';
import {
  generateRoute,
  generateSingleVenue,
  RouteGenerationOptions,
  SingleVenueOptions,
} from '@/lib/route-generator';
import { findOptimalInsertionPosition } from '@/lib/geo-utils';
import { Route, RouteStop } from '@/types/route';
import { ValidationWarning } from '@/types/validation';

type GenerationState = 'idle' | 'loading' | 'success' | 'error';

export function useRouteGeneration() {
  const [state, setState] = useState<GenerationState>('idle');
  const [route, setRoute] = useState<Route | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add stop state
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const generate = async (prompt: string, options?: RouteGenerationOptions) => {
    setState('loading');
    setError(null);
    setWarnings([]);

    try {
      const result = await generateRoute(prompt, options);
      setRoute(result.route);
      setWarnings(result.warnings);
      setState('success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');
      console.error('Route generation error:', err);
    }
  };

  const addStop = useCallback(
    async (prompt: string, options: Omit<SingleVenueOptions, 'existingStops'>) => {
      if (!route) {
        setAddStopError('No route to add stop to');
        return;
      }

      setIsAddingStop(true);
      setAddStopError(null);

      try {
        const result = await generateSingleVenue(prompt, {
          ...options,
          existingStops: route.stops,
        });

        // Sort existing stops by order
        const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);

        // Find optimal insertion position
        const optimalOrder = findOptimalInsertionPosition(
          sortedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
          { latitude: result.stop.latitude, longitude: result.stop.longitude }
        );

        console.log(`📍 Optimal insertion position for "${result.stop.name}": ${optimalOrder}`);

        // Renumber all stops to accommodate the new one
        const updatedStops: RouteStop[] = [];

        for (const stop of sortedStops) {
          if (stop.order >= optimalOrder) {
            // Shift stops at or after insertion point
            updatedStops.push({ ...stop, order: stop.order + 1 });
          } else {
            updatedStops.push(stop);
          }
        }

        // Add the new stop with the optimal order
        const newStop: RouteStop = {
          ...result.stop,
          order: optimalOrder,
        };
        updatedStops.push(newStop);

        // Sort by order and update route
        updatedStops.sort((a, b) => a.order - b.order);

        setRoute({
          ...route,
          stops: updatedStops,
        });

        // Add any warnings from validation
        if (result.warnings.length > 0) {
          setWarnings((prev) => [...prev, ...result.warnings]);
        }

        console.log(`✅ Added "${newStop.name}" as stop #${optimalOrder}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add stop';
        setAddStopError(errorMessage);
        console.error('Add stop error:', err);
      } finally {
        setIsAddingStop(false);
      }
    },
    [route]
  );

  const clearAddStopError = useCallback(() => {
    setAddStopError(null);
  }, []);

  const reset = () => {
    setState('idle');
    setRoute(null);
    setWarnings([]);
    setError(null);
    setAddStopError(null);
    setIsAddingStop(false);
  };

  const loadRoute = useCallback((savedRoute: Route) => {
    setRoute(savedRoute);
    setWarnings([]);
    setError(null);
    setAddStopError(null);
    setIsAddingStop(false);
    setState('success');
  }, []);

  return {
    state,
    route,
    warnings,
    error,
    generate,
    reset,
    loadRoute,
    // Add stop functionality
    isAddingStop,
    addStopError,
    addStop,
    clearAddStopError,
  };
}
