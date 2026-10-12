# Stardust Empire: game design

A space-themed incremental clicker for phones, in the spirit of Cookie Clicker. You start by tapping a
lonely asteroid for Stardust and end up running a galaxy-spanning industry that collapses and reboots
the universe for Dark Matter.

## Stack

TypeScript, plain HTML/CSS and a canvas, no framework. Wrapped as an Android (and later iOS) app with
Capacitor; the same build runs in any browser. Reasons:

- A clicker is mostly buttons, lists and big numbers, which HTML does well and cheaply.
- The game logic is pure functions over one state object, so it is unit tested with Node's test runner.
- Real screens are checked with headless Chromium (Playwright) at phone sizes.
- The GitHub Actions workflow wraps the web build in Capacitor and builds an installable APK.

The old Godot city builder stays in git history on `main`; the new game replaces it on this branch.

## Core loop

1. **Tap** the celestial body in the middle of the screen to harvest Stardust.
2. **Buy generators** that produce Stardust per second (SPS) without tapping.
3. **Buy upgrades** that multiply generators and taps.
4. **Catch comets** that fly across the screen for short, powerful boosts.
5. **Collapse the universe** (prestige) for Dark Matter: a permanent production bonus and a currency for
   permanent Cosmic upgrades. Start again, faster.

Progress continues while the app is closed (offline earnings at a reduced rate).

## Currency and numbers

- **Stardust**: main currency. Doubles; numbers shown as 1.23K, 4.56M ... up to Decillion, then
  scientific notation (setting to always use scientific).
- **Dark Matter**: prestige currency. Total Dark Matter gives +2% production each; spending it on
  Cosmic upgrades does not reduce the bonus.

## Generators

Price of the n-th copy is `base * 1.15^n`. Each generator has its own icon and flavor line.

| # | Generator | Base cost | Base SPS |
|---|---|---|---|
| 1 | Mining Drone | 15 | 0.1 |
| 2 | Asteroid Harvester | 100 | 1 |
| 3 | Lunar Base | 1.1K | 8 |
| 4 | Orbital Station | 12K | 47 |
| 5 | Gas Giant Siphon | 130K | 260 |
| 6 | Fusion Reactor | 1.4M | 1.4K |
| 7 | Dyson Swarm | 20M | 7.8K |
| 8 | Warp Gate | 330M | 44K |
| 9 | Nebula Refinery | 5.1B | 260K |
| 10 | Star Forge | 75B | 1.6M |
| 11 | Quasar Tap | 1T | 10M |
| 12 | Wormhole Network | 14T | 65M |
| 13 | Galaxy Engine | 170T | 430M |
| 14 | Universe Compiler | 2.1Qa | 2.9B |

Generators are revealed one at a time: a generator shows once you have owned the previous one, and is
shown as a silhouette until you have half its price.

## Upgrades

- **Generator tiers**: x2 to one generator at 1, 5, 25, 50, 100, 150, 200, 250 owned. Price scales from
  the generator's base cost.
