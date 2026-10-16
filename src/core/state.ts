// The whole game state is one plain object so it can be saved as JSON and
// tested without a browser. Everything that changes during play lives here.

import { GENERATORS } from '../data/generators.js';
import type { NumberStyle } from './format.js';
import type { Mission } from './missions.js';
import type { ContractState } from './contracts.js';
import type { Plot } from './garden.js';
import type { EventState } from './event.js';
import type { PassState } from './pass.js';
import type { MarketState } from './market.js';

export const SAVE_VERSION = 1;

export type BuffKind = 'rush' | 'supernova' | 'well' | 'horizon' | 'frenzy';

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
  /** Reminder notifications, on the phone only. Off until the player opts in. */
  notifications: boolean;
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
  /** The anomaly this universe is running under, if any. */
  anomaly: string | null;
  anomaliesDone: Record<string, true>;
  /** Real-time ms when the ad-granted Hyperdrive (x2 production) ends. */
  hyperEndsAt: number;
  adsWatched: number;
  lastInterstitialAt: number;
  /** Set when the player buys ad removal; rewarded ads stay available. */
  noAds: boolean;
  missions: Mission[];
  missionsDone: number;
  /** Game-clock second the next Tap Frenzy can be started. */
  frenzyReadyAt: number;
  contract: ContractState | null;
  /** Each one is a permanent +5% production. */
  contractMedals: number;
  /** Player switch for Auto-Fabricators (the Cosmic upgrade). */
  autoBuyOn: boolean;
  crystals: number;
  /** Real-time ms the next Quasar Crystal finishes; 0 until unlocked. */
  crystalNextAt: number;
  crystalAdUsed: boolean;
  /** Permanent generator levels bought with crystals. */
  genLevels: number[];
  /** Nebula Garden plots; null is an empty plot. */
  garden: Array<Plot | null>;
  gardenHarvests: number;
  /** Real-time ms when the fertilize ad is available again. */
  gardenFertilizeAt: number;
  /** This weekend's event economy; replaced when a new weekend starts. */
  event: EventState | null;
  /** Gold badges won across all weekend events. */
  eventGolds: number;
  /** Star Forge heat, brought up to date lazily from forgeHeatAt (real ms). */
  forgeHeat: number;
  forgeHeatAt: number;
  forgeCasts: number;
  /** Real-time ms when the stoke ad is available again. */
  forgeAdAt: number;
  /** Warp Exchange prices and holdings; null until first opened. */
  market: MarketState | null;
  /** Credits gained (or lost) selling goods. */
  marketProfit: number;
  /** Sales made at a profit. */
  marketWins: number;
  /** Lucky Orbit: local day of the last reset, free spin unused, ad spins used today. */
  wheelDay: number;
  wheelFree: boolean;
  wheelAds: number;
  wheelSpins: number;
  /** Purchases by product id: how many times each was bought. */
  purchases: Record<string, number>;
  /** Celestial body skin id, or 'default'. */
  skin: string;
  /** Hours of production saved in the Stardust Vault. */
  vaultHours: number;
  /** Real-time ms of the last vault fill; 0 until it starts. */
  vaultAt: number;
  vaultsOpened: number;
  /** The starter offer pops up once on its own. */
  starterOffered: boolean;
  /** Star Pass for the current season. */
  pass: PassState | null;
  /** Cumulative counters the Star Pass reads. */
  dailyClaims: number;
  contractTiers: number;
  badgesWon: number;
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
    anomaly: null,
    anomaliesDone: {},
    hyperEndsAt: 0,
    adsWatched: 0,
    lastInterstitialAt: 0,
    noAds: false,
    missions: [],
    missionsDone: 0,
    frenzyReadyAt: 0,
    contract: null,
    contractMedals: 0,
    autoBuyOn: true,
    crystals: 0,
    crystalNextAt: 0,
    crystalAdUsed: false,
    genLevels: GENERATORS.map(() => 0),
    garden: [],
    gardenHarvests: 0,
    gardenFertilizeAt: 0,
    event: null,
    eventGolds: 0,
    forgeHeat: 0,
    forgeHeatAt: 0,
    forgeCasts: 0,
    forgeAdAt: 0,
    market: null,
    marketProfit: 0,
    marketWins: 0,
    wheelDay: -1,
    wheelFree: true,
    wheelAds: 0,
    wheelSpins: 0,
    purchases: {},
    skin: 'default',
    vaultHours: 0,
    vaultAt: 0,
    vaultsOpened: 0,
    starterOffered: false,
    pass: null,
    dailyClaims: 0,
    contractTiers: 0,
    badgesWon: 0,
    settings: { sound: true, music: true, vibration: true, numberStyle: 'short', particles: true, notifications: false },
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
