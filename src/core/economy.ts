// Production, prices and purchases. Pure functions over GameState.

import { GENERATORS, COST_GROWTH } from '../data/generators.js';
import { UPGRADES, UPGRADE_BY_ID, type Effect, type UpgradeDef } from '../data/upgrades.js';
import { COSMIC, COSMIC_BY_ID, type CosmicEffect } from '../data/cosmic.js';
import { RELICS } from '../data/expeditions.js';
import { ANOMALIES, ANOMALY_BY_ID } from '../data/anomalies.js';
import { achievementCount, darkMatterAvailable, type GameState } from './state.js';

export const BUFF_MULT = { rush: 7, supernova: 777, well: 0.5, horizon: 66 } as const;
export const HYPER_MULT = 2;

/** Everything derived from purchases; recomputed when something is bought. */
export interface Derived {
  /** Production per generator type, after all multipliers except buffs. */
  genSps: number[];
  /** Base production per second without temporary buffs. */
  baseSps: number;
  /** Current production per second including buffs. */
  sps: number;
  tap: number;
  globalMult: number;
  prodBuff: number;
  tapBuff: number;
  cometFreq: number;
  cometStay: number;
  cometEffect: number;
  offlineRate: number;
  offlineCapHours: number;
  autoTap: number;
  genDiscount: number;
  upgDiscount: number;
  blackComets: boolean;
  expeditions: boolean;
  expeditionSlots: number;
  expSpeed: number;
  keepResearch: boolean;
  hyper: boolean;
  /** Anomaly rules for this universe. */
  noTaps: boolean;
  noComets: boolean;
  noUpgrades: boolean;
  costGrowth: number;
  /** Highest generator index that can be built. */
  maxGen: number;
}

function cosmicEffects(s: GameState): CosmicEffect[] {
  const out: CosmicEffect[] = [];
  for (const c of COSMIC) if (s.cosmic[c.id]) out.push(...c.effects);
  return out;
}

function upgradeEffects(s: GameState): Effect[] {
  const out: Effect[] = [];
  for (const id in s.upgrades) {
    const u = UPGRADE_BY_ID[id];
    if (u) out.push(...u.effects);
  }
  return out;
}

export function relicLevel(s: GameState, id: string): number {
  return s.relics[id] ?? 0;
}

