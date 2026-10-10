// The whole game state is one plain object so it can be saved as JSON and
// tested without a browser. Everything that changes during play lives here.

import { GENERATORS } from '../data/generators.js';
import type { NumberStyle } from './format.js';

export const SAVE_VERSION = 1;

export type BuffKind = 'rush' | 'supernova' | 'well' | 'horizon';

export interface Buff {
  kind: BuffKind;
  /** Game-clock second the buff ends. */
  endsAt: number;
  duration: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  numberStyle: NumberStyle;
  particles: boolean;
}

export interface Expedition {
  id: string;
  /** Real-time milliseconds when the probe returns. */
  returnsAt: number;
  startedAt: number;
}

export interface GameState {
  version: number;
  stardust: number;
  /** Stardust earned in this universe (since the last collapse). */
  earnedRun: number;
  /** Stardust earned across every universe, including this one. */
  earnedAll: number;
  tapEarnedRun: number;
  tapEarnedAll: number;
  tapsRun: number;
  tapsAll: number;
  generators: number[];
  upgrades: Record<string, true>;
  achievements: Record<string, number>;
  cosmic: Record<string, true>;
  /** Total Dark Matter ever earned; drives the production bonus. */
  darkMatter: number;
  darkMatterSpent: number;
  collapses: number;
  cometsRun: number;
  cometsAll: number;
  buffs: Buff[];
  /** Game-clock second the next comet appears. */
  nextCometAt: number;
  /** Game clock in seconds; advances while playing and by offline time. */
  time: number;
  playSeconds: number;
  startedAt: number;
  runStartedAt: number;
  /** Game-clock second this universe began. */
  runStartClock: number;
  lastSeen: number;
  highestSps: number;
  offlineEarnedAll: number;
  relics: Record<string, number>;
  expeditions: Expedition[];
  expeditionsDone: number;
  dailyStreak: number;
  /** Day number (days since epoch, local) of the last daily claim. */
  dailyLastDay: number;
  seenHints: Record<string, true>;
  settings: Settings;
}

export function newState(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    stardust: 0,
    earnedRun: 0,
    earnedAll: 0,
    tapEarnedRun: 0,
    tapEarnedAll: 0,
    tapsRun: 0,
    tapsAll: 0,
    generators: GENERATORS.map(() => 0),
    upgrades: {},
    achievements: {},
    cosmic: {},
    darkMatter: 0,
    darkMatterSpent: 0,
    collapses: 0,
    cometsRun: 0,
    cometsAll: 0,
    buffs: [],
    nextCometAt: 90,
    time: 0,
    playSeconds: 0,
    startedAt: now,
    runStartedAt: now,
    runStartClock: 0,
    lastSeen: now,
    highestSps: 0,
    offlineEarnedAll: 0,
    relics: {},
    expeditions: [],
    expeditionsDone: 0,
    dailyStreak: 0,
    dailyLastDay: -1,
    seenHints: {},
    settings: { sound: true, music: true, vibration: true, numberStyle: 'short', particles: true },
  };
}

export function totalGenerators(s: GameState): number {
  let n = 0;
  for (const c of s.generators) n += c;
  return n;
}

export function achievementCount(s: GameState): number {
  return Object.keys(s.achievements).length;
}

export function upgradeCount(s: GameState): number {
  return Object.keys(s.upgrades).length;
}

export function darkMatterAvailable(s: GameState): number {
  return s.darkMatter - s.darkMatterSpent;
}
