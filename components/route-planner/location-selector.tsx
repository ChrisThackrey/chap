import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface LocationInfo {
  city?: string;
  state?: string;
  county?: string;
  zipCode?: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

interface LocationSelectorProps {
  onLocationSelected: (location: LocationInfo) => void;
  currentLocation?: LocationInfo;
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
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&addressdetails=1`
    );

    if (!response.ok) {
      throw new Error('Failed to geocode zip code');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('Zip code not found');
    }

    const result = data[0];

    return {
      zipCode: zip,
      city: result.address.city || result.address.town || result.address.village,
      state: result.address.state,
      county: result.address.county,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
    };
  };

  const geocodeCityState = async (city: string, state: string, county?: string): Promise<LocationInfo> => {
    const query = county
      ? `${city}, ${county}, ${state}, USA`
      : `${city}, ${state}, USA`;

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`
    );

    if (!response.ok) {
      throw new Error('Failed to geocode location');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('Location not found');
    }

    const result = data[0];

    return {
      city: city,
      state: state,
      county: county,
      zipCode: result.address.postcode,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
    };
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      let locationInfo: LocationInfo;

      if (mode === 'zip') {
        if (!zipCode.trim()) {
          throw new Error('Please enter a zip code');
        }
        locationInfo = await geocodeZipCode(zipCode.trim());
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

      onLocationSelected(locationInfo);
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
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>⚠️ {error}</ThemedText>
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
        💡 Routes will be planned within a 60-mile radius of this location
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