export function computeDerived(s: GameState, now = Date.now()): Derived {
  const n = GENERATORS.length;
  const genMult = new Array<number>(n).fill(1);
  const synergy = new Array<number>(n).fill(0);
  let tapMult = 1;
  let tapSps = 0;
  let globalMult = 1;
  let droneFlat = 0;
  let droneFlatMult = 1;
  let cometFreq = 1;
  let cometStay = 1;
  let cometEffect = 1;
  let astronomerMult = 1;

  for (const e of upgradeEffects(s)) {
    switch (e.k) {
      case 'gen': genMult[e.gen] *= e.mult; break;
      case 'tap': tapMult *= e.mult; break;
      case 'tapSps': tapSps += e.pct; break;
      case 'global': globalMult *= 1 + e.pct; break;
      case 'droneFlat': droneFlat += e.amount; break;
      case 'droneFlatMult': droneFlatMult *= e.mult; break;
      case 'synergy': synergy[e.gen] += e.pct * s.generators[e.source]; break;
      case 'cometFreq': cometFreq *= e.mult; break;
      case 'cometStay': cometStay *= e.mult; break;
      case 'cometEffect': cometEffect *= e.mult; break;
      case 'astronomer': astronomerMult *= 1 + e.pct * achievementCount(s); break;
    }
  }

  let offlineRate = 0.25;
  let offlineCapHours = 8;
  let dmPct = 0.02;
  let achPct = 0.01;
  let autoTap = 0;
  let genDiscount = 0;
  let upgDiscount = 0;
  let blackComets = false;
  let expeditions = false;
  let expeditionSlots = 1;
  let keepResearch = false;
  for (const e of cosmicEffects(s)) {
    switch (e.k) {
      case 'offlineRate': offlineRate = Math.max(offlineRate, e.value); break;
      case 'offlineCapHours': offlineCapHours = Math.max(offlineCapHours, e.value); break;
      case 'cometFreq': cometFreq *= e.mult; break;
      case 'cometEffect': cometEffect *= e.mult; break;
      case 'dmBonus': dmPct += e.pct; break;
      case 'achBonus': achPct *= 1 + e.pct; break;
      case 'tapSps': tapSps += e.pct; break;
      case 'autoTap': autoTap += e.perSecond; break;
      case 'genDiscount': genDiscount += e.pct; break;
      case 'upgDiscount': upgDiscount += e.pct; break;
      case 'blackComets': blackComets = true; break;
      case 'expeditions': expeditions = true; break;
      case 'expeditionSlots': expeditionSlots = Math.max(expeditionSlots, e.value); break;
      case 'keepResearch': keepResearch = true; break;
      case 'starter': break;
    }
  }

  let relicTap = 1;
  let expSpeed = 1;
  for (const r of RELICS) {
    const lvl = relicLevel(s, r.id);
    if (!lvl) continue;
    const e = r.effect;
    switch (e.k) {
      case 'global': globalMult *= 1 + e.pct * lvl; break;
      case 'tap': relicTap *= 1 + e.pct * lvl; break;
      case 'cometFreq': cometFreq *= 1 + e.pct * lvl; break;
      case 'offline': offlineRate += e.pct * lvl; break;
      case 'expSpeed': expSpeed *= 1 + e.pct * lvl; break;
      case 'genDiscount': genDiscount += e.pct * lvl; break;
    }
  }

  let noTaps = false;
  let noComets = false;
  let noUpgrades = false;
  let costGrowth = COST_GROWTH;
  let maxGen = n - 1;
  const active = s.anomaly ? ANOMALY_BY_ID[s.anomaly] : undefined;
  for (const r of active?.rules ?? []) {
    switch (r.k) {
      case 'prodMult': globalMult *= r.mult; break;
      case 'noTaps': noTaps = true; break;
      case 'noComets': noComets = true; break;
      case 'noUpgrades': noUpgrades = true; break;
      case 'costGrowth': costGrowth = r.value; break;
      case 'maxGen': maxGen = r.index; break;
    }
  }
  for (const a of ANOMALIES) {
    if (!s.anomaliesDone[a.id]) continue;
    const r = a.reward;
    switch (r.k) {
      case 'global': globalMult *= 1 + r.pct; break;
      case 'tapMult': tapMult *= r.mult; break;
      case 'genDiscount': genDiscount += r.pct; break;
      case 'cometFreq': cometFreq *= r.mult; break;
      case 'droneMult': genMult[0] *= r.mult; break;
      case 'offline': offlineRate += r.pct; break;
    }
  }

  globalMult *= 1 + achPct * achievementCount(s);
  globalMult *= 1 + dmPct * s.darkMatter;
  globalMult *= astronomerMult;

  let nonDrone = 0;
  for (let i = 1; i < n; i++) nonDrone += s.generators[i];
  const flat = droneFlat * droneFlatMult * nonDrone;

  const genSps = new Array<number>(n).fill(0);
  let baseSps = 0;
  for (let i = 0; i < n; i++) {
    const owned = s.generators[i];
    if (!owned) continue;
    let per = GENERATORS[i].baseSps * genMult[i];
    if (i === 0) per += flat;
    per *= 1 + synergy[i];
    genSps[i] = per * owned * globalMult;
    baseSps += genSps[i];
  }

  let prodBuff = 1;
  let tapBuff = 1;
  for (const b of s.buffs) {
    if (b.kind === 'rush' || b.kind === 'well' || b.kind === 'horizon') prodBuff *= BUFF_MULT[b.kind];
    if (b.kind === 'supernova') tapBuff *= BUFF_MULT[b.kind];
  }
  const hyper = s.hyperEndsAt > now;
  if (hyper) prodBuff *= HYPER_MULT;
  const sps = baseSps * prodBuff;
  // Taps get the flat drone bonus and a share of production, but not the
  // global multiplier directly (it reaches them through the SPS share).
  const tap = noTaps ? 0 : ((1 * tapMult + flat) * relicTap + sps * tapSps) * tapBuff;

  return {
    genSps, baseSps, sps, tap, globalMult, prodBuff, tapBuff, cometFreq, cometStay, cometEffect, offlineRate: Math.min(offlineRate, 1.5),
    offlineCapHours, autoTap, genDiscount: Math.min(genDiscount, 0.5), upgDiscount: Math.min(upgDiscount, 0.5), blackComets, expeditions,
    expeditionSlots, expSpeed, keepResearch, hyper, noTaps, noComets, noUpgrades, costGrowth, maxGen,
  };
}

// ---------------------------------------------------------------- generators

