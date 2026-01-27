import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Route, RouteStop, RouteSegment } from '@/types/route';
import { fetchCompleteRoute, RouteCoordinate } from '@/lib/google-directions';
import { optimizeRouteForParking } from '@/lib/route-optimizer';

interface RouteMapProps {
  route: Route;
}

export function RouteMap({ route }: RouteMapProps) {
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [useAppleMaps, setUseAppleMaps] = useState(true); // Default to Apple Maps until Google is fixed
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const mapRef = useRef<MapView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debug: Log component mount and initial state
  useEffect(() => {
    console.log('🗺️ RouteMap mounted with route:', route?.stops?.length, 'stops');
    console.log('🗺️ Route stops:', route.stops.map(s => `${s.name} (${s.latitude}, ${s.longitude})`));
    console.log('🗺️ Map provider:', useAppleMaps ? 'Apple Maps' : 'Google Maps');
  }, []);

  // Reset map status when provider changes
  useEffect(() => {
    setMapStatus('loading');
    const switchTime = Date.now();
    console.log('🗺️ Switching to:', useAppleMaps ? 'Apple Maps' : 'Google Maps');

    if (!useAppleMaps) {
      console.log('🔑 Google Maps Configuration:');
      console.log('   API Key: REDACTED_GOOGLE_MAPS_API_KEY');
      console.log('   Bundle ID: com.thacken5.chap');
      console.log('   Waiting for native map initialization...');

      // Set a timeout to check if map loaded
      timeoutRef.current = setTimeout(() => {
        const elapsed = ((Date.now() - switchTime) / 1000).toFixed(1);
        console.error(`❌ Google Maps TIMEOUT after ${elapsed} seconds`);
        console.error('   Native map initialization FAILED');
        console.error('   This indicates:');
        console.error('   1. Native module not properly linked, OR');
        console.error('   2. API key rejected by Google servers, OR');
        console.error('   3. App needs to be rebuilt with EAS');
        console.error('');
        console.error('   ACTION: Check native logs in Console.app (Mac)');
        console.error('   Filter for "Google" or "Maps" to see native errors');
        setMapStatus('error');
      }, 10000);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [useAppleMaps]);

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

  // Calculate initial region with appropriate deltas
  const initialRegion = useMemo(() => {
    const latDelta = (bounds.maxLat - bounds.minLat) * 1.5; // 1.5x padding
    const lngDelta = (bounds.maxLng - bounds.minLng) * 1.5;

    const region = {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: Math.max(latDelta, 0.01), // Minimum delta for single point
      longitudeDelta: Math.max(lngDelta, 0.01),
    };

    console.log('🗺️ Initial region calculated:', region);
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

  // Auto-fit map to route bounds when route changes
  useEffect(() => {
    if (route.stops.length > 0 && mapRef.current) {
      // Small delay to ensure map is ready
      const timer = setTimeout(() => {
        fitBounds();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [route.stops.length]);

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

  return (
    <View style={styles.container}>
      {/* Debug overlay - Remove this entire block once Google Maps is working */}
      <View style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        backgroundColor: useAppleMaps
          ? 'rgba(76,175,80,0.95)'
          : mapStatus === 'ready'
            ? 'rgba(33,150,243,0.95)'
            : mapStatus === 'error'
              ? 'rgba(244,67,54,0.95)'
              : 'rgba(255,152,0,0.95)',
        padding: 10,
        borderRadius: 8,
        maxWidth: '85%',
      }}>
        <ThemedText style={{ fontSize: 12, fontWeight: 'bold', color: 'white' }}>
          {useAppleMaps
            ? '✅ Apple Maps'
            : mapStatus === 'ready'
              ? '✅ Google Maps Working!'
              : mapStatus === 'error'
                ? '❌ Google Maps Error'
                : '⏳ Loading Google Maps...'}
        </ThemedText>
        <ThemedText style={{ fontSize: 10, color: 'white' }}>
          Stops: {route.stops.length} | Route: {routeCoordinates.length} pts
        </ThemedText>
        {!useAppleMaps && mapStatus === 'error' && (
          <ThemedText style={{ fontSize: 9, color: 'white', marginTop: 4 }}>
            Check console logs for details. Likely API key restrictions issue.
          </ThemedText>
        )}
        {!useAppleMaps && mapStatus === 'loading' && (
          <ThemedText style={{ fontSize: 9, color: 'white', marginTop: 4 }}>
            Waiting for tiles... Check API restrictions if this persists.
          </ThemedText>
        )}
        <TouchableOpacity
          onPress={() => setUseAppleMaps(!useAppleMaps)}
          style={{
            marginTop: 6,
            backgroundColor: 'white',
            padding: 6,
            borderRadius: 4,
          }}
        >
          <ThemedText style={{ fontSize: 11, fontWeight: 'bold', color: '#333' }}>
            Switch to {useAppleMaps ? 'Google' : 'Apple'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={useAppleMaps ? PROVIDER_DEFAULT : PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        key={useAppleMaps ? 'apple-maps' : 'google-maps'}
        showsCompass={true}
        showsScale={true}
        showsMyLocationButton={false}
        rotateEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        zoomEnabled={true}
        onRegionChangeComplete={(region) => {
          setCurrentRegion(region);
          if (!useAppleMaps) {
            console.log('🗺️ Google Maps region changed - map is interactive');
          }
        }}
        onMapReady={() => {
          console.log('✅ MapView onMapReady called - native map initialized');
          console.log(`   Provider: ${useAppleMaps ? 'Apple Maps' : 'Google Maps'}`);
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
        {/* Multi-mode route segments with different styles */}
        {!isLoadingRoute && routeSegments.length > 0 && (
          <>
            {routeSegments.map((segment) => (
              <React.Fragment key={`segment-${segment.id}`}>
                {/* Shadow layer */}
                <Polyline
                  coordinates={segment.coordinates}
                  strokeColor="rgba(0, 0, 0, 0.3)"
                  strokeWidth={10}
                  lineCap="round"
                  lineJoin="round"
                />

                {/* Main line - color based on mode */}
                <Polyline
                  coordinates={segment.coordinates}
                  strokeColor={segment.mode === 'walking' ? '#4CAF50' : '#FFD700'}
                  strokeWidth={6}
                  lineCap="round"
                  lineJoin="round"
                  lineDashPattern={segment.mode === 'walking' ? [2, 8] : undefined}
                />

                {/* Inner glow */}
                <Polyline
                  coordinates={segment.coordinates}
                  strokeColor={segment.mode === 'walking' ? '#81C784' : '#FFF8DC'}
                  strokeWidth={3}
                  lineCap="round"
                  lineJoin="round"
                  lineDashPattern={segment.mode === 'walking' ? [2, 8] : undefined}
                />
              </React.Fragment>
            ))}
          </>
        )}

        {/* Fallback: old route coordinates if segments not available */}
        {!isLoadingRoute && routeCoordinates.length > 0 && routeSegments.length === 0 && (
          <>
            {/* Shadow layer for depth effect */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="rgba(0, 0, 0, 0.3)"
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            {/* Main yellow route line */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#FFD700"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
            {/* Inner glow for visibility */}
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#FFF8DC"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Parking location markers */}
        {route.stops
          .filter(stop => stop.parkingLocation)
          .map((stop) => (
            <Marker
              key={`parking-${stop.order}`}
              coordinate={{
                latitude: stop.parkingLocation!.latitude,
                longitude: stop.parkingLocation!.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.parkingMarker}>
                <IconSymbol name="parkingsign.circle.fill" size={32} color="#2196F3" />
              </View>
            </Marker>
          ))}

        {/* Stop markers with floating title labels */}
        {route.stops.map((stop) => (
          <Marker
            key={stop.order}
            identifier={`marker-${stop.order}`}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }} // Anchor at bottom center to position label above
            tracksViewChanges={false} // Performance optimization
          >
            <TouchableOpacity
              onPress={() => setSelectedStop(stop)}
              style={styles.markerContainer}
              activeOpacity={0.9}
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
            </TouchableOpacity>
          </Marker>
        ))}
      </MapView>

      {/* Loading indicator for route fetching */}
      {isLoadingRoute && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFD700" />
          <ThemedText style={styles.loadingText}>
            Loading route...
          </ThemedText>
        </View>
      )}

      {/* Map Controls */}
      <View style={styles.mapControls}>
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
      </View>

      {/* Stop detail modal */}
      <StopDetailModal
        stop={selectedStop}
        totalStops={route.stops.length}
        visible={selectedStop !== null}
        onClose={() => setSelectedStop(null)}
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 120,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -60 }],
    gap: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  extentsButton: {
    marginBottom: 8,
  },
  controlButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 4,
    maxWidth: 180,
    minWidth: 60,
  },
  floatingLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
});
