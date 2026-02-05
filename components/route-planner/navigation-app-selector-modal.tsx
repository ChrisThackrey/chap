import { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, MapColors, tailwind } from '@/constants/theme';

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
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const [isGoogleMapsInstalled, setIsGoogleMapsInstalled] = useState<boolean | null>(null);
  const [selectedApp, setSelectedApp] = useState<NavigationApp>('apple');

  // Check if Google Maps is installed
  useEffect(() => {
    const checkGoogleMaps = async () => {
      if (Platform.OS === 'ios') {
        try {
          const canOpen = await Linking.canOpenURL('comgooglemaps://');
          setIsGoogleMapsInstalled(canOpen);
        } catch {
          setIsGoogleMapsInstalled(false);
        }
      } else {
        // On Android, Google Maps is typically always available
        setIsGoogleMapsInstalled(true);
      }
    };

    if (visible) {
      checkGoogleMaps();
    }
  }, [visible]);

  const handleSend = useCallback(() => {
    onSelect(selectedApp);
  }, [selectedApp, onSelect]);

  const handleOpenGoogleMapsStore = useCallback(() => {
    // Open App Store to Google Maps page
    const appStoreUrl = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/google-maps/id585027354'
      : 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps';
    Linking.openURL(appStoreUrl);
  }, []);

  // Calculate safe bottom padding
  const bottomPadding = Math.max(20, insets.bottom + 8);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
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
              <TouchableOpacity
                style={[
                  styles.optionButton,
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
                  selectedApp === 'apple' && styles.radioOuterSelected,
                ]}>
                  {selectedApp === 'apple' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              {/* Google Maps Option */}
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  selectedApp === 'google' && styles.optionButtonSelected,
                  !isGoogleMapsInstalled && styles.optionButtonDisabled,
                ]}
                onPress={() => {
                  if (isGoogleMapsInstalled) {
                    setSelectedApp('google');
                  } else {
                    handleOpenGoogleMapsStore();
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, { backgroundColor: '#4285F4' }]}>
                  <IconSymbol name="location.fill" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <ThemedText style={[
                    styles.optionTitle,
                    !isGoogleMapsInstalled && styles.optionTitleDisabled,
                  ]}>
                    Google Maps
                  </ThemedText>
                  <ThemedText style={[
                    styles.optionSubtitle,
                    !isGoogleMapsInstalled && styles.optionSubtitleDisabled,
                  ]}>
                    {isGoogleMapsInstalled === null
                      ? 'Checking...'
                      : isGoogleMapsInstalled
                        ? 'Turn-by-turn navigation'
                        : 'Not installed'
                    }
                  </ThemedText>
                </View>
                {isGoogleMapsInstalled ? (
                  <View style={[
                    styles.radioOuter,
                    selectedApp === 'google' && styles.radioOuterSelected,
                  ]}>
                    {selectedApp === 'google' && <View style={styles.radioInner} />}
                  </View>
                ) : (
                  <View style={styles.connectButton}>
                    <ThemedText style={styles.connectButtonText}>Connect</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={[styles.buttonContainer, { paddingBottom: bottomPadding }]}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sendButton,
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
        </TouchableOpacity>
      </TouchableOpacity>
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
  optionButtonDisabled: {
    opacity: 0.7,
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
  optionTitleDisabled: {
    color: tailwind.gray400,
  },
  optionSubtitle: {
    fontSize: 13,
    color: tailwind.gray500,
  },
  optionSubtitleDisabled: {
    color: tailwind.gray400,
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
  connectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: tailwind.blue500,
  },
  connectButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: MapColors.route.driving.main,
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
