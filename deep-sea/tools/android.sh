#!/usr/bin/env bash
# Creates the Capacitor Android project (if needed), applies the icon, splash,
# portrait lock and permissions, and builds a debug APK at build/fathom.apk.
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
  sed -i 's/#[0-9A-Fa-f]\{6\}/#0B3A63/' "$RES/values/ic_launcher_background.xml"
fi
find "$RES" -name 'splash.png' -exec cp resources/android/splash.png {} \;

MANIFEST=android/app/src/main/AndroidManifest.xml
# Vibration for taps (navigator.vibrate and the Haptics plugin).
if ! grep -q 'android.permission.VIBRATE' "$MANIFEST"; then
  sed -i 's#</manifest>#    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>#' "$MANIFEST"
fi
# AdMob app id (Google's test id unless ADMOB_APP_ID is set).
ADMOB_APP_ID=${ADMOB_APP_ID:-ca-app-pub-3940256099942544~3347511713}
if ! grep -q 'com.google.android.gms.ads.APPLICATION_ID' "$MANIFEST"; then
  sed -i "s#</application>#    <meta-data android:name=\"com.google.android.gms.ads.APPLICATION_ID\" android:value=\"$ADMOB_APP_ID\"/>\n    </application>#" "$MANIFEST"
fi
if ! grep -q 'screenOrientation' "$MANIFEST"; then
  sed -i 's/<activity /<activity android:screenOrientation="portrait" /' "$MANIFEST"
fi

VERSION_NAME=$(node -p "require('./package.json').version")
VERSION_CODE=${VERSION_CODE:-1}
sed -i "s/versionCode [0-9]*/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" android/app/build.gradle

(cd android && ./gradlew assembleDebug --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/fathom.apk
ls -la build/fathom.apk
