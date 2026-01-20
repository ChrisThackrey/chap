# iOS Simulator Testing Guide

## Quick Start - Two Options

### Option 1: Local Build (Faster, Requires Xcode)
```bash
# Build locally (what we're doing now)
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

### 3. Open iOS Simulator
```bash
# Open Xcode Simulator
open -a Simulator

# Or if you have xcrun:
xcrun simctl boot "iPhone 15 Pro"
open -a Simulator
```

### 4. Install the App
**Method 1: Drag and Drop**
- Drag the `chap.app` folder onto the iOS Simulator window
- The app will install automatically

**Method 2: Command Line**
```bash
# List available simulators
xcrun simctl list devices

# Install on a specific simulator (replace UDID)
xcrun simctl install booted ./chap.app

# Or install on all booted simulators
xcrun simctl install booted chap.app
```

### 5. Start Development Server
```bash
# In your project directory
npm start

# Or
npx expo start --dev-client
```

### 6. Open the App
- Find "chap" on the simulator home screen
- Tap to open
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
- In Simulator: Features → Location → Custom Location
- Enter coordinates: 37.7749, -122.4194 (San Francisco)

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

# Install on all booted simulators
xcrun simctl install booted chap.app
```

## Troubleshooting

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
xcrun simctl uninstall booted com.yourname.chap
```

### "Cannot Connect to Dev Server"
```bash
# Restart Metro bundler
npm start -- --reset-cache

# Check firewall isn't blocking port 8081
# Try accessing http://localhost:8081 in browser
```

### "Location Services Not Working"
```bash
# Reset location permissions
xcrun simctl privacy booted grant location com.yourname.chap

# Or set custom location in Simulator
# Features → Location → Custom Location
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

## Useful Simulator Commands

```bash
# List all simulators
xcrun simctl list devices

# Boot a specific simulator
xcrun simctl boot "iPhone 15 Pro"

# Take screenshot
xcrun simctl io booted screenshot ~/Desktop/screenshot.png

# Record video
xcrun simctl io booted recordVideo ~/Desktop/demo.mov

# Open URL in simulator
xcrun simctl openurl booted "https://example.com"

# Reset simulator (clear all data)
xcrun simctl erase booted
```

---

**You're all set!** The build is running now. Once it completes, follow the installation steps above. 🚀
