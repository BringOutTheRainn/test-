// Star Forge minigame, opened by levelling the Star Forge with a Quasar
// Crystal (Cookie Clicker's Grimoire opens the same way from Wizard Tower
// levels). Forge Heat refills in real time, even while away, and is spent on
// forgings: instant Stardust, a comet on demand, or short production and tap
// buffs. Smelting can fail, so heat is a bet as well as a timer.

import { addBuff } from './comets.js';
import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

/** Index of the Star Forge, whose levels open and grow the forge. */
export const FORGE_GEN = 9;
/** Minutes to refill from empty to full. */
export const REFILL_MINUTES = 120;
export const STOKE_COOLDOWN_HOURS = 4;
export const SMELT_MINUTES = 20;
export const SMELT_FAIL = 0.1;

export type SpellId = 'smelt' | 'lure' | 'overclock' | 'strike';

export interface Spell {
  id: SpellId;
  name: string;
  cost: number;
  desc: string;
}

export const SPELLS: Spell[] = [
  { id: 'smelt', name: 'Smelt Stardust', cost: 20, desc: `${SMELT_MINUTES} minutes of production at once. ${SMELT_FAIL * 100}% of melts fail.` },
  { id: 'lure', name: 'Comet Lure', cost: 25, desc: 'A comet streaks in right now.' },
  { id: 'overclock', name: 'Overclock', cost: 35, desc: 'Production x7 for 30 seconds.' },
  { id: 'strike', name: 'Supernova Strike', cost: 30, desc: 'Taps x777 for 13 seconds.' },
];

export function forgeUnlocked(s: GameState): boolean {
  return (s.genLevels[FORGE_GEN] ?? 0) >= 1;
}

export function maxHeat(s: GameState): number {
  const lvl = s.genLevels[FORGE_GEN] ?? 0;
  return lvl < 1 ? 0 : 40 + 10 * lvl;
}

/** Brings heat up to date. Starts full the first time the forge is opened. */
export function syncHeat(s: GameState, now = Date.now()): number {
  const max = maxHeat(s);
  if (max === 0) return 0;
  if (s.forgeHeatAt <= 0) {
    s.forgeHeat = max;
  } else {
    const gained = ((now - s.forgeHeatAt) / 60000) * (max / REFILL_MINUTES);
    s.forgeHeat = Math.min(max, s.forgeHeat + Math.max(0, gained));
  }
  s.forgeHeatAt = now;
  return s.forgeHeat;
}

/** Ms until the forge is full again. */
export function heatFullIn(s: GameState): number {
  const max = maxHeat(s);
  return max ? Math.max(0, ((max - s.forgeHeat) / (max / REFILL_MINUTES)) * 60000) : 0;
}

export function spellById(id: string): Spell | undefined {
  return SPELLS.find((x) => x.id === id);
}

export interface CastResult {
  ok: boolean;
  failed?: boolean;
  amount?: number;
}

export function cast(s: GameState, d: Derived, id: string, now = Date.now(), rng: () => number = Math.random): CastResult {
  const spell = spellById(id);
  if (!spell || !forgeUnlocked(s)) return { ok: false };
  syncHeat(s, now);
  if (s.forgeHeat < spell.cost) return { ok: false };
  s.forgeHeat -= spell.cost;
  s.forgeCasts++;
  switch (spell.id) {
    case 'smelt': {
      if (rng() < SMELT_FAIL) return { ok: true, failed: true };
      const amount = Math.max(d.baseSps * SMELT_MINUTES * 60, 100 * SMELT_MINUTES);
      earn(s, amount);
      return { ok: true, amount };
    }
    case 'lure':
      s.nextCometAt = s.time;
      return { ok: true };
    case 'overclock':
      addBuff(s, 'rush', 30);
      return { ok: true };
    case 'strike':
      addBuff(s, 'supernova', 13);
      return { ok: true };
  }
}

export function stokeReady(s: GameState, now = Date.now()): boolean {
  return forgeUnlocked(s) && now >= s.forgeAdAt && s.forgeHeat < maxHeat(s);
}

/** Rewarded ad: refills the forge, then a 4 hour cooldown. */
export function stoke(s: GameState, now = Date.now()): boolean {
  syncHeat(s, now);
  if (!stokeReady(s, now)) return false;
  s.forgeHeat = maxHeat(s);
  s.forgeAdAt = now + STOKE_COOLDOWN_HOURS * 3600000;
  s.adsWatched++;
  return true;
}