export function generatorPrice(s: GameState, d: Derived, gen: number, amount = 1): number {
  const base = GENERATORS[gen].baseCost * (1 - d.genDiscount);
  const owned = s.generators[gen];
  // Geometric series: base * r^owned * (r^amount - 1) / (r - 1)
  const r = d.costGrowth;
  return Math.ceil(base * Math.pow(r, owned) * (Math.pow(r, amount) - 1) / (r - 1));
}

export function maxAffordable(s: GameState, d: Derived, gen: number): number {
  if (gen > d.maxGen) return 0;
  const base = GENERATORS[gen].baseCost * (1 - d.genDiscount);
  const r = d.costGrowth;
  const first = base * Math.pow(r, s.generators[gen]);
  if (s.stardust < first) return 0;
  let n = Math.floor(Math.log(s.stardust * (r - 1) / first + 1) / Math.log(r));
  // Correct for rounding at the edges.
  while (n > 0 && generatorPrice(s, d, gen, n) > s.stardust) n--;
  while (generatorPrice(s, d, gen, n + 1) <= s.stardust) n++;
  return n;
}

/** Buys `amount` copies (or as many as affordable when amount is 'max'). Returns how many were bought. */
export function buyGenerator(s: GameState, d: Derived, gen: number, amount: number | 'max'): number {
  if (gen > d.maxGen) return 0;
  const n = amount === 'max' ? maxAffordable(s, d, gen) : amount;
  if (n <= 0) return 0;
  const price = generatorPrice(s, d, gen, n);
  if (price > s.stardust) return 0;
  s.stardust -= price;
  s.generators[gen] += n;
  return n;
}

/** A generator is listed once the previous one has been bought (or it is the first). */
export function generatorVisible(s: GameState, gen: number): boolean {
  return gen === 0 || s.generators[gen] > 0 || s.generators[gen - 1] > 0;
}

/** Name and details are hidden until you can nearly afford it. */
export function generatorRevealed(s: GameState, gen: number): boolean {
  return gen === 0 || s.generators[gen] > 0 || s.earnedRun >= GENERATORS[gen].baseCost * 0.5;
}

// ---------------------------------------------------------------- upgrades

export function upgradePrice(d: Derived, u: UpgradeDef): number {
  return Math.ceil(u.cost * (1 - d.upgDiscount));
}

/** Upgrades you could buy now or soon, cheapest first. */
export function availableUpgrades(s: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => !s.upgrades[u.id] && u.unlock(s)).sort((a, b) => a.cost - b.cost);
}

export function buyUpgrade(s: GameState, d: Derived, id: string): boolean {
  const u = UPGRADE_BY_ID[id];
  if (!u || s.upgrades[id] || !u.unlock(s) || d.noUpgrades) return false;
  const price = upgradePrice(d, u);
  if (price > s.stardust) return false;
  s.stardust -= price;
  s.upgrades[id] = true;
  return true;
}

// ---------------------------------------------------------------- cosmic

export function cosmicAvailable(s: GameState, id: string): boolean {
  const c = COSMIC_BY_ID[id];
  return !!c && !s.cosmic[id] && c.requires.every((r) => s.cosmic[r]);
}

export function buyCosmic(s: GameState, id: string): boolean {
  const c = COSMIC_BY_ID[id];
  if (!c || !cosmicAvailable(s, id) || darkMatterAvailable(s) < c.cost) return false;
  s.darkMatterSpent += c.cost;
  s.cosmic[id] = true;
  return true;
}

// ---------------------------------------------------------------- earning

export function earn(s: GameState, amount: number): void {
  if (!(amount > 0)) return;
  s.stardust += amount;
  s.earnedRun += amount;
  s.earnedAll += amount;
}

/** One tap on the celestial body. Returns the Stardust it gave. */
export function tap(s: GameState, d: Derived): number {
  if (d.noTaps) return 0;
  const amount = d.tap;
  earn(s, amount);
  s.tapEarnedRun += amount;
  s.tapEarnedAll += amount;
  s.tapsRun++;
  s.tapsAll++;
  return amount;
}

/**
 * Advance the game clock by dt seconds: production and buff expiry.
 * Returns true when a buff ended, so the caller recomputes Derived.
 */
export function tick(s: GameState, d: Derived, dt: number): boolean {
  s.time += dt;
  s.playSeconds += dt;
  earn(s, d.sps * dt);
  if (d.sps > s.highestSps) s.highestSps = d.sps;
  const before = s.buffs.length;
  s.buffs = s.buffs.filter((b) => b.endsAt > s.time);
  return s.buffs.length !== before;
}
