import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { PromptInput } from '@/components/route-planner/prompt-input';
import { LoadingState } from '@/components/route-planner/loading-state';
import { RouteSummary } from '@/components/route-planner/route-summary';
import { RouteMap } from '@/components/route-planner/route-map';
import { useRouteGeneration } from '@/hooks/use-route-generation';
import { useUserLocation } from '@/hooks/use-user-location';
import { useRouteStorage } from '@/hooks/use-route-storage';

export default function RoutePlannerScreen() {
  const { state, route, error, generate, reset } = useRouteGeneration();
  const { location, requestLocation } = useUserLocation();
  const { saveRoute } = useRouteStorage();

  const handleGenerate = async (prompt: string) => {
    // Get user location if not already available
    const userLoc = location || (await requestLocation());
    await generate(prompt, userLoc || undefined);
  };

  const handleSave = async () => {
    if (route) {
      try {
        await saveRoute(route);
      } catch (error) {
        console.error('Failed to save route:', error);
      }
    }
  };

  return (
    <ThemedView style={styles.container}>
      {state === 'idle' && (
        <PromptInput onGenerate={handleGenerate} loading={false} />
      )}

      {state === 'loading' && <LoadingState onCancel={reset} />}

      {state === 'error' && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText type="title" style={styles.errorTitle}>
            Oops! Something went wrong
          </ThemedText>
          <ThemedText style={styles.errorMessage}>{error}</ThemedText>
          <ThemedText style={styles.errorHint}>
            Make sure you've added your OpenAI API key to the .env file
          </ThemedText>
          <PromptInput onGenerate={handleGenerate} loading={false} />
        </ThemedView>
      )}

      {state === 'success' && route && (
        <>
          <RouteSummary route={route} onSave={handleSave} onRegenerate={reset} />
          <RouteMap route={route} />
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    color: '#FF6B6B',
  },
  errorHint: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
});
