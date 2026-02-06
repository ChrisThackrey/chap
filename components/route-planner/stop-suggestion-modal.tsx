import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { searchNearbyPlaces, googlePlaceToRouteStop, GooglePlaceNew } from '@/lib/google-places';
import { RouteStop } from '@/types/route';
import { tailwind } from '@/constants/theme';
import { SuggestionCard } from './suggestion-card';

interface StopSuggestionModalProps {
  visible: boolean;
  description: string;
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  onSelectStop: (stop: RouteStop) => void;
  onDismiss: () => void;
  onSearchAgain: () => void;
}

export function StopSuggestionModal({
  visible,
  description,
  searchLocation,
  radiusMeters,
  onSelectStop,
  onDismiss,
  onSearchAgain,
}: StopSuggestionModalProps) {
  const [places, setPlaces] = useState<GooglePlaceNew[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible || !description || !searchLocation) return;

    let cancelled = false;
    setLoading(true);
    setSearched(false);
    setPlaces([]);

    (async () => {
      try {
        const results = await searchNearbyPlaces(
          description,
          searchLocation.latitude,
          searchLocation.longitude,
          radiusMeters,
        );
        if (!cancelled) {
          setPlaces(results.slice(0, 5));
          setSearched(true);
        }
      } catch (err) {
        console.error('[StopSuggestionModal] Search error:', err);
        if (!cancelled) setSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, description, searchLocation, radiusMeters]);

  const handleSelect = (place: GooglePlaceNew) => {
    const stop = googlePlaceToRouteStop(place, 0);
    onSelectStop(stop);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Pick a place</ThemedText>
            <ThemedText style={styles.subtitle}>
              Results for &ldquo;{description}&rdquo;
            </ThemedText>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
            <IconSymbol name="xmark.circle.fill" size={28} color={tailwind.gray300} />
          </TouchableOpacity>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={tailwind.blue500} />
            <ThemedText style={styles.stateText}>Finding places nearby...</ThemedText>
          </View>
        )}

        {/* Empty */}
        {!loading && searched && places.length === 0 && (
          <View style={styles.centeredState}>
            <IconSymbol name="magnifyingglass" size={36} color={tailwind.gray300} />
            <ThemedText style={styles.stateTitle}>No places found</ThemedText>
            <ThemedText style={styles.stateText}>
              Try a different description or widen your search area.
            </ThemedText>
          </View>
        )}

        {/* Results */}
        {!loading && places.length > 0 && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {places.map((place) => (
              <SuggestionCard
                key={place.id}
                place={place}
                onSelect={handleSelect}
              />
            ))}
          </ScrollView>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={onSearchAgain}
            activeOpacity={0.7}
          >
            <IconSymbol name="arrow.left" size={16} color={tailwind.gray600} />
            <ThemedText style={styles.footerButtonText}>
              Different search
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.footerButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tailwind.gray200,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: tailwind.gray900,
  },
  subtitle: {
    fontSize: 14,
    color: tailwind.gray500,
    marginTop: 2,
  },
  closeBtn: {
    marginTop: 2,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: tailwind.gray700,
  },
  stateText: {
    fontSize: 14,
    color: tailwind.gray500,
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tailwind.gray200,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: tailwind.gray600,
  },
});
