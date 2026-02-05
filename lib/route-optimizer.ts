import type { RouteStop, RouteSegment, TravelMode, RouteCoordinate } from '@/types/route';
import { searchParkingNearVenue as searchParkingGoogle, isGooglePlacesConfigured } from './google-places';
import { searchParkingNearVenue as searchParkingFoursquare } from './foursquare';
import {
  analyzeParkingAvailability,
  calculateWalkingThreshold,
  isWalkingDistanceBetweenStops,
} from './parking-detection';
import { fetchCompleteRouteWithSegments } from './google-directions';

/**
 * Route Optimizer
 *
 * Analyzes route stops and inserts parking locations where needed
 * based on Foursquare parking data and venue proximity.
 */

/**
 * Optimize route for parking by analyzing venue parking availability
 * and inserting park-and-walk segments where beneficial
 *
 * @param stops - Array of route stops in order
 * @returns Enhanced stops and route segments with travel modes
 */
/**
 * Represents a single route segment with its endpoints and travel mode
 */
interface SegmentDefinition {
  from: RouteCoordinate;
  to: RouteCoordinate;
  mode: TravelMode;
}

export async function optimizeRouteForParking(
  stops: RouteStop[],
  signal?: AbortSignal
): Promise<{
  optimizedStops: RouteStop[];
  segments: RouteSegment[];
}> {
  console.log('🔍 [RouteOptimizer] START optimizeRouteForParking');
  console.log('🔍 [RouteOptimizer] Input stops:', stops.length);

  // Check if already cancelled
  if (signal?.aborted) {
    throw new DOMException('Operation cancelled', 'AbortError');
  }

  if (stops.length < 2) {
    console.log('🔍 [RouteOptimizer] Less than 2 stops, returning early');
    return { optimizedStops: stops, segments: [] };
  }

  // Sort stops by order to ensure proper sequence
  const sortedStops = [...stops].sort((a, b) => a.order - b.order);
  console.log('🔍 [RouteOptimizer] Sorted stops:', sortedStops.map(s => `${s.order}: ${s.name}`).join(', '));

  // Validate all stops have valid coordinates
  console.log('🔍 [RouteOptimizer] Validating coordinates...');
  for (let i = 0; i < sortedStops.length; i++) {
    const stop = sortedStops[i];
    console.log(`🔍 [RouteOptimizer] Stop ${i + 1} "${stop.name}": lat=${stop.latitude}, lon=${stop.longitude}`);

    if (!stop.latitude || !stop.longitude || isNaN(stop.latitude) || isNaN(stop.longitude) ||
        stop.latitude === 0 || stop.longitude === 0) {
      console.error(`❌ [RouteOptimizer] Stop "${stop.name}" has invalid coordinates: (${stop.latitude}, ${stop.longitude})`);
      throw new Error(`Cannot optimize route: Stop "${stop.name}" has invalid coordinates (${stop.latitude}, ${stop.longitude})`);
    }
  }
  console.log('✅ [RouteOptimizer] All coordinates valid');

  console.log('🗺️ Optimizing route for parking...');
  console.log(`   Total stops: ${sortedStops.length}`);

  const optimizedStops: RouteStop[] = [];
  // Use segment definitions to ensure proper alignment between coordinates and modes
  const segmentDefinitions: SegmentDefinition[] = [];

  let currentParkingLocation: RouteCoordinate | null = null;
  let isInWalkingMode = false;
  let previousCoordinate: RouteCoordinate = {
    latitude: sortedStops[0].latitude,
    longitude: sortedStops[0].longitude,
  };

  for (let i = 0; i < sortedStops.length; i++) {
    const stop = sortedStops[i];
    const isFirstStop = i === 0;
    const isLastStop = i === sortedStops.length - 1;

    console.log(`   Stop ${i + 1}: ${stop.name}`);

    // First stop is just the starting point, analyze and continue
    if (isFirstStop) {
      const parkingStrategy = analyzeParkingAvailability(
        stop.venueDetails,
        stop.venueDetails?.categories
      );
      console.log(`      Strategy: ${parkingStrategy} (starting point)`);
      stop.parkingStrategy = parkingStrategy;
      optimizedStops.push(stop);
      continue;
    }

    // Analyze parking availability for this stop
    const parkingStrategy = analyzeParkingAvailability(
      stop.venueDetails,
      stop.venueDetails?.categories
    );

    console.log(`      Strategy: ${parkingStrategy}`);

    // Check if next stops are walkable
    const walkingInfo = !isLastStop
      ? calculateWalkingThreshold(sortedStops, i)
      : { canWalkToNext: false, walkableStops: 0 };

    const stopCoordinate: RouteCoordinate = {
      latitude: stop.latitude,
      longitude: stop.longitude,
    };

    if (parkingStrategy === 'park-and-walk' && walkingInfo.canWalkToNext && !isInWalkingMode) {
      // Need to find parking and start walking mode
      console.log(`      Finding parking near venue...`);

      // Use Google Places for parking search if configured, otherwise Foursquare
      const searchParking = isGooglePlacesConfigured() ? searchParkingGoogle : searchParkingFoursquare;

      let parkingLocation = await searchParking(
        stop.latitude,
        stop.longitude,
        500 // 500m radius
      );

      // If no parking within 500m, expand to 1km
      if (!parkingLocation) {
        console.log(`      Expanding search to 1km...`);
        parkingLocation = await searchParking(
          stop.latitude,
          stop.longitude,
          1000
        );
      }

      if (parkingLocation) {
        console.log(`      ✅ Found parking: ${parkingLocation.name}`);
        console.log(`      Walkable stops: ${walkingInfo.walkableStops + 1}`);

        // Store parking location
        currentParkingLocation = {
          latitude: parkingLocation.latitude,
          longitude: parkingLocation.longitude,
        };

        // Update stop with parking info
        stop.parkingStrategy = 'park-and-walk';
        stop.parkingLocation = parkingLocation;

        // Add driving segment from previous location to parking
        segmentDefinitions.push({
          from: previousCoordinate,
          to: currentParkingLocation,
          mode: 'driving',
        });

        // Add walking segment from parking to venue
        segmentDefinitions.push({
          from: currentParkingLocation,
          to: stopCoordinate,
          mode: 'walking',
        });

        // Enter walking mode
        isInWalkingMode = true;
        previousCoordinate = stopCoordinate;
      } else {
        console.log(`      ❌ No parking found, driving to venue`);
        // No parking found, fall back to drive-to-venue
        stop.parkingStrategy = 'drive-to-venue';
        segmentDefinitions.push({
          from: previousCoordinate,
          to: stopCoordinate,
          mode: 'driving',
        });
        previousCoordinate = stopCoordinate;
      }
    } else if (isInWalkingMode && walkingInfo.canWalkToNext) {
      // Continue walking mode
      console.log(`      Continuing in walking mode`);
      stop.parkingStrategy = 'park-and-walk';

      segmentDefinitions.push({
        from: previousCoordinate,
        to: stopCoordinate,
        mode: 'walking',
      });
      previousCoordinate = stopCoordinate;
    } else if (isInWalkingMode && !walkingInfo.canWalkToNext && !isLastStop) {
      // Exit walking mode, resume driving
      console.log(`      Exiting walking mode, next stop too far`);
      stop.parkingStrategy = 'drive-to-venue';

      // Add walking segment to current stop
      segmentDefinitions.push({
        from: previousCoordinate,
        to: stopCoordinate,
        mode: 'walking',
      });

      // Exit walking mode
      isInWalkingMode = false;
      currentParkingLocation = null;
      previousCoordinate = stopCoordinate;
    } else {
      // Normal driving mode or last stop in walking mode
      const mode: TravelMode = isInWalkingMode ? 'walking' : 'driving';
      console.log(`      ${isInWalkingMode ? 'Walking' : 'Driving'} to venue`);
      stop.parkingStrategy = isInWalkingMode ? 'park-and-walk' : 'drive-to-venue';

      segmentDefinitions.push({
        from: previousCoordinate,
        to: stopCoordinate,
        mode,
      });
      previousCoordinate = stopCoordinate;
    }

    optimizedStops.push(stop);
  }

  // Convert segment definitions to parallel arrays for fetchCompleteRouteWithSegments
  const segmentCoordinates: RouteCoordinate[] = [];
  const segmentModes: TravelMode[] = [];

  if (segmentDefinitions.length > 0) {
    // Add the first coordinate
    segmentCoordinates.push(segmentDefinitions[0].from);

    // Add each segment's destination and mode
    for (const segment of segmentDefinitions) {
      segmentCoordinates.push(segment.to);
      segmentModes.push(segment.mode);
    }
  }

  console.log('🗺️ Route optimization complete');
  console.log(`   Segment coordinates: ${segmentCoordinates.length}`);
  console.log(`   Segment modes: ${segmentModes.length}`);
  console.log(`   Expected: modes.length (${segmentModes.length}) === coordinates.length - 1 (${segmentCoordinates.length - 1})`);

  // Validate arrays before calling API
  if (segmentCoordinates.length < 2) {
    console.warn('⚠️ Not enough coordinates for route segments, returning empty segments');
    return { optimizedStops, segments: [] };
  }

  if (segmentModes.length !== segmentCoordinates.length - 1) {
    console.error('❌ Array length mismatch detected!');
    console.error(`   Coordinates: ${segmentCoordinates.length}`);
    console.error(`   Modes: ${segmentModes.length}`);
    console.error(`   Segment definitions: ${segmentDefinitions.length}`);
    // Return empty segments instead of crashing - let the fallback handle it
    return { optimizedStops, segments: [] };
  }

  // Fetch actual route segments with Google Directions
  console.log('🔍 [RouteOptimizer] Fetching route segments from Google Directions...');
  console.log('🔍 [RouteOptimizer] Segment coordinates:', JSON.stringify(segmentCoordinates, null, 2));
  console.log('🔍 [RouteOptimizer] Segment modes:', segmentModes);

  try {
    // Check if cancelled before making API calls
    if (signal?.aborted) {
      throw new DOMException('Operation cancelled', 'AbortError');
    }

    const segments = await fetchCompleteRouteWithSegments(segmentCoordinates, segmentModes, signal);

    console.log(`✅ [RouteOptimizer] Generated ${segments.length} route segments`);
    console.log(`   Walking: ${segments.filter(s => s.mode === 'walking').length}`);
    console.log(`   Driving: ${segments.filter(s => s.mode === 'driving').length}`);

    // Validate returned segments
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      console.log(`🔍 [RouteOptimizer] Segment ${i + 1}: mode=${seg.mode}, coords=${seg.coordinates.length}`);

      // Check for invalid coordinates in segments
      const invalidCoords = seg.coordinates.filter(c =>
        !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude) ||
        c.latitude === 0 || c.longitude === 0
      );

      if (invalidCoords.length > 0) {
        console.error(`❌ [RouteOptimizer] Segment ${i + 1} has ${invalidCoords.length} invalid coordinates!`);
        console.error('❌ [RouteOptimizer] Invalid coords:', invalidCoords);
        throw new Error(`Segment ${i + 1} contains invalid coordinates`);
      }
    }

    console.log('🔍 [RouteOptimizer] END optimizeRouteForParking - SUCCESS');
    return {
      optimizedStops,
      segments,
    };
  } catch (error) {
    console.error('❌ [RouteOptimizer] Error fetching route segments:', error);
    console.error('❌ [RouteOptimizer] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.log('🔍 [RouteOptimizer] END optimizeRouteForParking - ERROR (returning empty segments)');
    // Return empty segments to trigger fallback
    return { optimizedStops, segments: [] };
  }
}

/**
 * Calculate total distance and duration for a route
 */
export function calculateRouteMetrics(segments: RouteSegment[]): {
  totalDistance: number; // meters
  totalDuration: number; // seconds
  walkingDistance: number; // meters
  drivingDistance: number; // meters
} {
  let totalDistance = 0;
  let totalDuration = 0;
  let walkingDistance = 0;
  let drivingDistance = 0;

  for (const segment of segments) {
    totalDistance += segment.distance;
    totalDuration += segment.duration;

    if (segment.mode === 'walking') {
      walkingDistance += segment.distance;
    } else {
      drivingDistance += segment.distance;
    }
  }

  return {
    totalDistance,
    totalDuration,
    walkingDistance,
    drivingDistance,
  };
}
