import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Linking, Alert, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { NavigationAppSelectorModal, NavigationApp } from './navigation-app-selector-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Route, RouteStop, RouteSegment, TravelMode } from '@/types/route';
import { RouteCoordinate, fetchCompleteRouteWithSegments } from '@/lib/google-directions';
import { MapColors, tailwind } from '@/constants/theme';

// Check if running in Expo Go (which doesn't support Google Maps on iOS)
const isExpoGo = Constants.appOwnership === 'expo';

// Determine map provider - use Google on development builds, default (Apple) in Expo Go
const MAP_PROVIDER = Platform.OS === 'ios' && isExpoGo ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

// Debug: Temporarily disable custom style to test if Google Maps works without it
const USE_CUSTOM_STYLE = false;

console.log(`[RouteMap] Provider: ${MAP_PROVIDER === PROVIDER_GOOGLE ? 'Google' : 'Apple'}, ExpoGo: ${isExpoGo}`);

// Pastel map style for Google Maps - tailwind-inspired soft colors
const PASTEL_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F9FAFB' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D1D5DB' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FEF3C7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#FDE68A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBEAFE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60A5FA' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#059669' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F3F4F6' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ECFDF5' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
];

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
  onOpenAddStop?: () => void;
  onRemoveStop?: (stopId: string) => Promise<void>;
  isRemovingStop?: boolean;
  isAddingStop?: boolean;
}

