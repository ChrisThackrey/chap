import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  searchNearbyPlaces,
  googlePlaceToRouteStop,
  isGooglePlacesConfigured,
  GooglePlaceNew,
  calculateDistance,
} from '@/lib/google-places';
import { generateRoutePlan } from '@/lib/route-generator';
import { Route, RouteStop } from '@/types/route';
import { tailwind } from '@/constants/theme';
import { SuggestionCard } from './suggestion-card';

type Phase = 'loading' | 'results' | 'manual' | 'searching';

const QUICK_PICKS = [
  { label: 'Coffee', query: 'coffee shop', icon: 'cup.and.saucer.fill' as const, color: '#8B4513' },
  { label: 'Bar', query: 'bar', icon: 'wineglass.fill' as const, color: '#9B59B6' },
  { label: 'Restaurant', query: 'restaurant', icon: 'fork.knife' as const, color: '#FF6B6B' },
  { label: 'Park', query: 'park', icon: 'tree.fill' as const, color: '#2ECC71' },
  { label: 'Museum', query: 'museum', icon: 'building.columns.fill' as const, color: '#3498DB' },
  { label: 'Activity', query: 'fun activity', icon: 'figure.run' as const, color: '#1ABC9C' },
];

interface AddStopModalProps {
  visible: boolean;
  route: Route | null;
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  onSelectStop: (stop: RouteStop) => void;
  onDismiss: () => void;
}

