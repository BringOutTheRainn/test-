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

(cd android && ./gradlew assembleDebug --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/stardust-empire.apk
ls -la build/stardust-empire.apk