export function RouteMap({
  route,
  onOpenAddStop,
  onRemoveStop,
  isRemovingStop = false,
  isAddingStop = false,
}: RouteMapProps) {

  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [showAddStopTooltip, setShowAddStopTooltip] = useState(false);
  const [showNavSelectorModal, setShowNavSelectorModal] = useState(false);
  const [isExportingRoute, setIsExportingRoute] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [markersKey, setMarkersKey] = useState(0);
  const [tracksViewChanges, setTracksViewChanges] = useState(false);
  const [segmentRevision, setSegmentRevision] = useState(0);
  const mapRef = useRef<MapView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate offset positions for overlapping stops (filter invalid coords)
  const stopsWithOffsets = useMemo(() => {
    const validStops = route.stops.filter(stop =>
      typeof stop.latitude === 'number' &&
      typeof stop.longitude === 'number' &&
      !isNaN(stop.latitude) &&
      !isNaN(stop.longitude) &&
      stop.latitude !== 0 &&
      stop.longitude !== 0
    );
    return calculateStopPositions(validStops);
  }, [route.stops]);

  // Track previous stop count to fit map when stops are added/removed
  const prevStopCountRef = useRef(route.stops.length);

  useEffect(() => {
    const stopCountChanged = route.stops.length !== prevStopCountRef.current;

    if (stopCountChanged && hasAnimatedIn && route.stops.length >= 2) {
      setTimeout(() => {
        if (mapRef.current && route.stops.length > 0) {
          mapRef.current.fitToCoordinates(
            stopsWithOffsets.map(({ stop }) => ({ latitude: stop.latitude, longitude: stop.longitude })),
            { edgePadding: { top: 100, right: 60, bottom: 280, left: 60 }, animated: true }
          );
        }
      }, 300);
    }

    prevStopCountRef.current = route.stops.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.stops.length, hasAnimatedIn]);

  const controlsOpacity = useRef(new Animated.Value(0)).current;

  // Force markers to re-render when stops change
  useEffect(() => {
    setMarkersKey(prev => prev + 1);
    setTracksViewChanges(true);
    const timeout = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(timeout);
  }, [route.stops.length, JSON.stringify(route.stops.map(s => s.id))]);

  // Map initialization timeout
  useEffect(() => {
    setMapStatus('loading');

    timeoutRef.current = setTimeout(() => {
      setMapStatus((current) => {
        if (current === 'loading') {
          console.warn('[RouteMap] Forcing ready state after timeout');
          return 'ready';
        }
        return current;
      });
    }, 3000);

    const controlsTimeout = setTimeout(() => {
      if (!hasAnimatedIn) {
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
  const stopsKey = useMemo(() => {
    return [...route.stops]
      .filter(s =>
        typeof s.latitude === 'number' && typeof s.longitude === 'number' &&
        !isNaN(s.latitude) && !isNaN(s.longitude) &&
        s.latitude !== 0 && s.longitude !== 0
      )
      .sort((a, b) => a.order - b.order)
      .map(s => `${s.latitude.toFixed(6)},${s.longitude.toFixed(6)}`)
      .join('|');
  }, [route.stops]);

  // Fetch road-following directions when stops change
  useEffect(() => {
    const validStops = [...route.stops]
      .filter(s =>
        typeof s.latitude === 'number' && typeof s.longitude === 'number' &&
        !isNaN(s.latitude) && !isNaN(s.longitude) &&
        s.latitude !== 0 && s.longitude !== 0
      )
      .sort((a, b) => a.order - b.order);

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
          console.log(`[RouteMap] Directions: ${segments.length} segments, ${segments.reduce((sum, s) => sum + s.coordinates.length, 0)} coords`);
          setRouteSegments(segments);
          setSegmentRevision(prev => prev + 1);
          setRouteCoordinates([]);
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[RouteMap] Direction fetch failed:', error);
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
        edgePadding: { top: 100, right: 60, bottom: 280, left: 60 },
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
    if (mapStatus === 'ready' && route.stops.length > 0 && !hasAnimatedIn) {
      setHasAnimatedIn(true);

      if (mapRef.current) {
        mapRef.current.fitToCoordinates(
          stopsWithOffsets.map(({ stop }) => ({ latitude: stop.latitude, longitude: stop.longitude })),
          { edgePadding: { top: 100, right: 60, bottom: 280, left: 60 }, animated: false }
        );
      }

      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [mapStatus, route.stops, hasAnimatedIn, controlsOpacity, stopsWithOffsets]);

  const fitBounds = () => {
    if (!mapRef.current || stopsWithOffsets.length === 0) return;
    const coordinates = stopsWithOffsets.map(({ stop }) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 100, right: 60, bottom: 280, left: 60 },
      animated: true,
    });
  };

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

  const exportToAppleMaps = useCallback(async () => {
    if (route.stops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);
    const firstStop = sortedStops[0];
    const remainingStops = sortedStops.slice(1);
    const saddr = `${firstStop.latitude},${firstStop.longitude}`;
    const daddr = remainingStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('+to:');

    const url = remainingStops.length > 0
      ? `maps://?saddr=${saddr}&daddr=${daddr}&dirflg=d`
      : `maps://?saddr=${saddr}&dirflg=d`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        const webUrl = remainingStops.length > 0
          ? `http://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`
          : `http://maps.apple.com/?saddr=${saddr}&dirflg=d`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      console.error('Error opening Apple Maps:', error);
      Alert.alert('Unable to Open Maps', 'Could not open Apple Maps. Please try again.');
    }
  }, [route.stops]);

  const exportToGoogleMaps = useCallback(async () => {
    if (route.stops.length === 0) {
      Alert.alert('No Stops', 'There are no stops to export.');
      return;
    }

    const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);
    const firstStop = sortedStops[0];
    const lastStop = sortedStops[sortedStops.length - 1];
    const middleStops = sortedStops.slice(1, -1);
    const origin = `${firstStop.latitude},${firstStop.longitude}`;
    const destination = `${lastStop.latitude},${lastStop.longitude}`;
    const waypoints = middleStops
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }

    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening Google Maps:', error);
      Alert.alert('Unable to Open Google Maps', 'Could not open Google Maps. Please try again.');
    }
  }, [route.stops]);

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
        onRegionChangeComplete={(region) => setCurrentRegion(region)}
        onMapReady={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setMapStatus('ready');
        }}
        onMapLoaded={() => setMapStatus('ready')}
      >
        {/* Route segments with 3-layer effect */}
        {mapStatus === 'ready' && routeSegments.length > 0 && (
          <>
            {routeSegments.map((segment) => {
              const colors = segment.mode === 'walking'
                ? MapColors.route.walking
                : MapColors.route.driving;
              return (
                <React.Fragment key={`segment-${segment.id}-r${segmentRevision}`}>
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
              strokeColor={MapColors.route.driving.shadow}
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={MapColors.route.driving.main}
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={MapColors.route.driving.glow}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
          </React.Fragment>
        )}

        {/* Parking location markers */}
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

        {/* Offset indicator lines */}
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

        {/* Stop markers with floating title labels */}
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

      {/* Loading indicator */}
      {isLoadingRoute && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={MapColors.loading.spinner} />
          <ThemedText style={styles.loadingText}>
            Loading route...
          </ThemedText>
        </View>
      )}

      {/* Add Stop Button */}
      {onOpenAddStop && (
        <Animated.View style={[styles.addStopButtonContainer, { opacity: controlsOpacity }]}>
          <Pressable
            style={[styles.addStopButton, isAddingStop && styles.addStopButtonDisabled]}
            onPress={() => !isAddingStop && onOpenAddStop()}
            disabled={isAddingStop}
            onHoverIn={() => Platform.OS === 'web' && setShowAddStopTooltip(true)}
            onHoverOut={() => Platform.OS === 'web' && setShowAddStopTooltip(false)}
            accessibilityLabel="Add Venue"
            accessibilityHint="Add a new stop to your route"
            accessibilityRole="button"
          >
            {isAddingStop ? (
              <ActivityIndicator size="small" color={MapColors.controls.icon} />
            ) : (
              <IconSymbol name="plus" size={22} color={MapColors.controls.icon} />
            )}
          </Pressable>
          {showAddStopTooltip && (
            <View style={styles.tooltip}>
              <ThemedText style={styles.tooltipText}>Add Venue</ThemedText>
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
        >
          <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={18} color="#FFFFFF" />
          <ThemedText style={styles.exportButtonText}>Directions</ThemedText>
        </TouchableOpacity>
      </Animated.View>

      {/* Map Controls */}
      <Animated.View style={[styles.mapControls, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={[styles.controlButton, styles.extentsButton]}
          onPress={fitBounds}
        >
          <ThemedText style={styles.controlButtonText}>&#x2291;</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={zoomIn}>
          <ThemedText style={styles.controlButtonText}>+</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={zoomOut}>
          <ThemedText style={styles.controlButtonText}>&minus;</ThemedText>
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
