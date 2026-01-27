import { useState } from 'react';
import { generateRoute, RouteGenerationOptions } from '@/lib/route-generator';
import { Route } from '@/types/route';
import { ValidationWarning } from '@/types/validation';

type GenerationState = 'idle' | 'loading' | 'success' | 'error';

export function useRouteGeneration() {
  const [state, setState] = useState<GenerationState>('idle');
  const [route, setRoute] = useState<Route | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async (prompt: string, options?: RouteGenerationOptions) => {
    setState('loading');
    setError(null);
    setWarnings([]);

    try {
      const result = await generateRoute(prompt, options);
      setRoute(result.route);
      setWarnings(result.warnings);
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
    setWarnings([]);
    setError(null);
  };

  return {
    state,
    route,
    warnings,
    error,
    generate,
    reset,
  };
}
