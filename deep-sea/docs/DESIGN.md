# Fathom: game design

A deep sea idle clicker for phones. You start with one giant clam on a sunlit sandbank, tap it for
Pearls, and grow an underwater colony that sinks deeper and deeper, from the shallows to the hadal
trench. When the colony is big enough you lead it on a Great Migration and start again, stronger.

It is a sibling of Stardust Empire (same stack, same idle clicker skeleton), with its own twists:

| Twist | What it does | Why |
|---|---|---|
| **Descending** | Generators live in depth zones. You pay Pearls to descend a zone, which unlocks its generators and gives x1.5 production for the rest of the run. The water darkens and lights up with bioluminescence as you go. | A visible journey and a big decision every so often, instead of only buying the next generator. |
| **Tides** | A real-time tide turns every 4 minutes. High tide: taps x3. Low tide: production +25%. | Active players time their tapping; idle players lose nothing. |
| **Current combo** | Tapping quickly builds a combo up to x2 tap power that drains when you stop. | Taps feel skilful, not just repetitive. |
| **Living reef** | What you buy shows up in the scene: crabs on the sand, seahorses, swaying kelp, lanternfish schools, jellyfish, and deeper glows. | The colony feels alive and growing. |
| **Visitors** | A golden fish swims by every few minutes (rush, treasure or bubble burst). Below the shallows a whale sometimes passes: Whale Song, production x4 for 2 minutes. | Reasons to look at the screen. |
| **Great Migration** | Prestige for Moonstones (+2% production each) and a Heritage shop of permanent perks, including starting in the Twilight Reef. | The long loop. |

## Stack

TypeScript compiled by `tsc` into one plain script (`www/game.js`), HTML/CSS and a canvas, no framework,
no runtime dependencies. The rules (`src/core`) are pure functions over one state object and are unit
tested with Node's test runner; `src/ui` draws the scene and panels. The same build runs in any browser,
as a single inlined HTML file, and later inside Capacitor for Android and iOS.

## Numbers

- **Pearls**: main currency. Shown as 1.23K, 4.56M ... up to Decillion, then scientific notation.
- **Moonstones**: prestige currency. Every Moonstone ever earned gives +2% production; spending them on
  Heritage does not reduce the bonus.

## Generators

Price of the n-th copy is `base * 1.15^n`. A generator is shown once you have the previous one and its
zone is reached; it is a silhouette until you have half its price.

| # | Generator | Zone | Base cost | Base PPS |
|---|---|---|---|---|
| 1 | Hermit Crab | Sunlit Shallows | 15 | 0.1 |
| 2 | Seahorse Ranch | Sunlit Shallows | 100 | 1 |
| 3 | Kelp Farm | Sunlit Shallows | 1.1K | 8 |
| 4 | Lanternfish School | Twilight Reef | 12K | 47 |
| 5 | Octopus Workshop | Twilight Reef | 130K | 260 |
| 6 | Jellyfish Lamps | Twilight Reef | 1.4M | 1.4K |
| 7 | Anglerfish Lure | Midnight Trench | 20M | 7.8K |
| 8 | Giant Squid Press | Midnight Trench | 330M | 44K |
| 9 | Hydrothermal Vent | Midnight Trench | 5.1B | 260K |
| 10 | Sunken Galleon | Abyssal Plain | 75B | 1.6M |
| 11 | Leviathan Stable | Abyssal Plain | 1T | 10M |
| 12 | Trench Forge | Hadal Deep | 14T | 65M |
| 13 | Abyssal Cathedral | Hadal Deep | 170T | 430M |

## Zones

| Zone | Depth | Descend cost |
|---|---|---|
| Sunlit Shallows | 0 m | start |
| Twilight Reef | 200 m | 15K |
| Midnight Trench | 1,000 m | 25M |
| Abyssal Plain | 4,000 m | 100B |
| Hadal Deep | 10,000 m | 15T |

Each zone reached multiplies production by 1.5 for the rest of the run.

## Upgrades

