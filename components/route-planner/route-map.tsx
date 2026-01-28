import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking, Alert, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { AddStopModal } from './add-stop-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Route, RouteStop, RouteSegment } from '@/types/route';
import { fetchCompleteRoute, RouteCoordinate } from '@/lib/google-directions';
import { optimizeRouteForParking } from '@/lib/route-optimizer';
import { MapColors } from '@/constants/theme';

// Animation configuration
const ANIMATION_CONFIG = {
  INITIAL_ZOOM_DELAY: 800,      // Delay before zooming to route bounds
  ZOOM_DURATION: 1200,          // Duration of zoom animation
  MARKER_STAGGER_DELAY: 150,    // Delay between each marker appearing
  MARKER_FADE_DURATION: 400,    // Duration of marker fade-in
  ROUTE_FADE_DURATION: 600,     // Duration of route line fade-in
  ROUTE_APPEAR_DELAY: 400,      // Delay before route starts appearing
};

// Pastel map style for Google Maps - soft, muted colors
const PASTEL_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8e8d6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e8d4c0' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4f5' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d4edda' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a77' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// Threshold for considering stops as overlapping (in degrees)
// ~500m threshold to catch nearby markers that might visually overlap
const OVERLAP_THRESHOLD = 0.005;
// Base offset distance for overlapping markers (in degrees, ~300m)
const OFFSET_DISTANCE = 0.003;
// Minimum visual separation distance (prevents markers from being too close)
const MIN_SEPARATION = 0.002;

interface StopWithOffset {
  stop: RouteStop;
  displayLat: number;
  displayLng: number;
  isOffset: boolean;
  overlapGroup: number; // Group ID for stops that overlap with each other
}

/**
 * Calculate display positions for stops, offsetting overlapping ones
 * Uses a force-directed approach to spread out clustered markers
 */
function calculateStopPositions(stops: RouteStop[]): StopWithOffset[] {
  if (stops.length === 0) return [];

  // First pass: identify overlap groups
  const overlapGroups: number[][] = [];
  const stopToGroup: Map<number, number> = new Map();

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    let foundGroup = -1;

    // Check if this stop overlaps with any existing group
    for (let j = 0; j < i; j++) {
      const otherStop = stops[j];
      const latDiff = Math.abs(stop.latitude - otherStop.latitude);
      const lngDiff = Math.abs(stop.longitude - otherStop.longitude);

      if (latDiff < OVERLAP_THRESHOLD && lngDiff < OVERLAP_THRESHOLD) {
        const otherGroup = stopToGroup.get(j);
        if (otherGroup !== undefined) {
          foundGroup = otherGroup;
          break;
        }
      }
    }

    if (foundGroup >= 0) {
      overlapGroups[foundGroup].push(i);
      stopToGroup.set(i, foundGroup);
    } else {
      // Check if any previous stop should be in a group with this one
      let newGroupMembers = [i];
      for (let j = 0; j < i; j++) {
        if (stopToGroup.has(j)) continue;

        const otherStop = stops[j];
        const latDiff = Math.abs(stop.latitude - otherStop.latitude);
        const lngDiff = Math.abs(stop.longitude - otherStop.longitude);

        if (latDiff < OVERLAP_THRESHOLD && lngDiff < OVERLAP_THRESHOLD) {
          newGroupMembers.push(j);
        }
      }

      if (newGroupMembers.length > 1) {
        const groupId = overlapGroups.length;
        overlapGroups.push(newGroupMembers);
        newGroupMembers.forEach(idx => stopToGroup.set(idx, groupId));
      }
    }
  }

  // Second pass: calculate display positions
  const result: StopWithOffset[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const groupId = stopToGroup.get(i);

    if (groupId === undefined) {
      // No overlap, use original position
      result.push({
        stop,
        displayLat: stop.latitude,
        displayLng: stop.longitude,
        isOffset: false,
        overlapGroup: -1,
      });
    } else {
      // Part of an overlap group - spread in a circle around the center
      const group = overlapGroups[groupId];
      const indexInGroup = group.indexOf(i);
      const groupSize = group.length;

      // Calculate center of the group
      let centerLat = 0, centerLng = 0;
      group.forEach(idx => {
        centerLat += stops[idx].latitude;
        centerLng += stops[idx].longitude;
      });
      centerLat /= groupSize;
      centerLng /= groupSize;

      // Calculate offset angle and distance based on position in group
      // Spread markers evenly in a circle around the center
      const angle = (indexInGroup / groupSize) * 2 * Math.PI;
      // Increase offset distance for larger groups
      const offsetMultiplier = 1 + (groupSize - 2) * 0.3;
      const offsetDist = OFFSET_DISTANCE * offsetMultiplier;

      const displayLat = centerLat + (offsetDist * Math.cos(angle));
      const displayLng = centerLng + (offsetDist * Math.sin(angle));

      result.push({
        stop,
        displayLat,
        displayLng,
        isOffset: true,
        overlapGroup: groupId,
      });

      console.log(`📍 Offset marker "${stop.name}" (group ${groupId}, ${indexInGroup + 1}/${groupSize})`);
    }
  }

  // Third pass: ensure minimum separation between all markers
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const latDiff = Math.abs(result[i].displayLat - result[j].displayLat);
      const lngDiff = Math.abs(result[i].displayLng - result[j].displayLng);

      if (latDiff < MIN_SEPARATION && lngDiff < MIN_SEPARATION) {
        // Push them apart
        const pushAngle = Math.atan2(
          result[j].displayLat - result[i].displayLat,
          result[j].displayLng - result[i].displayLng
        );
        const pushDist = MIN_SEPARATION / 2;

        result[j].displayLat += pushDist * Math.sin(pushAngle);
        result[j].displayLng += pushDist * Math.cos(pushAngle);
        result[j].isOffset = true;
      }
    }
  }

  return result;
}

