#!/usr/bin/env bash
# Creates the Capacitor Android project (if needed), applies the icon, splash and portrait lock,
# and builds a debug APK at build/emberdeep.apk. Run `npm run android` from rpg/.
# Needs: npm install done, www/game.js built, JDK 21 and the Android SDK.
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
if [ -f "$RES/values/ic_launcher_background.xml" ]; then
  sed -i 's/#[0-9A-Fa-f]\{6\}/#2A1820/' "$RES/values/ic_launcher_background.xml"
fi
find "$RES" -name 'splash.png' -exec cp resources/android/splash.png {} \;

MANIFEST=android/app/src/main/AndroidManifest.xml
if ! grep -q 'screenOrientation' "$MANIFEST"; then
  sed -i 's/<activity /<activity android:screenOrientation="portrait" /' "$MANIFEST"
fi

# Version: name from package.json, code from VERSION_CODE (the CI run number) or 1.
VERSION_NAME=$(node -p "require('./package.json').version")
VERSION_CODE=${VERSION_CODE:-1}
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" android/app/build.gradle

(cd android && ./gradlew assembleDebug --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/emberdeep.apk
ls -la build/emberdeep.apk
