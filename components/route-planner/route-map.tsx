import { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { ThemedText } from '@/components/themed-text';
import { StopMarker } from './stop-marker';
import { StopDetailModal } from './stop-detail-modal';
import { Route, RouteStop, MapBounds } from '@/types/route';
import { useColorScheme } from '@/hooks/use-color-scheme';

MapLibreGL.setAccessToken(null); // CARTO doesn't require a token

interface RouteMapProps {
  route: Route;
}

export function RouteMap({ route }: RouteMapProps) {
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const colorScheme = useColorScheme();

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

  // Create route line coordinates
  const routeCoordinates = useMemo(() => {
    return route.stops.map((stop) => [stop.longitude, stop.latitude]);
  }, [route.stops]);

  // Use detailed Voyager basemap for better visual features
  const mapStyle =
    colorScheme === 'dark'
      ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'; // More detailed map

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        style={styles.map}
        styleURL={mapStyle}
        logoEnabled={false}
        compassEnabled={true}
        compassViewPosition={3}
        compassViewMargins={{ x: 16, y: 100 }}
        scaleBarEnabled={true}
        scaleBarPosition={{ bottom: 80, left: 16 }}
        attributionEnabled={true}
        attributionPosition={{ bottom: 8, right: 8 }}
        rotateEnabled={true}
        scrollEnabled={true}
        pitchEnabled={true}
        zoomEnabled={true}
      >
        <MapLibreGL.Camera
          zoomLevel={13}
          centerCoordinate={[center.longitude, center.latitude]}
          animationMode="flyTo"
          animationDuration={1000}
          minZoomLevel={10}
          maxZoomLevel={18}
        />

        {/* Route line */}
        <MapLibreGL.ShapeSource
          id="routeSource"
          shape={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeCoordinates,
            },
          }}
        >
          {/* Route line outline (shadow effect) */}
          <MapLibreGL.LineLayer
            id="routeLineOutline"
            style={{
              lineColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF',
              lineWidth: 8,
              lineOpacity: 0.3,
              lineBlur: 2,
            }}
            belowLayerID="routeLine"
          />
          {/* Main route line */}
          <MapLibreGL.LineLayer
            id="routeLine"
            style={{
              lineColor: colorScheme === 'dark' ? '#FF6B6B' : '#0a7ea4',
              lineWidth: 5,
              lineOpacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          {/* Route line with dashes for visual interest */}
          <MapLibreGL.LineLayer
            id="routeLineDash"
            style={{
              lineColor: colorScheme === 'dark' ? '#FFFFFF' : '#FFFFFF',
              lineWidth: 2,
              lineOpacity: 0.4,
              lineDasharray: [2, 4],
            }}
          />
        </MapLibreGL.ShapeSource>

        {/* Stop markers */}
        {route.stops.map((stop) => (
          <MapLibreGL.MarkerView
            key={stop.order}
            id={`marker-${stop.order}`}
            coordinate={[stop.longitude, stop.latitude]}
          >
            <TouchableOpacity onPress={() => setSelectedStop(stop)}>
              <StopMarker type={stop.type} stopNumber={stop.order} />
            </TouchableOpacity>
          </MapLibreGL.MarkerView>
        ))}
      </MapLibreGL.MapView>

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
});
