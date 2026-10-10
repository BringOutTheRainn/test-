#!/usr/bin/env bash
# Creates the Capacitor Android project (if needed), applies the icon, splash
# and portrait lock, and builds a debug APK at build/stardust-empire.apk.
# Needs: npm install done, JDK 21 and the Android SDK.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d android ]; then
  npx cap add android
fi
npx cap sync android

RES=android/app/src/main/res
for dpi in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cp resources/android/mipmap-$dpi/*.png "$RES/mipmap-$dpi/"
done
# Adaptive icon background colour.
if [ -f "$RES/values/ic_launcher_background.xml" ]; then
  sed -i 's/#[0-9A-Fa-f]\{6\}/#120C33/' "$RES/values/ic_launcher_background.xml"
fi
# Splash image in every drawable folder that has one.
find "$RES" -name 'splash.png' -exec cp resources/android/splash.png {} \;
# Portrait only.
MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q 'screenOrientation' "$MANIFEST"; then
  sed -i 's/<activity /<activity android:screenOrientation="portrait" /' "$MANIFEST"
fi

# Version: name from package.json, code from VERSION_CODE (CI run number) or 1.
VERSION_NAME=$(node -p "require('./package.json').version")
VERSION_CODE=${VERSION_CODE:-1}
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" android/app/build.gradle

(cd android && ./gradlew assembleDebug --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/stardust-empire.apk
ls -la build/stardust-empire.apk

# A signed release bundle for Google Play, only when a signing key is provided:
#   ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
if [ -n "${ANDROID_KEYSTORE_FILE:-}" ] && [ -f "$ANDROID_KEYSTORE_FILE" ]; then
  (cd android && ./gradlew bundleRelease --no-daemon \
    -Pandroid.injected.signing.store.file="$ANDROID_KEYSTORE_FILE" \
    -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD")
  cp android/app/build/outputs/bundle/release/app-release.aab build/stardust-empire.aab
  ls -la build/stardust-empire.aab
fi
