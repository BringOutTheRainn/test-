# Emberdeep: game design

A turn-based dungeon RPG for phones, played in portrait with one thumb. Short fights (a minute or
two), a clear "next stage" to push, and gear and levels to come back stronger after a loss.

## Setting

Something has been knocking under an old keep, and the cellar floor has split open. Three heroes go
down to find the Ember Gate and seal it:

| Hero | Role | Skills |
|---|---|---|
| **Aldric**, Knight | Tank | Slash · Shield Bash (stun) · Challenge (taunt + guard) · Rally (shield the party) |
| **Wren**, Ranger | Damage | Quick Shot (crits) · Venom Arrow (poison) · Volley (hit all) · Aimed Shot (huge hit + expose) |
| **Mira**, Cleric | Support | Smite · Heal (cures poison) · Blessing (regen + fury) · Resurrect |

## Combat

- **Turn order by speed.** Every unit has a next-turn time; the lowest goes next and then waits
  `1000 / speed`. The strip at the top shows the next nine turns.
- **Skills with cooldowns** instead of mana: a basic attack plus three specials per hero.
- **Enemy intents.** Every enemy shows what it will do next and to whom (`🗡 44 Wren`, `🗡 32 All`,
  `🛡 Bone Wall`). This is the main source of decisions: taunt before a big single hit, shield before
  an area attack, kill the healer first.
- **Statuses:** stun, poison, burn, shield, taunt, regen, fury (+35% damage), exposed (+35% damage
  taken), guard (−40% damage taken). Bosses resist stuns half the time.
- **Waves:** normal stages are two waves, boss stages one. Health carries between waves.
- **Bosses** have summons (Raise Dead, Brood, War Cry) and some enrage below half health.
- Tap a skill, then a target. The basic attack is preselected, so the quickest play is just tapping
  an enemy. **Auto** and **2×** toggles for replays.

## Progression

- **Four depths, 20 stages:** The Old Cellar, Goblin Warren, Spider Caves, Iron Depths.
- **Stars:** win, no hero falls, and win within a hero-turn par.
- **Rewards:** gold and XP for every win (first clears pay double gold), a 25% gear drop chance
  (60% on bosses), and a fixed item for each boss's first clear.
- **Levels:** each level adds 10% attack and defence and 11% health; XP to the next level is
  `25 × level^1.5`. Losing still gives some XP.
- **Gear:** weapon, armour and charm per hero, 15 items from the existing art. The Forge sells
  better stock as you reach deeper regions. Upgrades add 15% per level up to +5. Selling refunds
  part of the price.

## Heroes and the party

Six heroes, three in each fight. Aldric (Knight), Wren (Ranger) and Mira (Cleric) start in the
party. Three more wait at the **Tavern** on the Heroes tab, each unlocked by a boss:

| Hero | Unlocks | Cost | Role |
| --- | --- | --- | --- |
| Sera, Duelist | 1-5 | 150 | Fastest hero: Lunge, Flurry (three cuts), Parry (guard + fury), Finishing Blow |
| Tomas, Druid | 2-5 | 450 | Support: Thorn Whip (poison), Grove (party regen), Barkskin (shield + guard), Entangle (hit all, may hold) |
| Lyra, Pyromancer | 3-5 | 500 | Glass cannon: Firebolt, Ignite (heavy burn), Fireball (hit and burn all), Inferno |

Recruits join at the party's lowest level, so a new hero is useful at once (AFK Arena's Resonating
Crystal solves the same "new hero is level 1" problem). Benched heroes still get half the XP. Tap a
party slot (on the Heroes tab, or in a stage's window) to swap a hero in. Swords also fit the
Duelist; maces and staves fit the Druid and Pyromancer; the Silk Cloak fits everyone but the
Knight. Sprites come from the project's `art/raw/heroes2` (ponytail sword, curly wooden staff,
ponytail sun staff, recoloured red) via `tools/pixelize.py --size 64`.

All of Emberdeep's sprites now live in `rpg/art/`. The repo's shared `art/` folder was removed when
the city builder was replaced by Stardust Empire, so the sprites Emberdeep uses were copied from
before that change, along with `palette.hex`, `sources.json` and `pixelize.py`.

## Balance

`npm run sim` plays the campaign with the autopilot, buying gear greedily, and prints the win rate,
stars, remaining health and hero turns per stage. Current curve: the first region is gentle, the
later regions win about 90–100% of first tries with sensible gear but with real damage taken, and
the final boss needs a little farming. Difficulty knobs are at the top of `src/core/battle.ts`.
The sim ends by testing all 20 possible parties on every boss with equal gear: at level 11 they
range from about 55% to 100% against the final boss, and the starting trio sits in the middle
(about 85%), so swapping one hero is a real answer to a wall. When the sim tries the spire after
each boss, it stalls at the next boss floor: floor 9 after 1-5, 14 after 2-5, 19 after 3-5, and
about floor 34 after the campaign. Climbing makes the campaign a little easier (more XP and gold),
which is fine for an optional mode.

## Daily Trial

From stage 1-2 on, the top of the dungeon map offers one generated fight a day: three waves from
the region you're pushing, a little under its level, with one twist from a list of six (Swift Foes,
Iron Hide, Glass Cannons, Blessed Start, Warded, Frail Heroes). The trial is the same all day and
changes at midnight UTC. The first win of the day pays 3× that region's stage gold, double XP and a
guaranteed piece of gear. Winning on consecutive days builds a streak worth +10% gold per day, up to
+50%. Losses can be retried freely; after the day's win it can still be played for practice.

## The Ember Spire

