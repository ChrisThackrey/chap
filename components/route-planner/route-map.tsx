import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking, Alert, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { NavigationAppSelectorModal, NavigationApp } from './navigation-app-selector-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Route, RouteStop, RouteSegment, TravelMode } from '@/types/route';
import { RouteCoordinate, fetchCompleteRouteWithSegments } from '@/lib/google-directions';
import { MAP_PROVIDER, getMapStyle } from '@/lib/map-config';
import { isValidCoordinate } from '@/lib/coordinate-validation';
import { logger } from '@/lib/logger';
import { tailwind } from '@/constants/theme';
import { useMapColors } from '@/hooks/use-map-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Padding used whenever the map is fitted to the route. */
const FIT_EDGE_PADDING = { top: 100, right: 60, bottom: 280, left: 60 };
/** If the native map never reports ready (e.g. missing API key), show content anyway. */
const MAP_READY_TIMEOUT_MS = 3000;
const GOOGLE_MAPS_STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/google-maps/id585027354',
  android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
  default: 'https://www.google.com/maps',
});

// Threshold for considering stops as overlapping (in degrees)
const OVERLAP_THRESHOLD = 0.005;
const OFFSET_DISTANCE = 0.003;
const MIN_SEPARATION = 0.002;

interface StopWithOffset {
  stop: RouteStop;
  displayLat: number;
  displayLng: number;
  isOffset: boolean;
  overlapGroup: number;
}

/**
 * Calculate display positions for stops, offsetting overlapping ones
 */
