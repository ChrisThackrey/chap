import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, tailwind } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchNearbyPlaces, GooglePlaceNew } from '@/lib/google-places';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;
const MAX_RESULTS = 5;

interface PlaceSearchInputProps {
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  onSelectPlace: (place: GooglePlaceNew) => void;
  placeholder?: string;
}

function StarRow({ rating }: { rating?: number }) {
  if (!rating || !Number.isFinite(rating)) return null;
  const clamped = Math.max(0, Math.min(5, rating));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5;
  const stars: IconSymbolName[] = [];
  for (let i = 0; i < full; i++) stars.push('star.fill');
  if (half) stars.push('star.leadinghalf.filled');
  return (
    <View style={styles.starsRow}>
      {stars.map((icon, i) => (
        <IconSymbol key={i} name={icon} size={12} color="#F59E0B" />
      ))}
      <ThemedText style={styles.ratingText}>{clamped.toFixed(1)}</ThemedText>
    </View>
  );
}

export function PlaceSearchInput({
  searchLocation,
  radiusMeters,
  onSelectPlace,
  placeholder = 'Search for a place...',
}: PlaceSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GooglePlaceNew[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH || !searchLocation) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    // Flipped by the cleanup so a superseded search never writes stale results.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const places = await searchNearbyPlaces(
          trimmed,
          searchLocation.latitude,
          searchLocation.longitude,
          radiusMeters,
        );
        if (cancelled) return;
        setResults(
          places
            .filter((p) => p.displayName?.text && p.location)
            .slice(0, MAX_RESULTS)
        );
        setHasSearched(true);
      } catch (err) {
        if (cancelled) return;
        console.warn('Place search error:', err);
        setResults([]);
        setHasSearched(true);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchLocation, radiusMeters]);

  const handleSelect = (place: GooglePlaceNew) => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    onSelectPlace(place);
  };

  if (!searchLocation) {
    return (
      <View style={styles.noLocation}>
        <IconSymbol name="location.slash" size={20} color={colors.icon} />
        <ThemedText style={[styles.noLocationText, { color: colors.textSecondary }]}>
          Set your location first
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <IconSymbol name="magnifyingglass" size={18} color={colors.icon} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.icon}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search for a place"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.tint} />}
      </View>

      {hasSearched && results.length === 0 && !isSearching && (
        <ThemedText style={[styles.noResults, { color: colors.textSecondary }]}>No results found</ThemedText>
      )}

      {/*
        Rendered as a plain list instead of a FlatList: results are capped at
        five items and the parent is a scrolling container, so virtualisation
        adds nothing and nested lists trigger RN warnings.
      */}
      {results.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.resultRow, { borderBottomColor: colors.border }]}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.displayName.text}`}
        >
          <View style={styles.resultInfo}>
            <ThemedText style={styles.resultName} numberOfLines={1}>
              {item.displayName.text}
            </ThemedText>
            <ThemedText style={[styles.resultAddress, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.formattedAddress || ''}
            </ThemedText>
            <StarRow rating={item.rating} />
          </View>
          <IconSymbol name="plus.circle" size={22} color={colors.tint} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  noLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  noLocationText: {
    fontSize: 14,
  },
  noResults: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  resultAddress: {
    fontSize: 13,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: tailwind.gray500,
    marginLeft: 4,
  },
});
