// Ad rewards and pacing rules. The ad SDK itself lives in ui/ads.ts.

import { AD_CONFIG } from '../data/ads.js';
import { eventActive } from './event.js';
import type { GameState } from './state.js';

/** Double weekends: rewarded boosts last twice as long while a weekend event runs. */
export function boostMult(now = Date.now()): number {
  return eventActive(now) ? 2 : 1;
}

export function hyperActive(s: GameState, now = Date.now()): boolean {
  return s.hyperEndsAt > now;
}

export function hyperRemainingMs(s: GameState, now = Date.now()): number {
  return Math.max(0, s.hyperEndsAt - now);
}

/** Can another Hyperdrive be stacked on? */
export function hyperCanStack(s: GameState, now = Date.now()): boolean {
  return hyperRemainingMs(s, now) + AD_CONFIG.hyperMinutes * 60000 * boostMult(now) <= AD_CONFIG.hyperCapMinutes * 60000 + 1000;
}

/** Reward for watching a Hyperdrive ad. */
export function grantHyper(s: GameState, now = Date.now()): void {
  const start = Math.max(now, s.hyperEndsAt);
  const cap = now + AD_CONFIG.hyperCapMinutes * 60000;
  s.hyperEndsAt = Math.min(cap, start + AD_CONFIG.hyperMinutes * 60000 * boostMult(now));
  s.adsWatched++;
}

export function frenzyReady(s: GameState): boolean {
  return s.time >= s.frenzyReadyAt && !s.buffs.some((b) => b.kind === 'frenzy');
}

/** Seconds of game time until Tap Frenzy can be used again. */
export function frenzyCooldown(s: GameState): number {
  return Math.max(0, s.frenzyReadyAt - s.time);
}

/** Reward for watching a Tap Frenzy ad. */
export function grantFrenzy(s: GameState, now = Date.now()): void {
  const secs = AD_CONFIG.frenzySeconds * boostMult(now);
  s.buffs = s.buffs.filter((b) => b.kind !== 'frenzy');
  s.buffs.push({ kind: 'frenzy', endsAt: s.time + secs, duration: secs });
  s.frenzyReadyAt = s.time + secs + AD_CONFIG.frenzyCooldownMinutes * 60;
  s.adsWatched++;
}

/** Whether a full-screen ad may be shown at a natural break right now. */
export function interstitialAllowed(s: GameState, now = Date.now()): boolean {
  if (s.noAds) return false;
  if (s.playSeconds < AD_CONFIG.interstitialAfterPlayMinutes * 60) return false;
  return now - s.lastInterstitialAt >= AD_CONFIG.interstitialGapMinutes * 60000;
}
