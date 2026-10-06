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
src/
  core/               Autoloads: EventBus (signals), Content (loads data), Game (state, saving)
  systems/            Inventory, TimerService, City, Economy: plain classes, no UI
  combat/             Battle, Effects, DungeonRun: plain classes, no UI
  ui/                 Screens built in code
tests/                Headless tests
packs/                Optional content packs (see below)
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
32-color palette in `art/palette.hex` (Endesga 32), so all art matches.

**Content packs.** A folder in `packs/<name>/` (or `user://packs/<name>/` on the device) with the same
layout as `data/` is loaded after the base data. An entry with an existing id replaces it, a new id
adds content. This is the hook for events and downloadable content later.

**Save versions.** When the save format changes, bump `CURRENT_VERSION` in
`src/core/save_service.gd` and add a step to `_migrate_step`.

## Exporting to phones

When creating Android and iOS export presets, add `data/*, packs/*` to *Resources > Filters to export
non-resource files* so the JSON content is included in the build.