- **Generator tiers**: x2 to one generator at 1, 5, 25, 50, 100, 150, 200 owned.
- **Crab Pickers**: Hermit Crabs gain flat PPS for every other creature you own (the "cursor" line).
- **Tap**: Strong Grip x2 tap tiers; Mother of Pearl adds 1% of PPS to each tap.
- **Current**: Rhythm raises the combo cap; Slack Water slows how fast the combo drains.
- **Visitors**: Shiny Lures (fish come 20% more often), Slow Swimmers (fish stay 50% longer).
- **Reef Research**: ten levels of x1.15 production, priced up steeply.

Upgrades appear in a strip of icons once affordable or close; bought ones are counted in Stats.

## Visitors

Golden fish every 2 to 4 minutes, tappable for about 12 seconds:

| Effect | Chance | Result |
|---|---|---|
| Pearl Rush | 45% | Production x7 for 60 s |
| Sunken Treasure | 45% | +min(15% of bank, 15 min of production) + 13 |
| Bubble Burst | 10% | Tap power x77 for 13 s |

From the Twilight Reef, 1 in 8 visitors is a whale instead: Whale Song, production x4 for 2 minutes.

## Logbook (achievements)

Pearls earned, taps, best combo, each generator at 1/50/100, fish and whales, zones reached, migrations.
Each entry gives +1% production.

## Great Migration (prestige)

- Opens once lifetime Pearls reach 10 billion.
- Total Moonstones = `floor(cbrt(lifetimePearls / 1e10))`; a migration grants the difference.
- Resets Pearls, generators, upgrades and depth. Keeps the Logbook, Moonstones and Heritage.
- The clam's pearl changes colour as Moonstones grow.

## Heritage (spend Moonstones)

Warm Currents (offline rate 25% → 50% → 75% → 100%), Golden Shoals (visitors more often), Deep
Memory (start in the Twilight Reef), Pearl Inheritance (start with Pearls), Long Tides (high tide
lasts longer), Clam Mastery (higher combo cap), Whale Friend (whales twice as often, from the shallows),
Research Notes (keep Reef Research through migrations).

## Geyser (active skill)

Unlocks after 500 Pearls. Tap the geyser button to erupt: 20 seconds of 10 automatic taps a second (they
keep the combo up), then 10 minutes to recharge.

## Daily Tide Gift

