import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tailwind } from '@/constants/theme';
import { searchNearbyPlaces, GooglePlaceNew } from '@/lib/google-places';

interface PlaceSearchInputProps {
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  onSelectPlace: (place: GooglePlaceNew) => void;
  placeholder?: string;
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (!searchLocation) return;

      // Cancel previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      try {
        const places = await searchNearbyPlaces(
          query.trim(),
          searchLocation.latitude,
          searchLocation.longitude,
          radiusMeters,
        );
        if (!controller.signal.aborted) {
          setResults(places.filter(p => p.displayName?.text).slice(0, 5));
          setHasSearched(true);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn('Place search error:', err);
          setResults([]);
          setHasSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, searchLocation, radiusMeters]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSelect = (place: GooglePlaceNew) => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    onSelectPlace(place);
  };

  if (!searchLocation) {
    return (
      <View style={styles.noLocation}>
        <IconSymbol name="location.slash" size={20} color={tailwind.gray400} />
        <ThemedText style={styles.noLocationText}>Set your location first</ThemedText>
      </View>
    );
  }

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    const stars = [];
    for (let i = 0; i < full; i++) stars.push('star.fill');
    if (half) stars.push('star.leadinghalf.filled');
    return (
      <View style={styles.starsRow}>
        {stars.map((icon, i) => (
          <IconSymbol key={i} name={icon as any} size={12} color="#F59E0B" />
        ))}
        <ThemedText style={styles.ratingText}>{rating.toFixed(1)}</ThemedText>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <IconSymbol name="magnifyingglass" size={18} color={tailwind.gray400} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={tailwind.gray400}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color={tailwind.blue500} />}
      </View>

      {hasSearched && results.length === 0 && !isSearching && (
        <ThemedText style={styles.noResults}>No results found</ThemedText>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultRow}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.resultInfo}>
                <ThemedText style={styles.resultName} numberOfLines={1}>
                  {item.displayName.text}
                </ThemedText>
                <ThemedText style={styles.resultAddress} numberOfLines={1}>
                  {item.formattedAddress || ''}
                </ThemedText>
                {renderStars(item.rating)}
              </View>
              <IconSymbol name="plus.circle" size={22} color={tailwind.blue500} />
            </TouchableOpacity>
          )}
        />
      )}
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
    borderColor: tailwind.gray200,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: tailwind.gray900,
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
    color: tailwind.gray400,
  },
  noResults: {
    fontSize: 14,
    color: tailwind.gray400,
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
    borderBottomColor: tailwind.gray100,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: tailwind.gray900,
  },
  resultAddress: {
    fontSize: 13,
    color: tailwind.gray500,
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
