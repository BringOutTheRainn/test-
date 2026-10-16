// Quasar Crystals: a slow resource (one every 20 hours, real time) that
// levels up generators for good, in the spirit of Cookie Clicker's sugar
// lumps. Levels survive every collapse. A rewarded ad can speed up growth.

import { GENERATORS } from '../data/generators.js';
import type { GameState } from './state.js';

export const CRYSTAL_HOURS = 20;
export const CRYSTAL_UNLOCK = 1e9;
/** Production bonus per level, for that generator. */
export const LEVEL_PCT = 0.05;
export const AD_SPEEDUP_HOURS = 2;

const GROW_MS = CRYSTAL_HOURS * 3600000;

export function crystalsUnlocked(s: GameState): boolean {
  return s.earnedAll >= CRYSTAL_UNLOCK || s.crystalNextAt > 0;
}

/**
 * Starts growth once unlocked and banks every crystal that finished since
 * the last check, including time away. Returns how many were banked.
 */
export function growCrystals(s: GameState, now = Date.now()): number {
  if (!crystalsUnlocked(s)) return 0;
  if (s.crystalNextAt <= 0) {
    s.crystalNextAt = now + GROW_MS;
    s.crystalAdUsed = false;
    return 0;
  }
  let n = 0;
  while (s.crystalNextAt <= now) {
    n++;
    s.crystalNextAt += GROW_MS;
    s.crystalAdUsed = false;
  }
  s.crystals += n;
  return n;
}

export function crystalProgress(s: GameState, now = Date.now()): number {
  if (s.crystalNextAt <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (s.crystalNextAt - now) / GROW_MS));
}

export function levelCost(s: GameState, gen: number): number {
  return (s.genLevels[gen] ?? 0) + 1;
}

export function levelUp(s: GameState, gen: number): boolean {
  if (gen < 0 || gen >= GENERATORS.length) return false;
  const cost = levelCost(s, gen);
  if (s.crystals < cost) return false;
  s.crystals -= cost;
  s.genLevels[gen] = (s.genLevels[gen] ?? 0) + 1;
  return true;
}

/** Rewarded ad: the current crystal grows 2 hours sooner, once per crystal. */
export function speedUpCrystal(s: GameState, now = Date.now()): boolean {
  if (s.crystalAdUsed || s.crystalNextAt <= now) return false;
  s.crystalNextAt = Math.max(now, s.crystalNextAt - AD_SPEEDUP_HOURS * 3600000);
  s.crystalAdUsed = true;
  s.adsWatched++;
  return true;
}

export function levelMult(s: GameState, gen: number): number {
  return 1 + LEVEL_PCT * (s.genLevels[gen] ?? 0);
}
