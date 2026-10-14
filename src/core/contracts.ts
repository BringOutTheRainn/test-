// Weekly contracts: one themed goal per week with three reward tiers, in the
// style of Egg, Inc. contracts. The top tier awards a Contract Medal, a
// permanent +5% production that survives every collapse.

import { dayNumber } from './daily.js';
import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

export type ContractCounter = 'comets' | 'taps' | 'missions';

export interface ContractDef {
  id: string;
  name: string;
  /** "Catch {n} comets" style text; {n} is replaced with the goal. */
  goalText: string;
  counter: ContractCounter;
  goals: [number, number, number];
}

export const CONTRACTS: ContractDef[] = [
  { id: 'comets', name: 'Comet Season', goalText: 'Catch {n} comets', counter: 'comets', goals: [20, 50, 100] },
  { id: 'taps', name: 'Tap Marathon', goalText: 'Tap {n} times', counter: 'taps', goals: [1500, 5000, 12000] },
  { id: 'missions', name: 'Busy Fleet', goalText: 'Complete {n} missions', counter: 'missions', goals: [8, 20, 40] },
];

/** Reward per tier: minutes of base production. Tier 3 also gives a Medal. */
export const TIER_MINUTES = [30, 90, 240];
export const MEDAL_PCT = 0.05;

export interface ContractState {
  week: number;
  /** Counter value when the player first saw this week's contract. */
  start: number;
  /** Tiers already claimed, 0 to 3. */
  claimed: number;
}

/** Weeks start on Monday, local time. Day 0 (1 Jan 1970) was a Thursday. */
export function weekNumber(now = Date.now()): number {
  return Math.floor((dayNumber(now) + 3) / 7);
}

/** Milliseconds until this week's contract ends (next Monday, local midnight). */
export function contractTimeLeft(now = Date.now()): number {
  const d = new Date(now);
  const daysToMonday = (8 - d.getDay()) % 7 || 7;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToMonday);
  return end.getTime() - now;
}

export function contractFor(week: number): ContractDef {
  return CONTRACTS[((week % CONTRACTS.length) + CONTRACTS.length) % CONTRACTS.length];
}

function counter(s: GameState, c: ContractCounter): number {
  return c === 'comets' ? s.cometsAll : c === 'taps' ? s.tapsAll : s.missionsDone;
}

/** Starts this week's contract when the week has turned. Returns the live one. */
export function currentContract(s: GameState, now = Date.now()): { def: ContractDef; state: ContractState } {
  const week = weekNumber(now);
  const def = contractFor(week);
  if (!s.contract || s.contract.week !== week) s.contract = { week, start: counter(s, def.counter), claimed: 0 };
  return { def, state: s.contract };
}

export function contractProgress(s: GameState, now = Date.now()): number {
  const { def, state } = currentContract(s, now);
  return Math.max(0, counter(s, def.counter) - state.start);
}

/** Tiers reached but not yet claimed. */
export function contractClaimable(s: GameState, now = Date.now()): number {
  const { def, state } = currentContract(s, now);
  const p = contractProgress(s, now);
  return def.goals.filter((g) => p >= g).length - state.claimed;
}

export function tierReward(d: Derived, tier: number): number {
  return Math.max(d.baseSps * TIER_MINUTES[tier] * 60, 1000 * (tier + 1));
}

/** Claims the next reached tier. Returns the Stardust paid and whether a Medal was won. */
export function claimContract(s: GameState, d: Derived, now = Date.now()): { amount: number; tier: number; medal: boolean } | null {
  if (contractClaimable(s, now) <= 0) return null;
  const st = s.contract!;
  const tier = st.claimed;
  const amount = tierReward(d, tier);
  earn(s, amount);
  st.claimed++;
  s.contractTiers++;
  const medal = tier === 2;
  if (medal) s.contractMedals++;
  return { amount, tier, medal };
}
