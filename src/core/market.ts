// Warp Exchange: the third generator minigame, opened by levelling the Warp
// Gate with a Quasar Crystal (Cookie Clicker's Stock Market opens the same
// way from Bank levels). Four goods drift around a resting price every ten
// real minutes, even while away. Buy low, sell high: prices are in seconds of
// current base production, so goods keep their worth as the empire grows.

import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

/** Index of the Warp Gate, whose levels open the exchange and grow its hold. */
export const MARKET_GEN = 7;
export const TICK_MINUTES = 10;
/** Ticks caught up after time away: one day. */
export const MAX_CATCHUP = 144;
export const HISTORY = 36;
export const TIP_TICKS = 6;
export const TIP_COOLDOWN_HOURS = 4;

export interface Good {
  id: string;
  name: string;
  short: string;
  /** Resting price in seconds of base production. */
  rest: number;
  /** Typical move per tick. */
  vol: number;
}

export const GOODS: Good[] = [
  { id: 'ice', name: 'Comet Ice', short: 'Ice', rest: 8, vol: 0.5 },
  { id: 'ore', name: 'Iridium Ore', short: 'Ore', rest: 20, vol: 1.4 },
  { id: 'plasma', name: 'Neutron Plasma', short: 'Plasma', rest: 50, vol: 4 },
  { id: 'anti', name: 'Antimatter', short: 'Antimatter', rest: 120, vol: 11 },
];

export interface GoodState {
  price: number;
  trend: number;
  held: number;
  /** Average price paid for what is held. */
  avg: number;
  hist: number[];
}

export interface MarketState {
  /** Real-time ms of the last tick. */
  last: number;
  goods: GoodState[];
  /** Good with an insider tip, or -1. */
  tip: number;
  tipTicks: number;
  tipAt: number;
}

export function marketUnlocked(s: GameState): boolean {
  return (s.genLevels[MARKET_GEN] ?? 0) >= 1;
}

/** Hold space for each good: 50 at level 1, 25 more per level. */
export function holdSize(s: GameState): number {
  const lvl = s.genLevels[MARKET_GEN] ?? 0;
  return lvl < 1 ? 0 : 25 + 25 * lvl;
}

/** Stardust per credit: a second of base production. */
export function creditValue(d: Derived): number {
  return Math.max(d.baseSps, 1);
}

function tick(m: MarketState, rng: () => number): void {
  m.goods.forEach((g, i) => {
    const def = GOODS[i];
    if (m.tip === i && m.tipTicks > 0) g.trend = def.vol * 0.7;
    else {
      g.trend = g.trend * 0.85 + (rng() - 0.5) * def.vol * 0.6;
      // Now and then a rumour moves the whole market for a good.
      if (rng() < 0.04) g.trend = (rng() < 0.5 ? -1 : 1) * def.vol * (0.4 + 0.6 * rng());
    }
    g.price += g.trend + (rng() - 0.5) * def.vol + (def.rest - g.price) * 0.04;
    g.price = Math.max(def.rest * 0.15, Math.min(def.rest * 3, g.price));
    g.hist.push(g.price);
    if (g.hist.length > HISTORY) g.hist.splice(0, g.hist.length - HISTORY);
  });
  if (m.tipTicks > 0 && --m.tipTicks === 0) m.tip = -1;
}

/** The exchange, created on first open and caught up for time away. Null while locked. */
export function syncMarket(s: GameState, now = Date.now(), rng: () => number = Math.random): MarketState | null {
  if (!marketUnlocked(s)) return null;
  const step = TICK_MINUTES * 60000;
  if (!s.market) {
    s.market = {
      last: now,
      goods: GOODS.map((g) => ({ price: g.rest, trend: 0, held: 0, avg: 0, hist: [g.rest] })),
      tip: -1,
      tipTicks: 0,
      tipAt: 0,
    };
  }
  const m = s.market;
  const due = Math.floor((now - m.last) / step);
  if (due > 0) {
    for (let k = 0; k < Math.min(due, MAX_CATCHUP); k++) tick(m, rng);
    m.last += due * step;
  }
  return m;
}

/** Ms until prices move again. */
export function nextTickIn(m: MarketState, now = Date.now()): number {
  return Math.max(0, m.last + TICK_MINUTES * 60000 - now);
}

/** Most of a good that can be bought right now. */
export function maxBuy(s: GameState, d: Derived, m: MarketState, i: number): number {
  const g = m.goods[i];
  const space = holdSize(s) - g.held;
  return Math.max(0, Math.min(space, Math.floor(s.stardust / (g.price * creditValue(d)))));
}

/** Buys up to n of good i. Returns how many were bought. */
export function buyGood(s: GameState, d: Derived, i: number, n: number, now = Date.now()): number {
  const m = syncMarket(s, now);
  if (!m || i < 0 || i >= GOODS.length) return 0;
  const g = m.goods[i];
  const k = Math.min(Math.floor(n), maxBuy(s, d, m, i));
  if (k <= 0) return 0;
  s.stardust -= k * g.price * creditValue(d);
  g.avg = (g.avg * g.held + g.price * k) / (g.held + k);
  g.held += k;
  return k;
}

export interface Sale {
  sold: number;
  value: number;
  /** In credits; negative for a loss. */
  profit: number;
}

/** Sells up to n of good i. Only profit counts toward Stardust earned. */
export function sellGood(s: GameState, d: Derived, i: number, n: number, now = Date.now()): Sale {
  const m = syncMarket(s, now);
  const none = { sold: 0, value: 0, profit: 0 };
  if (!m || i < 0 || i >= GOODS.length) return none;
  const g = m.goods[i];
  const k = Math.min(Math.floor(n), g.held);
  if (k <= 0) return none;
  const unit = creditValue(d);
  const value = k * g.price * unit;
  const basis = k * g.avg * unit;
  if (value > basis) {
    s.stardust += basis;
    earn(s, value - basis);
  } else {
    s.stardust += value;
  }
  const profit = k * (g.price - g.avg);
  g.held -= k;
  if (g.held === 0) g.avg = 0;
  s.marketProfit += profit;
  if (profit > 0) s.marketWins++;
  return { sold: k, value, profit };
}

export function tipReady(m: MarketState, now = Date.now()): boolean {
  return now >= m.tipAt && m.tipTicks === 0;
}

/** Rewarded ad: the good furthest below its resting price rises for an hour. Returns its index. */
export function insiderTip(s: GameState, now = Date.now()): number {
  const m = syncMarket(s, now);
  if (!m || !tipReady(m, now)) return -1;
  let best = 0;
  m.goods.forEach((g, i) => {
    if (g.price / GOODS[i].rest < m.goods[best].price / GOODS[best].rest) best = i;
  });
  m.tip = best;
  m.tipTicks = TIP_TICKS;
  m.tipAt = now + TIP_COOLDOWN_HOURS * 3600000;
  s.adsWatched++;
  return best;
}

/** Sells everything held, as happens before a collapse. Returns the Stardust paid. */
export function sellAllGoods(s: GameState, d: Derived, now = Date.now()): number {
  if (!s.market) return 0;
  let total = 0;
  for (let i = 0; i < GOODS.length; i++) total += sellGood(s, d, i, Infinity, now).value;
  return total;
}

/** Credits' worth of goods held, at today's prices. */
export function heldValue(s: GameState): number {
  return s.market ? s.market.goods.reduce((n, g) => n + g.held * g.price, 0) : 0;
}
