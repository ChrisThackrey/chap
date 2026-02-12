import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

const THEME_STORAGE_KEY = '@chap/theme-preference';

interface ThemeContextValue {
  preference: ThemePreference;
  colorScheme: ColorScheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
  isLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function AppThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setPreferenceState(saved);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadPreference();
  }, []);

  const setPreference = useCallback(async (newPreference: ThemePreference) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newPreference);
      setPreferenceState(newPreference);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, []);

  // Resolve the actual color scheme based on preference
  const colorScheme: ColorScheme =
    preference === 'system' ? (systemColorScheme ?? 'dark') : preference;

  return (
    <ThemeContext.Provider value={{ preference, colorScheme, setPreference, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within an AppThemeProvider');
  }
  return context;
}

// Compatibility hook that returns just the color scheme
export function useColorScheme(): ColorScheme {
  const context = useContext(ThemeContext);
  // If used outside provider (e.g., during initial render), return undefined
  // to signal that theme detection should happen at the component level
  if (context === undefined) {
    // This shouldn't happen in normal app flow, but fallback to dark for safety
    console.warn('useColorScheme called outside ThemeProvider');
    return 'dark';
  }
  return context.colorScheme;
}
