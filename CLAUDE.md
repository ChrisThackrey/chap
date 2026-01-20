# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Expo React Native application named "chap" using:
- **Expo SDK ~54.0.27** with React Native 0.81.5 and React 19.1.0
- **Expo Router 6.0** for file-based routing
- **TypeScript** with strict mode enabled
- **React Native New Architecture** enabled (`newArchEnabled: true`)
- **Experimental features**: Typed routes and React Compiler

## Development Commands

### Running the app
```bash
npm start                 # Start Expo development server
npx expo start           # Alternative command
npm run android          # Run on Android emulator
npm run ios              # Run on iOS simulator
npm run web              # Run web version
```

### Code quality
```bash
npm run lint             # Run ESLint (uses expo lint)
```

### Project management
```bash
npm install              # Install dependencies
npm run reset-project    # Move starter code to app-example/ and create blank app/
```

## Architecture

### Routing Structure
The app uses **Expo Router** with file-based routing:
- `app/_layout.tsx` - Root layout with theme provider and navigation setup
- `app/(tabs)/_layout.tsx` - Tab navigation layout with bottom tabs
- `app/(tabs)/index.tsx` - Home tab screen
- `app/(tabs)/explore.tsx` - Explore tab screen
- `app/modal.tsx` - Modal screen example
- `unstable_settings.anchor` is set to `'(tabs)'` in root layout

### Component Organization
- `components/` - Reusable UI components
  - `components/ui/` - Low-level UI primitives (icon-symbol, collapsible)
  - `components/themed-*.tsx` - Theme-aware wrapper components
  - Platform-specific implementations use `.ios.tsx` extension
- `hooks/` - Custom React hooks (color scheme, theme color)
  - Platform-specific hooks use `.web.ts` extension
- `constants/` - Theme configuration and constants

### Theming System
- Uses React Navigation's `ThemeProvider` with `DarkTheme` and `DefaultTheme`
- Custom color scheme hook (`use-color-scheme`) detects system preferences
- Theme colors defined in `constants/theme.ts`
- Components use `useColorScheme()` and `useThemeColor()` hooks
- Supports automatic dark mode via `userInterfaceStyle: "automatic"` in app.json

### Path Aliases
TypeScript is configured with `@/*` alias pointing to project root:
```typescript
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
```

## Platform Support
- **iOS**: Supports tablets, uses SF Symbols for icons (via IconSymbol component)
- **Android**: Edge-to-edge enabled, adaptive icons configured
- **Web**: Static output, separate platform implementations where needed

## Important Configuration Files
- `app.json` - Expo configuration (plugins, experiments, platform settings)
- `tsconfig.json` - Extends `expo/tsconfig.base` with strict mode
- `eslint.config.js` - Uses Expo's flat ESLint config
- `package.json` - Project metadata and scripts
