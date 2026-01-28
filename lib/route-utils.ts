import { Route } from '@/types/route';
import { metersToMiles, calculateDistanceMiles } from './geo-utils';

/**
 * Calculate the total distance of a route in miles
 * Uses segment distances if available, otherwise calculates straight-line distances
 */
export function calculateTotalDistance(route: Route): number {
  // If segments exist, sum their distances (stored in meters)
  if (route.segments && route.segments.length > 0) {
    const totalMeters = route.segments.reduce((sum, seg) => sum + seg.distance, 0);
    return metersToMiles(totalMeters);
  }

  // Fallback: calculate straight-line distance between consecutive stops
  let totalMiles = 0;
  const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sortedStops.length - 1; i++) {
    totalMiles += calculateDistanceMiles(
      sortedStops[i].latitude,
      sortedStops[i].longitude,
      sortedStops[i + 1].latitude,
      sortedStops[i + 1].longitude
    );
  }
  return totalMiles;
}

/**
 * Format a distance in miles for display
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
