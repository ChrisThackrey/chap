import { Modal, View, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { RouteStop } from '@/types/route';
import { getStopIcon } from '@/constants/stop-icons';

interface StopDetailModalProps {
  stop: RouteStop | null;
  totalStops: number;
  visible: boolean;
  onClose: () => void;
}

export function StopDetailModal({ stop, totalStops, visible, onClose }: StopDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!stop) return null;

  const iconConfig = getStopIcon(stop.type);

  const handleGetDirections = () => {
    const address = encodeURIComponent(stop.address);
    const url =
      Platform.OS === 'ios'
        ? `maps://maps.apple.com/?q=${address}`
        : `geo:0,0?q=${address}`;

    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
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
          style={styles.modalContainer}
        >
          <ThemedView style={[styles.modal, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: iconConfig.color }]}>
                <IconSymbol
                  name={iconConfig.ios as any}
                  size={32}
                  color="#FFFFFF"
                />
              </View>

              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <ThemedText style={styles.closeButtonText}>✕</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <ThemedText type="title" style={styles.title}>
                {stop.name}
              </ThemedText>

              <ThemedText style={styles.subtitle}>
                Stop {stop.order} of {totalStops} • {stop.type}
              </ThemedText>

              <View style={styles.durationContainer}>
                <ThemedText style={styles.duration}>
                  ⏱️ {stop.duration} minutes
                </ThemedText>
              </View>

              <ThemedText style={styles.description}>
                {stop.description}
              </ThemedText>

              <View style={styles.addressContainer}>
                <ThemedText style={styles.addressLabel}>📍 Address:</ThemedText>
                <ThemedText style={styles.address}>{stop.address}</ThemedText>
              </View>

              <TouchableOpacity
                style={[styles.directionsButton, { backgroundColor: colors.tint }]}
                onPress={handleGetDirections}
              >
                <ThemedText style={styles.directionsButtonText}>
                  Get Directions
                </ThemedText>
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
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '80%',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '300',
  },
  content: {
    gap: 12,
  },
  title: {
    fontSize: 24,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    textTransform: 'capitalize',
  },
  durationContainer: {
    alignSelf: 'flex-start',
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  addressContainer: {
    marginTop: 8,
    gap: 4,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  address: {
    fontSize: 14,
    opacity: 0.8,
  },
  directionsButton: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
