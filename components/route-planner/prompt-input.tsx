import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface PromptInputProps {
  onGenerate: (prompt: string) => void;
  loading?: boolean;
}

export function PromptInput({ onGenerate, loading = false }: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleGenerate = () => {
    if (prompt.trim().length > 0 && !loading) {
      onGenerate(prompt.trim());
    }
  };

  const characterCount = prompt.length;
  const maxCharacters = 500;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        🌹 Plan Your Perfect Date
      </ThemedText>

      <ThemedText style={styles.label}>
        Describe your ideal date
      </ThemedText>

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#F2F2F7',
            color: colors.text,
            borderColor: colors.icon,
          },
        ]}
        placeholder="E.g., 'Romantic sunset dinner by the water with live music'"
        placeholderTextColor={colors.icon}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        numberOfLines={4}
        maxLength={maxCharacters}
        editable={!loading}
      />

      <ThemedText style={styles.charCount}>
        {characterCount}/{maxCharacters}
      </ThemedText>

      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: colors.tint,
            opacity: prompt.trim().length === 0 || loading ? 0.5 : 1,
          },
        ]}
        onPress={handleGenerate}
        disabled={prompt.trim().length === 0 || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.buttonText}>Generate Route</ThemedText>
        )}
      </TouchableOpacity>

      <View style={styles.tipsContainer}>
        <ThemedText type="defaultSemiBold" style={styles.tipsTitle}>
          💡 Tips:
        </ThemedText>
        <ThemedText style={styles.tipText}>
          • Be specific about location and atmosphere
        </ThemedText>
        <ThemedText style={styles.tipText}>
          • Mention activities you enjoy
        </ThemedText>
        <ThemedText style={styles.tipText}>
          • Set the mood and vibe
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
    opacity: 0.6,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  tipsContainer: {
    marginTop: 32,
    gap: 8,
  },
  tipsTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    opacity: 0.8,
  },
});
