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

## Daily Trial

From stage 1-2 on, the top of the dungeon map offers one generated fight a day: three waves from
the region you're pushing, a little under its level, with one twist from a list of six (Swift Foes,
Iron Hide, Glass Cannons, Blessed Start, Warded, Frail Heroes). The trial is the same all day and
changes at midnight UTC. The first win of the day pays 3× that region's stage gold, double XP and a
guaranteed piece of gear. Winning on consecutive days builds a streak worth +10% gold per day, up to
+50%. Losses can be retried freely; after the day's win it can still be played for practice.

## Ads

Optional only. After a win that paid gold, a "Watch an ad" button doubles the gold, three times a
day. In the browser build it plays a 5-second placeholder; the Android build will use AdMob
rewarded video. No interstitials.

## Milestones

1. ~~First playable: combat, 20 stages, levels, gear, forge, stars.~~
2. ~~Daily Trial with streaks, and opt-in rewarded ads.~~
3. More heroes to recruit (pick three of five or six for each fight), using the hero art in
   `art/raw/heroes2`.
4. An endless tower with a best-floor record, for players who finish the campaign.
5. Music and more sound.
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
