import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, tailwind } from '@/constants/theme';
import {
  DEFAULT_VENUE_COUNT,
  MAX_VENUE_COUNT as MAX_COUNT,
  MIN_VENUE_COUNT as MIN_COUNT,
  clampVenueCount,
} from '@/hooks/use-venue-count-preference';

interface VenueCountSelectorProps {
  initialCount: number;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}

const PRESET_COUNTS = [2, 3, 4, 5, 6, 8];

export function VenueCountSelector({
  initialCount = DEFAULT_VENUE_COUNT,
  onConfirm,
  onCancel,
}: VenueCountSelectorProps) {
  const [count, setCount] = useState(clampVenueCount(initialCount));
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  // Inside an iOS page-sheet modal the sheet already clears the status bar, but
  // useSafeAreaInsets still reports the window inset; applying it leaves a
  // large blank band above the header.
  const sheetTopPadding = Platform.OS === 'ios' ? 8 : insets.top;

  const handlePresetPress = (preset: number) => {
    setCount(preset);
  };

  const handleIncrement = () => {
    if (count < MAX_COUNT) {
      setCount(count + 1);
    }
  };

  const handleDecrement = () => {
    if (count > MIN_COUNT) {
      setCount(count - 1);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: sheetTopPadding }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
          <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>
            Cancel
          </ThemedText>
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Number of Stops
        </ThemedText>
        <TouchableOpacity onPress={() => onConfirm(count)} style={styles.headerButton}>
          <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>
            Done
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Large count display with increment/decrement */}
        <View style={styles.countDisplayContainer}>
          <TouchableOpacity
            onPress={handleDecrement}
            disabled={count <= MIN_COUNT}
            style={[
              styles.incrementButton,
              count <= MIN_COUNT && styles.incrementButtonDisabled,
            ]}
          >
            <IconSymbol
              name="minus.circle.fill"
              size={48}
              color={count <= MIN_COUNT ? tailwind.gray300 : colors.tint}
            />
          </TouchableOpacity>

          <View style={styles.countDisplay}>
            <ThemedText style={styles.countNumber}>{count}</ThemedText>
            <ThemedText style={styles.countLabel}>
              {count === 1 ? 'stop' : 'stops'}
            </ThemedText>
          </View>

          <TouchableOpacity
            onPress={handleIncrement}
            disabled={count >= MAX_COUNT}
            style={[
              styles.incrementButton,
              count >= MAX_COUNT && styles.incrementButtonDisabled,
            ]}
          >
            <IconSymbol
              name="plus.circle.fill"
              size={48}
              color={count >= MAX_COUNT ? tailwind.gray300 : colors.tint}
            />
          </TouchableOpacity>
        </View>

        {/* Description */}
        <ThemedText style={styles.description}>
          Choose how many venues you&apos;d like in your route. More stops mean a longer experience!
        </ThemedText>

        {/* Preset buttons */}
        <View style={styles.presetsContainer}>
          <ThemedText style={styles.presetsLabel}>Quick select:</ThemedText>
          <View style={styles.presetButtons}>
            {PRESET_COUNTS.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetButton,
                  { borderColor: count === preset ? colors.tint : colors.border, backgroundColor: count === preset ? colors.tint : colors.surface },
                  count === preset && styles.presetButtonActive,
                ]}
                onPress={() => handlePresetPress(preset)}
              >
                <ThemedText
                  style={[
                    styles.presetButtonText,
                    count === preset && styles.presetButtonTextActive,
                  ]}
                >
                  {preset}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Help text */}
        <ThemedText style={[styles.helpText, { paddingBottom: Math.max(28, insets.bottom + 8) }]}>
          Tap the + or - buttons to adjust, or use the quick select buttons below.
          Your preference will be saved for future routes.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tailwind.gray200,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  countDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginBottom: 32,
  },
  incrementButton: {
    padding: 8,
  },
  incrementButtonDisabled: {
    opacity: 0.3,
  },
  countDisplay: {
    alignItems: 'center',
    minWidth: 120,
  },
  countNumber: {
    fontSize: 72,
    fontWeight: '800',
    lineHeight: 80,
  },
  countLabel: {
    fontSize: 18,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 4,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.7,
    marginBottom: 48,
    paddingHorizontal: 12,
  },
  presetsContainer: {
    paddingVertical: 18,
  },
  presetsLabel: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginBottom: 14,
  },
  presetButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  presetButton: {
    width: '30%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    backgroundColor: tailwind.gray50,
  },
  presetButtonActive: {
    borderWidth: 2,
  },
  presetButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  presetButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  helpText: {
    fontSize: 13,
    opacity: 0.55,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 19,
    marginTop: 24,
  },
});
