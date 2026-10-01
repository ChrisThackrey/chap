import { useEffect } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { AppThemeProvider } from '@/contexts/theme-context';
import { useColorScheme, useTheme } from '@/hooks/use-color-scheme';

// Prevent splash screen from hiding until the theme is loaded.
// The promise can reject (e.g. on web or if already hidden); that is harmless.
SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Root error boundary. Expo Router renders this instead of a red screen (in
 * production, a blank screen) when any route throws during render, so an
 * unexpected runtime error becomes a recoverable state instead of a crash.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <ThemedView style={styles.errorContainer}>
      <ThemedText type="title" style={styles.errorTitle}>
        Something went wrong
      </ThemedText>
      <ThemedText style={styles.errorMessage}>{error.message}</ThemedText>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: colors.tint }]}
        onPress={retry}
        accessibilityRole="button"
      >
        <ThemedText style={styles.retryText}>Try again</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoaded } = useTheme();

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoaded]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AppThemeProvider>
        <RootLayoutNav />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 24,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
