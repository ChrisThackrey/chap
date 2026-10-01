# EAS Build Guide for Chap Dating App

## Prerequisites
✅ EAS CLI installed
✅ OpenAI API key configured
✅ eas.json created

## Step-by-Step Build Instructions

### 1. Login to Expo
```bash
eas login
```
If you don't have an Expo account, create one at https://expo.dev/signup

### 2. Configure Your Project
```bash
eas build:configure
```
This will link your project to your Expo account.

### 3. Set Environment Variables in Expo
Your OpenAI API key needs to be securely stored in Expo's servers:

```bash
eas secret:create --scope project --name OPENAI_API_KEY --value "your-api-key-here" --type string
```

**Note:** Replace `your-api-key-here` with your actual OpenAI API key from the .env file.

### 4. Build for a Simulated iOS Device (Mac only)
```bash
eas build --platform ios --profile development
```

This will:
- Build a development client for iOS
- Take 10-20 minutes
- Give you a downloadable .tar.gz file
- You can install it on a simulated iOS device (Device Hub on Xcode 27+)

### 5. Build for Android
```bash
eas build --platform android --profile development
```

This will:
- Build a development APK for Android
- Take 10-20 minutes
- Give you a downloadable .apk file
- You can install it on an Android emulator or device

### 6. Install the Development Build

**For iOS Simulator:**
```bash
# Easiest: download and install the latest simulator build (eas-cli 24.4.2+ on Xcode 27)
eas build:run --platform ios --latest

# Or by hand: download the .tar.gz from the EAS URL, then:
tar -xvf path/to/downloaded-file.tar.gz
xcrun devicectl list devices                      # find the simulated device's UDID
xcrun simctl boot <UDID>                          # boot it if it is shut down
xcrun devicectl device install app --device <UDID> ./chap.app
open "devices://device/open?id=<UDID>"            # show it in Device Hub
```
See `IOS_SIMULATOR_GUIDE.md` for the full Device Hub command list.

**For Android:**
```bash
# Download the .apk file from EAS, then:
adb install path/to/downloaded-file.apk
```

### 7. Start the Development Server
```bash
npm start
```

Then scan the QR code with your development build.

## Quick Commands Reference

```bash
# Check build status
eas build:list

# View build logs
eas build:view [BUILD-ID]

# Cancel a build
eas build:cancel [BUILD-ID]

# Check EAS credentials
eas credentials

# Check project configuration
eas config

# View secrets
eas secret:list
```

## Troubleshooting

### Build Failed?
1. Check the build logs: `eas build:view [BUILD-ID]`
2. Common issues:
   - Missing iOS/Android credentials (EAS will prompt you to set them up)
   - Node modules issues (try deleting node_modules and running `npm install`)
   - Cache issues (add `--clear-cache` flag to build command)

### Can't Install on Device?
- iOS: Make sure the device is registered in your Apple Developer account
- Android: Enable "Install from Unknown Sources" in device settings

### Development Build Won't Connect?
1. Make sure you're on the same network
2. Check that the dev server is running (`npm start`)
3. Try restarting both the dev server and the app

## Testing Your Route Planner

Once your development build is running:

1. **Open the app** → You'll see "Plan Date" as the first tab
2. **Enter a date description**, for example:
   - "Romantic sunset dinner by the water in San Francisco"
   - "Adventure day date with hiking and craft beer in Denver"
   - "Rainy day date with museums and cozy cafes in Seattle"
3. **Tap "Generate Route"**
4. **Allow location permission** when prompted
5. **Wait 5-10 seconds** for OpenAI to generate the route
6. **View the map** with custom markers for each stop
7. **Tap any marker** to see full details
8. **Tap "Get Directions"** to open in native maps app
9. **Save the route** for later

## Next Steps

After testing, you can:
- Build a preview version for TestFlight (iOS) or internal testing (Android)
- Configure push notifications
- Add more features
- Submit to app stores

## Useful Links

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS Secrets](https://docs.expo.dev/build-reference/variables/)
- [Expo Dashboard](https://expo.dev/)
