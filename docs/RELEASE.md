# Releasing Stardust Empire on Google Play

## What the repo already does

- Every push builds a debug APK (`stardust-empire-apk` artifact) you can install on a phone for testing.
- When the repository has a signing key in its secrets, the same workflow also builds a signed
  release bundle (`stardust-empire-play-bundle`, an `.aab`) that Google Play accepts.
- The version name comes from `package.json` and the version code from the workflow run number, so each
  build uploads as a newer version.

## One-time setup

1. **Create an upload key** on your computer (keep the file and passwords safe; losing them is painful):

   ```sh
   keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Add four repository secrets** in GitHub under Settings, Secrets and variables, Actions:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | the output of `base64 -w0 upload.keystore` |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | the key password |

3. **Create the app in the Play Console** (a developer account costs a one-time $25), turn on Play App
   Signing, and upload the `.aab` from the latest run to an internal testing track.

## Store listing

**App name:** Stardust Empire

**Short description (80 characters max):**
Tap an asteroid, build a galactic empire, collapse the universe, do it again.

**Full description:**

It starts with one lonely asteroid. Tap it, harvest a speck of Stardust, and buy your first Mining
Drone. Before long you are running Lunar Bases, Gas Giant Siphons, Dyson Swarms and Warp Gates, and
your asteroid has grown into a moon, a planet, a star and finally a black hole.

- 14 generators, from tiny Mining Drones to the reality-bending Universe Compiler
- Around 170 upgrades, including synergies that make generators boost each other
- Catch comets for Stardust Rushes, Lucky Hauls and 777x Supernova Taps
- Over 100 achievements, each one making your empire stronger
- Collapse the universe for Dark Matter and unlock a tree of permanent cosmic upgrades
- Six anomalies: twisted universes with one strange rule and a permanent reward
- Send probes on expeditions to find ancient Relics
- Your empire keeps working while you are away
- Daily supply drops for coming back
- Play offline, no account. Optional ads give boosts; you never have to watch one

**Category:** Games, Simulation (Idle)
**Content rating:** Everyone (no violence, no user content, no purchases). Declare **Contains ads**.
**Tags:** idle, clicker, incremental, space, tycoon

**Graphics:** the 512 px icon is `www/icon-512.png`. Phone screenshots can be made with
`npm run screens`. The 1024 x 500 feature graphic is `resources/feature-graphic.png`.

## Privacy

The game stores progress only on the device and has no accounts or analytics. Ads are served by
Google AdMob, which collects the device advertising ID, approximate location from IP, and app
interaction data to show and measure ads. In the Play Console data safety form, declare:
- Device or other IDs: collected and shared, for advertising and analytics (by AdMob)
- App activity and approximate location: collected by AdMob for advertising
- Data is encrypted in transit; users cannot request deletion through the app (link Google's policy)

The privacy policy page must name AdMob and link https://policies.google.com/technologies/partner-sites.
The app asks for consent in the EEA and UK through Google's consent form (configure a GDPR message in
AdMob under Privacy & messaging).

## Ads setup

The build ships with Google's **test** ad IDs, so it is safe to install and try. To earn money:

1. Create an AdMob account and add the app (Android, package `com.bringouttherainn.stardustempire`).
2. Create three ad units: Rewarded (Hyperdrive and doubles), Interstitial (break ads), Banner (optional).
3. In GitHub, Settings, Secrets and variables, Actions, **Variables**, add `ADMOB_APP_ID` with the app ID
   (`ca-app-pub-…~…`). CI writes it into the Android manifest.
4. Put the three unit IDs (`ca-app-pub-…/…`) in `src/data/ads.ts` and set `testing: false`.
5. Add `app-ads.txt` to the developer website listed in Play Console.

Placements: Hyperdrive (rewarded, x2 production for 2 h, stacks to 8 h, runs offline); x2 offline
earnings; x2 daily drop; a break ad after collapsing or entering an anomaly (at most once per 8
minutes, never in the first 20 minutes of play). The banner is off by default (`banner: false`).
