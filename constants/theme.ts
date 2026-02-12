/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Tailwind CSS default color palette
export const tailwind = {
  // Blue (primary)
  blue50: '#EFF6FF',
  blue100: '#DBEAFE',
  blue200: '#BFDBFE',
  blue400: '#60A5FA',
  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  // Indigo
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  // Yellow (route)
  yellow300: '#FDE047',
  yellow400: '#FACC15',
  yellow500: '#EAB308',
  yellow600: '#CA8A04',
  // Amber
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',
  // Red (errors)
  red50: '#FEF2F2',
  red500: '#EF4444',
  red600: '#DC2626',
  // Gray
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  // Slate (for dark mode and UI elements)
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate800: '#1E293B',
  slate900: '#0F172A',
  // Emerald (success)
  emerald500: '#10B981',
  emerald600: '#059669',
  // Violet (force adjust gesture)
  violet500: '#8B5CF6',
  violet600: '#7C3AED',
};

const tintColorLight = tailwind.blue500;
const tintColorDark = tailwind.blue400;

export const Colors = {
  light: {
    text: tailwind.gray900,
    background: '#FFFFFF',
    tint: tintColorLight,
    icon: tailwind.gray500,
    tabIconDefault: tailwind.gray400,
    tabIconSelected: tintColorLight,
    // Extended palette
    textSecondary: tailwind.gray600,
    border: tailwind.gray200,
    surface: tailwind.gray50,
    surfaceHover: tailwind.gray100,
  },
  dark: {
    text: tailwind.gray200,
    background: tailwind.gray900,
    tint: tintColorDark,
    icon: tailwind.gray400,
    tabIconDefault: tailwind.gray400,
    tabIconSelected: tintColorDark,
    // Extended palette
    textSecondary: tailwind.gray400,
    border: tailwind.gray700,
    surface: tailwind.gray800,
    surfaceHover: tailwind.gray700,
  },
};

/**
 * Map-specific color palette for route visualization
 * Uses classic gold/green route colors for good visibility
 * Structured as { light, dark } to match the Colors pattern
 */
const sharedMapColors = {
  route: {
    driving: {
      main: '#FFD700',
      glow: '#FFF8DC',
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
    walking: {
      main: '#4CAF50',
      glow: '#81C784',
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  offsetIndicator: tailwind.slate500,
  radius: {
    stroke: `${tailwind.blue500}CC`,
    fill: `${tailwind.blue500}1F`,
  },
  parking: tailwind.blue500,
};

export const MapColors = {
  light: {
    ...sharedMapColors,
    controls: {
      background: '#FFFFFF',
      backgroundPressed: tailwind.gray100,
      icon: tailwind.gray700,
      border: tailwind.gray200,
      shadow: 'rgba(0, 0, 0, 0.1)',
    },
    label: {
      background: 'rgba(255, 255, 255, 0.98)',
      text: tailwind.gray800,
      border: `${tailwind.blue500}33`,
      shadow: 'rgba(0, 0, 0, 0.1)',
    },
    loading: {
      background: 'rgba(255, 255, 255, 0.98)',
      spinner: tailwind.blue500,
      text: tailwind.gray700,
    },
  },
  dark: {
    ...sharedMapColors,
    controls: {
      background: tailwind.gray800,
      backgroundPressed: tailwind.gray700,
      icon: tailwind.gray200,
      border: tailwind.gray600,
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
    label: {
      background: 'rgba(31, 41, 55, 0.98)',
      text: tailwind.gray200,
      border: `${tailwind.blue400}33`,
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
    loading: {
      background: 'rgba(31, 41, 55, 0.98)',
      spinner: tailwind.blue400,
      text: tailwind.gray200,
    },
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