Tap the clam 150 times in a day (geyser taps don't count) to open that day's gift, worth 10, 15, 20, 30, 45,
60 and 90 minutes of production over a 7 day streak; day 7 adds a Whale Song. A missed day starts the streak
over. Shown as a chip at the top left of the scene, which glows when the gift is ready.

## Opt-in rewarded ads

Every ad is the player's choice, and rewards are capped so ads stay a bonus:
- **Current Surge**: production x2 for 10 minutes; each extra ad adds 10 minutes, up to 4 a day. A gold
  button at the bottom right of the scene, shown from 1,000 Pearls.
- **Welcome back x2**: doubles the offline haul.
- **Tide Gift x2**: doubles today's gift right after it is claimed, once a day.

On phones the AdMob plugin plays a real rewarded video (Google's test unit until release). In the browser a
five second stand-in countdown plays instead, so every flow can be tried. No interstitials or banners.

## Ocean ambience

A soft wave soundscape (filtered noise with a slow swell) starts with the first tap. It sounds darker in
deeper zones. It has its own switch in Settings.

## Rare creatures (Hearts)

Golden fish leave 1 Heart when caught, whales leave 3. Hearts adopt six rare creatures that glide around the
reef and stay forever, through migrations: Moon Jelly (3, combo cap +10), Pearl Narwhal (6, production +10%),
Glass Squid (10, geyser recharges 20% faster), Ghost Ray (15, visitors 10% more often), Golden Turtle (25,
offline +10%), Leafy Sea Dragon (40, tap power +25%). Listed at the top of the Logbook tab.

## Reef Requests (missions)

Three short goals at a time, shown by the 📜 chip under the gift chip, which glows when one is done: tap the clam
N times, gather N Pearls, own N of a creature, catch a visitor, reach a combo, erupt the geyser or descend.
Each one pays about a minute of production (at least 25 Pearls per request finished so far) and a Heart, so
they also feed the rare creature collection. After a claim, new requests come in five minutes later, which
keeps them a bonus rather than the main income. Targets grow with the number finished, requests are redrawn
after a migration, and two Logbook entries count them (10 and 50).

## Coral spawning (real moon)

Real reefs spawn a few nights after the full moon, so Fathom follows the real moon: from 2 to 6 days after each
full moon (moon age 16.5 to 21 days, about four days a month) the water fills with drifting pink and cream spawn,
visitors come twice as often and every catch leaves double Hearts. A pill at the top right counts down the
nights, Stats shows when the next spawning starts, and the Logbook has "Spawning Night" for a catch during one.

## Reminders

On phones, when the app goes to the background it schedules up to four local notifications (no server):
the geyser is recharged, the Tide Gift is waiting (6 pm local, only if that day is not claimed yet, naming the
streak day), the coral starts spawning (if within three days), and the nets are full (8 hours, the offline cap).
Nothing under 15 minutes away is scheduled, everything is cancelled when the app opens again, permission is
asked after the first Tide Gift claim, and Settings has a Reminders switch.

## Android build

`.github/workflows/fathom.yml` runs the rule tests and pacing simulation and builds an installable debug APK
(artifact `fathom-apk`) on every change under `deep-sea/`. Capacitor 7 with AdMob (Google's test ids until
release), App (back button closes popups, then minimises), Haptics and Splash Screen. Icons and splash are
rendered from SVG by `tools/make_icons.mjs`. Package id `com.bringouttherainn.fathom`, portrait only.
The same job builds the Play Store bundle (artifact `fathom-aab`), signed with the upload key when the
`FATHOM_KEYSTORE_*` secrets are set. The listing text, data safety answers and release checklist are in
`docs/store-listing.md`; the privacy policy is `docs/privacy.md`.

## Saving and offline

Auto-save every 10 s and on hide, to local storage, as versioned JSON. Offline earnings for up to 8 hours
at the offline rate, shown in a welcome back popup. Export, import and hard reset in Settings.

## Screens (portrait phone)

- **Top bar**: Pearls, PPS, tide, settings.
- **Scene**: the clam on the seabed, the living reef, visitors, floating numbers, combo bar.
- **Tabs**: Colony (generators, upgrade strip, x1/x10/x100/Max), Depths, Logbook, Migration, Stats.

## Milestones

1. **Playable first version** (this build): everything above in the browser, tests, screenshots.
2. **Mobile release**: ~~Capacitor Android build in CI, icon, splash, back button, haptics~~ (built),
   ~~Play bundle in CI, store listing, privacy policy~~ (built); still to do: the upload key secrets, real
   AdMob ids, a feature graphic, and the Play Console setup (steps in `docs/store-listing.md`).
3. **Retention**: ~~daily tide gifts~~, ~~geyser~~, ~~opt-in rewarded ads~~, ~~ocean ambience~~ (built),
   ~~Hearts and rare creatures~~ (built), ~~missions (Reef Requests)~~ (built), ~~reminders~~ (built).
4. **Depth content**: ~~coral spawning on real full moons~~ (built), an expedition submarine, a reef garden
   minigame.

## Research log

**Run 1 (Oct 14, evening).** Sources: TouchArcade and Reefbuilders reviews of AbyssRium (Tap Tap Fish),
Sensor Tower's 2026 note on monetization and retention, a 2026 Playio post on rewarded ads and retention,
Mind Studios' idle clicker design guide.
- AbyssRium's volcano skill auto-taps the reef about ten times a second for a short burst, and reviewers
  liked it as a break from tapping by hand. **Built: Geyser.** 20 s of 10 auto-taps a second, 10 minute
  recharge, unlocked at 500 Pearls. It feeds the combo, so it pairs well with high tide.
- Daily rewards tied to actually playing build the return habit better than plain login rewards, because
  they get the player into the core loop. **Built: Daily Tide Gift.** 150 taps a day opens a 7 day streak
  gift; day 7 adds a Whale Song. Logbook entries for the first gift, a full week, and geyser use.
- Reviewers of AbyssRium found interest fading after about two weeks, and its rare fish need "Love" that
  fish drop now and then. **Next:** Hearts dropped by visitors that unlock rare creatures with small
  permanent bonuses, so there is a long collection goal.
- Rewarded ads work best as a short, capped version of a bigger boost (for example x2 for a few minutes),
  placed at natural moments. **Next:** opt-in ads for x2 offline earnings and a doubled Tide Gift, with a
  daily cap.

**Run 2 (Oct 15, morning).** Sources: App Store listings for Idle Fish (Vivid Games), Fish Farm Merge, Idle Sea
Park and Fishing Clicker; Android Central's review of Fishing Life; run 1's rewarded-ad notes.
- Every ocean idle game checked pays offline earnings, and the common ad placements are a doubled
  welcome-back haul and a timed production boost. **Built: opt-in rewarded ads.** Current Surge (x2 for
  10 minutes, stacks, 4 a day), doubled offline haul and a doubled Tide Gift. A browser stand-in plays a
  countdown; the AdMob plugin path is wired for the phone build.
- Fishing Life's reviews are mostly about the mood: relaxing wave sounds and a day and night cycle. Fathom
  had no ambient sound. **Built: ocean ambience** that sounds darker the deeper the colony goes, with a
  Settings switch.
- **Next:** the Android build in CI (Capacitor, installable APK) so the ads and haptics run on a phone, then
  Hearts and rare creatures.

**Run 3 (Oct 15, evening).** Sources: run 1's AbyssRium notes (its fish give "Love" that unlocks rare fish),
the Stardust Empire Android pipeline as the template for the phone build.
- **Built: the Android app build.** Every change now builds an installable APK in GitHub Actions, with the
  Fathom icon, splash, back button and haptics, so ads and vibration can be tried on a real phone.
- AbyssRium keeps players collecting long after the main loop with rare fish bought with Love. **Built:
  Hearts and rare creatures.** Six permanent adoptions with small bonuses, each visible in the scene, which
  also gives catching visitors a lasting purpose.
- **Next:** a signed Play Store bundle and listing, then missions (short rotating goals).

**Run 4 (Oct 16, morning).** Sources: TouchTapPlay's Egg, Inc. guide (three evolving missions that ease new
players in), PocketGamer.biz on Egg, Inc. as the idle-game gold standard (small side tasks keep a simple core
engaging), AdVenture Capitalist's 7.1 notes (task-based goals) and Pocket Gamer's review (rewards too small
for progress felt dull).
- Egg, Inc. always shows three missions that point the player at the next useful step. **Built: Reef
  Requests.** Three rotating goals drawn from what the player can do right now, paying Pearls and a Heart.
  The first pacing run showed instant claims cut the time to 1T by about a fifth, so rewards are a minute of
  production and new requests wait five minutes after a claim; the simulation is back to about 104 minutes.
- **Built: the Play Store release kit.** CI now also builds the release bundle (signed once the upload key
  secrets exist), with a ready listing, data safety answers, privacy policy and a release checklist.
- **Next:** gentle reminders (a local notification when the gift or geyser is ready), then a weekend event.

**Run 5 (Oct 16, evening).** Sources: GameAnalytics on keeping idle players coming back, Mind Studios' idle
design guide (an offline cap creates a reason to return), Pushwoosh on game notifications (only for meaningful
moments), the 2021 PNAS study and Divers Alert Network on coral mass spawning (a few nights after the full moon).
- Idle players return when something worthwhile is waiting, but notifications for small events feel like
  nagging. **Built: reminders.** At most four local notifications, each for a real reward (geyser, gift, full
  nets, spawning), never sooner than 15 minutes, with a Settings switch.
- Other ocean games run calendar weekend events. Fathom's own twist is to follow nature instead: **Built: coral
  spawning** on the real moon, about four days a month, with double visitors and Hearts and a new scene effect.
  It does not change the 3 hour simulation (no spawning in its window), and adds about 4/30 x 2 to visitor
  Hearts over a month.
- **Next:** the expedition submarine (send a sub on timed dives for Pearls and Hearts while idle), and a feature
  graphic for the store listing.

