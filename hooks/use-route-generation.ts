import { useState, useCallback } from 'react';
import {
  generateRoute,
  generateSingleVenue,
  RouteGenerationOptions,
  SingleVenueOptions,
} from '@/lib/route-generator';
import { findOptimalInsertionPosition } from '@/lib/geo-utils';
import { Route, RouteStop, RouteSegment } from '@/types/route';
import { ValidationWarning } from '@/types/validation';
import { validateRoute } from '@/lib/debug-utils';
import { isValidCoordinate } from '@/lib/coordinate-validation';
import { routeOptimizationService } from '@/lib/route-optimization-service';

type GenerationState = 'idle' | 'loading' | 'success' | 'error';
type OptimizationState = 'idle' | 'optimizing' | 'complete' | 'error' | 'cancelled';

export function useRouteGeneration() {
  const [state, setState] = useState<GenerationState>('idle');
  const [route, setRoute] = useState<Route | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add stop state
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  // Remove stop state
  const [isRemovingStop, setIsRemovingStop] = useState(false);

  // Optimization state
  const [optimizationState, setOptimizationState] = useState<OptimizationState>('idle');
  const [optimizedSegments, setOptimizedSegments] = useState<RouteSegment[]>([]);

  const generate = async (prompt: string, options?: RouteGenerationOptions) => {
    setState('loading');
    setError(null);
    setWarnings([]);

    try {
      const result = await generateRoute(prompt, options);
      setRoute(result.route);
      setWarnings(result.warnings);
      setState('success');

      // Automatically optimize the initial route
      if (result.route.stops.length >= 2) {
        console.log('🔍 [Generate] Optimizing initial route...');
        try {
          const optimizationResult = await routeOptimizationService.optimize(result.route.stops);
          setOptimizedSegments(optimizationResult.segments);
          setOptimizationState('complete');
          console.log('✅ [Generate] Initial route optimized');
        } catch (optError) {
          console.error('❌ [Generate] Initial optimization failed:', optError);
          setOptimizationState('error');
          // Don't throw - route generation was successful
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');
      console.error('Route generation error:', err);
    }
  };

  const addStop = useCallback(
    async (prompt: string, options: Omit<SingleVenueOptions, 'existingStops'>): Promise<{ success: boolean; needsOptimization: boolean; updatedRoute?: Route }> => {
      console.log('🔍 [AddStop] ========== START ADD STOP ==========');
      console.log('🔍 [AddStop] Prompt:', prompt);
      console.log('🔍 [AddStop] Options:', JSON.stringify(options, null, 2));

      if (!route) {
        console.error('❌ [AddStop] No route available');
        setAddStopError('No route to add stop to');
        return { success: false, needsOptimization: false };
      }

      console.log(`🔍 [AddStop] Current route has ${route.stops.length} stops`);
      route.stops.forEach((s, i) => {
        console.log(`🔍 [AddStop] Existing stop ${i + 1}: "${s.name}" order=${s.order} lat=${s.latitude} lon=${s.longitude}`);
      });

      setIsAddingStop(true);
      setAddStopError(null);

      try {
        console.log('🔍 [AddStop] Calling generateSingleVenue...');
        const result = await generateSingleVenue(prompt, {
          ...options,
          existingStops: route.stops,
        });
        console.log('🔍 [AddStop] generateSingleVenue returned successfully');
        console.log('🔍 [AddStop] New stop:', result.stop.name);
        console.log('🔍 [AddStop] New stop coords:', `lat=${result.stop.latitude}, lon=${result.stop.longitude}`);

        // ✅ VALIDATE COORDINATES BEFORE UPDATING STATE
        if (!isValidCoordinate(result.stop.latitude, result.stop.longitude)) {
          const error = `Invalid coordinates for ${result.stop.name}: (${result.stop.latitude}, ${result.stop.longitude})`;
          console.error('❌ [AddStop]', error);
          setAddStopError(error);
          return { success: false, needsOptimization: false };
        }
        console.log('✅ [AddStop] Coordinates validated');

        // Build updated route before state update
        let newRoute: Route | null = null;

        // Use functional update to avoid stale closure issues
        console.log('🔍 [AddStop] Updating route state...');
        setRoute((currentRoute) => {
          if (!currentRoute) {
            console.error('❌ [AddStop] currentRoute is null in setRoute callback');
            return null;
          }

          console.log(`🔍 [AddStop] setRoute callback - current route has ${currentRoute.stops.length} stops`);

          // Sort existing stops by order
          const sortedStops = [...currentRoute.stops].sort((a, b) => a.order - b.order);
          console.log('🔍 [AddStop] Sorted stops:', sortedStops.map(s => `#${s.order}: ${s.name}`).join(', '));

          // Find optimal insertion position
          const stopCoords = sortedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
          const newStopCoord = { latitude: result.stop.latitude, longitude: result.stop.longitude };

          console.log('🔍 [AddStop] Calling findOptimalInsertionPosition');
          console.log('🔍 [AddStop] Existing coords:', stopCoords);
          console.log('🔍 [AddStop] New coord:', newStopCoord);

          const optimalOrder = findOptimalInsertionPosition(stopCoords, newStopCoord);

          console.log(`📍 [AddStop] Optimal insertion position for "${result.stop.name}": ${optimalOrder}`);

          // Renumber all stops to accommodate the new one
          const updatedStops: RouteStop[] = [];

          for (const stop of sortedStops) {
            if (stop.order >= optimalOrder) {
              // Shift stops at or after insertion point
              const shiftedStop = { ...stop, order: stop.order + 1 };
              console.log(`🔍 [AddStop] Shifting "${stop.name}" from order ${stop.order} to ${shiftedStop.order}`);
              updatedStops.push(shiftedStop);
            } else {
              updatedStops.push(stop);
            }
          }

          // Add the new stop with the optimal order
          const newStop: RouteStop = {
            ...result.stop,
            order: optimalOrder,
          };
          console.log(`🔍 [AddStop] Creating new stop "${newStop.name}" with order ${optimalOrder}`);
          console.log(`🔍 [AddStop] New stop coords: lat=${newStop.latitude}, lon=${newStop.longitude}`);
          updatedStops.push(newStop);

          // Sort by order and update route
          updatedStops.sort((a, b) => a.order - b.order);

          console.log(`✅ [AddStop] Added "${newStop.name}" as stop #${optimalOrder}`);
          console.log(`🔍 [AddStop] Updated route will have ${updatedStops.length} stops`);
          updatedStops.forEach((s, i) => {
            console.log(`🔍 [AddStop] Final stop ${i + 1}: "${s.name}" order=${s.order} lat=${s.latitude} lon=${s.longitude}`);
          });

          const updatedRoute = {
            ...currentRoute,
            stops: updatedStops,
          };

          console.log('🔍 [AddStop] Validating updated route before returning...');
          validateRoute(updatedRoute, 'AddStop:PreReturn');

          // Store for return value
          newRoute = updatedRoute;

          console.log('🔍 [AddStop] Returning updated route from setRoute callback');
          return updatedRoute;
        });

        console.log('🔍 [AddStop] setRoute call completed');

        // Add any warnings from validation
        if (result.warnings.length > 0) {
          console.log(`🔍 [AddStop] Adding ${result.warnings.length} warnings`);
          setWarnings((prev) => [...prev, ...result.warnings]);
        }

        console.log('🔍 [AddStop] ========== ADD STOP SUCCESS ==========');
        return { success: true, needsOptimization: true, updatedRoute: newRoute || undefined };
      } catch (err) {
        console.error('❌ [AddStop] ========== ADD STOP ERROR ==========');
        console.error('❌ [AddStop] Error:', err);
        console.error('❌ [AddStop] Stack:', err instanceof Error ? err.stack : 'No stack');
        const errorMessage = err instanceof Error ? err.message : 'Failed to add stop';
        setAddStopError(errorMessage);
        return { success: false, needsOptimization: false };
      } finally {
        console.log('🔍 [AddStop] Finally block - setting isAddingStop = false');
        setIsAddingStop(false);
      }
    },
    [route]
  );

  const optimizeCurrentRoute = useCallback(async (routeToOptimize?: Route): Promise<void> => {
    // Use provided route or fall back to state route
    // This allows calling with fresh route data before state updates complete
    const targetRoute = routeToOptimize || route;

    if (!targetRoute || targetRoute.stops.length < 2) {
      console.log('🔍 [OptimizeRoute] No route or insufficient stops to optimize');
      return;
    }

    console.log('🔍 [OptimizeRoute] ========== START OPTIMIZATION ==========');
    console.log('🔍 [OptimizeRoute] Optimizing route with', targetRoute.stops.length, 'stops');
    console.log('🔍 [OptimizeRoute] Stops:', targetRoute.stops.map(s => `${s.order}:${s.name}`).join(', '));

    setOptimizationState('optimizing');

    try {
      const result = await routeOptimizationService.optimize(targetRoute.stops);

      console.log('✅ [OptimizeRoute] Optimization complete');
      console.log('🔍 [OptimizeRoute] Optimized stops:', result.optimizedStops.length);
      console.log('🔍 [OptimizeRoute] Segments:', result.segments.length);

      // Update route with optimized stops and segments
      setRoute(currentRoute => {
        if (!currentRoute) return null;
        return {
          ...currentRoute,
          stops: result.optimizedStops,
        };
      });

      setOptimizedSegments(result.segments);
      setOptimizationState('complete');

      console.log('🔍 [OptimizeRoute] ========== OPTIMIZATION SUCCESS ==========');
    } catch (err) {
      // Check if it was a cancellation
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('🚫 [OptimizeRoute] Optimization cancelled');
        setOptimizationState('cancelled');
        return;
      }

      console.error('❌ [OptimizeRoute] ========== OPTIMIZATION ERROR ==========');
      console.error('❌ [OptimizeRoute] Error:', err);
      console.error('❌ [OptimizeRoute] Stack:', err instanceof Error ? err.stack : 'No stack');
      setOptimizationState('error');
      throw err;
    }
  }, [route]);

  const clearAddStopError = useCallback(() => {
    setAddStopError(null);
  }, []);

  const removeStop = useCallback(async (stopId: string) => {
    console.log('🔍 [RemoveStop] ========== START REMOVE STOP ==========');
    console.log('🔍 [RemoveStop] Removing stop ID:', stopId);

    setIsRemovingStop(true);
    let updatedRoute: Route | null = null;

    try {
      // Update the route state and capture the result
      setRoute((currentRoute) => {
        if (!currentRoute) return null;

        // Find the stop to remove
        const stopToRemove = currentRoute.stops.find(s => s.id === stopId);
        if (!stopToRemove) {
          console.log('⚠️ [RemoveStop] Stop not found in route');
          return currentRoute;
        }

        console.log(`🗑️ [RemoveStop] Removing "${stopToRemove.name}" (was stop #${stopToRemove.order})`);
        console.log(`🔍 [RemoveStop] Route had ${currentRoute.stops.length} stops`);

        // Filter out the removed stop
        const remainingStops = currentRoute.stops.filter(s => s.id !== stopId);

        // Renumber stops: decrement order for all stops that were after the removed one
        const reorderedStops = remainingStops.map(stop => ({
          ...stop,
          order: stop.order > stopToRemove.order ? stop.order - 1 : stop.order,
        }));

        console.log(`✅ [RemoveStop] Route now has ${reorderedStops.length} stops`);
        reorderedStops.forEach((s, i) => {
          console.log(`   Stop ${i + 1}: "${s.name}" order=${s.order}`);
        });

        const newRoute: Route = {
          ...currentRoute,
          stops: reorderedStops,
        };

        updatedRoute = newRoute;
        return newRoute;
      });

      // Re-optimize after removing stop with the fresh route data
      if (updatedRoute) {
        // TypeScript gets confused here, but we know updatedRoute is Route at runtime
        const safeRoute = updatedRoute as unknown as Route;
        const stopCount = safeRoute.stops.length;

        if (stopCount >= 2) {
          console.log('🔍 [RemoveStop] Re-optimizing route with', stopCount, 'stops');
          try {
            // Pass the fresh route to avoid stale closure
            await optimizeCurrentRoute(safeRoute);
            console.log('✅ [RemoveStop] Route re-optimized successfully');
          } catch (error) {
            console.error('❌ [RemoveStop] Optimization failed:', error);
            // Don't throw - removal was successful even if optimization fails
          }
        } else {
          console.log('🔍 [RemoveStop] Less than 2 stops remaining, clearing segments');
          setOptimizedSegments([]);
          setOptimizationState('idle');
        }
      }

      console.log('🔍 [RemoveStop] ========== REMOVE STOP SUCCESS ==========');
    } catch (error) {
      console.error('❌ [RemoveStop] ========== REMOVE STOP ERROR ==========');
      console.error('❌ [RemoveStop] Error:', error);
      throw error;
    } finally {
      setIsRemovingStop(false);
    }
  }, [optimizeCurrentRoute]);

  const reset = () => {
    setState('idle');
    setRoute(null);
    setWarnings([]);
    setError(null);
    setAddStopError(null);
    setIsAddingStop(false);
    setOptimizedSegments([]);
    setOptimizationState('idle');
    routeOptimizationService.reset();
  };

  const loadRoute = useCallback(async (savedRoute: Route) => {
    setRoute(savedRoute);
    setWarnings([]);
    setError(null);
    setAddStopError(null);
    setIsAddingStop(false);
    setState('success');

    // Optimize loaded route
    if (savedRoute.stops.length >= 2) {
      console.log('🔍 [LoadRoute] Optimizing loaded route...');
      try {
        setOptimizationState('optimizing');
        const result = await routeOptimizationService.optimize(savedRoute.stops);
        setOptimizedSegments(result.segments);
        setOptimizationState('complete');
        console.log('✅ [LoadRoute] Loaded route optimized');
      } catch (error) {
        console.error('❌ [LoadRoute] Optimization failed:', error);
        setOptimizationState('error');
      }
    }
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
    // Remove stop functionality
    removeStop,
    isRemovingStop,
    // Optimization functionality
    optimizeCurrentRoute,
    optimizationState,
    optimizedSegments,
  };
}
