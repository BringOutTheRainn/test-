// Entering, finishing and leaving anomalies.

import { ANOMALY_BY_ID } from '../data/anomalies.js';
import type { Derived } from './economy.js';
import { pendingDarkMatter, resetRun } from './prestige.js';
import type { GameState } from './state.js';

export function anomaliesUnlocked(s: GameState): boolean {
  return s.collapses > 0;
}

/**
 * Collapses into an anomaly. Any pending Dark Matter is collected first, as
 * in a normal collapse. Returns the Dark Matter gained, or -1 if not allowed.
 */
export function enterAnomaly(s: GameState, d: Derived, id: string, now = Date.now()): number {
  if (!ANOMALY_BY_ID[id] || s.anomaliesDone[id] || !anomaliesUnlocked(s)) return -1;
  const gained = pendingDarkMatter(s);
  if (gained >= 1) {
    s.darkMatter += gained;
    s.collapses++;
  }
  resetRun(s, d, now);
  s.anomaly = id;
  return gained;
}

/** Marks the active anomaly done when its goal is reached. Returns its id. */
export function checkAnomaly(s: GameState): string | null {
  const a = s.anomaly ? ANOMALY_BY_ID[s.anomaly] : undefined;
  if (!a || s.earnedRun < a.goal) return null;
  s.anomaliesDone[a.id] = true;
  s.anomaly = null;
  return a.id;
}

/** Leaves the anomaly by starting a normal universe (keeps pending Dark Matter rules). */
export function abandonAnomaly(s: GameState, d: Derived, now = Date.now()): number {
  if (!s.anomaly) return -1;
  const gained = pendingDarkMatter(s);
  if (gained >= 1) {
    s.darkMatter += gained;
    s.collapses++;
  }
  resetRun(s, d, now);
  s.anomaly = null;
  return gained;
}
