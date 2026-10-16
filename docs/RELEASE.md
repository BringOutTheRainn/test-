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
- Daily supply drops and missions that always give you a next goal
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

Reminder notifications are opt-in, scheduled on the device only, and need the Android 13 notification
permission (the build adds it). No push server is involved.

The privacy policy page must name AdMob and link https://policies.google.com/technologies/partner-sites.
The app asks for consent in the EEA and UK through Google's consent form (configure a GDPR message in
AdMob under Privacy & messaging).

Purchases go through Google Play Billing; the game stores only which products were bought, on the
phone. Mention in-app purchases in the store listing and the Data safety form (purchase history).

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

## Ad mediation (more money per ad)

Mediation lets other ad networks bid against AdMob for every placement, which usually raises
earnings per ad. No code changes are needed:

1. In the AdMob console, open Mediation and create a mediation group for each ad format (Rewarded,
   Interstitial, Banner) on Android. Add networks such as AppLovin, Unity Ads, Liftoff and Meta
   Audience Network, and turn on bidding where offered. Each network needs its own (free) account.
2. In GitHub, Settings, Secrets and variables, Actions, **Variables**, add `ADMOB_MEDIATION_ADAPTERS`
   with the adapter libraries for those networks, comma separated, for example
   `com.google.ads.mediation:applovin:13.0.1.0,com.google.ads.mediation:unity:4.13.0.0`.
   Use the versions from Google's mediation docs for each network. CI adds them to the app build.
3. Add each network's lines to `app-ads.txt` and list the networks in the privacy policy.

## In-app purchases

The Shop (cart button, top right) sells these products. Create them in Play Console, Monetize,
Products, **In-app products**, with exactly these ids, then activate them:

| Product id | Type | Suggested price | What it does |
| --- | --- | --- | --- |
| `supporter_pack` | One-time | $3.99 | No break ads or banners, production x2 forever |
| `starter_pack` | One-time | $1.99 | 10 crystals, 4 h of production, +10% production; offered for the first 3 days |
| `crystals_5` | Consumable | $0.99 | 5 Quasar Crystals |
| `crystals_30` | Consumable | $4.99 | 30 Quasar Crystals |
| `crystals_80` | Consumable | $9.99 | 80 Quasar Crystals |
| `event_pass` | Consumable | $2.99 | This weekend: double Flux and a Platinum badge |
| `vault_open` | Consumable | $2.99 | Pays out the Stardust Vault (up to 12 h of production) |
| `skin_lava`, `skin_ice`, `skin_neon`, `skin_gold` | One-time | $0.99 each | Planet skins |

Play Console only lets you create products after an APK or bundle with the billing permission has
been uploaded to a testing track; the build includes it through `cordova-plugin-purchase`. Add your
Google account as a licence tester (Settings, License testing) to buy without being charged.

The game grants a purchase as soon as Google Play approves it and then acknowledges it, so a crash
in between replays the purchase on next launch rather than losing it. Purchases are checked on the
phone only; if fraud becomes a problem, add server-side receipt validation (for example with
RevenueCat or a Firebase function). A "Restore purchases" button sits at the bottom of the Shop.
In a browser the Shop runs a test checkout and nothing is charged.
