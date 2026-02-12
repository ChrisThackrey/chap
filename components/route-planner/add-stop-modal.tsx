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
import { Route, RouteStop, StopType } from '@/types/route';
import { STOP_ICON_MAPPING } from '@/constants/stop-icons';
import { Colors, tailwind } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SuggestionCard } from './suggestion-card';

type Phase = 'idle' | 'searching' | 'results';

const ALL_STOP_TYPES: StopType[] = [
  'cafe', 'bar', 'restaurant', 'park', 'museum',
  'activity', 'theater', 'viewpoint', 'shopping',
];

const SEARCH_QUERY_BY_TYPE: Record<StopType, string> = {
  restaurant: 'restaurant',
  cafe: 'coffee shop',
  bar: 'bar',
  park: 'park',
  museum: 'museum',
  theater: 'theater',
  viewpoint: 'scenic viewpoint',
  activity: 'fun activity',
  shopping: 'shopping stores',
};

function getComplementaryTypes(stops: RouteStop[]): StopType[] {
  const existing = new Set(stops.map(s => s.type));
  return ALL_STOP_TYPES.filter(t => !existing.has(t));
}

const QUICK_PICKS = [
  { label: 'Coffee', query: 'coffee shop', icon: 'cup.and.saucer.fill' as const, color: '#8B4513' },
  { label: 'Bar', query: 'bar', icon: 'wineglass.fill' as const, color: '#9B59B6' },
  { label: 'Restaurant', query: 'restaurant', icon: 'fork.knife' as const, color: '#FF6B6B' },
  { label: 'Park', query: 'park', icon: 'tree.fill' as const, color: '#2ECC71' },
  { label: 'Museum', query: 'museum', icon: 'building.columns.fill' as const, color: '#3498DB' },
  { label: 'Activity', query: 'fun activity', icon: 'figure.run' as const, color: '#1ABC9C' },
];

/** Filter out places that have no valid location coordinates */
function filterValidPlaces(places: GooglePlaceNew[]): GooglePlaceNew[] {
  return places.filter(p =>
    p.displayName?.text &&
    p.location &&
    typeof p.location.latitude === 'number' &&
    typeof p.location.longitude === 'number' &&
    !isNaN(p.location.latitude) &&
    !isNaN(p.location.longitude) &&
    !(p.location.latitude === 0 && p.location.longitude === 0)
  );
}

interface AddStopModalProps {
  visible: boolean;
  route: Route | null;
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  maxStops?: number;
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
  const [phase, setPhase] = useState<Phase>('idle');
  const [places, setPlaces] = useState<GooglePlaceNew[]>([]);
  const [customText, setCustomText] = useState('');
  const [selectedChip, setSelectedChip] = useState<number | null>(null);
  const [lastSearchLabel, setLastSearchLabel] = useState('');

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const stopsSnapshotRef = useRef<RouteStop[]>([]);
  const searchIdRef = useRef(0);

  // Compute smart search center from existing stops
  const smartSearchCenter = useMemo(() => {
    if (!searchLocation) return null;
    const stops = route?.stops;
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
  }, [searchLocation, route?.stops]);

