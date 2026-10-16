// Star Pass: a four-week season of 30 tiers, in the style of the event passes
// in Idle Miner Tycoon and most live mobile games. XP comes from things the
// player already does (missions, comets, contracts, event badges, the daily
// drop, minigames, collapses), counted from cumulative counters so nothing
// has to report in. Every tier pays on the free track; the premium track
// (an in-app purchase per season) pays more, plus Medals and a skin.

import { dayNumber } from './daily.js';
import { earn, type Derived } from './economy.js';
import { weekNumber } from './contracts.js';
import type { GameState } from './state.js';

export const PASS_TIERS = 30;
export const XP_PER_TIER = 250;
export const SEASON_WEEKS = 4;
/** The skin the premium track awards at its last tier. */
export const PASS_SKIN = 'aurora';

/** XP per unit of each counter. */
export const XP_RATES = {
  missions: 20,
  comets: 3,
  dailies: 25,
  contractTiers: 40,
  badges: 40,
  harvests: 2,
  casts: 3,
  trades: 3,
  collapses: 60,
} as const;

type Counter = keyof typeof XP_RATES;

export interface PassState {
  season: number;
  /** Counter values at the start of the season. */
  base: Record<Counter, number>;
  /** Tiers claimed on each track. */
  free: number;
  prem: number;
  premium: boolean;
}

export interface PassReward {
  /** Minutes of base production. */
  minutes: number;
  crystals: number;
  medal: boolean;
  skin?: string;
}

function counters(s: GameState): Record<Counter, number> {
  return {
    missions: s.missionsDone,
    comets: s.cometsAll,
    dailies: s.dailyClaims,
    contractTiers: s.contractTiers,
    badges: s.badgesWon,
    harvests: s.gardenHarvests,
    casts: s.forgeCasts,
    trades: s.marketWins,
    collapses: s.collapses,
  };
}

export function seasonNumber(now = Date.now()): number {
  return Math.floor(weekNumber(now) / SEASON_WEEKS);
}

/** Ms until the season ends (Monday midnight, local time). */
export function seasonTimeLeft(now = Date.now()): number {
  const endWeek = (seasonNumber(now) + 1) * SEASON_WEEKS;
  // Week w starts on local day 7w - 3 (day 0 was a Thursday).
  const endDay = endWeek * 7 - 3;
  const daysLeft = endDay - dayNumber(now);
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysLeft).getTime() - now;
}

/** The live season's pass, started fresh when a new season begins. */
export function currentPass(s: GameState, now = Date.now()): PassState {
  const season = seasonNumber(now);
  if (!s.pass || s.pass.season !== season) {
    s.pass = { season, base: counters(s), free: 0, prem: 0, premium: false };
  }
  return s.pass;
}

export function passXp(s: GameState, p: PassState): number {
  const now = counters(s);
  let xp = 0;
  for (const k of Object.keys(XP_RATES) as Counter[]) xp += Math.max(0, now[k] - (p.base[k] ?? 0)) * XP_RATES[k];
  return xp;
}

export function passTier(s: GameState, p: PassState): number {
  return Math.min(PASS_TIERS, Math.floor(passXp(s, p) / XP_PER_TIER));
}

/** Reward for reaching tier t (1-based) on either track. */
export function tierReward(t: number, premium: boolean): PassReward {
  if (!premium) {
    return { minutes: 10 + t, crystals: t % 5 === 0 ? 1 : 0, medal: t === PASS_TIERS };
  }
  return {
    minutes: 2 * (10 + t),
    crystals: t % 3 === 0 ? 2 : 0,
    medal: t === 10 || t === 20,
    skin: t === PASS_TIERS ? PASS_SKIN : undefined,
  };
}

export function passClaimable(s: GameState, now = Date.now()): number {
  const p = currentPass(s, now);
  const tier = passTier(s, p);
  return Math.max(0, tier - p.free) + (p.premium ? Math.max(0, tier - p.prem) : 0);
}

export interface PassPayout {
  stardust: number;
  crystals: number;
  medals: number;
  skin?: string;
  tiers: number;
}

/** Claims every reached tier on both tracks. */
export function claimPass(s: GameState, d: Derived, now = Date.now()): PassPayout {
  const p = currentPass(s, now);
  const tier = passTier(s, p);
  const out: PassPayout = { stardust: 0, crystals: 0, medals: 0, tiers: 0 };
  const pay = (r: PassReward): void => {
    out.stardust += Math.max(d.baseSps * r.minutes * 60, 100 * r.minutes);
    out.crystals += r.crystals;
    if (r.medal) out.medals++;
    if (r.skin) out.skin = r.skin;
    out.tiers++;
  };
  while (p.free < tier) pay(tierReward(++p.free, false));
  if (p.premium) while (p.prem < tier) pay(tierReward(++p.prem, true));
  if (out.stardust) earn(s, out.stardust);
  s.crystals += out.crystals;
  s.contractMedals += out.medals;
  if (out.skin) {
    s.purchases[`skin_${out.skin}`] = 1;
    s.skin = out.skin;
  }
  return out;
}
