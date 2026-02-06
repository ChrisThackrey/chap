import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tailwind } from '@/constants/theme';
import { PlaceSearchInput } from '@/components/route-planner/place-search-input';
import { isGooglePlacesConfigured, GooglePlaceNew } from '@/lib/google-places';

interface AddStopInputProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (description: string) => void;
  onSelectPlace?: (place: GooglePlaceNew) => void;
  searchLocation?: { latitude: number; longitude: number } | null;
  radiusMeters?: number;
}

const QUICK_PICKS = [
  { label: 'Coffee', description: 'a great coffee shop', icon: 'cup.and.saucer.fill' as const, color: '#8B4513' },
  { label: 'Bar', description: 'a fun bar', icon: 'wineglass.fill' as const, color: '#9B59B6' },
  { label: 'Restaurant', description: 'an interesting restaurant', icon: 'fork.knife' as const, color: '#FF6B6B' },
  { label: 'Park', description: 'a scenic park or garden', icon: 'tree.fill' as const, color: '#2ECC71' },
  { label: 'Museum', description: 'an interesting museum', icon: 'building.columns.fill' as const, color: '#3498DB' },
  { label: 'Activity', description: 'a fun activity or experience', icon: 'figure.run' as const, color: '#1ABC9C' },
];

export function AddStopInput({
  visible,
  onClose,
  onSubmit,
  onSelectPlace,
  searchLocation,
  radiusMeters = 40000,
}: AddStopInputProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedChip(null);
      setCustomText('');
    }
  }, [visible]);

  const canSubmit = selectedChip !== null || customText.trim().length > 0;

  const handleChipPress = (index: number) => {
    setSelectedChip(index);
    setCustomText('');
  };

  const handleTextChange = (text: string) => {
    setCustomText(text);
    if (text.length > 0) {
      setSelectedChip(null);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const description =
      selectedChip !== null ? QUICK_PICKS[selectedChip].description : customText.trim();
    onSubmit(description);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.title}>Add a Stop</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark" size={20} color={tailwind.gray500} />
            </TouchableOpacity>
          </View>

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
            <ThemedText style={styles.dividerText}>or describe</ThemedText>
            <View style={styles.dividerLine} />
          </View>

          {/* Text input */}
          <TextInput
            style={styles.textInput}
            placeholder="e.g. a rooftop bar with great views"
            placeholderTextColor={tailwind.gray400}
            value={customText}
            onChangeText={handleTextChange}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            <IconSymbol name="plus.circle.fill" size={20} color="#FFFFFF" />
            <ThemedText style={styles.submitButtonText}>Add to Route</ThemedText>
          </TouchableOpacity>

          {/* Place search section */}
          {onSelectPlace && isGooglePlacesConfigured() && (
            <>
              <View style={styles.dividerRow2}>
                <View style={styles.dividerLine} />
                <ThemedText style={styles.dividerText}>or search for a specific place</ThemedText>
                <View style={styles.dividerLine} />
              </View>
              <PlaceSearchInput
                searchLocation={searchLocation || null}
                radiusMeters={radiusMeters}
                onSelectPlace={onSelectPlace}
                placeholder="e.g. Blue Bottle Coffee"
              />
            </>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: tailwind.gray900,
  },
  closeButton: {
    padding: 8,
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
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tailwind.blue500,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dividerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  bottomSpacer: {
    height: 40,
  },
});
