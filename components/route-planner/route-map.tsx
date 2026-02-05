import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking, Alert, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { AddStopModal } from './add-stop-modal';
import { NavigationAppSelectorModal, NavigationApp } from './navigation-app-selector-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Route, RouteStop, RouteSegment } from '@/types/route';
import { RouteCoordinate } from '@/lib/google-directions';
import { MapColors, tailwind } from '@/constants/theme';
import { validateRoute, snapshotRouteState } from '@/lib/debug-utils';

// Check if running in Expo Go (which doesn't support Google Maps on iOS)
const isExpoGo = Constants.appOwnership === 'expo';

// Determine map provider - use Google on development builds, default (Apple) in Expo Go
// Force Google Maps for development builds
const MAP_PROVIDER = Platform.OS === 'ios' && isExpoGo ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

// Debug: Temporarily disable custom style to test if Google Maps works without it
const USE_CUSTOM_STYLE = false; // Set to true once Google Maps is confirmed working

// Log map configuration on module load
console.log('🗺️ Map Configuration:');
console.log(`   Platform: ${Platform.OS}`);
console.log(`   Is Expo Go: ${isExpoGo}`);
console.log(`   Map Provider: ${MAP_PROVIDER === PROVIDER_GOOGLE ? 'Google Maps' : 'Default (Apple Maps)'}`);
console.log(`   Google Maps API Key configured: ${!!Constants.expoConfig?.ios?.config?.googleMapsApiKey}`);

// Pastel map style for Google Maps - tailwind-inspired soft colors
const PASTEL_MAP_STYLE = [
  // Base geometry - soft gray from tailwind gray-50
  { elementType: 'geometry', stylers: [{ color: '#F9FAFB' }] },
  // Labels - gray-600 for readability
  { elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  // Administrative boundaries - gray-300
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D1D5DB' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  // Roads - white with subtle gray stroke
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  // Highways - soft amber/yellow tint (amber-100)
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FEF3C7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#FDE68A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  // Water - soft blue (blue-100)
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBEAFE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60A5FA' }] },
  // Parks - soft emerald/green (emerald-100)
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#059669' }] },
  // Landscape - subtle warm tint
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F3F4F6' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ECFDF5' }] },
  // Hide POI labels for cleaner look
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  // Hide transit for cleaner look
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
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
  optimizedSegments?: RouteSegment[];
  isOptimizing?: boolean;
  onAddStop?: (prompt: string) => Promise<{ success: boolean }>;
  isAddingStop?: boolean;
  addStopError?: string | null;
  onClearAddStopError?: () => void;
  onRemoveStop?: (stopId: string) => Promise<void>;
  isRemovingStop?: boolean;
}

