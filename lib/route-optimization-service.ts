/**
 * Route Optimization Service
 *
 * Singleton service that manages route optimization with proper cancellation support.
 * Ensures only one optimization runs at a time and provides clean cancellation of in-flight requests.
 */

import type { RouteStop, RouteSegment } from '@/types/route';
import { optimizeRouteForParking } from './route-optimizer';

export type OptimizationState = 'idle' | 'optimizing' | 'complete' | 'error' | 'cancelled';

export interface OptimizationStatus {
  isRunning: boolean;
  state: OptimizationState;
}

export class RouteOptimizationService {
  private currentController: AbortController | null = null;
  private isRunning = false;
  private currentState: OptimizationState = 'idle';

  /**
   * Optimize a route with automatic cancellation of previous optimization
   *
   * @param stops - Array of route stops to optimize
   * @returns Object containing optimized stops and segments
   * @throws Error if optimization fails (unless cancelled)
   */
  async optimize(stops: RouteStop[]): Promise<{ optimizedStops: RouteStop[]; segments: RouteSegment[] }> {
    console.log('🔄 [OptimizationService] Starting optimization for', stops.length, 'stops');

    // Cancel any existing optimization
    this.cancel();

    // Create new abort controller
    this.currentController = new AbortController();
    this.isRunning = true;
    this.currentState = 'optimizing';

    try {
      // Pass abort signal through the entire chain
      const result = await optimizeRouteForParking(stops, this.currentController.signal);

      this.currentState = 'complete';
      console.log('✅ [OptimizationService] Optimization complete:', result.segments.length, 'segments');

      return result;
    } catch (error) {
      // Check if this was a cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        this.currentState = 'cancelled';
        console.log('🚫 [OptimizationService] Optimization cancelled');
        throw error; // Re-throw so caller knows it was cancelled
      }

      // Other errors
      this.currentState = 'error';
      console.error('❌ [OptimizationService] Optimization failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentController = null;
    }
  }

  /**
   * Cancel the current optimization if one is running
   */
  cancel(): void {
    if (this.currentController) {
      console.log('🛑 [OptimizationService] Cancelling current optimization');
      this.currentController.abort();
      this.currentController = null;
    }
    this.isRunning = false;
    if (this.currentState === 'optimizing') {
      this.currentState = 'cancelled';
    }
  }

  /**
   * Get the current optimization status
   */
  getStatus(): OptimizationStatus {
    return {
      isRunning: this.isRunning,
      state: this.currentState,
    };
  }

  /**
   * Reset the service state
   */
  reset(): void {
    this.cancel();
    this.currentState = 'idle';
  }
}

// Export singleton instance
export const routeOptimizationService = new RouteOptimizationService();
