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

  // CARTO basemap style URLs
  const mapStyle =
    colorScheme === 'dark'
      ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        style={styles.map}
        styleURL={mapStyle}
        logoEnabled={false}
      >
        <MapLibreGL.Camera
          zoomLevel={12}
          centerCoordinate={[center.longitude, center.latitude]}
          animationMode="flyTo"
          animationDuration={1000}
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
          <MapLibreGL.LineLayer
            id="routeLine"
            style={{
              lineColor: colorScheme === 'dark' ? '#FFFFFF' : '#0a7ea4',
              lineWidth: 4,
              lineOpacity: 0.8,
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
