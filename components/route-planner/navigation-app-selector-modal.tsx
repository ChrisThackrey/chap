import { useState, useCallback } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, tailwind } from '@/constants/theme';
import { useMapColors } from '@/hooks/use-map-colors';

export type NavigationApp = 'apple' | 'google';

interface NavigationAppSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (app: NavigationApp) => void;
  isExporting?: boolean;
}

export function NavigationAppSelectorModal({
  visible,
  onClose,
  onSelect,
  isExporting = false,
}: NavigationAppSelectorModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const mapColors = useMapColors();
  const insets = useSafeAreaInsets();
  // Apple Maps only exists on iOS; default Android to Google Maps.
  const supportsAppleMaps = Platform.OS === 'ios';
  const [selectedApp, setSelectedApp] = useState<NavigationApp>(supportsAppleMaps ? 'apple' : 'google');

  const handleSend = useCallback(() => {
    onSelect(selectedApp);
  }, [selectedApp, onSelect]);

  // Calculate safe bottom padding
  const bottomPadding = Math.max(20, insets.bottom + 8);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop: tapping outside the sheet dismisses it. Not an accessibility
          element itself so the sheet's controls stay reachable to screen readers. */}
      <Pressable style={styles.overlay} onPress={onClose} accessible={false}>
        {/* Inner Pressable swallows taps so they don't dismiss the sheet */}
        <Pressable onPress={() => {}} accessible={false}>
          <ThemedView style={[styles.modal, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                Open in Navigation App
              </ThemedText>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <ThemedText style={styles.closeButtonText}>✕</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Description */}
            <ThemedText style={styles.description}>
              Choose which navigation app to send your route to:
            </ThemedText>

            {/* Selection Options */}
            <View style={styles.optionsContainer}>
              {/* Apple Maps Option */}
              {supportsAppleMaps && (
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  selectedApp === 'apple' && styles.optionButtonSelected,
                ]}
                onPress={() => setSelectedApp('apple')}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: '#000000' }]}>
                  <IconSymbol name="map.fill" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <ThemedText style={styles.optionTitle}>Apple Maps</ThemedText>
                  <ThemedText style={styles.optionSubtitle}>
                    Built-in navigation
                  </ThemedText>
                </View>
                <View style={[
                  styles.radioOuter,
                  { borderColor: colors.border },
                  selectedApp === 'apple' && styles.radioOuterSelected,
                ]}>
                  {selectedApp === 'apple' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
              )}

              {/* Google Maps Option */}
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  selectedApp === 'google' && styles.optionButtonSelected,
                ]}
                onPress={() => setSelectedApp('google')}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: '#4285F4' }]}>
                  <IconSymbol name="location.fill" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <ThemedText style={styles.optionTitle}>
                    Google Maps
                  </ThemedText>
                  <ThemedText style={styles.optionSubtitle}>
                    Turn-by-turn navigation
                  </ThemedText>
                </View>
                <View style={[
                  styles.radioOuter,
                  { borderColor: colors.border },
                  selectedApp === 'google' && styles.radioOuterSelected,
                ]}>
                  {selectedApp === 'google' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={[styles.buttonContainer, { paddingBottom: bottomPadding }]}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: mapColors.route.driving.main },
                  isExporting && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                activeOpacity={0.7}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol name="arrow.up.forward" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.sendButtonText}>Send</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '400',
    color: tailwind.gray400,
  },
  description: {
    fontSize: 14,
    color: tailwind.gray500,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  optionsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: tailwind.gray200,
    backgroundColor: tailwind.gray50,
  },
  optionButtonSelected: {
    borderColor: tailwind.blue500,
    backgroundColor: `${tailwind.blue500}10`,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 13,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: tailwind.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: tailwind.blue500,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tailwind.blue500,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tailwind.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: tailwind.gray600,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
