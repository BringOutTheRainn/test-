// Daily login reward with a 7 day streak.

import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

const REWARD_MINUTES = [10, 20, 30, 45, 60, 90, 180];

export function dayNumber(now: number): number {
  const offset = new Date(now).getTimezoneOffset() * 60000;
  return Math.floor((now - offset) / 86400000);
}

export function dailyReady(s: GameState, now = Date.now()): boolean {
  return s.dailyLastDay !== dayNumber(now);
}

/** The streak day (1 to 7) the next claim would be. */
export function nextStreakDay(s: GameState, now = Date.now()): number {
  const today = dayNumber(now);
  const streak = s.dailyLastDay === today - 1 ? s.dailyStreak + 1 : s.dailyLastDay === today ? s.dailyStreak : 1;
  return ((streak - 1) % 7) + 1;
}

export function dailyReward(s: GameState, d: Derived, day: number): number {
  const minutes = REWARD_MINUTES[day - 1];
  return Math.max(d.baseSps * minutes * 60, 50 * day * day);
}

export function rewardMinutes(day: number): number {
  return REWARD_MINUTES[day - 1];
}

export interface DailyClaim {
  day: number;
  streak: number;
  amount: number;
}

export function claimDaily(s: GameState, d: Derived, now = Date.now()): DailyClaim | null {
  if (!dailyReady(s, now)) return null;
  const today = dayNumber(now);
  s.dailyStreak = s.dailyLastDay === today - 1 ? s.dailyStreak + 1 : 1;
  s.dailyLastDay = today;
  const day = ((s.dailyStreak - 1) % 7) + 1;
  const amount = dailyReward(s, d, day);
  earn(s, amount);
  return { day, streak: s.dailyStreak, amount };
}