interface RouteMapProps {
  route: Route;
  onAddStop?: (prompt: string) => void;
  isAddingStop?: boolean;
  addStopError?: string | null;
  onClearAddStopError?: () => void;
}

export function RouteMap({
  route,
  onAddStop,
  isAddingStop = false,
  addStopError = null,
  onClearAddStopError,
}: RouteMapProps) {
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [showAddStopTooltip, setShowAddStopTooltip] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const mapRef = useRef<MapView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate offset positions for overlapping stops
  const stopsWithOffsets = useMemo(() => calculateStopPositions(route.stops), [route.stops]);

  // Animation values for markers - initialize to 1 for immediate visibility
  // Animation will enhance the experience but markers are visible by default
  const markerAnimations = useRef<Animated.Value[]>(
    route.stops.map(() => new Animated.Value(1))
  ).current;
  // Initialize marker scales to 1 for immediate visibility
  const markerScales = useRef<Animated.Value[]>(
    route.stops.map(() => new Animated.Value(1))
  ).current;
  // Initialize controls opacity to 0 (will fade in)
  const controlsOpacity = useRef(new Animated.Value(0)).current;

  // Debug: Log component mount and initial state
  useEffect(() => {
    console.log('🗺️ RouteMap mounted with route:', route?.stops?.length, 'stops');
    console.log('🗺️ Route stops:', route.stops.map(s => `${s.name} (${s.latitude}, ${s.longitude})`));
    console.log('🗺️ Map provider: Google Maps');
  }, []);

  // Set up Google Maps initialization timeout
  useEffect(() => {
    setMapStatus('loading');
    console.log('🗺️ Using: Google Maps');

    // Set a longer timeout for Google Maps initialization
    timeoutRef.current = setTimeout(() => {
      console.warn('Google Maps initialization taking longer than expected');
      // Don't set error - just log warning, map may still initialize
    }, 15000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Calculate map bounds from route stops
  const bounds = useMemo(() => {
    const lats = route.stops.map((s) => s.latitude);
    const lngs = route.stops.map((s) => s.longitude);

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [route.stops]);

  // Calculate center point
  const center = useMemo(() => {
    return {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLng + bounds.maxLng) / 2,
    };
  }, [bounds]);

  // Calculate initial region - start at route bounds so all stops are visible immediately
  const initialRegion = useMemo(() => {
    // Use route bounds with extra padding (1.8x) for comfortable viewing
    const latDelta = (bounds.maxLat - bounds.minLat) * 1.8;
    const lngDelta = (bounds.maxLng - bounds.minLng) * 1.8;

    const region = {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: Math.max(latDelta, 0.02), // Minimum zoom level
      longitudeDelta: Math.max(lngDelta, 0.02),
    };

    console.log('🗺️ Initial region (route bounds):', region);
    return region;
  }, [center, bounds]);

  // Convert stops to coordinates for Directions API
  const stopCoordinates = useMemo(() => {
    return route.stops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));
  }, [route.stops]);

  // Fetch road-following route with parking optimization
  useEffect(() => {
    if (route.stops.length < 2) {
      // Single stop, no route needed
      setRouteSegments([]);
      setRouteCoordinates([]);
      return;
    }

    let isMounted = true;
    setIsLoadingRoute(true);

    console.log('🗺️ Starting route optimization for', route.stops.length, 'stops');

    // Try optimized route with parking detection first
    optimizeRouteForParking(route.stops)
      .then(({ optimizedStops, segments }) => {
        if (isMounted) {
          console.log('✅ Route segments loaded:', segments.length, 'segments');
          console.log('   Walking segments:', segments.filter(s => s.mode === 'walking').length);
          console.log('   Driving segments:', segments.filter(s => s.mode === 'driving').length);

          if (segments.length > 0) {
            setRouteSegments(segments);
            setRouteCoordinates([]); // Clear old coordinates
          } else {
            console.warn('⚠️ No segments returned, falling back to simple route');
            // Fallback if no segments
            return fetchCompleteRoute(stopCoordinates).then(coords => {
              if (isMounted) {
                setRouteCoordinates(coords);
                setRouteSegments([]);
              }
            });
          }
          setIsLoadingRoute(false);
        }
      })
      .catch((error) => {
        console.error('❌ Error optimizing route:', error);
        if (isMounted) {
          console.log('🔄 Falling back to simple driving route');
          // Fallback to simple driving route
          fetchCompleteRoute(stopCoordinates)
            .then(coords => {
              if (isMounted) {
                console.log('✅ Fallback route loaded:', coords.length, 'points');
                setRouteCoordinates(coords);
                setRouteSegments([]); // Clear segments to use fallback rendering
                setIsLoadingRoute(false);
              }
            })
            .catch((fallbackError) => {
              console.error('❌ Fallback route also failed:', fallbackError);
              if (isMounted) {
                // Final fallback: straight lines
                console.log('🔄 Using straight lines between stops');
                setRouteCoordinates(stopCoordinates);
                setRouteSegments([]);
                setIsLoadingRoute(false);
              }
            });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [route.stops, stopCoordinates]);

  // Animate map and elements when ready
  useEffect(() => {
    if (mapStatus === 'ready' && route.stops.length > 0 && !hasAnimatedIn) {
      console.log('🎬 Starting map animations');
      setHasAnimatedIn(true);

      // Immediately fit to show all stops with proper padding
      if (mapRef.current) {
        console.log('🎬 Fitting to coordinates');
        mapRef.current.fitToCoordinates(
          route.stops.map(s => ({ latitude: s.latitude, longitude: s.longitude })),
          { edgePadding: { top: 100, right: 60, bottom: 100, left: 60 }, animated: false }
        );
      }

      // Animate markers with staggered pop-in effect (scale 0 → 1.15 → 1)
      const markerTimer = setTimeout(() => {
        console.log('🎬 Animating markers with bounce effect');
        route.stops.forEach((_, index) => {
          setTimeout(() => {
            // First animate to slightly larger than normal (overshoot)
            Animated.spring(markerScales[index], {
              toValue: 1.15,
              friction: 6,
              tension: 100,
              useNativeDriver: true,
            }).start(() => {
              // Then settle back to normal size
              Animated.spring(markerScales[index], {
                toValue: 1,
                friction: 8,
                tension: 120,
                useNativeDriver: true,
              }).start();
            });
            // Also fade in the marker
            Animated.timing(markerAnimations[index], {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }).start();
          }, index * ANIMATION_CONFIG.MARKER_STAGGER_DELAY);
        });
      }, 200); // Small delay to let map settle

      // Fade in controls
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }).start();

      return () => {
        clearTimeout(markerTimer);
      };
    }
  }, [mapStatus, route.stops.length, hasAnimatedIn, markerAnimations, markerScales, controlsOpacity]);

  // Fit bounds to show all stops
  const fitBounds = () => {
    if (!mapRef.current || route.stops.length === 0) return;

    const coordinates = route.stops.map((stop) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 80,
        right: 80,
        bottom: 80,
        left: 80,
      },
      animated: true,
    });
  };

  // Zoom in - decrease latitudeDelta/longitudeDelta for closer view
  const zoomIn = () => {
    if (!mapRef.current || !currentRegion) return;

    const newRegion = {
      ...currentRegion,
      latitudeDelta: currentRegion.latitudeDelta / 2,
      longitudeDelta: currentRegion.longitudeDelta / 2,
    };

    mapRef.current.animateToRegion(newRegion, 300);
  };

  // Zoom out - increase latitudeDelta/longitudeDelta for wider view
  const zoomOut = () => {
    if (!mapRef.current || !currentRegion) return;

    const newRegion = {
      ...currentRegion,
      latitudeDelta: currentRegion.latitudeDelta * 2,
      longitudeDelta: currentRegion.longitudeDelta * 2,
    };

    mapRef.current.animateToRegion(newRegion, 300);
  };

  // Export route to Apple Maps with all stops as directions
  const exportToAppleMaps = useCallback(async () => {
    if (route.stops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    // Sort stops by order
    const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);

    // Build Apple Maps URL with multiple waypoints
    // Format: maps://?saddr=LAT,LNG&daddr=LAT,LNG+to:LAT,LNG+to:LAT,LNG
    const firstStop = sortedStops[0];
    const remainingStops = sortedStops.slice(1);

    // Start address (first stop)
    const saddr = `${firstStop.latitude},${firstStop.longitude}`;

    // Destination addresses (remaining stops joined with +to:)
    const daddr = remainingStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('+to:');

    // Build the full URL
    const url = remainingStops.length > 0
      ? `maps://?saddr=${saddr}&daddr=${daddr}&dirflg=d`
      : `maps://?saddr=${saddr}&dirflg=d`;

    console.log('🗺️ Opening Apple Maps with route:', url);

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // Fallback to web URL
        const webUrl = remainingStops.length > 0
          ? `http://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`
          : `http://maps.apple.com/?saddr=${saddr}&dirflg=d`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      console.error('Error opening Apple Maps:', error);
      Alert.alert(
        'Unable to Open Maps',
        'Could not open Apple Maps. Please try again.'
      );
    }
  }, [route.stops]);

  // Log map status changes to console instead of displaying on screen
  useEffect(() => {
    if (mapStatus === 'error') {
      console.error('Google Maps failed to load. Check API key restrictions.');
    }
  }, [mapStatus]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={PASTEL_MAP_STYLE}
        initialRegion={initialRegion}
        showsCompass={true}
        showsScale={true}
        showsMyLocationButton={false}
        showsBuildings={false}
        showsIndoors={false}
        rotateEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        zoomEnabled={true}
        legalLabelInsets={{ top: 0, left: 0, bottom: -20, right: 0 }}
        onRegionChangeComplete={(region) => {
          setCurrentRegion(region);
          console.log('🗺️ Google Maps region changed - map is interactive');
        }}
        onMapReady={() => {
          console.log('✅ MapView onMapReady called - native map initialized');
          console.log('   Provider: Google Maps');
          console.log(`   Timestamp: ${new Date().toISOString()}`);

          // Clear the timeout since map loaded successfully
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            console.log('✅ Timeout cleared - map initialized successfully');
          }

          setMapStatus('ready');
        }}
        onMapLoaded={() => {
          console.log('✅ MapView onMapLoaded called - tiles should be visible');
          console.log(`   Timestamp: ${new Date().toISOString()}`);
          setMapStatus('ready');
        }}
      >
        {/* Route segments with 3-layer effect (shadow, main, glow) */}
        {!isLoadingRoute && routeSegments.length > 0 && (
          <>
            {routeSegments.map((segment) => {
              const colors = segment.mode === 'walking'
                ? MapColors.route.walking
                : MapColors.route.driving;
              return (
                <React.Fragment key={`segment-${segment.id}`}>
                  {/* Shadow layer */}
                  <Polyline
                    coordinates={segment.coordinates}
                    strokeColor={colors.shadow}
                    strokeWidth={10}
                    lineCap="round"
                    lineJoin="round"
                    lineDashPattern={segment.mode === 'walking' ? [8, 8] : undefined}
                  />
                  {/* Main line */}
                  <Polyline
                    coordinates={segment.coordinates}
                    strokeColor={colors.main}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                    lineDashPattern={segment.mode === 'walking' ? [8, 8] : undefined}
                  />
                  {/* Inner glow */}
                  <Polyline
                    coordinates={segment.coordinates}
                    strokeColor={colors.glow}
                    strokeWidth={3}
                    lineCap="round"
                    lineJoin="round"
                    lineDashPattern={segment.mode === 'walking' ? [8, 8] : undefined}
                  />
                </React.Fragment>
              );
            })}
          </>
        )}

        {/* Fallback: route line with 3-layer effect */}
        {!isLoadingRoute && routeCoordinates.length > 0 && routeSegments.length === 0 && (
          <>
            {/* Shadow layer */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={MapColors.route.driving.shadow}
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            {/* Main yellow route line */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={MapColors.route.driving.main}
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
            {/* Inner glow */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={MapColors.route.driving.glow}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Parking location markers - animated */}
        {route.stops
          .filter(stop => stop.parkingLocation)
          .map((stop, index) => (
            <Marker
              key={`parking-${stop.order}`}
              coordinate={{
                latitude: stop.parkingLocation!.latitude,
                longitude: stop.parkingLocation!.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
            >
              <Animated.View
                style={[
                  styles.parkingMarker,
                  {
                    opacity: markerAnimations[index] || 1,
                    transform: [{ scale: markerScales[index] || 1 }],
                  },
                ]}
              >
                <IconSymbol name="parkingsign.circle.fill" size={32} color={MapColors.parking} />
              </Animated.View>
            </Marker>
          ))}

        {/* Offset indicator lines - dashed lines from offset marker to true location */}
        {stopsWithOffsets
          .filter(({ isOffset }) => isOffset)
          .map(({ stop, displayLat, displayLng }) => (
            <Polyline
              key={`offset-line-${stop.order}`}
              coordinates={[
                { latitude: displayLat, longitude: displayLng },
                { latitude: stop.latitude, longitude: stop.longitude },
              ]}
              strokeColor={MapColors.offsetIndicator}
              strokeWidth={2}
              lineDashPattern={[6, 4]}
              lineCap="round"
            />
          ))}

        {/* Stop markers with floating title labels - using offset positions */}
        {stopsWithOffsets.map(({ stop, displayLat, displayLng }, index) => (
          <Marker
            key={stop.order}
            identifier={`marker-${stop.order}`}
            coordinate={{
              latitude: displayLat,
              longitude: displayLng,
            }}
            anchor={{ x: 0.5, y: 1 }} // Anchor at bottom center to position label above
            tracksViewChanges={true} // Enable for animations
            onPress={() => setSelectedStop(stop)} // Use Marker's native onPress instead of TouchableOpacity
          >
            <Animated.View
              style={[
                styles.markerContainer,
                {
                  opacity: markerAnimations[index] || 1,
                  transform: [
                    { scale: markerScales[index] || 1 },
                  ],
                },
              ]}
            >
              {/* Floating label above marker */}
              <View style={styles.floatingLabel}>
                <ThemedText
                  style={styles.floatingLabelText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {stop.name}
                </ThemedText>
              </View>

              {/* Marker icon below label */}
              <View style={{ overflow: 'visible' }}>
                <StopMarker type={stop.type} stopNumber={stop.order} />
              </View>
            </Animated.View>
          </Marker>
        ))}
      </MapView>

      {/* Loading indicator for route fetching */}
      {isLoadingRoute && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={MapColors.loading.spinner} />
          <ThemedText style={styles.loadingText}>
            Loading route...
          </ThemedText>
        </View>
      )}

      {/* Add Stop Button - top left with tooltip */}
      {onAddStop && (
        <Animated.View style={[styles.addStopButtonContainer, { opacity: controlsOpacity }]}>
          <Pressable
            style={styles.addStopButton}
            onPress={() => setShowAddStopModal(true)}
            onHoverIn={() => Platform.OS === 'web' && setShowAddStopTooltip(true)}
            onHoverOut={() => Platform.OS === 'web' && setShowAddStopTooltip(false)}
            accessibilityLabel="Add Venue"
            accessibilityHint="Add a new stop to your route"
            accessibilityRole="button"
          >
            <IconSymbol name="plus" size={22} color={MapColors.controls.icon} />
          </Pressable>
          {/* Tooltip - visible on hover (web only) */}
          {showAddStopTooltip && (
            <View style={styles.tooltip}>
              <ThemedText style={styles.tooltipText}>Add Venue</ThemedText>
            </View>
          )}
        </Animated.View>
      )}

      {/* Export to Apple Maps Button - top right */}
      <Animated.View style={[styles.exportButtonContainer, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={exportToAppleMaps}
          activeOpacity={0.8}
        >
          <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={18} color="#FFFFFF" />
          <ThemedText style={styles.exportButtonText}>Directions</ThemedText>
        </TouchableOpacity>
      </Animated.View>

      {/* Map Controls - animated fade in */}
      <Animated.View style={[styles.mapControls, { opacity: controlsOpacity }]}>
        {/* Zoom Extents Button */}
        <TouchableOpacity
          style={[styles.controlButton, styles.extentsButton]}
          onPress={fitBounds}
        >
          <ThemedText style={styles.controlButtonText}>⊡</ThemedText>
        </TouchableOpacity>

        {/* Zoom In Button */}
        <TouchableOpacity style={styles.controlButton} onPress={zoomIn}>
          <ThemedText style={styles.controlButtonText}>+</ThemedText>
        </TouchableOpacity>

        {/* Zoom Out Button */}
        <TouchableOpacity style={styles.controlButton} onPress={zoomOut}>
          <ThemedText style={styles.controlButtonText}>−</ThemedText>
        </TouchableOpacity>
      </Animated.View>

      {/* Stop detail modal */}
      <StopDetailModal
        stop={selectedStop}
        totalStops={route.stops.length}
        visible={selectedStop !== null}
        onClose={() => setSelectedStop(null)}
      />

      {/* Add stop modal */}
      {onAddStop && (
        <AddStopModal
          visible={showAddStopModal}
          onClose={() => setShowAddStopModal(false)}
          onSubmit={(prompt) => {
            onAddStop(prompt);
            setShowAddStopModal(false);
          }}
          isLoading={isAddingStop}
          error={addStopError}
          onClearError={onClearAddStopError || (() => {})}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -40 }],
    backgroundColor: MapColors.loading.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 140,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
    color: MapColors.loading.text,
  },
  addStopButtonContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  addStopButton: {
    width: 46,
    height: 46,
    backgroundColor: MapColors.controls.background,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: MapColors.controls.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
  },
  tooltip: {
    position: 'absolute',
    top: 52,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 1000,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    borderColor: MapColors.controls.border,
  },
  exportButtonContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -70 }],
    gap: 10,
  },
  controlButton: {
    width: 46,
    height: 46,
    backgroundColor: MapColors.controls.background,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: MapColors.controls.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: MapColors.controls.border,
  },
  extentsButton: {
    marginBottom: 6,
  },
  controlButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: MapColors.controls.icon,
  },
  parkingMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  floatingLabel: {
    backgroundColor: MapColors.label.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: MapColors.label.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: MapColors.label.border,
    marginBottom: 6,
    maxWidth: 180,
    minWidth: 60,
  },
  floatingLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: MapColors.label.text,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
