// What each purchase does to the game. Kept free of any store code so it can
// be tested and so the browser build can grant test purchases.

import { PRODUCT_BY_ID, SKINS } from '../data/store.js';
import { crystalsUnlocked } from './crystals.js';
import { earn, type Derived } from './economy.js';
import { currentEvent } from './event.js';
import { currentPass } from './pass.js';
import type { GameState } from './state.js';

export const SUPPORTER_MULT = 2;
export const STARTER_PCT = 0.1;
export const STARTER_HOURS = 4;
/** Hours the starter offer stays up after the first launch. */
export const STARTER_WINDOW_HOURS = 72;
/** The vault saves this many hours of production per real hour, up to the cap. */
export const VAULT_RATE = 0.25;
export const VAULT_CAP_HOURS = 12;
/** One bonus crystal per this many saved hours, once crystals are unlocked. */
export const VAULT_HOURS_PER_CRYSTAL = 4;

export function owns(s: GameState, id: string): boolean {
  return (s.purchases[id] ?? 0) > 0;
}

/** Permanent production multiplier from purchases. */
export function purchaseMult(s: GameState): number {
  let m = 1;
  if (owns(s, 'supporter_pack')) m *= SUPPORTER_MULT;
  if (owns(s, 'starter_pack')) m *= 1 + STARTER_PCT;
  return m;
}

export function starterOfferLeft(s: GameState, now = Date.now()): number {
  if (owns(s, 'starter_pack')) return 0;
  return Math.max(0, s.startedAt + STARTER_WINDOW_HOURS * 3600000 - now);
}

/** Fills the vault for the real time since the last check, including time away. */
export function fillVault(s: GameState, now = Date.now()): void {
  if (s.vaultAt > 0 && now > s.vaultAt) {
    s.vaultHours = Math.min(VAULT_CAP_HOURS, s.vaultHours + (VAULT_RATE * (now - s.vaultAt)) / 3600000);
  }
  s.vaultAt = now;
}

export function vaultValue(s: GameState, d: Derived): { stardust: number; crystals: number } {
  return {
    stardust: Math.max(d.baseSps, 1) * s.vaultHours * 3600,
    crystals: crystalsUnlocked(s) ? Math.floor(s.vaultHours / VAULT_HOURS_PER_CRYSTAL) : 0,
  };
}

/** Whether a product can be bought right now (non-consumables only once). */
export function canBuy(s: GameState, id: string, now = Date.now()): boolean {
  const p = PRODUCT_BY_ID[id];
  if (!p) return false;
  if (p.kind === 'nonconsumable' && owns(s, id)) return false;
  if (id === 'starter_pack') return starterOfferLeft(s, now) > 0;
  if (id === 'event_pass') {
    const e = currentEvent(s, now);
    return !!e && !e.pass;
  }
  if (id === 'vault_open') return s.vaultHours >= 1;
  if (id === 'star_pass') return !currentPass(s, now).premium;
  if (id.startsWith('crystals_')) return crystalsUnlocked(s);
  return true;
}

export interface Grant {
  stardust?: number;
  crystals?: number;
  text: string;
}

/**
 * Applies a completed purchase. Non-consumables are idempotent, so a store
 * that reports the same purchase twice (restore, restart) is harmless.
 */
export function grant(s: GameState, d: Derived, id: string, now = Date.now()): Grant | null {
  const p = PRODUCT_BY_ID[id];
  if (!p) return null;
  if (p.kind === 'nonconsumable' && owns(s, id)) return null;
  s.purchases[id] = (s.purchases[id] ?? 0) + 1;
  switch (id) {
    case 'supporter_pack':
      s.noAds = true;
      return { text: 'Thank you! Break ads are gone and production is doubled for good.' };
    case 'starter_pack': {
      const amount = Math.max(d.baseSps * STARTER_HOURS * 3600, 5000);
      earn(s, amount);
      s.crystals += 10;
      return { stardust: amount, crystals: 10, text: 'Starter Pack unlocked: +10% production forever.' };
    }
    case 'crystals_5': s.crystals += 5; return { crystals: 5, text: '5 Quasar Crystals added.' };
    case 'crystals_30': s.crystals += 30; return { crystals: 30, text: '30 Quasar Crystals added.' };
    case 'crystals_80': s.crystals += 80; return { crystals: 80, text: '80 Quasar Crystals added.' };
    case 'event_pass': {
      const e = currentEvent(s, now);
      if (e) e.pass = true;
      else s.crystals += 10; // The weekend ended mid-purchase: pay the crystals instead.
      return { text: e ? 'Event Pass active: double Flux and the Platinum badge.' : 'The event had ended, so you got 10 crystals instead.' };
    }
    case 'star_pass':
      currentPass(s, now).premium = true;
      return { text: 'Star Pass Premium unlocked for this season. Claim your premium rewards in Goals.' };
    case 'vault_open': {
      fillVault(s, now);
      const v = vaultValue(s, d);
      earn(s, v.stardust);
      s.crystals += v.crystals;
      s.vaultHours = 0;
      s.vaultsOpened++;
      return { stardust: v.stardust, crystals: v.crystals, text: 'The vault is open.' };
    }
  }
  if (id.startsWith('skin_')) {
    s.skin = id.slice(5);
    return { text: `${p.name} unlocked and applied.` };
  }
  return { text: `${p.name} unlocked.` };
}

export function skinFilter(s: GameState): string {
  return SKINS.find((k) => k.id === s.skin)?.filter ?? 'none';
}

export function setSkin(s: GameState, id: string): boolean {
  if (id !== 'default' && !owns(s, `skin_${id}`)) return false;
  s.skin = id;
  return true;
}
