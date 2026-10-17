# Emberdeep

A turn-based dungeon RPG for phones. A party of three heroes, picked from six, fights its way down through
four depths under an old keep to seal the Ember Gate. The design is in [docs/DESIGN.md](docs/DESIGN.md).

Its pixel art (heroes, enemies, items and dungeon backgrounds) lives in `art/`, first drawn for the old city builder.

## Running it

```sh
cd rpg
npm install          # TypeScript, plus Capacitor for the Android build
npm run build        # writes www/game.js; open www/index.html in a browser
npm test             # rules tests
npm run sim          # plays the whole campaign on autopilot and prints the difficulty curve
npm run screens      # phone-sized screenshots into screens/ (needs Playwright)
npm run single       # one self-contained file, build/emberdeep.html
npm run icons        # redraws the launcher icon and splash in resources/ (needs Playwright)
npm run android      # debug APK at build/emberdeep.apk (needs JDK 21 and the Android SDK)
```

CI builds the APK on every change to `rpg/`; download `emberdeep-apk` from the
"Emberdeep Android build" run's Summary page and install it on a phone.

## How it is organised

- `src/core/data.ts`: heroes, skills, enemies, items, the four regions and their 20 stages.
- `src/core/battle.ts`: the battle rules. Pure functions over one battle object that return a list of
  events (hit, heal, status, death, wave...). The UI animates those events.
- `src/core/game.ts`: the save: gold, levels, gear, stars, rewards, shop and upgrades.
- `src/ui/app.ts`: the screens (dungeon map, heroes, forge, battle) and input.
- `src/ui/audio.ts`: synthesized sound effects.

Like Fathom and Stardust Empire, the TypeScript compiles to one plain script with no runtime
dependencies, so it can later be wrapped with Capacitor for Android and iOS.