export function RouteMap({
  route,
  optimizedSegments = [],
  isOptimizing = false,
  onAddStop,
  isAddingStop = false,
  addStopError = null,
  onClearAddStopError,
  onRemoveStop,
  isRemovingStop = false,
}: RouteMapProps) {
  // Debug: Log props on mount and updates
  useEffect(() => {
    console.log('🔍 [RouteMap] Component props updated');
    console.log('   - onAddStop provided:', !!onAddStop);
    console.log('   - isAddingStop:', isAddingStop);
    console.log('   - addStopError:', addStopError);
    console.log('   - Route stops:', route.stops.length);

    // Validate and snapshot route whenever it changes
    snapshotRouteState(route, 'RouteMap:PropsUpdate');
    validateRoute(route, 'RouteMap:PropsUpdate');
  }, [onAddStop, isAddingStop, addStopError, route.stops.length, route]);

  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [showAddStopTooltip, setShowAddStopTooltip] = useState(false);
  const [showNavSelectorModal, setShowNavSelectorModal] = useState(false);
  const [isExportingRoute, setIsExportingRoute] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [markersKey, setMarkersKey] = useState(0); // Force marker re-render
  const [tracksViewChanges, setTracksViewChanges] = useState(false); // Temporarily enable tracking during updates
  const mapRef = useRef<MapView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate offset positions for overlapping stops
  // Filter out any stops with invalid coordinates to prevent crashes
  const stopsWithOffsets = useMemo(() => {
    console.log('🔄 [RouteMap] Recalculating stopsWithOffsets');
    console.log(`   Input stops: ${route.stops.length}`);
    console.log(`   Stop IDs: ${route.stops.map(s => s.id).join(', ')}`);

    const validStops = route.stops.filter(stop =>
      typeof stop.latitude === 'number' &&
      typeof stop.longitude === 'number' &&
      !isNaN(stop.latitude) &&
      !isNaN(stop.longitude) &&
      stop.latitude !== 0 &&
      stop.longitude !== 0
    );

    if (validStops.length !== route.stops.length) {
      console.warn(`⚠️ Filtered out ${route.stops.length - validStops.length} stops with invalid coordinates`);
    }

    console.log(`   Valid stops for rendering: ${validStops.length}`);
    const result = calculateStopPositions(validStops);
    console.log(`   Calculated positions for ${result.length} markers`);
    return result;
  }, [route.stops]);

  // Track previous stop count to fit map when stops are added/removed
  const prevStopCountRef = useRef(route.stops.length);

  // Fit map to show all stops when stops are added or removed
  useEffect(() => {
    const stopCountChanged = route.stops.length !== prevStopCountRef.current;

    if (stopCountChanged && hasAnimatedIn && route.stops.length >= 2) {
      const wasAdded = route.stops.length > prevStopCountRef.current;
      const wasRemoved = route.stops.length < prevStopCountRef.current;

      console.log(`🗺️ [RouteMap] Stop count changed from ${prevStopCountRef.current} to ${route.stops.length}`);
      console.log(`   Action: ${wasAdded ? 'Added' : wasRemoved ? 'Removed' : 'Changed'}`);

      // Fit map to show all remaining stops
      setTimeout(() => {
        if (mapRef.current && route.stops.length > 0) {
          console.log('🗺️ [RouteMap] Re-fitting map to show all stops');
          mapRef.current.fitToCoordinates(
            route.stops.map(s => ({ latitude: s.latitude, longitude: s.longitude })),
            { edgePadding: { top: 100, right: 60, bottom: 100, left: 60 }, animated: true }
          );
        }
      }, 300); // Slightly longer delay for removal to allow segments to update first
    }

    prevStopCountRef.current = route.stops.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.stops.length, hasAnimatedIn]);

  // Initialize controls opacity to 0 (will fade in)
  const controlsOpacity = useRef(new Animated.Value(0)).current;

  // Debug: Log when route stops change
  useEffect(() => {
    console.log('🗺️ RouteMap route updated:', route?.stops?.length, 'stops');
    console.log('🗺️ Stop names:', route.stops.map(s => s.name).join(', '));
    console.log('🗺️ Stop IDs:', route.stops.map(s => s.id).join(', '));
  }, [route.stops]);

  // Force markers to re-render when stops change
  useEffect(() => {
    console.log('🔄 [RouteMap] Forcing marker re-render - stops changed');
    console.log(`   Stop count: ${route.stops.length}`);
    console.log(`   Stop IDs: ${route.stops.map(s => s.id).join(', ')}`);

    // Increment key to force React to remount markers
    setMarkersKey(prev => prev + 1);

    // Temporarily enable tracksViewChanges to force marker updates
    setTracksViewChanges(true);

    // Disable tracking after markers have updated (500ms should be enough)
    const timeout = setTimeout(() => {
      console.log('🔄 [RouteMap] Disabling tracksViewChanges after marker update');
      setTracksViewChanges(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [route.stops.length, JSON.stringify(route.stops.map(s => s.id))]);

  // Set up Google Maps initialization timeout
  useEffect(() => {
    setMapStatus('loading');
    console.log('🗺️ Using: Google Maps');

    // Fallback: force map to ready state after 3 seconds if callbacks don't fire
    timeoutRef.current = setTimeout(() => {
      setMapStatus((current) => {
        if (current === 'loading') {
          console.warn('⚠️ Google Maps callbacks not firing - forcing ready state');
          return 'ready';
        }
        return current;
      });
    }, 3000);

    // Additional fallback: ensure controls are visible after 5 seconds
    const controlsTimeout = setTimeout(() => {
      if (!hasAnimatedIn) {
        console.warn('⚠️ Controls animation did not complete - forcing visibility');
        controlsOpacity.setValue(1);
      }
    }, 5000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      clearTimeout(controlsTimeout);
    };
  }, [controlsOpacity, hasAnimatedIn]);

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

  // Use optimized segments from parent when available
  useEffect(() => {
    console.log('🔍 [RouteMap] Segments updated from parent');
    console.log(`🔍 [RouteMap] Optimized segments:`, optimizedSegments.length);
    console.log(`🔍 [RouteMap] Is optimizing:`, isOptimizing);

    if (isOptimizing) {
      console.log('🔍 [RouteMap] Optimization in progress, showing loading state');
      setIsLoadingRoute(true);
      setRouteSegments([]);
      setRouteCoordinates([]);
      return;
    }

    if (route.stops.length < 2) {
      console.log('🔍 [RouteMap] Less than 2 stops, clearing route');
      setRouteSegments([]);
      setRouteCoordinates([]);
      setIsLoadingRoute(false);
      return;
    }

    if (optimizedSegments.length > 0) {
      console.log('🔍 [RouteMap] Using optimized segments from parent');

      // Validate segments before using them
      const hasInvalidSegments = optimizedSegments.some(seg =>
        seg.coordinates.some(c =>
          !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude) ||
          c.latitude === 0 || c.longitude === 0
        )
      );

      if (hasInvalidSegments) {
        console.error('❌ [RouteMap] Optimized segments contain invalid coordinates');
        setRouteSegments([]);
        setRouteCoordinates([]);
        setIsLoadingRoute(false);
        return;
      }

      setRouteSegments(optimizedSegments);
      setRouteCoordinates([]);
      setIsLoadingRoute(false);
    } else {
      console.log('🔍 [RouteMap] No optimized segments, using fallback straight lines');
      // Fallback: show straight lines between stops
      const validCoords = stopCoordinates.filter(c =>
        typeof c.latitude === 'number' &&
        typeof c.longitude === 'number' &&
        !isNaN(c.latitude) &&
        !isNaN(c.longitude) &&
        c.latitude !== 0 &&
        c.longitude !== 0
      );

      setRouteCoordinates(validCoords);
      setRouteSegments([]);
      setIsLoadingRoute(false);
    }
  }, [optimizedSegments, isOptimizing, route.stops.length, stopCoordinates]);

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

      // Fade in controls
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }).start(() => {
        console.log('✅ Controls fade-in animation completed - buttons should be visible');
      });
    }
  }, [mapStatus, route.stops, hasAnimatedIn, controlsOpacity]);

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

  // Export route to Google Maps with all stops as waypoints
  const exportToGoogleMaps = useCallback(async () => {
    if (route.stops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    // Sort stops by order
    const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);

    // Build Google Maps URL with waypoints
    // Format: https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|LAT,LNG&travelmode=driving
    const firstStop = sortedStops[0];
    const lastStop = sortedStops[sortedStops.length - 1];
    const middleStops = sortedStops.slice(1, -1);

    // Origin (first stop)
    const origin = `${firstStop.latitude},${firstStop.longitude}`;

    // Destination (last stop)
    const destination = `${lastStop.latitude},${lastStop.longitude}`;

    // Waypoints (middle stops, separated by |)
    // Note: Mobile browsers support up to 3 waypoints, but we'll include all and let Google handle it
    const waypoints = middleStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('|');

    // Build the full URL using cross-platform Maps URLs (works via Universal Links on iOS)
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

    // Add waypoints if there are intermediate stops
    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    console.log('🗺️ Opening Google Maps with route:', url);

    try {
      // Open URL - Google Maps app will intercept via Universal Links on iOS
      // On Android, Google Maps app handles the URL if installed
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening Google Maps:', error);
      Alert.alert(
        'Unable to Open Google Maps',
        'Could not open Google Maps. Please try again.'
      );
    }
  }, [route.stops]);

  // Handle navigation app selection
  const handleNavigationAppSelect = useCallback(async (app: NavigationApp) => {
    setIsExportingRoute(true);
    try {
      if (app === 'apple') {
        await exportToAppleMaps();
      } else {
        await exportToGoogleMaps();
      }
      setShowNavSelectorModal(false);
    } catch (error) {
      console.error('Error exporting route:', error);
    } finally {
      setIsExportingRoute(false);
    }
  }, [exportToAppleMaps, exportToGoogleMaps]);

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
        provider={MAP_PROVIDER}
        customMapStyle={USE_CUSTOM_STYLE && MAP_PROVIDER === PROVIDER_GOOGLE ? PASTEL_MAP_STYLE : undefined}
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
          console.log(`   Provider: ${MAP_PROVIDER === PROVIDER_GOOGLE ? 'Google Maps' : 'Apple Maps'}`);
          console.log('   Custom style rules:', MAP_PROVIDER === PROVIDER_GOOGLE ? PASTEL_MAP_STYLE.length : 'N/A (Apple Maps)');
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
        {/* Guard: Only render when map is ready and not loading to prevent native crash */}
        {mapStatus === 'ready' && !isLoadingRoute && routeSegments.length > 0 && (
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
        {/* Guard: Only render when map is ready and not loading to prevent native crash */}
        {mapStatus === 'ready' && !isLoadingRoute && routeCoordinates.length > 0 && routeSegments.length === 0 && (
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

        {/* Parking location markers */}
        {/* Guard: Only render when map is ready to prevent native crash */}
        {mapStatus === 'ready' && route.stops
          .filter(stop => stop.parkingLocation)
          .map((stop) => (
            <Marker
              key={`parking-${stop.id}-${markersKey}`}
              coordinate={{
                latitude: stop.parkingLocation!.latitude,
                longitude: stop.parkingLocation!.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
            >
              <View style={styles.parkingMarker}>
                <IconSymbol name="parkingsign.circle.fill" size={32} color={MapColors.parking} />
              </View>
            </Marker>
          ))}

        {/* Offset indicator lines - dashed lines from offset marker to true location */}
        {/* Guard: Only render when map is ready to prevent native crash */}
        {mapStatus === 'ready' && stopsWithOffsets
          .filter(({ isOffset }) => isOffset)
          .map(({ stop, displayLat, displayLng }) => (
            <Polyline
              key={`offset-line-${stop.id}-${markersKey}`}
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
        {/* Guard: Only render when map is ready to prevent native crash */}
        {mapStatus === 'ready' && stopsWithOffsets.map(({ stop, displayLat, displayLng }) => (
          <Marker
            key={`${stop.id}-${markersKey}`}
            identifier={`marker-${stop.id}-${markersKey}`}
            coordinate={{
              latitude: displayLat,
              longitude: displayLng,
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksViewChanges}
            onPress={() => setSelectedStop(stop)}
          >
            <View style={styles.markerContainer}>
              <View style={styles.floatingLabel}>
                <ThemedText
                  style={styles.floatingLabelText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {stop.name}
                </ThemedText>
              </View>
              <View style={{ overflow: 'visible' }}>
                <StopMarker type={stop.type} stopNumber={stop.order} />
              </View>
            </View>
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
            onPress={() => {
              console.log('🔘 Add Stop button pressed - opening modal');
              setShowAddStopModal(true);
            }}
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

      {/* Export to Navigation App Button - top right */}
      <Animated.View style={[styles.exportButtonContainer, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => setShowNavSelectorModal(true)}
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
        onRemoveStop={onRemoveStop}
        isRemovingStop={isRemovingStop}
      />

      {/* Add stop modal */}
      {onAddStop && (
        <AddStopModal
          visible={showAddStopModal}
          onClose={() => {
            console.log('🔘 Add Stop modal closing');
            setShowAddStopModal(false);
          }}
          onSubmit={async (prompt) => {
            console.log('🔘 Add Stop modal submitted with prompt:', prompt);
            try {
              const result = await onAddStop(prompt);
              console.log('🔘 onAddStop result:', result);
              if (result?.success) {
                console.log('✅ Add Stop successful - closing modal');
                setShowAddStopModal(false);
              } else {
                console.log('❌ Add Stop failed');
              }
            } catch (error) {
              console.error('❌ Add Stop threw error:', error);
            }
          }}
          isLoading={isAddingStop}
          error={addStopError}
          onClearError={onClearAddStopError || (() => {})}
        />
      )}

      {/* Navigation app selector modal */}
      <NavigationAppSelectorModal
        visible={showNavSelectorModal}
        onClose={() => setShowNavSelectorModal(false)}
        onSelect={handleNavigationAppSelect}
        isExporting={isExportingRoute}
      />
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
    backgroundColor: tailwind.blue500,
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