export function AddStopModal({
  visible,
  route,
  searchLocation,
  radiusMeters,
  onSelectStop,
  onDismiss,
}: AddStopModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [places, setPlaces] = useState<GooglePlaceNew[]>([]);
  const [aiQuery, setAiQuery] = useState('');
  const [searchLabel, setSearchLabel] = useState('');
  const [customText, setCustomText] = useState('');
  const [selectedChip, setSelectedChip] = useState<number | null>(null);

  // Snapshot stops on open to prevent re-renders from changing them
  const stopsSnapshotRef = useRef<RouteStop[]>([]);
  const cancelledRef = useRef(false);

  const originalPrompt = route?.originalPrompt;
  const existingStops = route?.stops;

  // Compute smart search center from existing stops
  const smartSearchCenter = useMemo(() => {
    if (!searchLocation) return null;
    const stops = stopsSnapshotRef.current;
    if (!stops || stops.length < 2) return searchLocation;

    const sorted = [...stops].sort((a, b) => a.order - b.order);
    let maxGap = 0;
    let gapMidLat = searchLocation.latitude;
    let gapMidLon = searchLocation.longitude;

    for (let i = 0; i < sorted.length - 1; i++) {
      const dist = calculateDistance(
        sorted[i].latitude, sorted[i].longitude,
        sorted[i + 1].latitude, sorted[i + 1].longitude
      );
      if (dist > maxGap) {
        maxGap = dist;
        gapMidLat = (sorted[i].latitude + sorted[i + 1].latitude) / 2;
        gapMidLon = (sorted[i].longitude + sorted[i + 1].longitude) / 2;
      }
    }
    return { latitude: gapMidLat, longitude: gapMidLon };
  }, [searchLocation]);

  // Rank-blend and slice results
  const rankBlendResults = useCallback((results: GooglePlaceNew[], stops: RouteStop[]): GooglePlaceNew[] => {
    if (!stops || stops.length === 0) return results.slice(0, 5);

    const withRelevanceRank = results.map((r, i) => ({ place: r, relevanceRank: i }));

    const byDistance = [...withRelevanceRank].sort((a, b) => {
      const distA = a.place.location ? Math.min(...stops.map(s =>
        calculateDistance(a.place.location!.latitude, a.place.location!.longitude, s.latitude, s.longitude)
      )) : Infinity;
      const distB = b.place.location ? Math.min(...stops.map(s =>
        calculateDistance(b.place.location!.latitude, b.place.location!.longitude, s.latitude, s.longitude)
      )) : Infinity;
      return distA - distB;
    });
    const distanceRankMap = new Map<string, number>();
    byDistance.forEach((item, i) => distanceRankMap.set(item.place.id, i));

    return withRelevanceRank
      .sort((a, b) => {
        const scoreA = a.relevanceRank * 0.6 + (distanceRankMap.get(a.place.id) ?? results.length) * 0.4;
        const scoreB = b.relevanceRank * 0.6 + (distanceRankMap.get(b.place.id) ?? results.length) * 0.4;
        return scoreA - scoreB;
      })
      .map(item => item.place)
      .slice(0, 5);
  }, []);

  // Search places with a query
  const searchWithQuery = useCallback(async (query: string) => {
    if (!smartSearchCenter || !isGooglePlacesConfigured()) {
      setPhase('manual');
      return;
    }

    setPlaces([]);
    try {
      const results = await searchNearbyPlaces(
        query,
        smartSearchCenter.latitude,
        smartSearchCenter.longitude,
        radiusMeters,
      );

      if (cancelledRef.current) return;

      if (results.length === 0) {
        setPhase('manual');
        return;
      }

      const sorted = rankBlendResults(results, stopsSnapshotRef.current);
      setPlaces(sorted);
      setPhase('results');
    } catch (err) {
      console.error('[AddStopModal] Search error:', err);
      if (!cancelledRef.current) setPhase('manual');
    }
  }, [smartSearchCenter, radiusMeters, rankBlendResults]);

  // Main effect: on open, decide AI vs manual
  useEffect(() => {
    if (!visible) return;

    // Snapshot current stops
    stopsSnapshotRef.current = existingStops || [];
    cancelledRef.current = false;
    setPlaces([]);
    setCustomText('');
    setSelectedChip(null);
    setAiQuery('');
    setSearchLabel('');

    // If no original prompt or no Google Places, go straight to manual
    if (!originalPrompt || !searchLocation || !isGooglePlacesConfigured()) {
      setPhase('manual');
      return;
    }

    // AI-driven flow
    setPhase('loading');

    (async () => {
      try {
        const existingNames = stopsSnapshotRef.current.map(s => s.name);
        const plan = await generateRoutePlan(originalPrompt, {
          venueCount: 1,
          pinnedStopNames: existingNames.length > 0 ? existingNames : undefined,
        });

        if (cancelledRef.current) return;

        if (!plan.stops || plan.stops.length === 0) {
          setPhase('manual');
          return;
        }

        const query = plan.stops[0].searchQuery;
        setAiQuery(query);
        await searchWithQuery(query);
      } catch (err) {
        console.error('[AddStopModal] AI suggestion error:', err);
        if (!cancelledRef.current) setPhase('manual');
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [visible, originalPrompt, searchLocation, existingStops, searchWithQuery]);

  const handleSelect = useCallback((place: GooglePlaceNew) => {
    const stop = googlePlaceToRouteStop(place, 0);
    if (!stop) return;
    onSelectStop(stop);
  }, [onSelectStop]);

  const handleManualSearch = useCallback(async () => {
    const label = selectedChip !== null
      ? QUICK_PICKS[selectedChip].label
      : customText.trim();
    const query = selectedChip !== null
      ? QUICK_PICKS[selectedChip].query
      : customText.trim();

    if (!query) return;

    setSearchLabel(label);
    setPhase('searching');
    await searchWithQuery(query);
  }, [selectedChip, customText, searchWithQuery]);

  const handleChipPress = (index: number) => {
    setSelectedChip(index);
    setCustomText('');
  };

  const handleTextChange = (text: string) => {
    setCustomText(text);
    if (text.length > 0) setSelectedChip(null);
  };

  const canSearch = selectedChip !== null || customText.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Add a Stop</ThemedText>
            {phase === 'results' && searchLabel ? (
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                Showing: &ldquo;{searchLabel}&rdquo;
              </ThemedText>
            ) : phase === 'results' && aiQuery ? (
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                AI suggested: &ldquo;{aiQuery}&rdquo;
              </ThemedText>
            ) : phase === 'loading' ? (
              <ThemedText style={styles.subtitle}>
                Finding a great addition...
              </ThemedText>
            ) : null}
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
            <IconSymbol name="xmark.circle.fill" size={28} color={tailwind.gray300} />
          </TouchableOpacity>
        </View>

        {/* Loading phase */}
        {phase === 'loading' && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={tailwind.blue500} />
            <ThemedText style={styles.stateText}>
              Asking AI for the perfect next stop...
            </ThemedText>
          </View>
        )}

        {/* Searching phase (manual search in progress) */}
        {phase === 'searching' && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={tailwind.blue500} />
            <ThemedText style={styles.stateText}>Searching nearby places...</ThemedText>
          </View>
        )}

        {/* Results phase */}
        {phase === 'results' && places.length > 0 && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick picks + custom search at top */}
            <ThemedText style={styles.sectionLabel}>Quick pick</ThemedText>
            <View style={styles.chipGrid}>
              {QUICK_PICKS.map((pick, index) => {
                const isSelected = selectedChip === index;
                return (
                  <TouchableOpacity
                    key={pick.label}
                    style={[
                      styles.chip,
                      isSelected && { backgroundColor: pick.color, borderColor: pick.color },
                    ]}
                    onPress={() => handleChipPress(index)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol
                      name={pick.icon}
                      size={18}
                      color={isSelected ? '#FFFFFF' : pick.color}
                    />
                    <ThemedText
                      style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}
                    >
                      {pick.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>or describe what you want</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            <TextInput
              style={styles.textInput}
              placeholder="e.g. a rooftop bar with great views"
              placeholderTextColor={tailwind.gray400}
              value={customText}
              onChangeText={handleTextChange}
              returnKeyType="search"
              onSubmitEditing={canSearch ? handleManualSearch : undefined}
            />

            <TouchableOpacity
              style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
              onPress={handleManualSearch}
              disabled={!canSearch}
              activeOpacity={0.8}
            >
              <IconSymbol name="magnifyingglass" size={20} color="#FFFFFF" />
              <ThemedText style={styles.searchButtonText}>Search Nearby</ThemedText>
            </TouchableOpacity>

            {/* Suggestion cards below */}
            <View style={styles.suggestionsSection}>
              <ThemedText style={styles.sectionLabel}>Suggestions</ThemedText>
              {places.map((place) => {
                const stops = stopsSnapshotRef.current;
                let nearestDist: number | undefined;
                let nearestName: string | undefined;
                if (place.location && stops.length > 0) {
                  for (const s of stops) {
                    const d = calculateDistance(
                      place.location.latitude, place.location.longitude,
                      s.latitude, s.longitude
                    ) * 0.621371; // km to miles
                    if (nearestDist === undefined || d < nearestDist) {
                      nearestDist = d;
                      nearestName = s.name;
                    }
                  }
                }
                return (
                  <SuggestionCard
                    key={place.id}
                    place={place}
                    onSelect={handleSelect}
                    nearestStopDistance={nearestDist}
                    nearestStopName={nearestName}
                  />
                );
              })}
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}

        {/* Manual phase */}
        {phase === 'manual' && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.manualContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick pick chips */}
            <ThemedText style={styles.sectionLabel}>Quick pick</ThemedText>
            <View style={styles.chipGrid}>
              {QUICK_PICKS.map((pick, index) => {
                const isSelected = selectedChip === index;
                return (
                  <TouchableOpacity
                    key={pick.label}
                    style={[
                      styles.chip,
                      isSelected && { backgroundColor: pick.color, borderColor: pick.color },
                    ]}
                    onPress={() => handleChipPress(index)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol
                      name={pick.icon}
                      size={18}
                      color={isSelected ? '#FFFFFF' : pick.color}
                    />
                    <ThemedText
                      style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}
                    >
                      {pick.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>or describe what you want</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            {/* Text input */}
            <TextInput
              style={styles.textInput}
              placeholder="e.g. a rooftop bar with great views"
              placeholderTextColor={tailwind.gray400}
              value={customText}
              onChangeText={handleTextChange}
              returnKeyType="search"
              onSubmitEditing={canSearch ? handleManualSearch : undefined}
            />

            {/* Search button */}
            <TouchableOpacity
              style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
              onPress={handleManualSearch}
              disabled={!canSearch}
              activeOpacity={0.8}
            >
              <IconSymbol name="magnifyingglass" size={20} color="#FFFFFF" />
              <ThemedText style={styles.searchButtonText}>Search Nearby</ThemedText>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
    maxWidth: 260,
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
  manualContent: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tailwind.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
    backgroundColor: '#FFFFFF',
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tailwind.gray700,
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tailwind.gray200,
  },
  dividerText: {
    fontSize: 13,
    color: tailwind.gray400,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: tailwind.gray900,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tailwind.blue500,
    paddingVertical: 16,
    borderRadius: 14,
  },
  searchButtonDisabled: {
    opacity: 0.4,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  suggestionsSection: {
    marginTop: 8,
    gap: 12,
  },
  bottomSpacer: {
    height: 40,
  },
});
