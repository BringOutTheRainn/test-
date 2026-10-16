# Fathom: Play Store listing and release checklist

## Listing

- **App name** (30 max): Fathom: Deep Sea Idle Clicker
- **Short description** (80 max): Tap a giant clam, grow a glowing reef and sink into the deep. Relaxing idle game.
- **Category**: Games / Casual (tags: Idle, Clicker, Ocean)
- **Content rating**: Everyone. No violence, no chat, no user content.
- **Contains ads**: Yes (opt-in rewarded videos only). **In-app purchases**: No.

**Full description**

> Tap the giant clam, gather Pearls and grow a colony that sinks deeper and deeper, from the sunlit shallows
> to the glowing hadal trench.
>
> 🐚 Tap quickly to ride the current combo, and time your taps with the real-time tide.
> 🦀 Hire hermit crabs, seahorse ranchers, lanternfish schools, octopus workshops and stranger creatures of
> the deep. Every one of them appears in your living reef.
> 🌊 Descend through five ocean zones that darken and light up with bioluminescence.
> 🐟 Catch golden fish and greet passing whales for big boosts and Hearts.
> ❤ Adopt rare creatures: a Moon Jelly, a Pearl Narwhal, a Leafy Sea Dragon and more.
> 📜 Help your neighbours with Reef Requests, claim a Daily Tide Gift and erupt the geyser.
> 🌙 Lead a Great Migration to earn Moonstones and permanent Heritage perks.
>
> Your colony keeps gathering while you are away. Ads are always optional: watch one only when you want a
> bonus. Relaxing ocean ambience included. Plays offline.

**Graphics to upload**: icon 512x512 (`www/icon-512.png`), feature graphic 1024x500 (to make), and 4 to 8
phone screenshots (portrait, from `node tools/screens.mjs`: 02, 03, 05, 07, 12, 18).

## Data safety form

- Data collected by the app itself: none. The save lives on the phone.
- The Google Mobile Ads SDK (AdMob) collects the advertising ID, approximate location, app interactions and
  diagnostics to show and measure ads. Declare these as "shared with third parties for advertising".
- Data is encrypted in transit (AdMob uses HTTPS). Users cannot request deletion of AdMob data from us.

## Release checklist

1. Create an upload key once, and keep it safe:
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Add repository secrets: `FATHOM_KEYSTORE_B64` (`base64 -w0 upload.jks`), `FATHOM_KEYSTORE_PASSWORD`,
   `FATHOM_KEY_ALIAS` (`upload`) and `FATHOM_KEY_PASSWORD`. CI then uploads a signed `fathom.aab`
   (artifact `fathom-aab`); without them it uploads `fathom-unsigned.aab`, which Play will not accept.
3. Create the app in AdMob, set the repository variable `ADMOB_APP_ID`, and replace the test rewarded unit id
   in `src/ui/ads.ts` (turn `testing` off).
4. Publish the privacy policy (`docs/privacy.md`) at a public URL and paste it into the Play Console.
5. Create the app in the Play Console, fill in the listing above, content rating, data safety and target
   audience (13+, since ads are shown), then upload `fathom.aab` to Internal testing.
