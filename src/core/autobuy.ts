// Auto-Fabricators: a late Cosmic upgrade that keeps buying the generator
// that pays itself back fastest. Upgrades are left to the player.

import { GENERATORS } from '../data/generators.js';
import { buyGenerator, generatorPrice, generatorVisible, type Derived } from './economy.js';
import type { GameState } from './state.js';

/** The visible generator with the shortest payback time, or -1. */
export function bestGenerator(s: GameState, d: Derived): number {
  let best = -1;
  let bestPayback = Infinity;
  for (let i = 0; i <= d.maxGen && i < GENERATORS.length; i++) {
    if (!generatorVisible(s, i)) continue;
    const owned = s.generators[i];
    const gain = owned > 0 ? d.genSps[i] / owned : GENERATORS[i].baseSps * d.globalMult;
    if (gain <= 0) continue;
    const payback = generatorPrice(s, d, i, 1) / gain;
    if (payback < bestPayback) {
      bestPayback = payback;
      best = i;
    }
  }
  return best;
}

/**
 * Buys the best-value generator while it is affordable, up to `limit` times.
 * Returns how many were bought. The caller recomputes Derived afterwards.
 */
export function autoBuyStep(s: GameState, d: Derived, limit = 10): number {
  if (!d.autoBuy || !s.autoBuyOn) return 0;
  let bought = 0;
  while (bought < limit) {
    const gen = bestGenerator(s, d);
    if (gen < 0 || generatorPrice(s, d, gen, 1) > s.stardust) break;
    if (buyGenerator(s, d, gen, 1) <= 0) break;
    bought++;
  }
  return bought;
}
