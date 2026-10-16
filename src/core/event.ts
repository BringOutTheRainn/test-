// Weekend events: a short side economy that opens from Friday to Sunday
// (local time), in the style of AdVenture Capitalist's event planets and
// Idle Miner Tycoon's badge tiers. Flux is earned by tapping the rift and by
// four event generators, keeps flowing while away, and is wiped when the
// weekend ends. Badges pay Stardust; Gold also awards a Contract Medal.

import { earn, type Derived } from './economy.js';
import { weekNumber } from './contracts.js';
import type { GameState } from './state.js';

export interface EventGen {
  id: string;
  name: string;
  baseCost: number;
  /** Flux per second each. */
  rate: number;
}

export const EVENT_GENS: EventGen[] = [
  { id: 'skimmer', name: 'Flux Skimmer', baseCost: 10, rate: 1 },
  { id: 'funnel', name: 'Ion Funnel', baseCost: 250, rate: 12 },
  { id: 'loom', name: 'Plasma Loom', baseCost: 8000, rate: 150 },
  { id: 'engine', name: 'Rift Engine', baseCost: 300000, rate: 2500 },
];

export const EVENT_GROWTH = 1.25;

export interface EventTheme {
  name: string;
  flavor: string;
}

export const EVENT_THEMES: EventTheme[] = [
  { name: 'Solar Flare Weekend', flavor: 'The sun is throwing a tantrum. Catch what it throws.' },
  { name: 'Ion Storm', flavor: 'Charged clouds roll through the sector. Bottle the lightning.' },
  { name: 'Meteor Bazaar', flavor: 'A swarm of glittering rocks, and everyone wants a piece.' },
];

/** Badges by Flux earned this event: Bronze, Silver, Gold, and Platinum with the Event Pass. */
export const BADGE_GOALS = [5e4, 1e8, 5e9, 5e10];
export const BADGE_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum'];
/** Badge rewards in minutes of base production. Gold also gives a Medal, Platinum 10 crystals. */
export const BADGE_MINUTES = [30, 120, 360, 720];
export const GOLD_TIER = 2;
export const PLATINUM_CRYSTALS = 10;
export const EVENT_AD_MINUTES = 10;
export const EVENT_AD_COOLDOWN_MINUTES = 120;

export interface EventState {
  week: number;
  flux: number;
  earned: number;
  gens: number[];
  /** Real-time ms of the last Flux update. */
  last: number;
  /** Badges already claimed, 0 to 3. */
  claimed: number;
  adReadyAt: number;
  /** Event Pass bought for this weekend: double Flux and the Platinum badge. */
  pass?: boolean;
}

/** Badges this player can win this weekend. */
export function badgeCount(e: EventState): number {
  return e.pass ? BADGE_GOALS.length : GOLD_TIER + 1;
}

/** Friday, Saturday and Sunday, local time. */
export function eventActive(now = Date.now()): boolean {
  const day = new Date(now).getDay();
  return day === 5 || day === 6 || day === 0;
}

/** Ms until the event ends (when active) or starts (when not). */
export function eventTimeLeft(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getDay();
  // Days until Monday when active, until Friday when not.
  const add = eventActive(now) ? (8 - day) % 7 || 7 : (5 - day + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + add).getTime() - now;
}

export function eventTheme(week: number): EventTheme {
  return EVENT_THEMES[((week % EVENT_THEMES.length) + EVENT_THEMES.length) % EVENT_THEMES.length];
}

/** Events open once the player has a real economy going. */
export function eventUnlocked(s: GameState): boolean {
  return s.earnedAll >= 1e6 || s.collapses > 0;
}

export function eventRate(e: EventState): number {
  return EVENT_GENS.reduce((sum, g, i) => sum + g.rate * (e.gens[i] ?? 0), 0) * (e.pass ? 2 : 1);
}

export function eventTap(e: EventState): number {
  return (e.pass ? 2 : 1) + eventRate(e) * 0.05;
}

export function eventPrice(e: EventState, i: number): number {
  return Math.ceil(EVENT_GENS[i].baseCost * EVENT_GROWTH ** (e.gens[i] ?? 0));
}

/**
 * The live event, started fresh when a new weekend opens and caught up for
 * time away. Null outside the weekend or before the player unlocks events.
 */
export function currentEvent(s: GameState, now = Date.now()): EventState | null {
  if (!eventActive(now) || !eventUnlocked(s)) return null;
  const week = weekNumber(now);
  if (!s.event || s.event.week !== week) {
    s.event = { week, flux: 0, earned: 0, gens: EVENT_GENS.map(() => 0), last: now, claimed: 0, adReadyAt: 0 };
  }
  const e = s.event;
  const dt = Math.max(0, (now - e.last) / 1000);
  if (dt > 0) {
    addFlux(e, eventRate(e) * dt);
    e.last = now;
  }
  return e;
}

function addFlux(e: EventState, amount: number): void {
  e.flux += amount;
  e.earned += amount;
}

export function eventTapOnce(e: EventState): number {
  const n = eventTap(e);
  addFlux(e, n);
  return n;
}

export function buyEventGen(e: EventState, i: number): boolean {
  if (i < 0 || i >= EVENT_GENS.length) return false;
  const price = eventPrice(e, i);
  if (e.flux < price) return false;
  e.flux -= price;
  e.gens[i] = (e.gens[i] ?? 0) + 1;
  return true;
}

export function badgeReady(e: EventState): boolean {
  return e.claimed < badgeCount(e) && e.earned >= BADGE_GOALS[e.claimed];
}

export function badgeReward(d: Derived, tier: number): number {
  return Math.max(d.baseSps * BADGE_MINUTES[tier] * 60, 100 * BADGE_MINUTES[tier]);
}

/** Claims the next badge. Returns the Stardust paid, or 0. */
export function claimBadge(s: GameState, d: Derived, e: EventState): number {
  if (!badgeReady(e)) return 0;
  const tier = e.claimed;
  const amount = badgeReward(d, tier);
  earn(s, amount);
  e.claimed++;
  s.badgesWon++;
  if (tier === GOLD_TIER) {
    s.contractMedals++;
    s.eventGolds++;
  }
  if (tier === GOLD_TIER + 1) s.crystals += PLATINUM_CRYSTALS;
  return amount;
}

/** Rewarded ad: 30 minutes of event production at once, every 2 hours. */
export function eventAdReady(e: EventState, now = Date.now()): boolean {
  return now >= e.adReadyAt;
}

export function eventAdBoost(e: EventState, now = Date.now()): number {
  if (!eventAdReady(e, now)) return 0;
  const n = Math.max(eventRate(e), 1) * EVENT_AD_MINUTES * 60;
  addFlux(e, n);
  e.adReadyAt = now + EVENT_AD_COOLDOWN_MINUTES * 60000;
  return n;
}

/** Day of the event, 1 to 3, for display. */
export function eventDay(now = Date.now()): number {
  const day = new Date(now).getDay();
  return day === 0 ? 3 : day - 4;
}
