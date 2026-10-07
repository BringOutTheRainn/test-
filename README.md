# City Builder RPG

A mobile city builder with turn-based dungeon fights, made in Godot 4. The design lives in the
[game design document](https://claude.ai/code/artifact/c6adb66b-7140-4e01-9f76-b7aba4a7330f).

Everything is plain text: GDScript, JSON data and a hand-written `project.godot`. There are no
editor-made scenes to maintain, so the whole game can be changed from a text editor.

## First milestone

- **City:** an 8 by 9 grid with a Town Hall. Tap an empty tile to build (Lumber Mill, Quarry, Farm,
  House, and Warehouse, Granary and Tavern from Town Hall 2). Builds cost resources, take real time,
  use one of 2 builders, and keep running while the app is closed. Tap a building to upgrade it or
  finish it with gems (the last 5 minutes are free). Production fills storage up to its cap.
- **Dungeon:** the Goblin Warren, a fight and a boss. Knight, Ranger and Cleric against goblins in two
  rows, turn order by Speed, energy for skills, taunt, shields, poison and stun. Tap a skill, then a
  target. Auto and 2x toggles. Loot goes back to the city; losing keeps half.
- **Saving:** progress saves automatically, and the save file is versioned so updates can migrate it.

## Running it

1. Install [Godot 4.3 or newer](https://godotengine.org/download) (standard build, not .NET).
2. Run the game from this folder without opening the editor:

   ```sh
   godot --path .
   ```

   Opening the folder in the Godot editor also works if you ever want to.

Run the tests (the same ones CI runs on every pull request):

```sh
godot --headless --script res://tests/run_tests.gd   # game rules and data checks
godot --headless --script res://tests/ui_smoke.gd    # opens the real screens and plays a room
```

## How it is organised

```
data/                 All game content, one JSON file per thing
  config/game.json    Starting resources, builders, grid size, skip prices, combat tuning
  resources/          Gold, wood, stone, ...
  buildings/          Each building with its levels: cost, build time, what it provides
  heroes/ enemies/    Stats, row and skill list
  skills/             Target rule plus a list of effects
  dungeons/           Rooms, enemies and loot
  items/ stats/       Gear and the stats it changes
  recipes/            What the Blacksmith crafts
  quests/             The goal chain shown above the town
  daily_quests/       The pool today's three daily quests are picked from
  shop/               Shop offers: gem packs, builders, resource crates
src/
  core/               Autoloads: EventBus (signals), Content (loads data), Game (state, saving)
  systems/            Inventory, TimerService, City, Heroes, Crafting, Quests, Daily, Shop: no UI
  platform/           Phone features behind small wrappers: notifications, store
  combat/             Battle, Effects, DungeonRun: plain classes, no UI
  ui/                 Screens built in code
tests/                Headless tests
packs/                Optional content packs (see below)
plugins/              Android plugin source (notifications), built by the Android workflow
addons/               Editor plugin that adds that Android plugin to exports
```

The systems are independent: they don't reference the UI or each other's internals. `Game` wires
them together and forwards their signals to `EventBus`, which the UI listens to.

## Changing and adding content

| To do this | Edit |
|---|---|
| Rebalance a building | its file in `data/buildings/` |
| Add a building | a new file in `data/buildings/` (copy an existing one) |
| Add a resource | a new file in `data/resources/`; it shows up in the top bar automatically |
| Add a hero or enemy | a new file in `data/heroes/` or `data/enemies/` |
| Add a skill | a new file in `data/skills/` built from existing effects |
| Add a dungeon or room | `data/dungeons/` |
| Add a new kind of effect | one `register()` call in `src/combat/effects.gd` |
| Add a new kind of building bonus | a new key under `provides`, read with `city.provided_total()` |

The logic tests check that every id referenced in the data exists, so a typo fails the tests.

**Art.** A building, hero or enemy uses `art/<type>/<id>.png` if that file exists (for example
`art/buildings/farm.png`), or the path in its `"sprite"` field. Anything without art keeps its colored
placeholder, so art can land one file at a time. Sprites are small pixel art, drawn sharp (no
smoothing). To clean up an AI-generated image, generate it on a solid magenta `#FF00FF` background
and run:

```sh
python3 tools/pixelize.py raw.png art/buildings/farm.png --size 64 --preview check.png
```

It removes the background, crops, shrinks to a real pixel grid and snaps every pixel to the
32-color palette in `art/palette.hex` (Endesga 32), so all art matches. Add `--keep-bg` for
backdrops. `art/sources.json` records which generated image each sprite came from.

Other art the game picks up by id: `art/resources/<id>.png` (icons in the resource bar and costs) and
`art/backgrounds/<dungeon id>.png` (the battle backdrop). In battle, heroes face right and enemies
face left; set `"faces": "right"` or `"left"` in a hero or enemy data file if its art looks the
other way.

**UI look.** Colors, text sizes and the framed pixel panels and buttons all live in
`src/ui/ui_kit.gd`. The pixel font is generated: edit the glyphs in `tools/make_font.py` and run
`python3 tools/make_font.py`.

**Heroes: stats, levels and gear.** A hero's battle stats are worked out, never stored: the
`"stats"` in `data/heroes/<id>.json`, plus its `"growth"` for every level above 1, plus the
`"stats"` of each item it wears. Stats are listed in `data/stats/` (adding a file there adds a stat
to every sheet), items in `data/items/` (each has a `"slot"`, `"rarity"` and `"stats"`), and the
slots, rarities and XP curve (`"hero_leveling"`) in `data/config/game.json`. Enemies give the
`"xp"` in their data file when beaten, and a dungeon room can drop items with `"items": [...]`.
The logic lives in `src/systems/heroes.gd`; the Heroes screen shows each hero's sheet and gear.

**First session.** A new game opens with a short story (config `"intro"`), then a chain of goals
from `data/quests/` shown above the town: build a Lumber Mill and Quarry, upgrade the Town Hall,
build a Tavern and recruit the Knight and Cleric (heroes with a `"recruit"` block), clear the Old
Cellar, and build the Warehouse from the blueprint its boss drops (buildings with `"blueprint": true`
need one; a room drops it with `"blueprints": [...]`). Goal types are listed in
`src/systems/quests.gd`. `tests/first_session.gd` plays the whole chain to catch balance or data
changes that would block it.

**Early game.** Town Hall 3 and 4 unlock the Blacksmith (crafts recipes from `data/recipes/`, one
at a time; its level, from the `"crafting"` it provides, sets which recipes are known), the Barracks
(every hero earns its `"hero_xp_per_hour"`, even while the game is closed) and the Mine (iron). The
Spider Caves and Iron Depths follow; a room's `"first_clear_items"` drop only on the first win.
The quest chain runs through all of it, and `tests/first_session.gd` plays it with a fake clock,
waiting for resources the way a player would, and prints how many hours that took.

**Daily loop.** The Daily screen has a 7-day login track (config `"daily_login"`), three quests a day
picked from `data/daily_quests/` (each counts how much a counter like `fights_won` rose today; the
game adds to counters with `Game.count()`), and a bonus for finishing all three. When the app goes
to the background the game schedules phone notifications for finished builds and crafts, full
storage and tomorrow's reward (texts in config `"notifications"`), and cancels them when the player
returns. Each kind can be switched off in Settings.

**Shop.** Offers live in `data/shop/`: gem packs and the starter pack and monthly card cost real money
(`"price_usd"`), builders and resource crates cost gems (`"cost"`). Real-money purchases go through
`src/platform/store.gd`, which is in test mode until store billing is added: every purchase is free
and the shop says so. Upgrades short of resources can buy what's missing (config `"shop"."gem_value"`).

**Content packs.** A folder in `packs/<name>/` (or `user://packs/<name>/` on the device) with the same
layout as `data/` is loaded after the base data. An entry with an existing id replaces it, a new id
adds content. This is the hook for events and downloadable content later.

**Save versions.** When the save format changes, bump `CURRENT_VERSION` in
`src/core/save_service.gd` and add a step to `_migrate_step`.

## Exporting to phones

The Android build runs on GitHub (`.github/workflows/android.yml`): it builds the notifications
plugin with Gradle, exports with Godot's Gradle build, and attaches `city-builder-rpg-apk` to the
run. That APK is signed with a throwaway key, so it's for testing; a Play Store build needs a real
upload key stored as a repository secret.

When creating an iOS preset, add `data/*, packs/*` to *Resources > Filters to export non-resource
files* so the JSON content is included, as the Android preset does.