  // Rank-blend results by relevance (60%) and proximity to existing stops (40%)
  const rankBlendResults = useCallback((results: GooglePlaceNew[], stops: RouteStop[]): GooglePlaceNew[] => {
    const valid = filterValidPlaces(results);
    if (valid.length === 0) return [];
    if (!stops || stops.length === 0) return valid.slice(0, 10);

    const withRank = valid.map((place, i) => ({ place, relevanceRank: i }));

    const byDistance = [...withRank].sort((a, b) => {
      const loc = a.place.location!;
      const distA = Math.min(...stops.map(s =>
        calculateDistance(loc.latitude, loc.longitude, s.latitude, s.longitude)
      ));
      const locB = b.place.location!;
      const distB = Math.min(...stops.map(s =>
        calculateDistance(locB.latitude, locB.longitude, s.latitude, s.longitude)
      ));
      return distA - distB;
    });

    const distRankMap = new Map<string, number>();
    byDistance.forEach((item, i) => distRankMap.set(item.place.id, i));

    return withRank
      .sort((a, b) => {
        const scoreA = a.relevanceRank * 0.6 + (distRankMap.get(a.place.id) ?? valid.length) * 0.4;
        const scoreB = b.relevanceRank * 0.6 + (distRankMap.get(b.place.id) ?? valid.length) * 0.4;
        return scoreA - scoreB;
      })
      .map(item => item.place)
      .slice(0, 10);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (!visible) return;
    setPhase('idle');
    setPlaces([]);
    setCustomText('');
    setSelectedChip(null);
    setLastSearchLabel('');
    stopsSnapshotRef.current = route?.stops || [];
  }, [visible, route?.stops]);

  // Search places with a query
  const executeSearch = useCallback(async (query: string, label: string) => {
    if (!smartSearchCenter || !isGooglePlacesConfigured()) {
      setPlaces([]);
      setLastSearchLabel(label);
      setPhase('results');
      return;
    }

    const thisSearchId = ++searchIdRef.current;
    setPhase('searching');
    setLastSearchLabel(label);
    setPlaces([]);

    try {
      const results = await searchNearbyPlaces(
        query,
        smartSearchCenter.latitude,
        smartSearchCenter.longitude,
        radiusMeters,
      );

      if (searchIdRef.current !== thisSearchId) return; // stale, discard

      const sorted = rankBlendResults(results, stopsSnapshotRef.current);
      setPlaces(sorted);
      setPhase('results');
    } catch (err) {
      console.error('[AddStopModal] Search error:', err);
      if (searchIdRef.current !== thisSearchId) return;
      setPlaces([]);
      setPhase('results');
    }
  }, [smartSearchCenter, radiusMeters, rankBlendResults]);

  // Handle complementary type chip press
  const handleComplementaryChipPress = useCallback((type: StopType) => {
    const query = SEARCH_QUERY_BY_TYPE[type];
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    setSelectedChip(null);
    setCustomText('');
    executeSearch(query, label);
  }, [executeSearch]);

  const handleSelect = useCallback((place: GooglePlaceNew) => {
    try {
      const stop = googlePlaceToRouteStop(place, 0);
      if (!stop) return;
      onSelectStop(stop);
    } catch (err) {
      console.error('[AddStopModal] Failed to convert place to stop:', err);
    }
  }, [onSelectStop]);

  const handleManualSearch = useCallback(async () => {
    const label = selectedChip !== null
      ? QUICK_PICKS[selectedChip].label
      : customText.trim();
    const query = selectedChip !== null
      ? QUICK_PICKS[selectedChip].query
      : customText.trim();

    if (!query) return;
    executeSearch(query, label);
  }, [selectedChip, customText, executeSearch]);

  const handleChipPress = (index: number) => {
    setSelectedChip(index);
    setCustomText('');
  };

  const handleTextChange = (text: string) => {
    setCustomText(text);
    if (text.length > 0) setSelectedChip(null);
  };

  const handleBackToIdle = () => {
    setPhase('idle');
    setPlaces([]);
    setLastSearchLabel('');
  };

  const canSearch = selectedChip !== null || customText.trim().length > 0;

  const getNearestStop = (place: GooglePlaceNew) => {
    const stops = stopsSnapshotRef.current;
    let nearestDist: number | undefined;
    let nearestName: string | undefined;
    if (place.location && stops.length > 0) {
      for (const s of stops) {
        const d = calculateDistance(
          place.location.latitude, place.location.longitude,
          s.latitude, s.longitude
        ) * 0.621371;
        if (nearestDist === undefined || d < nearestDist) {
          nearestDist = d;
          nearestName = s.name;
        }
      }
    }
    return { nearestDist, nearestName };
  };