An endless climb that opens after stage 1-5, shown under the Daily Trial on the dungeon map. Each
floor is fixed (seeded by its number), two waves, and pays gold and XP once; losing costs nothing
and the record stays. Enemy level is `3 + floor(0.6 × floor)`, so it climbs a little faster than
heroes level up from the spire alone. Every fifth floor is a boss floor (Acolyte, Warchief, Queen,
Troll, then round again) that also drops a piece of gear, and those are the natural walls. Foes come
from deeper regions as the floors rise.

**Spire tithe.** Once a floor is cleared, the spire pays `2 × best floor` gold an hour while you're
away, filling for up to 12 hours. Collect it from the spire's window; the result offers the usual
optional ad to double it.

## Music and sound

Everything is synthesized with Web Audio, so there are no audio files. Three looping chiptune songs
(the map, ordinary fights, bosses) are generated from an eight-bar chord loop each: bass, arpeggio,
drums and a seeded melody that repeats every loop. Music switches to the boss song when a boss is on
the field, pauses when the app is hidden, and has its own toggle in Settings.

## Ads

Optional only. After a win that paid gold, a "Watch an ad" button doubles the gold, three times a
day. In the browser build it plays a 5-second placeholder; the Android build will use AdMob
rewarded video. No interstitials.

## Milestones

1. ~~First playable: combat, 20 stages, levels, gear, forge, stars.~~
2. ~~Daily Trial with streaks, and opt-in rewarded ads.~~
3. ~~Three recruitable heroes at the Tavern and party picking.~~
3b. Hero synergies: a small bonus for certain pairs (Knight + Cleric "Oathbound", Druid +
   Pyromancer "Wildfire"), shown on the party strip.
4. ~~The Ember Spire: an endless climb with boss floors and a best-floor record.~~
4b. ~~Spire tithe: idle gold per hour from the best floor.~~ Still to do: milestone chests every 10
   floors.
5. ~~Music.~~
6. Android build in CI (Capacitor), AdMob rewarded ads, store listing.
7. Hero skill upgrades and a fifth depth.

## Research log

**2026-10-14, evening.** Mobile RPG retention fades fast after day one: benchmarks put RPGs near
30% D1 but only about 10% D7 and 3–5% D30, and progression walls and content droughts are named as
the usual D30 killers ([Playio](https://blog.playio.co/retention-by-game-genre),
[Segwise](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies.md)). Daily resets
with growing streak rewards and capped rewarded-video placements are the standard answers; Sensor
Tower notes daily limits drive rewarded-video views and every ad button trains a habit, so place
them sparingly ([Sensor Tower](https://sensortower.com/blog/best-mobile-game-monetization-retention-practices)).
Slay the Spire's mobile reviews praise short runs that change your character a lot and learning
enemy patterns, which Emberdeep's intents already lean on
([Pocket Gamer](https://www.pocketgamer.com/slay-the-spire/review/)). Built: the Daily Trial (a
reason to open the game every day, and new content against the wall at the final boss) and a capped,
opt-in ad that doubles gold. Next: more heroes, so losing to a boss can be answered with a
different party, not only grinding.

**2026-10-15, morning.** Party building is the hook every comparable game leans on. Darkest
Dungeon's stagecoach offers new recruits each week and players are told to grow the roster to about
16 so a bad run never stalls them ([TheGamer](https://www.thegamer.com/darkest-dungeon-best-party-builds-guide/),
[Steam discussion](https://steamcommunity.com/app/262060/discussions/0/1637536330480567955)), and a
veteran who outgrows easy content needs a replacement, which keeps recruiting relevant. Gacha RPGs
(AFK Arena, Epic Seven, Summoners War) keep rosters wide but are criticised for making a new hero
start at level 1; AFK Arena's Resonating Crystal fixes that by syncing levels. Emberdeep keeps it
small and fair: no gacha, three fixed recruits bought with gold, joining at party level. Built: the
Tavern, three heroes and party swapping. Next: an endless tower for players who finish, then
hero-pair synergies.

**2026-10-15, evening.** AFK Arena's King's Tower is the template for endless PvE climbs: it
unlocks early, floors can't be replayed, each pays a one-time reward, and bigger rewards land every
fifth and tenth floor ([afk.guide](https://afk.guide/kings-tower/),
[AFK Arena wiki](https://afk-arena.fandom.com/wiki/King%27s_Tower_Rewards?oldid=8673)). A ladder of
the highest floors gives long-term players something to compare
([ludo.guide](https://www.ludo.guide/guide/afk-arena/kings-tower)), and the floor count has been
raised in patches over time ([afk.guide patch notes](https://afk.guide/?p=12557)), so an endless mode
is cheap, lasting content. Built: the Ember Spire, unlocking after the first boss so most players
see it, with boss floors that drop gear. Kept Emberdeep's identity: same intents, turn order and
three-hero party. Next: spire milestone chests and idle gold tied to the best floor.

**2026-10-16, morning.** AFK Arena builds its whole session rhythm around a resource chest on the
main screen that fills while you're away, with timers sized so two check-ins a day empty it
([Game Developer](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena));
offline gains cover gold, hero XP and some gear
([BlueStacks](https://www.bluestacks.com/de/blog/game-guides/afk-arena/afka-beste-guides-und-tipps-sammlung-de.html)),
and the idle angle carries its marketing ([Udonis](https://blog.udonis.co/mobile-marketing/mobile-games/afk-arena-analysis)).
The usual caution is to cap idle gains so they never outpace active play. Built: the spire tithe,
gold only, capped at 12 hours and scaled by the best floor, so climbing is what raises it; plus
background music, the last missing piece of polish from the milestone list. Also fixed: the space
game's merge deleted the shared `art/` folder, so Emberdeep now carries its own sprites in `rpg/art`.
Next: Android build in CI (Capacitor), using the same approach the space game already ships with.
