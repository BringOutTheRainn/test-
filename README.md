# Stardust Empire

A space-themed incremental clicker for phones, in the spirit of Cookie Clicker. Tap a lonely asteroid
for Stardust, build an industry of 14 generators from Mining Drones to the Universe Compiler, catch
comets, then collapse the universe for Dark Matter and do it all again, faster.

The full design and milestones are in [docs/DESIGN.md](docs/DESIGN.md).

## Play it

```sh
npm install        # TypeScript and Capacitor
npm run build      # compiles src/ into www/js/
npm run serve      # then open http://localhost:8080
```

Any static web server pointed at `www/` works once it is built. The game is made for portrait phones
and also works on desktop (wide screens get a side panel).

## Android

GitHub Actions builds an installable debug APK on every push and pull request (the **Android build**
workflow; download `stardust-empire-apk` from the run's Summary page). To build locally you need
JDK 21 and the Android SDK:

```sh
npm install
npm run android    # writes build/stardust-empire.apk
```

`tools/android.sh` creates the Capacitor project in `android/` (not committed), copies in the icon and
splash from `resources/android/`, locks the app to portrait and runs Gradle. A Play Store release
needs a signing key in the repository secrets; see [docs/RELEASE.md](docs/RELEASE.md).

## Tests

```sh
npm test                          # builds, then runs tests/*.test.js with Node's test runner
node tools/simulate.mjs 12 3      # a greedy bot plays 12 hours at 3 taps/s and prints milestones
npm run screens                   # headless Chromium screenshots at phone size into screens/
```

## How it is organised

```
src/
  data/        Content: generators, upgrades, achievements, cosmic tree, expeditions, news
  core/        Rules as pure functions over one GameState object (no DOM), unit tested
  ui/          Screens: the sky canvas, panels, modals, sound, phone wrappers
  main.ts      Builds the page, loads the save and runs the game loop
www/           index.html, styles.css, icons; compiled JS goes to www/js/
resources/     Icon and splash sources and the Android PNGs made from them
tools/         Screenshots, icon rendering, pacing simulation, Android build
tests/         Rule tests
```

| To do this | Edit |
|---|---|
| Rebalance or add a generator | `src/data/generators.ts` (upgrade tiers and achievements follow automatically) |
| Add an upgrade line | `src/data/upgrades.ts`, with an effect from the `Effect` type |
| Add an achievement | `src/data/achievements.ts` |
| Add a cosmic upgrade | `src/data/cosmic.ts` (x and y place it in the tree) |
| Add a headline | `src/data/news.ts` |
| Change the app icon | `www/icon.svg` and `resources/icon-foreground.svg`, then `npm run icons` |

Saves live in local storage under `stardust-empire-save`, are versioned, and migrate through
`MIGRATIONS` in `src/core/save.ts`. Players can copy and load a save code from Settings.

The previous Godot city builder is still in the git history on `main` before this rewrite.
