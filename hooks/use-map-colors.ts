import { MapColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useMapColors() {
  const colorScheme = useColorScheme();
  return MapColors[colorScheme];
}
