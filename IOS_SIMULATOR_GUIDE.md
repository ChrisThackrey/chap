# iOS Simulated Device Testing Guide (Device Hub)

Xcode 27 replaced `Simulator.app` with **Device Hub** (`DeviceHub.app`). Simulated
devices are still booted with `xcrun simctl`, and `xcrun devicectl` now manages
both simulated and physical devices. On Xcode 26 and earlier, use `open -a Simulator`
wherever this guide says `open -a DeviceHub`.

**Use an iOS 26.x simulated device.** Xcode 27 builds against the iOS 27 SDK, which
requires the UIScene lifecycle; Expo SDK 54 apps do not have it and crash at launch
on an iOS 27 runtime (expo/expo#46664).

## Quick Start - Three Options

### Option 0: Run Straight From Source (Fastest Loop)
```bash
# Builds with Xcode, installs on a simulated device, opens Device Hub and starts Metro
npm run ios

# Pick the device (UDIDs come from `xcrun devicectl list devices`)
npm run ios -- --device <UDID>
```
This needs the Expo CLI patch in `patches/`, which `npm install` applies automatically.

### Option 1: Local Build (Faster, Requires Xcode)
```bash
# Build locally
eas build --platform ios --profile development --local

# This creates a .tar.gz file in your project directory
```

### Option 2: Cloud Build (Slower, No Xcode Required)
```bash
# Build on EAS servers
eas build --platform ios --profile development

# After ~15 mins, download the .tar.gz from the EAS dashboard
```

## Step-by-Step Installation

### 1. Wait for Build to Complete
The build process will output a `.tar.gz` file when complete.

### 2. Extract the Build
```bash
# The build creates a file like: chap-development-simulator.tar.gz
# Extract it:
tar -xvf chap-development-simulator.tar.gz

# This creates a chap.app folder
```

### 3. Boot a Device and Open Device Hub
```bash
# List devices; simulated ones show "simulated" in the Reality column
xcrun devicectl list devices

# Boot a simulated device (devicectl has no boot command, so this stays simctl)
xcrun simctl boot <UDID>

# Open Device Hub focused on that device (this does not boot a shut-down device)
open "devices://device/open?id=<UDID>"

# Or just bring Device Hub forward
open -a DeviceHub
```
Quitting Device Hub shuts down the simulated devices. Its very first launch after
installing Xcode runs a one-time updater and can take over 20 seconds.

### 4. Install the App
**Method 1: EAS CLI**
```bash
# Downloads the latest simulator build and installs it (needs eas-cli 24.4.2+ on Xcode 27)
eas build:run --platform ios --latest
```

**Method 2: Command Line**
```bash
# Install on a specific device
xcrun devicectl device install app --device <UDID> ./chap.app

# simctl still works, including the "booted" shortcut
xcrun simctl install booted ./chap.app
```

### 5. Start Development Server
```bash
# In your project directory
npm start

# Or
npx expo start --dev-client
```

### 6. Open the App
```bash
xcrun devicectl device process launch --device <UDID> com.thacken5.chap
```
- Or find "chap" on the device's home screen in Device Hub and click it
- The app will connect to your development server automatically

## Testing Your Route Planner

### First Test: Basic Flow
1. **App opens** → You see "Plan Date" tab (should be active)
2. **Enter prompt**: "Romantic dinner date in San Francisco"
3. **Tap "Generate Route"**
4. **Allow location** when prompted (or deny - app works either way)
5. **Wait 5-10 seconds** → Loading animation with rotating messages
6. **Map appears** with colored markers and a route line
7. **Tap any marker** → Modal opens with stop details
8. **Tap "Get Directions"** → Opens in Maps app
9. **Tap "Save"** → Route saved to storage
10. **Tap "New Route"** → Returns to prompt input

### Test Different Prompts
```
✅ "Romantic sunset dinner by the water in San Francisco"
✅ "Adventure day date with hiking and coffee in Berkeley"
✅ "Rainy day museum and cafe date in Oakland"
✅ "First date: casual, fun, not too serious in Palo Alto"
✅ "Anniversary celebration, upscale dining in Napa"
```

### What to Look For

**Map Features:**
- ✅ Map displays with appropriate zoom level
- ✅ Route line connects all stops in order
- ✅ Markers have different colors based on stop type
- ✅ Markers show numbered badges (1, 2, 3...)
- ✅ Map theme matches system (light/dark mode)

**Stop Details:**
- ✅ Tapping marker opens detailed modal
- ✅ Shows stop name, type, and description
- ✅ Displays "Stop X of Y"
- ✅ Shows duration (e.g., "90 minutes")
- ✅ Shows full address
- ✅ "Get Directions" button works

**Interactions:**
- ✅ Can generate multiple routes
- ✅ Can save routes
- ✅ Can share routes
- ✅ Location permission handling works
- ✅ Error states display correctly
- ✅ Loading states are smooth

### Location Testing

**With Location Permission:**
- App will request your location
- Routes will be suggested near you
- More accurate recommendations

**Without Location Permission:**
- App still works
- Routes will be in a default area (based on prompt)
- You can still enter specific locations in your prompt

### Debugging Tools

**If Map Doesn't Load:**
```bash
# Check Metro bundler logs
npm start -- --reset-cache

# Check device logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "chap"'
```

**If OpenAI Fails:**
```bash
# Test OpenAI directly
node test-openai.js

# Check .env file has correct key
cat .env
```

**If Location Doesn't Work:**
```bash
# Set a simulated location (San Francisco); negative values need the `=` form
xcrun devicectl device simulate location coordinate --device <UDID> --latitude 37.7749 --longitude=-122.4194

# Stop simulating
xcrun devicectl device simulate location clear --device <UDID>
```

### Performance Tips

**Speed Up Subsequent Builds:**
```bash
# Builds are cached, so rebuilds are much faster
eas build --platform ios --profile development --local
```

**Fast Refresh During Development:**
- Save any file → App updates instantly
- No need to rebuild for code changes
- Only rebuild when adding new native dependencies

## Common Commands

```bash
# Check build status
eas build:list

# View latest build
eas build:view --platform ios

# Cancel running build
eas build:cancel

# Clear cache and rebuild
eas build --platform ios --profile development --clear-cache

# Install the latest simulator build
eas build:run --platform ios --latest
```

## Troubleshooting

### "Can't determine id of Simulator app"
The Expo CLI for SDK 54 only looks for `Simulator.app`, which Xcode 27 removed. The
patch in `patches/@expo+cli+54.0.27.patch` teaches it about Device Hub. If you see
this error, the patch was not applied:
```bash
npm install          # runs patch-package via postinstall
npx patch-package    # or apply it directly
```

### App launches but no device window appears in Device Hub
Device Hub keeps running after its device window is closed, and activating the app does
not bring the window back. The patch makes `npm run ios` send the device deep link on
every launch, so this should not happen; if it does, re-apply the patch (above) or open
the window by hand:
```bash
open "devices://device/open?id=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)"
```

### "Build Failed"
Check the logs for specific errors:
```bash
# Local build - check terminal output
# Cloud build - check EAS dashboard

# Common fixes:
rm -rf node_modules
npm install
eas build --platform ios --profile development --clear-cache
```

### "App Crashes on Launch"
```bash
# Check device logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "chap"'

# Try clearing app data
xcrun devicectl device uninstall app --device <UDID> com.thacken5.chap
```
If it crashes immediately on an iOS 27 device, switch to an iOS 26.x one (see the note at the top).

### "Cannot Connect to Dev Server"
```bash
# Restart Metro bundler
npm start -- --reset-cache

# Check firewall isn't blocking port 8081
# Try accessing http://localhost:8081 in browser
```

### "Location Services Not Working"
```bash
# Grant location permission (simctl only)
xcrun simctl privacy booted grant location com.thacken5.chap

# Set a simulated location
xcrun devicectl device simulate location coordinate --device <UDID> --latitude 37.7749 --longitude=-122.4194
```

### "Map is Blank"
- Check internet connection (MapLibre needs to download tiles)
- Wait a few seconds for tiles to load
- Try zooming in/out
- Check console for MapLibre errors

## Next Steps After Testing

### Ready for Physical Device?
```bash
# Build for physical iPhone (requires Apple Developer account)
eas build --platform ios --profile development
```

### Ready for TestFlight?
```bash
# Build production version
eas build --platform ios --profile preview
eas submit --platform ios
```

### Want to Share with Testers?
```bash
# Build internal distribution
eas build --platform ios --profile preview
# Share the downloaded .ipa file
```

## Useful Device Commands

`devicectl` takes a device UDID or name with `--device`; it has no `booted` shortcut.

```bash
# List all devices (simulated and physical)
xcrun devicectl list devices

# Boot a specific simulated device
xcrun simctl boot <UDID>

# Take screenshot
xcrun devicectl device capture screenshot --device <UDID> --destination ~/Desktop/screenshot.png

# Record video (must be .mp4; add --duration <seconds> or stop with Ctrl+C)
xcrun devicectl device capture screen-record --device <UDID> --destination ~/Desktop/demo.mp4

# Open URL on the device
xcrun devicectl device process openURL --device <UDID> "https://example.com"

# List installed apps
xcrun devicectl device info apps --device <UDID>

# Reset the device (clear all data)
xcrun simctl erase <UDID>
```

---

**You're all set!** The build is running now. Once it completes, follow the installation steps above. 🚀