function calculateStopPositions(stops: RouteStop[]): StopWithOffset[] {
  if (stops.length === 0) return [];

  const overlapGroups: number[][] = [];
  const stopToGroup: Map<number, number> = new Map();

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    let foundGroup = -1;

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

  const result: StopWithOffset[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const groupId = stopToGroup.get(i);

    if (groupId === undefined) {
      result.push({
        stop,
        displayLat: stop.latitude,
        displayLng: stop.longitude,
        isOffset: false,
        overlapGroup: -1,
      });
    } else {
      const group = overlapGroups[groupId];
      const indexInGroup = group.indexOf(i);
      const groupSize = group.length;

      let centerLat = 0, centerLng = 0;
      group.forEach(idx => {
        centerLat += stops[idx].latitude;
        centerLng += stops[idx].longitude;
      });
      centerLat /= groupSize;
      centerLng /= groupSize;

      const angle = (indexInGroup / groupSize) * 2 * Math.PI;
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
    }
  }

  // Ensure minimum separation between all markers
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const latDiff = Math.abs(result[i].displayLat - result[j].displayLat);
      const lngDiff = Math.abs(result[i].displayLng - result[j].displayLng);

      if (latDiff < MIN_SEPARATION && lngDiff < MIN_SEPARATION) {
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
  userLocation?: { latitude: number; longitude: number } | null;
  onOpenAddStop?: () => void;
  onRemoveStop?: (stopId: string) => Promise<void>;
  isRemovingStop?: boolean;
  isAddingStop?: boolean;
  onRequestLocation?: () => Promise<{ latitude: number; longitude: number } | null>;
}

export function RouteMap({
  route,
  userLocation,
  onOpenAddStop,
  onRemoveStop,
  isRemovingStop = false,
  isAddingStop = false,
  onRequestLocation,
}: RouteMapProps) {

  const mapColors = useMapColors();
  const colorScheme = useColorScheme();

  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [showAddStopTooltip, setShowAddStopTooltip] = useState(false);
  const [showNavSelectorModal, setShowNavSelectorModal] = useState(false);
  const [isExportingRoute, setIsExportingRoute] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [tracksViewChanges, setTracksViewChanges] = useState(false);
  const [segmentRevision, setSegmentRevision] = useState(0);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const mapRef = useRef<MapView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stops with usable coordinates, sorted by route order. Everything the map
  // draws derives from this list so a single bad stop can't break rendering.
  const validStops = useMemo(
    () =>
      route.stops
        .filter((stop) => isValidCoordinate(stop.latitude, stop.longitude))
        .sort((a, b) => a.order - b.order),
    [route.stops]
  );

  // Calculate offset positions for overlapping stops
  const stopsWithOffsets = useMemo(() => calculateStopPositions(validStops), [validStops]);

  const fitToStops = useCallback((animated: boolean) => {
    if (!mapRef.current || stopsWithOffsets.length === 0) return;
    mapRef.current.fitToCoordinates(
      stopsWithOffsets.map(({ stop }) => ({ latitude: stop.latitude, longitude: stop.longitude })),
      { edgePadding: FIT_EDGE_PADDING, animated }
    );
  }, [stopsWithOffsets]);

  // Track previous stop count to fit map when stops are added/removed
  const prevStopCountRef = useRef(validStops.length);

  useEffect(() => {
    const stopCountChanged = validStops.length !== prevStopCountRef.current;
    prevStopCountRef.current = validStops.length;

    if (!stopCountChanged || !hasAnimatedIn || validStops.length < 2) return;

    const timer = setTimeout(() => fitToStops(true), 300);
    return () => clearTimeout(timer);
  }, [validStops.length, hasAnimatedIn, fitToStops]);

  const controlsOpacity = useRef(new Animated.Value(0)).current;

  // Identity of the stop set; changes when stops are added, removed or reordered.
  const stopIdsKey = useMemo(() => validStops.map((s) => s.id).join('|'), [validStops]);

  // Membership-only identity (order-insensitive). Used to remount the MapView
  // when stops are added or removed: react-native-maps runs through Fabric's
  // legacy-interop layer, and inserting/reordering Marker children in place
  // throws "insertReactSubview:atIndex" out of bounds (SIGABRT). A fresh
  // MapView with the final children avoids child mutation entirely.
  const mapInstanceKey = useMemo(
    () => `map-${[...validStops.map((s) => s.id)].sort().join('|')}`,
    [validStops]
  );

  // Let markers redraw their custom views briefly when the stop set changes.
  // NOTE: keys below are deliberately stable (stop.id / segment.id). Remounting
  // every child with a changing key made react-native-maps' Fabric interop
  // layer throw "insertReactSubview:atIndex" out-of-bounds (SIGABRT) when a
  // stop was added.
  useEffect(() => {
    setTracksViewChanges(true);
    const timeout = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(timeout);
  }, [stopIdsKey]);

  // Map initialization timeout. Runs once per mount: re-running it (as the
  // previous implementation did whenever `hasAnimatedIn` flipped) reset the
  // status to "loading", which unmounted every marker and polyline for up to
  // three seconds right after the map first appeared.
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setMapStatus((current) => {
        if (current === 'loading') {
          logger.warn('[RouteMap] Map did not report ready; forcing ready state after timeout');
          return 'ready';
        }
        return current;
      });
    }, MAP_READY_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Safety net: if the entrance animation never runs, still reveal the controls.
  useEffect(() => {
    if (hasAnimatedIn) return;
    const controlsTimeout = setTimeout(() => controlsOpacity.setValue(1), 5000);
    return () => clearTimeout(controlsTimeout);
  }, [controlsOpacity, hasAnimatedIn]);

  // Calculate map bounds
  const bounds = useMemo(() => {
    const validStops = stopsWithOffsets.map(({ stop }) => stop);
    if (validStops.length === 0) {
      return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
    }
    const lats = validStops.map((s) => s.latitude);
    const lngs = validStops.map((s) => s.longitude);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [stopsWithOffsets]);

  const center = useMemo(() => ({
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
  }), [bounds]);

  const initialRegion = useMemo(() => {
    const latDelta = (bounds.maxLat - bounds.minLat) * 1.8;
    const lngDelta = (bounds.maxLng - bounds.minLng) * 1.8;
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: Math.max(latDelta, 0.02),
      longitudeDelta: Math.max(lngDelta, 0.02),
    };
  }, [center, bounds]);

  // Stable key based on stop coordinates — only re-fetch when positions change
  const stopsKey = useMemo(
    () => validStops.map((s) => `${s.latitude.toFixed(6)},${s.longitude.toFixed(6)}`).join('|'),
    [validStops]
  );

  // Fetch road-following directions when stops change
  useEffect(() => {
    if (validStops.length < 2) {
      setRouteSegments([]);
      setRouteCoordinates([]);
      setIsLoadingRoute(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    (async () => {
      const coords: RouteCoordinate[] = validStops.map(s => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));
      setRouteCoordinates(coords);
      setRouteSegments([]);  // Clear old segments so fallback lines show through ALL stops
      setIsLoadingRoute(true);

      try {
        const modes: TravelMode[] = new Array(coords.length - 1).fill('driving');
        const segments = await fetchCompleteRouteWithSegments(coords, modes, controller.signal);

        if (!active) return;

        if (segments.length > 0) {
          logger.debug(`[RouteMap] Directions: ${segments.length} segments`);
          setRouteSegments(segments);
          setSegmentRevision(prev => prev + 1);
          setRouteCoordinates([]);
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        logger.error('[RouteMap] Direction fetch failed:', error);
        // Only now clear segments so straight-line fallback shows
        if (active) setRouteSegments([]);
      } finally {
        if (active) setIsLoadingRoute(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
    // `validStops` is intentionally read via `stopsKey`: it changes identity on
    // every route update, but directions only need re-fetching when positions move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey]);

  // Fit map after polylines render
  useEffect(() => {
    if (!hasAnimatedIn || !mapRef.current || routeSegments.length === 0) return;

    const fitTimer = setTimeout(() => {
      if (!mapRef.current) return;
      const allCoords = routeSegments.flatMap(seg => seg.coordinates);
      if (allCoords.length === 0) return;
      mapRef.current.fitToCoordinates(allCoords, {
        edgePadding: FIT_EDGE_PADDING,
        animated: true,
      });
    }, 100);

    const nudgeTimer = setTimeout(() => {
      if (!mapRef.current || !currentRegion) return;
      mapRef.current.animateToRegion(
        { ...currentRegion, latitudeDelta: currentRegion.latitudeDelta + 0.000001 },
        1
      );
    }, 500);

    return () => {
      clearTimeout(fitTimer);
      clearTimeout(nudgeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentRevision]);

  // Animate map and elements when ready
  useEffect(() => {
    if (mapStatus === 'ready' && validStops.length > 0 && !hasAnimatedIn) {
      setHasAnimatedIn(true);
      fitToStops(false);

      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [mapStatus, validStops.length, hasAnimatedIn, controlsOpacity, fitToStops]);

  const fitBounds = () => fitToStops(true);

  const zoomIn = () => {
    if (!mapRef.current || !currentRegion) return;
    mapRef.current.animateToRegion({
      ...currentRegion,
      latitudeDelta: currentRegion.latitudeDelta / 2,
      longitudeDelta: currentRegion.longitudeDelta / 2,
    }, 300);
  };

  const zoomOut = () => {
    if (!mapRef.current || !currentRegion) return;
    mapRef.current.animateToRegion({
      ...currentRegion,
      latitudeDelta: currentRegion.latitudeDelta * 2,
      longitudeDelta: currentRegion.longitudeDelta * 2,
    }, 300);
  };

  const zoomToMyLocation = useCallback(async () => {
    let loc = userLocation;
    if (!loc && onRequestLocation) {
      setIsRequestingLocation(true);
      try { loc = await onRequestLocation(); }
      finally { setIsRequestingLocation(false); }
    }
    if (!loc || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: loc.latitude,
      longitude: loc.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  }, [userLocation, onRequestLocation]);

  const exportToAppleMaps = useCallback(async (
    locationOverride?: { latitude: number; longitude: number } | null
  ) => {
    if (validStops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    const sortedStops = validStops;
    const effectiveLocation = locationOverride ?? userLocation;

    // If we have user's GPS, use it as origin and route through ALL stops
    const saddr = effectiveLocation
      ? `${effectiveLocation.latitude},${effectiveLocation.longitude}`
      : `${sortedStops[0].latitude},${sortedStops[0].longitude}`;
    const destinationStops = effectiveLocation ? sortedStops : sortedStops.slice(1);
    const daddr = destinationStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('+to:');

    const url = destinationStops.length > 0
      ? `maps://?saddr=${saddr}&daddr=${daddr}&dirflg=d`
      : `maps://?saddr=${saddr}&dirflg=d`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        const webUrl = destinationStops.length > 0
          ? `http://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`
          : `http://maps.apple.com/?saddr=${saddr}&dirflg=d`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      logger.error('Error opening Apple Maps:', error);
      Alert.alert('Unable to Open Maps', 'Could not open Apple Maps. Please try again.');
    }
  }, [validStops, userLocation]);

  const exportToGoogleMaps = useCallback(async (
    locationOverride?: { latitude: number; longitude: number } | null
  ) => {
    if (validStops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    const sortedStops = validStops;
    const effectiveLocation = locationOverride ?? userLocation;

    // On iOS, try opening Google Maps directly via native URL scheme
    if (Platform.OS === 'ios') {
      const saddr = effectiveLocation
        ? `${effectiveLocation.latitude},${effectiveLocation.longitude}`
        : `${sortedStops[0].latitude},${sortedStops[0].longitude}`;
      const destinationStops = effectiveLocation ? sortedStops : sortedStops.slice(1);
      const daddr = destinationStops
        .map(stop => `${stop.latitude},${stop.longitude}`)
        .join('+to:');
      const nativeUrl = `comgooglemaps://?saddr=${saddr}&daddr=${daddr}&directionsmode=driving`;

      try {
        await Linking.openURL(nativeUrl);
        return;
      } catch {
        // Google Maps not installed or scheme failed — fall through to web URL
      }
    }

    // Fallback: web URL (works on all platforms, opens Google Maps natively on Android)
    const lastStop = sortedStops[sortedStops.length - 1];
    const origin = effectiveLocation
      ? `${effectiveLocation.latitude},${effectiveLocation.longitude}`
      : `${sortedStops[0].latitude},${sortedStops[0].longitude}`;
    const destination = `${lastStop.latitude},${lastStop.longitude}`;
    // When using user location, all stops become waypoints except the last (destination)
    const waypointStops = effectiveLocation ? sortedStops.slice(0, -1) : sortedStops.slice(1, -1);
    const waypoints = waypointStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Google Maps Not Found',
        'Could not open Google Maps. Would you like to install it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Install',
            onPress: () => {
              Linking.openURL(GOOGLE_MAPS_STORE_URL).catch((err) =>
                logger.error('Unable to open app store:', err)
              );
            },
          },
        ]
      );
    }
  }, [validStops, userLocation]);

  const handleNavigationAppSelect = useCallback(async (app: NavigationApp) => {
    setIsExportingRoute(true);
    try {
      let currentLocation = userLocation;
      if (!currentLocation && onRequestLocation) {
        currentLocation = await onRequestLocation();
      }
      if (app === 'apple') {
        await exportToAppleMaps(currentLocation);
      } else {
        await exportToGoogleMaps(currentLocation);
      }
      setShowNavSelectorModal(false);
    } catch (error) {
      logger.error('Error exporting route:', error);
      Alert.alert('Export Failed', 'Could not send the route to the navigation app.');
    } finally {
      setIsExportingRoute(false);
    }
  }, [exportToAppleMaps, exportToGoogleMaps, userLocation, onRequestLocation]);

  const customMapStyle = getMapStyle(colorScheme);

  return (
    <View style={styles.container}>
      <MapView
        key={mapInstanceKey}
        ref={mapRef}
        style={styles.map}
        provider={MAP_PROVIDER}
        customMapStyle={customMapStyle}
        initialRegion={initialRegion}
        showsCompass={true}
        showsScale={true}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsBuildings={false}
        showsIndoors={false}
        rotateEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        zoomEnabled={true}
        legalLabelInsets={{ top: 0, left: 0, bottom: -20, right: 0 }}
        onRegionChangeComplete={(region) => setCurrentRegion(region)}
        onMapReady={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setMapStatus('ready');
          // A remounted map (see mapInstanceKey) starts at initialRegion; re-fit to the stops.
          if (hasAnimatedIn) fitToStops(false);
        }}
        onMapLoaded={() => setMapStatus('ready')}
        accessibilityLabel="Route map"
      >
        {/* Route segments with 3-layer effect */}
        {mapStatus === 'ready' && routeSegments.length > 0 && (
          <>
            {routeSegments.map((segment) => {
              const colors = segment.mode === 'walking'
                ? mapColors.route.walking
                : mapColors.route.driving;
              return (
                <React.Fragment key={`segment-${segment.id}`}>
                  <Polyline
                    coordinates={segment.coordinates}
                    strokeColor={colors.shadow}
                    strokeWidth={10}
                    lineCap="round"
                    lineJoin="round"
                    lineDashPattern={segment.mode === 'walking' ? [8, 8] : undefined}
                  />
                  <Polyline
                    coordinates={segment.coordinates}
                    strokeColor={colors.main}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                    lineDashPattern={segment.mode === 'walking' ? [8, 8] : undefined}
                  />
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

        {/* Fallback: straight-line route while directions load */}
        {mapStatus === 'ready' && routeCoordinates.length > 0 && routeSegments.length === 0 && (
          <React.Fragment key={`fallback-${stopsKey}`}>
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={mapColors.route.driving.shadow}
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={mapColors.route.driving.main}
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={mapColors.route.driving.glow}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
          </React.Fragment>
        )}

        {/* Parking location markers */}
        {mapStatus === 'ready' && validStops
          .filter((stop) => stop.parkingLocation && isValidCoordinate(stop.parkingLocation.latitude, stop.parkingLocation.longitude))
          .map((stop) => (
            <Marker
              key={`parking-${stop.id}`}
              coordinate={{
                latitude: stop.parkingLocation!.latitude,
                longitude: stop.parkingLocation!.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
            >
              <View style={styles.parkingMarker}>
                <IconSymbol name="parkingsign.circle.fill" size={32} color={mapColors.parking} />
              </View>
            </Marker>
          ))}

        {/* Offset indicator lines */}
        {mapStatus === 'ready' && stopsWithOffsets
          .filter(({ isOffset }) => isOffset)
          .map(({ stop, displayLat, displayLng }) => (
            <Polyline
              key={`offset-line-${stop.id}`}
              coordinates={[
                { latitude: displayLat, longitude: displayLng },
                { latitude: stop.latitude, longitude: stop.longitude },
              ]}
              strokeColor={mapColors.offsetIndicator}
              strokeWidth={2}
              lineDashPattern={[6, 4]}
              lineCap="round"
            />
          ))}

        {/* Stop markers with floating title labels */}
        {mapStatus === 'ready' && stopsWithOffsets.map(({ stop, displayLat, displayLng }) => (
          <Marker
            key={`marker-${stop.id}`}
            identifier={`marker-${stop.id}`}
            coordinate={{
              latitude: displayLat,
              longitude: displayLng,
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={tracksViewChanges}
            onPress={() => setSelectedStop(stop)}
          >
            <View style={styles.markerContainer}>
              <View style={[styles.floatingLabel, {
                backgroundColor: mapColors.label.background,
                shadowColor: mapColors.label.shadow,
                borderColor: mapColors.label.border,
              }]}>
                <ThemedText
                  style={[styles.floatingLabelText, { color: mapColors.label.text }]}
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

        {/* Custom "You Are Here" marker */}
        {mapStatus === 'ready' && userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={999}
          >
            <View style={styles.userLocationMarker}>
              <View style={styles.userLocationPulse} />
              <View style={styles.userLocationDot} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Loading indicator */}
      {isLoadingRoute && (
        <View style={[styles.loadingOverlay, { backgroundColor: mapColors.loading.background }]}>
          <ActivityIndicator size="large" color={mapColors.loading.spinner} />
          <ThemedText style={[styles.loadingText, { color: mapColors.loading.text }]}>
            Loading route...
          </ThemedText>
        </View>
      )}

      {/* Add Stop Button */}
      {onOpenAddStop && (
        <Animated.View style={[styles.addStopButtonContainer, { opacity: controlsOpacity }]}>
          <Pressable
            style={[styles.addStopButton, { backgroundColor: mapColors.controls.background }, isAddingStop && styles.addStopButtonDisabled]}
            onPress={() => !isAddingStop && onOpenAddStop()}
            disabled={isAddingStop}
            onHoverIn={() => Platform.OS === 'web' && setShowAddStopTooltip(true)}
            onHoverOut={() => Platform.OS === 'web' && setShowAddStopTooltip(false)}
            accessibilityLabel="Add Venue"
            accessibilityHint="Add a new stop to your route"
            accessibilityRole="button"
          >
            {isAddingStop ? (
              <ActivityIndicator size="small" color={mapColors.controls.icon} />
            ) : (
              <IconSymbol name="plus" size={22} color={mapColors.controls.icon} />
            )}
          </Pressable>
          {showAddStopTooltip && (
            <View style={styles.tooltip}>
              <ThemedText style={[styles.tooltipText, { borderColor: mapColors.controls.border }]}>Add Venue</ThemedText>
            </View>
          )}
        </Animated.View>
      )}

      {/* Export to Navigation App Button */}
      <Animated.View style={[styles.exportButtonContainer, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => setShowNavSelectorModal(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open route in a navigation app"
        >
          <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={18} color="#FFFFFF" />
          <ThemedText style={styles.exportButtonText}>Directions</ThemedText>
        </TouchableOpacity>
      </Animated.View>

      {/* Map Controls */}
      <Animated.View style={[styles.mapControls, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: mapColors.controls.background }, styles.extentsButton]}
          onPress={fitBounds}
          accessibilityRole="button"
          accessibilityLabel="Fit route on screen"
        >
          <IconSymbol name="arrow.up.left.and.arrow.down.right" size={20} color={mapColors.controls.icon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: mapColors.controls.background }]}
          onPress={zoomIn}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <ThemedText style={[styles.controlButtonText, { color: mapColors.controls.icon }]}>+</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: mapColors.controls.background }]}
          onPress={zoomOut}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <ThemedText style={[styles.controlButtonText, { color: mapColors.controls.icon }]}>&minus;</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: mapColors.controls.background }, styles.locationButton]}
          onPress={zoomToMyLocation}
          disabled={isRequestingLocation}
          accessibilityRole="button"
          accessibilityLabel="Zoom to my location"
        >
          {isRequestingLocation ? (
            <ActivityIndicator size="small" color={mapColors.controls.icon} />
          ) : (
            <IconSymbol name="location.viewfinder" size={22} color={mapColors.controls.icon} />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Stop detail modal */}
      <StopDetailModal
        stop={selectedStop}
        totalStops={validStops.length}
        visible={selectedStop !== null}
        onClose={() => setSelectedStop(null)}
        onRemoveStop={onRemoveStop}
        isRemovingStop={isRemovingStop}
      />

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
  },
  addStopButtonContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  addStopButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addStopButtonDisabled: {
    opacity: 0.5,
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
    transform: [{ translateY: -95 }],
    gap: 10,
  },
  controlButton: {
    width: 46,
    height: 46,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1.5,
    marginBottom: 6,
    maxWidth: 180,
    minWidth: 60,
  },
  floatingLabelText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  locationButton: {
    marginTop: 6,
  },
  userLocationMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3B82F6',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
});
