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

## Balance

`npm run sim` plays the campaign with the autopilot, buying gear greedily, and prints the win rate,
stars, remaining health and hero turns per stage. Current curve: the first region is gentle, the
later regions win about 90–100% of first tries with sensible gear but with real damage taken, and
the final boss needs a little farming. Difficulty knobs are at the top of `src/core/battle.ts`.

## Not in this version

More heroes to recruit, endless or daily dungeons, hero skill upgrades, music, store builds
(Capacitor), monetisation.