- **Drone synergy** (Cookie Clicker's cursor): Mining Drones gain a flat bonus per non-drone generator.
- **Tap upgrades**: x2 tap power tiers, and "Gravity Gloves" lines that add a percent of SPS to each tap.
- **Comet upgrades**: comets appear more often and last longer.
- **Synergies**: pairs of generators boost each other (e.g. Lunar Base +5% per Orbital Station).
- **Research**: flat production multipliers unlocked by total Stardust milestones.

Upgrades show in a row of icons when affordable or close to it; bought ones are listed in Stats.

## Comets (random events)

A comet streaks across the screen every 2 to 5 minutes and stays tappable for about 13 seconds.
Tapping gives one of:

| Effect | Chance | Result |
|---|---|---|
| Stardust Rush | 45% | Production x7 for 77 s |
| Lucky Haul | 45% | +min(15% of bank, 15 min of production) + 13 |
| Supernova Tap | 10% | Tap power x777 for 13 s |

Rare **Black Comet** (after first prestige): a bigger reward or a short x0.5 "Gravity Well" penalty.

## Achievements

Earned for totals (Stardust earned, taps, generators owned, comets caught, prestiges, specific feats).
Each achievement gives +1% production ("Constellations"), shown in a grid with locked silhouettes.

## Prestige: Collapse the Universe

- Available once lifetime Stardust earned reaches 10 billion (about 1.5 hours of active play).
- Total Dark Matter = `floor(cbrt(lifetimeEarned / 1e10))`; a collapse grants the difference from what you already have.
- Collapse resets Stardust, generators and upgrades. Keeps achievements, Dark Matter and Cosmic upgrades.
- The celestial body evolves with total Dark Matter and progress: asteroid, moon, rocky planet, ringed
  gas giant, star, pulsar, black hole.

## Cosmic upgrades (spend Dark Matter)

A small tree of permanent perks, e.g.: start with 10% offline rate → 50% → 90%; comets more often;
keep a few generator tiers; start each universe with some Stardust; extra Constellation bonus;
unlock buy-max; unlock auto-tapper drones; unlock the Expeditions screen.

## Expeditions (later milestone)

Send probes to named systems for a fixed real time (5 min to 8 h). Returns Stardust, a temporary boost or
rare "Relics" that give permanent small multipliers. Gives players a reason to check back.

## Daily and session features

- Offline earnings popup on return, with a "double it" rewarded ad button.
- Daily login reward streak (Stardust boost, Dark Matter shard on day 7).
- News ticker with funny space headlines that change with progress.

## Screens (portrait phone)

- **Top bar**: Stardust count, SPS, settings button.
- **Center**: the celestial body on a parallax starfield, floating "+N" numbers and particles on tap.
- **Bottom tabs**: Build (generators + upgrade strip), Upgrades, Achievements, Stats, Cosmos (prestige
  and cosmic tree, once unlocked).
- Buy amount toggle: x1 / x10 / x100 / Max.

## Feel

- Satisfying tap: squash animation, particles, floating numbers, a soft synthesized click (Web Audio),
  short vibration on Android. Sound and vibration toggles in settings.
- Big number counters ease towards the real value.
- Dark, high-contrast space palette with neon accents. Safe-area aware for notches.

## Saving

Auto-save every 10 s and when the app goes to the background, to local storage. Saves are versioned
JSON with migrations. Export/import a save string from Settings. Hard reset with confirmation.

## Monetization: ads (built)

Ads are mostly opt-in, so the game never feels pay-to-skip:
- **Tap Frenzy** (rewarded): 60 s of 20 auto-taps a second, taps x10, 5 minute recharge.
- **Mission swap** (rewarded): trade an unwanted mission for a new one.
- **Hyperdrive** (rewarded): x2 production for 2 h, stacks to 8 h, keeps running offline. Button on the
  sky appears once the first Asteroid Harvester is bought.
- **x2 offline earnings** and **x2 daily drop** (rewarded).
- **Break ad** (interstitial) after a collapse or entering an anomaly: at most every 8 minutes, never in
  the first 20 minutes of play.
- **Banner**: built but off by default.
- A `noAds` flag in the save turns off interstitials and banners, ready for a future "Remove ads" purchase.

AdMob through `@capacitor-community/admob`; a browser stand-in plays a countdown so every flow can be tried
on the web. IDs and pacing live in `src/data/ads.ts`. Release steps are in RELEASE.md.

## Milestones

1. **Core loop**: tap, Stardust, first 8 generators, buy x1/x10/x100/Max, saving, offline earnings,
   number formatting, phone layout, starfield. Tests and screenshots.
2. **Depth**: upgrades (tiers, taps, synergies), achievements, stats, comets, sound and vibration, news
   ticker, all 14 generators.
3. **Prestige**: Collapse the Universe, Dark Matter, Cosmic upgrades, celestial body evolution,
   settings with save export/import.
4. **Mobile release**: Capacitor Android build in CI (installable APK artifact), app icon, splash,
   safe areas, Android back button, pause/resume saving, performance pass, first-time hints.
5. **Widen scope**: Expeditions and Relics, daily rewards, Anomaly challenge runs, balance pass with a
   simulation that checks pacing to the first prestige (target 1.5 to 3 hours of active play).
6. **Ads**: Hyperdrive, x2 offline and daily rewards, paced break ads (see Monetization).
7. **Live research (twice daily, Oct 10 to 17)**: study similar games, add what fits, ship the best.

## Research log

**Run 1 (Oct 10, evening).** Sources: CrazyGames' clicker monetization guide, GameAnalytics and Adjust
idle-game guides, AdVenture Capitalist and Egg, Inc. reviews.
- Reviews of AdVenture Capitalist and Egg, Inc. keep naming the same weakness: goals feel shallow and
  progress repetitive. Egg, Inc. answers with a rolling set of missions. **Built: Missions** (three at
  a time, each worth minutes of production, achievements at 1/10/50/150/400, swap one with a rewarded ad).
- Rewarded ads that boost currency or speed up time convert best; a "welcome back" double and a
  temporary tap or auto-click boost are the top two placements. Welcome-back double is built. **Built: Tap
  Frenzy** (rewarded: 60 s of 20 auto-taps a second at x10 per tap, 5 minute recharge), next to
  Hyperdrive in a new Boosts window.
- Interstitials hurt retention most; keep them at natural pauses only (already true: after collapse
  or anomaly entry, paced).
- Daily task lists and login streaks are standard retention; streak exists, missions now cover tasks.

**Run 2 (Oct 11, morning).** Sources: AdVenture Capitalist wiki and Steam threads, GameAnalytics,
Countly and Kwalee notes on push notifications, a PocketGamer.biz chart on opt-in rates.
- AdVenture Capitalist's speed boosts at 25/50/100 owned are its main pacing hook. **Skipped:** our
  tier upgrades already unlock at 1/5/25/50/100/150/200/250 owned, so adding automatic doubles would
  stack on top and wreck the Dark Matter pacing.
- Players who allow notifications keep playing far more often (vendor figures: 55% vs 29% retained in
  month one). The advice is to notify only on real events, rarely, and to ask at a good moment.
  **Built: Reminders**: storage full (offline cap reached), Hyperdrive ended, probe returned, daily drop
  waiting at 6 pm. At most one of each, never under 10 minutes away, cleared when the app opens. One
  soft ask after the first long absence, and a Settings toggle. Phone only.
- An offline storage cap creates the "come back" pull; ours is 8 hours, raised by Cosmic upgrades.

**Run 3 (Oct 11, evening).** Sources: Egg, Inc. wiki (Contracts), Antimatter Dimensions Steam
threads and review summaries.
- Egg, Inc. contracts are time-limited goals with up to three reward tiers, the last one the most
  valuable. **Built: Weekly contracts.** One themed goal a week (Comet Season, Tap Marathon, Busy Fleet,
  rotating), three tiers worth 30 min, 90 min and 4 h of production, and the top tier awards a Contract
  Medal: +5% production forever, kept through collapses. Achievements at 1, 4 and 10 medals. Lives at
  the top of the Missions window; the missions badge counts claimable tiers.
- Antimatter Dimensions players complain most about waiting without automation, and value autobuyers
  more when they arrive late. **Next:** a late Cosmic upgrade that auto-buys generators.

**Run 4 (Oct 12, morning).** Sources: Idle Miner Tycoon guides on managers, run 3's Antimatter
Dimensions notes.
- Idle Miner Tycoon's managers (automation) are the feature players credit most: income keeps coming
  without constant tapping, leaving time for decisions. Automation feels best when it arrives after the
  player has done the work by hand. **Built: Auto-Fabricators**, a 60 Dark Matter Cosmic upgrade below
  Constellation Map. Once a second it buys the generator with the shortest payback, as long as it is
  affordable; upgrades stay manual. An Auto switch sits on the Build tab's buy row.
- Fixed a drawing crash on large planets (a continent at the planet's edge got a negative width).

**Run 5 (Oct 12, evening).** Sources: Idle Planet Miner review summaries and its subreddit, the
Cookie Clicker wiki (minigames, sugar lumps).
- Space idle games are praised for the core loop but criticised for a grindy late game and intrusive
  ads. Our ads stay opt-in apart from paced break ads; late-game goals now come from anomalies,
  contracts and the new crystals.
- Cookie Clicker's sugar lumps are a slow real-time resource (about one a day) that levels buildings
  for good, giving a reason to open the game daily long after the main loop is solved. **Built: Quasar
  Crystals.** Unlock at 1 billion lifetime Stardust; one forms every 20 hours, even while away; each
  generator level costs level + 1 crystals and adds +5% to that generator, kept through collapses. A
  rewarded ad grows the current crystal 2 hours sooner (once per crystal). Achievements at 1, 10 and 40
  total levels. Opened from the crystal counter on the Build tab.

### Backlog from research (best first)
1. Minigame per late generator (Cookie Clicker style), opened by crystal levels.
2. "Remove ads" in-app purchase that also keeps rewarded ads optional (the `noAds` flag already exists).
