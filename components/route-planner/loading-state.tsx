import { useEffect, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface LoadingStateProps {
  onCancel: () => void;
}

const LOADING_MESSAGES = [
  'Planning your date...',
  'Finding perfect spots...',
  'Discovering hidden gems...',
  'Creating memories...',
];

export function LoadingState({ onCancel }: LoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.tint} />

        <ThemedText type="title" style={styles.message}>
          {LOADING_MESSAGES[messageIndex]}
        </ThemedText>

        <ThemedText style={styles.subMessage}>
          This may take a few moments
        </ThemedText>

        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: colors.icon }]}
          onPress={onCancel}
        >
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  message: {
    fontSize: 24,
    textAlign: 'center',
    marginTop: 20,
  },
  subMessage: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  cancelButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 16,
  },
});
