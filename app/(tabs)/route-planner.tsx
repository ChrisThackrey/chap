import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PromptInput } from '@/components/route-planner/prompt-input';
import { LoadingState } from '@/components/route-planner/loading-state';
import { RouteSummary } from '@/components/route-planner/route-summary';
import { RouteMap } from '@/components/route-planner/route-map';
import { LocationSelector } from '@/components/route-planner/location-selector';
import { useRouteGeneration } from '@/hooks/use-route-generation';
import { useUserLocation } from '@/hooks/use-user-location';
import { useRouteStorage } from '@/hooks/use-route-storage';
import { useLocationPreference, LocationPreference } from '@/hooks/use-location-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function RoutePlannerScreen() {
  const { state, route, error, generate, reset } = useRouteGeneration();
  const { location: deviceLocation, requestLocation } = useUserLocation();
  const { saveRoute } = useRouteStorage();
  const { location: preferredLocation, saveLocation, getLocationContext } = useLocationPreference();
  const [showLocationSelector, setShowLocationSelector] = useState(!preferredLocation);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleLocationSelected = async (location: LocationPreference) => {
    await saveLocation(location);
    setShowLocationSelector(false);
  };

  const handleGenerate = async (prompt: string) => {
    // Use preferred location if set, otherwise try to get device location
    let userLoc = preferredLocation
      ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
      : deviceLocation;

    if (!userLoc) {
      userLoc = await requestLocation();
    }

    const locationContext = preferredLocation ? getLocationContext() : undefined;

    await generate(prompt, {
      userLocation: userLoc || undefined,
      locationContext,
    });
  };

  const handleSave = async () => {
    if (route) {
      try {
        await saveRoute(route);
      } catch (error) {
        console.error('Failed to save route:', error);
      }
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Location Badge */}
      {preferredLocation && state !== 'success' && (
        <TouchableOpacity
          style={[styles.locationBadge, { backgroundColor: colors.tint }]}
          onPress={() => setShowLocationSelector(true)}
        >
          <IconSymbol name="mappin.circle.fill" size={16} color="#FFFFFF" />
          <ThemedText style={styles.locationBadgeText} numberOfLines={1}>
            {preferredLocation.city}, {preferredLocation.state}
          </ThemedText>
          <IconSymbol name="chevron.down" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Location Selector Modal */}
      <Modal
        visible={showLocationSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <ScrollView>
          <ThemedView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="title">Choose Location</ThemedText>
              {preferredLocation && (
                <TouchableOpacity onPress={() => setShowLocationSelector(false)}>
                  <ThemedText style={[styles.closeButton, { color: colors.tint }]}>
                    Done
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
            <LocationSelector
              onLocationSelected={handleLocationSelected}
              currentLocation={preferredLocation || undefined}
            />
          </ThemedView>
        </ScrollView>
      </Modal>

      {state === 'idle' && (
        <PromptInput onGenerate={handleGenerate} loading={false} />
      )}

      {state === 'loading' && <LoadingState onCancel={reset} />}

      {state === 'error' && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText type="title" style={styles.errorTitle}>
            Oops! Something went wrong
          </ThemedText>
          <ThemedText style={styles.errorMessage}>{error}</ThemedText>
          <ThemedText style={styles.errorHint}>
            Make sure you've added your OpenAI API key to the .env file
          </ThemedText>
          <PromptInput onGenerate={handleGenerate} loading={false} />
        </ThemedView>
      )}

      {state === 'success' && route && (
        <View style={{ flex: 1 }}>
          <RouteSummary route={route} onSave={handleSave} onRegenerate={reset} />
          <View style={{ flex: 1 }}>
            <RouteMap route={route} />
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    margin: 12,
    borderRadius: 20,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  locationBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  modalContent: {
    flex: 1,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    color: '#FF6B6B',
  },
  errorHint: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
});
