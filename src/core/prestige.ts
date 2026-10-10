// Collapsing the universe: reset the run for permanent Dark Matter.

import { COSMIC } from '../data/cosmic.js';
import { GENERATORS } from '../data/generators.js';
import { UPGRADE_BY_ID } from '../data/upgrades.js';
import type { Derived } from './economy.js';
import type { GameState } from './state.js';

export const DM_SCALE = 1e10;

/** Total Dark Matter a lifetime of earnings is worth. */
export function darkMatterForEarnings(earnedAll: number): number {
  return Math.floor(Math.cbrt(earnedAll / DM_SCALE));
}

export function pendingDarkMatter(s: GameState): number {
  return Math.max(0, darkMatterForEarnings(s.earnedAll) - s.darkMatter);
}

/** Lifetime Stardust needed for the next whole Dark Matter. */
export function earningsForNextDarkMatter(s: GameState): number {
  const next = darkMatterForEarnings(s.earnedAll) + 1;
  return Math.pow(next, 3) * DM_SCALE;
}

export function canCollapse(s: GameState): boolean {
  return pendingDarkMatter(s) >= 1;
}

export function starterGenerators(s: GameState): number[] {
  const out = GENERATORS.map(() => 0);
  for (const c of COSMIC) {
    if (!s.cosmic[c.id]) continue;
    for (const e of c.effects) if (e.k === 'starter') out[e.gen] = Math.max(out[e.gen], e.count);
  }
  return out;
}

/** Collapse the universe. Returns the Dark Matter gained. */
export function collapse(s: GameState, d: Derived, now = Date.now()): number {
  const gained = pendingDarkMatter(s);
  if (gained < 1) return 0;
  s.darkMatter += gained;
  s.collapses++;
  resetRun(s, d, now);
  s.anomaly = null;
  return gained;
}

/** Starts a fresh universe: keeps permanent progress, clears the rest. */
export function resetRun(s: GameState, d: Derived, now = Date.now()): void {
  s.stardust = 0;
  s.earnedRun = 0;
  s.tapEarnedRun = 0;
  s.tapsRun = 0;
  s.cometsRun = 0;
  s.buffs = [];
  s.generators = starterGenerators(s);
  const kept: Record<string, true> = {};
  if (d.keepResearch) {
    for (const id in s.upgrades) if (UPGRADE_BY_ID[id]?.group === 'research') kept[id] = true;
  }
  s.upgrades = kept;
  s.runStartedAt = now;
  s.runStartClock = s.time;
  s.nextCometAt = s.time + 90;
}
