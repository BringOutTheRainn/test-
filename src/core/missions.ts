// Missions: three short goals at a time, each paying a burst of Stardust.
// They give every session something concrete to aim for. A new universe
// (collapse or anomaly) starts a fresh set.

import { GENERATORS } from '../data/generators.js';
import { pluralName } from '../data/upgrades.js';
import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

export type MissionKind = 'own' | 'taps' | 'comets' | 'earn';

export interface Mission {
  kind: MissionKind;
  /** Generator index, for 'own' missions. */
  gen?: number;
  target: number;
  /** Counter value when the mission was given; progress counts from here. */
  start: number;
  /** Reward, in minutes of base production. */
  minutes: number;
}

export const MISSION_SLOTS = 3;

type Rng = () => number;

function counter(s: GameState, m: Mission): number {
  switch (m.kind) {
    case 'own': return s.generators[m.gen ?? 0] ?? 0;
    case 'taps': return s.tapsAll;
    case 'comets': return s.cometsAll;
    case 'earn': return s.earnedAll;
  }
}

/** How far along the mission is, from 0 up to its target. */
export function missionProgress(s: GameState, m: Mission): number {
  const now = counter(s, m);
  return Math.min(m.target, Math.max(0, m.kind === 'own' ? now : now - m.start));
}

export function missionDone(s: GameState, m: Mission): boolean {
  return missionProgress(s, m) >= m.target;
}

export function missionReward(d: Derived, m: Mission): number {
  return Math.max(d.baseSps * m.minutes * 60, 100 * m.minutes);
}

export function claimableMissions(s: GameState): number {
  return s.missions.filter((m) => missionDone(s, m)).length;
}

function pick<T>(list: T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Makes a mission that is not already on the board. */
export function makeMission(s: GameState, d: Derived, rng: Rng = Math.random): Mission {
  const level = Math.min(10, Math.floor(s.missionsDone / 5));
  const taken = new Set(s.missions.map((m) => `${m.kind}:${m.gen ?? ''}`));
  for (let attempt = 0; attempt < 20; attempt++) {
    const kinds: MissionKind[] = ['own', 'own', 'own', 'earn', 'earn'];
    if (!d.noTaps) kinds.push('taps', 'taps');
    if (!d.noComets && s.time > 120) kinds.push('comets');
    const kind = pick(kinds, rng);
    let m: Mission;
    if (kind === 'own') {
      // Any generator owned so far, or the next one up.
      let top = 0;
      s.generators.forEach((n, i) => { if (n > 0) top = i; });
      const choices: number[] = [];
      for (let i = 0; i <= Math.min(top + 1, GENERATORS.length - 1); i++) if (i <= d.maxGen) choices.push(i);
      const gen = choices.length ? pick(choices, rng) : 0;
      const owned = s.generators[gen];
      const step = owned === 0 ? 1 : Math.max(5, Math.round(owned * 0.15));
      m = { kind, gen, target: owned + step, start: owned, minutes: owned === 0 ? 5 : 3 };
    } else if (kind === 'taps') {
      m = { kind, target: Math.min(600, 50 + 25 * level), start: s.tapsAll, minutes: 3 };
    } else if (kind === 'comets') {
      m = { kind, target: 1 + Math.floor(rng() * 2), start: s.cometsAll, minutes: 6 };
    } else {
      const mins = 10 + Math.floor(rng() * 21);
      m = { kind, target: Math.max(500, d.baseSps * mins * 60), start: s.earnedAll, minutes: Math.round(mins / 4) };
    }
    if (!taken.has(`${m.kind}:${m.gen ?? ''}`)) return m;
  }
  return { kind: 'earn', target: Math.max(500, d.baseSps * 900), start: s.earnedAll, minutes: 4 };
}

/** Fills empty mission slots. Returns true if anything was added. */
export function ensureMissions(s: GameState, d: Derived, rng: Rng = Math.random): boolean {
  let added = false;
  while (s.missions.length < MISSION_SLOTS) {
    s.missions.push(makeMission(s, d, rng));
    added = true;
  }
  return added;
}

/** Claims a finished mission and replaces it. Returns the Stardust paid. */
export function claimMission(s: GameState, d: Derived, i: number, rng: Rng = Math.random): number {
  const m = s.missions[i];
  if (!m || !missionDone(s, m)) return 0;
  const amount = missionReward(d, m);
  earn(s, amount);
  s.missionsDone++;
  replaceMission(s, d, i, rng);
  return amount;
}

/** Swaps an unfinished mission for a new one (paid for with a rewarded ad). */
export function swapMission(s: GameState, d: Derived, i: number, rng: Rng = Math.random): boolean {
  if (!s.missions[i]) return false;
  replaceMission(s, d, i, rng);
  return true;
}

/** Puts a different kind of mission in slot i, when one is available. */
function replaceMission(s: GameState, d: Derived, i: number, rng: Rng): void {
  const [old] = s.missions.splice(i, 1);
  let next = makeMission(s, d, rng);
  for (let n = 0; n < 5 && next.kind === old.kind && next.gen === old.gen; n++) next = makeMission(s, d, rng);
  s.missions.splice(i, 0, next);
}

export function describeMission(m: Mission, fmt: (n: number) => string): string {
  switch (m.kind) {
    case 'own': {
      const g = GENERATORS[m.gen ?? 0];
      return m.target === 1 ? `Build your first ${g.name}` : `Own ${m.target} ${pluralName(m.gen ?? 0)}`;
    }
    case 'taps': return `Tap ${m.target} times`;
    case 'comets': return m.target === 1 ? 'Catch a comet' : `Catch ${m.target} comets`;
    case 'earn': return `Harvest ${fmt(m.target)} Stardust`;
  }
}
