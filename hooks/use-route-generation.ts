import { useState } from 'react';
import { generateRoute } from '@/lib/route-generator';
import { Route, UserLocation } from '@/types/route';

type GenerationState = 'idle' | 'loading' | 'success' | 'error';

export function useRouteGeneration() {
  const [state, setState] = useState<GenerationState>('idle');
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (prompt: string, userLocation?: UserLocation) => {
    setState('loading');
    setError(null);

    try {
      const result = await generateRoute(prompt, userLocation);
      setRoute(result);
      setState('success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setState('error');
      console.error('Route generation error:', err);
    }
  };

  const reset = () => {
    setState('idle');
    setRoute(null);
    setError(null);
  };

  return {
    state,
    route,
    error,
    generate,
    reset,
  };
}
