// Awards achievements whose conditions are met.

import { ACHIEVEMENTS } from '../data/achievements.js';
import type { GameState } from './state.js';

/** Marks newly met achievements as earned and returns their ids. */
export function checkAchievements(s: GameState, sps: number, now = Date.now()): string[] {
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.id in s.achievements) continue;
    if (a.check(s, sps)) {
      s.achievements[a.id] = now;
      fresh.push(a.id);
    }
  }
  return fresh;
}

/** For achievements awarded by events rather than state checks. */
export function grantAchievement(s: GameState, id: string, now = Date.now()): boolean {
  if (id in s.achievements) return false;
  s.achievements[id] = now;
  return true;
}
