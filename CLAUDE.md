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
npm run ios              # Build and run on a simulated iOS device (Device Hub on Xcode 27+)
npm run web              # Run web version
```

### Code quality
```bash
npm run lint             # ESLint over the whole project (app, components, hooks, lib, ...)
npm run typecheck        # tsc --noEmit
npm run check            # typecheck + lint (run before committing)
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

### Icons
- `components/ui/icon-symbol-names.ts` is the single icon table: keys are SF Symbol names (iOS, via expo-symbols), values are Material Icons names (Android/web). Both sides are type-checked, and `IconSymbol` only accepts names from this table, so add new icons there.
- Stop-type icons/colors live in `constants/stop-icons.ts`; use `getStopIcon(type)` (falls back to the activity icon for unknown types).

### Maps
- `lib/map-config.ts` holds the shared map provider (Google, or Apple inside Expo Go on iOS) and the light/dark map styles used by every `MapView`.
- `RouteMap` remounts its `MapView` whenever the *set* of stops changes (`mapInstanceKey`). react-native-maps runs through Fabric's legacy-interop layer and inserting/reordering Marker children in place crashes with `insertReactSubview:atIndex` (SIGABRT). Keep marker/polyline keys stable and do not reintroduce incrementing "remount" keys.

### External services
- `lib/openai.ts` creates the OpenAI client lazily via `getOpenAIClient()`; a missing key surfaces as a user-facing error at generation time instead of crashing on import.
- `lib/logger.ts` gates `debug`/`info` behind `__DEV__`; use it instead of `console.log` in lib code.
- Persisted preferences (`hooks/use-*-preference.ts`, `hooks/use-route-storage.ts`) validate and sanitize JSON from AsyncStorage; never trust stored shapes directly.

### Native build notes
- `app.config.js` extends `app.json` and injects `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` into the native map SDK config. Never put API keys in `app.json`; the key must be in `.env` (or the EAS profile env) whenever `expo prebuild` / `expo run:*` / EAS builds run.
- `ios/` and `android/` are generated (`expo prebuild`) and git-ignored.
- `plugins/with-ios-pod-deployment-target.js` raises pod `IPHONEOS_DEPLOYMENT_TARGET` to 15.1 in the Podfile post_install; Xcode 26+ refuses to build several transitive pods otherwise.
- Xcode 27 replaced `Simulator.app` with Device Hub (`DeviceHub.app`, `com.apple.dt.Devices`). `patches/@expo+cli+54.0.27.patch` (applied by `patch-package` on `postinstall`) ports expo/expo#50250 so `expo run:ios` / `expo start` find and open Device Hub; without it they fail with "Can't determine id of Simulator app". It also counts the `DevicesTrampoline` process (Device Hub's slow first launch) as running, which upstream does not. Delete the patch once `@expo/cli` for SDK 54 ships the fix or the project moves to SDK 56+.
- npm 12 blocks URL dependencies, so `npx patch-package @expo/cli` cannot regenerate the patch (`EALLOWREMOTE`); rebuild it with `git diff` against `npm pack @expo/cli@<version>` instead.
- `simctl` still boots simulated devices; `devicectl` handles install/launch/screenshots for simulated and physical devices. Command reference: `IOS_SIMULATOR_GUIDE.md`.
- Run on iOS 26.x simulated devices: Xcode 27 builds against the iOS 27 SDK, and without a UIScene manifest (SDK 57+ only) the app crashes at launch on an iOS 27 runtime.

## Platform Support
- **iOS**: Supports tablets, uses SF Symbols for icons (via IconSymbol component)
- **Android**: Edge-to-edge enabled, adaptive icons configured
- **Web**: Static output, separate platform implementations where needed

## Important Configuration Files
- `app.json` + `app.config.js` - Expo configuration (plugins, experiments, platform settings); secrets come from env via `app.config.js`
- `tsconfig.json` - Extends `expo/tsconfig.base` with strict mode
- `eslint.config.js` - Uses Expo's flat ESLint config
- `package.json` - Project metadata and scripts
