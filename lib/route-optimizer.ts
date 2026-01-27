import type { RouteStop, RouteSegment, TravelMode, RouteCoordinate } from '@/types/route';
import { searchParkingNearVenue } from './foursquare';
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
export async function optimizeRouteForParking(
  stops: RouteStop[]
): Promise<{
  optimizedStops: RouteStop[];
  segments: RouteSegment[];
}> {
  if (stops.length < 2) {
    return { optimizedStops: stops, segments: [] };
  }

  console.log('🗺️ Optimizing route for parking...');
  console.log(`   Total stops: ${stops.length}`);

  const optimizedStops: RouteStop[] = [];
  const segmentCoordinates: RouteCoordinate[] = [];
  const segmentModes: TravelMode[] = [];

  let currentParkingLocation: RouteCoordinate | null = null;
  let isInWalkingMode = false;

  // Add first stop as starting point
  segmentCoordinates.push({
    latitude: stops[0].latitude,
    longitude: stops[0].longitude,
  });

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const isFirstStop = i === 0;
    const isLastStop = i === stops.length - 1;

    console.log(`   Stop ${i + 1}: ${stop.name}`);

    // First stop is already added as starting point, just analyze and continue
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
      ? calculateWalkingThreshold(stops, i)
      : { canWalkToNext: false, walkableStops: 0 };

    if (parkingStrategy === 'park-and-walk' && walkingInfo.canWalkToNext && !isInWalkingMode) {
      // Need to find parking and start walking mode
      console.log(`      Finding parking near venue...`);

      let parkingLocation = await searchParkingNearVenue(
        stop.latitude,
        stop.longitude,
        500 // 500m radius
      );

      // If no parking within 500m, expand to 1km
      if (!parkingLocation) {
        console.log(`      Expanding search to 1km...`);
        parkingLocation = await searchParkingNearVenue(
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

        // Add driving segment to parking location
        segmentCoordinates.push(currentParkingLocation);
        segmentModes.push('driving');

        // Enter walking mode
        isInWalkingMode = true;

        // Add walking segment from parking to venue
        segmentCoordinates.push({
          latitude: stop.latitude,
          longitude: stop.longitude,
        });
        segmentModes.push('walking');
      } else {
        console.log(`      ❌ No parking found, driving to venue`);
        // No parking found, fall back to drive-to-venue
        stop.parkingStrategy = 'drive-to-venue';
        segmentCoordinates.push({
          latitude: stop.latitude,
          longitude: stop.longitude,
        });
        segmentModes.push('driving');
      }
    } else if (isInWalkingMode && walkingInfo.canWalkToNext) {
      // Continue walking mode
      console.log(`      Continuing in walking mode`);
      stop.parkingStrategy = 'park-and-walk';

      segmentCoordinates.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
      });
      segmentModes.push('walking');
    } else if (isInWalkingMode && !walkingInfo.canWalkToNext && !isLastStop) {
      // Exit walking mode, resume driving
      console.log(`      Exiting walking mode, next stop too far`);
      stop.parkingStrategy = 'drive-to-venue';

      // Add walking segment to current stop
      segmentCoordinates.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
      });
      segmentModes.push('walking');

      // Exit walking mode
      isInWalkingMode = false;
      currentParkingLocation = null;
    } else {
      // Normal driving mode
      console.log(`      Driving to venue`);
      stop.parkingStrategy = 'drive-to-venue';

      segmentCoordinates.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
      });
      segmentModes.push('driving');
    }

    optimizedStops.push(stop);
  }

  console.log('🗺️ Route optimization complete');
  console.log(`   Segment coordinates: ${segmentCoordinates.length}`);
  console.log(`   Segment modes: ${segmentModes.length}`);

  // Fetch actual route segments with Google Directions
  console.log('📍 Fetching route segments from Google Directions...');
  const segments = await fetchCompleteRouteWithSegments(segmentCoordinates, segmentModes);

  console.log(`✅ Generated ${segments.length} route segments`);
  console.log(`   Walking: ${segments.filter(s => s.mode === 'walking').length}`);
  console.log(`   Driving: ${segments.filter(s => s.mode === 'driving').length}`);

  return {
    optimizedStops,
    segments,
  };
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