  const complementaryTypes = useMemo(() => {
    return getComplementaryTypes(stopsSnapshotRef.current);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared UI pieces ──────────────────────────────────────────────────

  const renderQuickPicks = () => (
    <View style={styles.quickPicksSection}>
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
                !isSelected && { backgroundColor: colors.surface, borderColor: colors.border },
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
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <ThemedText style={styles.dividerText}>or describe what you want</ThemedText>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <TextInput
        style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
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
    </View>
  );

  const renderPlaceCard = (place: GooglePlaceNew) => {
    const { nearestDist, nearestName } = getNearestStop(place);
    return (
      <SuggestionCard
        key={place.id}
        place={place}
        onSelect={handleSelect}
        nearestStopDistance={nearestDist}
        nearestStopName={nearestName}
      />
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={styles.headerTextWrap}>
            <ThemedText style={styles.title}>Add a Stop</ThemedText>
            {phase === 'results' && lastSearchLabel ? (
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                Showing: &ldquo;{lastSearchLabel}&rdquo;
              </ThemedText>
            ) : null}
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
            <IconSymbol name="xmark.circle.fill" size={28} color={tailwind.gray300} />
          </TouchableOpacity>
        </View>

        {/* ── Searching ── */}
        {phase === 'searching' && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={tailwind.blue500} />
            <ThemedText style={styles.stateText}>Searching nearby places...</ThemedText>
          </View>
        )}

        {/* ── Idle: complementary suggestions + quick picks ── */}
        {phase === 'idle' && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {complementaryTypes.length > 0 && (
              <View style={styles.suggestedSection}>
                <ThemedText style={styles.sectionLabel}>Suggested for your route</ThemedText>
                <View style={styles.chipGrid}>
                  {complementaryTypes.map(type => {
                    const iconConfig = STOP_ICON_MAPPING[type] || STOP_ICON_MAPPING.activity;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => handleComplementaryChipPress(type)}
                        activeOpacity={0.7}
                      >
                        <IconSymbol
                          name={iconConfig.ios as any}
                          size={18}
                          color={iconConfig.color}
                        />
                        <ThemedText style={styles.chipLabel}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {renderQuickPicks()}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}

        {/* ── Results ── */}
        {phase === 'results' && (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderQuickPicks()}

            {!isGooglePlacesConfigured() ? (
              <View style={styles.emptyState}>
                <IconSymbol name="exclamationmark.triangle" size={32} color={tailwind.gray400} />
                <ThemedText style={styles.emptyStateTitle}>Search unavailable</ThemedText>
                <ThemedText style={styles.emptyStateText}>
                  Google Places is not configured. Please add your API key.
                </ThemedText>
              </View>
            ) : places.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol name="magnifyingglass" size={32} color={tailwind.gray400} />
                <ThemedText style={styles.emptyStateTitle}>No results found</ThemedText>
                <ThemedText style={styles.emptyStateText}>
                  Try a different search term or expand your search radius.
                </ThemedText>
                <TouchableOpacity
                  style={styles.tryAgainButton}
                  onPress={handleBackToIdle}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.tryAgainText}>Search again</ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.flatResultsSection}>
                <ThemedText style={styles.sectionLabel}>Results</ThemedText>
                {places.map(p => renderPlaceCard(p))}
              </View>
            )}

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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
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
  stateText: {
    fontSize: 14,
    color: tailwind.gray500,
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },

  // Suggested section
  suggestedSection: {
    marginBottom: 20,
  },

  // Quick picks section
  quickPicksSection: {
    marginBottom: 20,
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
    marginBottom: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
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
  },
  dividerText: {
    fontSize: 13,
    color: tailwind.gray400,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
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

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyStateText: {
    fontSize: 14,
    color: tailwind.gray500,
    textAlign: 'center',
    lineHeight: 20,
  },
  tryAgainButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: tailwind.blue500,
  },
  tryAgainText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Flat results
  flatResultsSection: {
    gap: 10,
  },

  bottomSpacer: {
    height: 40,
  },
});
