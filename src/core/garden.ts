// Nebula Garden: the first generator minigame, opened by levelling the
// Nebula Refinery with Quasar Crystals (Cookie Clicker's garden opens the
// same way from farm levels). Spores grow in real time, even while away, and
// harvesting pays minutes of base production. Short spores reward checking
// in often; long ones reward coming back. Plots survive every collapse.

import { earn, type Derived } from './economy.js';
import { levelMult } from './crystals.js';
import type { GameState } from './state.js';

export interface Seed {
  id: string;
  name: string;
  /** Real-time minutes to mature. */
  growMinutes: number;
  /** Harvest reward, in minutes of base production. */
  rewardMinutes: number;
  flavor: string;
}

export const SEEDS: Seed[] = [
  { id: 'moss', name: 'Star Moss', growMinutes: 5, rewardMinutes: 1.5, flavor: 'Fuzzy, glowing, and ready almost at once.' },
  { id: 'bloom', name: 'Comet Bloom', growMinutes: 60, rewardMinutes: 12, flavor: 'Opens its petals once an hour, like a tail sweeping past.' },
  { id: 'orchid', name: 'Void Orchid', growMinutes: 480, rewardMinutes: 90, flavor: 'Slow and silent. Plant one before bed.' },
];

export interface Plot {
  seed: string;
  /** Real-time ms when it was planted. */
  plantedAt: number;
}

/** Index of the Nebula Refinery, whose levels open and grow the garden. */
export const GARDEN_GEN = 8;
export const MAX_PLOTS = 9;
export const FERTILIZE_HOURS = 2;
export const FERTILIZE_COOLDOWN_HOURS = 4;

export function gardenUnlocked(s: GameState): boolean {
  return (s.genLevels[GARDEN_GEN] ?? 0) >= 1;
}

/** Four plots at level 1, two more per level, up to a 3 by 3 bed. */
export function plotCount(s: GameState): number {
  const lvl = s.genLevels[GARDEN_GEN] ?? 0;
  return lvl < 1 ? 0 : Math.min(MAX_PLOTS, 2 + 2 * lvl);
}

export function seedById(id: string): Seed | undefined {
  return SEEDS.find((x) => x.id === id);
}

export function plotProgress(p: Plot | null, now = Date.now()): number {
  if (!p) return 0;
  const seed = seedById(p.seed);
  if (!seed) return 0;
  return Math.min(1, Math.max(0, (now - p.plantedAt) / (seed.growMinutes * 60000)));
}

export function plotReady(p: Plot | null, now = Date.now()): boolean {
  return !!p && plotProgress(p, now) >= 1;
}

export function readyPlots(s: GameState, now = Date.now()): number {
  return s.garden.slice(0, plotCount(s)).filter((p) => plotReady(p, now)).length;
}

/** Nebula Refinery levels also make every harvest bigger. */
export function harvestValue(s: GameState, d: Derived, seed: Seed): number {
  return Math.max(d.baseSps * seed.rewardMinutes * 60, 50 * seed.rewardMinutes) * levelMult(s, GARDEN_GEN);
}

export function plant(s: GameState, i: number, seedId: string, now = Date.now()): boolean {
  if (i < 0 || i >= plotCount(s) || s.garden[i] || !seedById(seedId)) return false;
  while (s.garden.length <= i) s.garden.push(null);
  s.garden[i] = { seed: seedId, plantedAt: now };
  return true;
}

/** Harvests one mature plot. Returns the Stardust paid. */
export function harvest(s: GameState, d: Derived, i: number, now = Date.now()): number {
  const p = s.garden[i];
  if (!p || i >= plotCount(s) || !plotReady(p, now)) return 0;
  const seed = seedById(p.seed)!;
  const amount = harvestValue(s, d, seed);
  earn(s, amount);
  s.garden[i] = null;
  s.gardenHarvests++;
  return amount;
}

/** Harvests every mature plot and replants the same spore. Returns the total paid. */
export function harvestAll(s: GameState, d: Derived, now = Date.now()): number {
  let total = 0;
  for (let i = 0; i < plotCount(s); i++) {
    const p = s.garden[i];
    if (!p || !plotReady(p, now)) continue;
    total += harvest(s, d, i, now);
    plant(s, i, p.seed, now);
  }
  return total;
}

export function fertilizeReady(s: GameState, now = Date.now()): boolean {
  return now >= s.gardenFertilizeAt && s.garden.slice(0, plotCount(s)).some((p) => p && !plotReady(p, now));
}

/** Rewarded ad: every growing plant gains 2 hours. Then a 4 hour cooldown. */
export function fertilize(s: GameState, now = Date.now()): boolean {
  if (!fertilizeReady(s, now)) return false;
  for (const p of s.garden) if (p) p.plantedAt -= FERTILIZE_HOURS * 3600000;
  s.gardenFertilizeAt = now + FERTILIZE_COOLDOWN_HOURS * 3600000;
  s.adsWatched++;
  return true;
}
