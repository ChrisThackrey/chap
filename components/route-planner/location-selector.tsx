import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { LocationPreference as LocationInfo } from '@/hooks/use-location-preference';
import { isValidCoordinate } from '@/lib/coordinate-validation';

interface LocationSelectorProps {
  onLocationSelected: (location: LocationInfo) => void | Promise<void>;
  currentLocation?: LocationInfo;
}

/** Nominatim usage policy requires an identifying User-Agent on every request. */
const NOMINATIM_HEADERS = { 'User-Agent': 'ChapDatingApp/1.0', Accept: 'application/json' };
const NOMINATIM_TIMEOUT_MS = 10_000;

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    county?: string;
    postcode?: string;
  };
}

async function fetchNominatim(url: string): Promise<NominatimSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: NOMINATIM_HEADERS, signal: controller.signal });
    if (!response.ok) {
      throw new Error('Location service is unavailable right now. Please try again.');
    }
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as NominatimSearchResult[]) : [];
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Location lookup timed out. Check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compact label for the location badge. Nominatim's display_name is a full
 * hierarchy ("Austin, Travis County, Texas, United States") which wraps to
 * several lines in the header badge; prefer "City, State" when known.
 */
function buildDisplayName(city: string | undefined, state: string | undefined, fallback: string): string {
  if (city && state) return `${city}, ${state}`;
  return city || state || fallback;
}

function parseCoordinates(result: NominatimSearchResult): { latitude: number; longitude: number } {
  const latitude = parseFloat(result.lat ?? '');
  const longitude = parseFloat(result.lon ?? '');
  if (!isValidCoordinate(latitude, longitude)) {
    throw new Error('Location service returned invalid coordinates');
  }
  return { latitude, longitude };
}

export function LocationSelector({ onLocationSelected, currentLocation }: LocationSelectorProps) {
  const [mode, setMode] = useState<'zip' | 'city'>('city');
  const [zipCode, setZipCode] = useState(currentLocation?.zipCode || '');
  const [city, setCity] = useState(currentLocation?.city || '');
  const [state, setState] = useState(currentLocation?.state || '');
  const [county, setCounty] = useState(currentLocation?.county || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const geocodeZipCode = async (zip: string): Promise<LocationInfo> => {
    const data = await fetchNominatim(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=US&format=json&addressdetails=1&limit=1`
    );

    if (data.length === 0) {
      throw new Error('Zip code not found');
    }

    const result = data[0];
    const address = result.address ?? {};
    const coords = parseCoordinates(result);
    const city = address.city || address.town || address.village;

    return {
      zipCode: zip,
      city,
      state: address.state,
      county: address.county,
      ...coords,
      displayName: buildDisplayName(city, address.state, result.display_name || zip),
    };
  };

  const geocodeCityState = async (city: string, state: string, county?: string): Promise<LocationInfo> => {
    const query = county
      ? `${city}, ${county}, ${state}, USA`
      : `${city}, ${state}, USA`;

    const data = await fetchNominatim(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`
    );

    if (data.length === 0) {
      throw new Error('Location not found');
    }

    const result = data[0];
    const coords = parseCoordinates(result);

    return {
      city,
      state,
      county,
      zipCode: result.address?.postcode,
      ...coords,
      displayName: buildDisplayName(city, state, result.display_name || query),
    };
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      let locationInfo: LocationInfo;

      if (mode === 'zip') {
        const zip = zipCode.trim();
        if (!/^\d{5}$/.test(zip)) {
          throw new Error('Please enter a valid 5-digit zip code');
        }
        locationInfo = await geocodeZipCode(zip);
      } else {
        if (!city.trim() || !state.trim()) {
          throw new Error('Please enter city and state');
        }
        locationInfo = await geocodeCityState(
          city.trim(),
          state.trim(),
          county.trim() || undefined
        );
      }

      await onLocationSelected(locationInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find location');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <IconSymbol name="mappin.and.ellipse" size={24} color={colors.tint} />
        <ThemedText type="subtitle" style={styles.title}>
          Set Your Location
        </ThemedText>
      </View>

      <ThemedText style={styles.description}>
        Choose your location for personalized date route suggestions
      </ThemedText>

      {/* Mode Selector */}
      <View style={styles.modeSwitcher}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'city' && { backgroundColor: colors.tint },
          ]}
          onPress={() => setMode('city')}
        >
          <ThemedText
            style={[
              styles.modeButtonText,
              mode === 'city' && styles.modeButtonTextActive,
            ]}
          >
            City & State
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'zip' && { backgroundColor: colors.tint },
          ]}
          onPress={() => setMode('zip')}
        >
          <ThemedText
            style={[
              styles.modeButtonText,
              mode === 'zip' && styles.modeButtonTextActive,
            ]}
          >
            Zip Code
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Input Fields */}
      {mode === 'zip' ? (
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>Zip Code</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.icon,
                color: colors.text,
              },
            ]}
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="Enter zip code (e.g., 78205)"
            placeholderTextColor={colors.icon}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
      ) : (
        <>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>City *</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.icon,
                  color: colors.text,
                },
              ]}
              value={city}
              onChangeText={setCity}
              placeholder="Enter city (e.g., San Antonio)"
              placeholderTextColor={colors.icon}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>State *</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.icon,
                  color: colors.text,
                },
              ]}
              value={state}
              onChangeText={setState}
              placeholder="Enter state (e.g., Texas or TX)"
              placeholderTextColor={colors.icon}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>County (Optional)</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.icon,
                  color: colors.text,
                },
              ]}
              value={county}
              onChangeText={setCounty}
              placeholder="Enter county (e.g., Bexar County)"
              placeholderTextColor={colors.icon}
              autoCapitalize="words"
            />
          </View>
        </>
      )}

      {/* Error Message */}
      {error && (
        <View style={[styles.errorContainer, colorScheme === 'dark' && { backgroundColor: 'rgba(220, 38, 38, 0.15)' }]}>
          <ThemedText style={[styles.errorText, colorScheme === 'dark' && { color: '#FCA5A5' }]}>⚠️ {error}</ThemedText>
        </View>
      )}

      {/* Current Location Display */}
      {currentLocation && (
        <View style={styles.currentLocation}>
          <ThemedText style={styles.currentLocationLabel}>
            Current: {currentLocation.displayName}
          </ThemedText>
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          { backgroundColor: colors.tint },
          loading && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.submitButtonText}>
            Set Location
          </ThemedText>
        )}
      </TouchableOpacity>

      <ThemedText style={styles.hint}>
        💡 Routes will be planned around this location, within your chosen search radius
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  modeSwitcher: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#fee',
    borderRadius: 8,
  },
  errorText: {
    color: '#c00',
    fontSize: 14,
  },
  currentLocation: {
    padding: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 8,
  },
  currentLocationLabel: {
    fontSize: 12,
    opacity: 0.8,
  },
  submitButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
  },
});
