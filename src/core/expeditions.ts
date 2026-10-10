// Expeditions: timed trips that return Stardust and Relics.

import { DESTINATION_BY_ID, RELICS, RELIC_BY_ID, type DestinationDef } from '../data/expeditions.js';
import { earn, type Derived } from './economy.js';
import type { GameState } from './state.js';

export function expeditionDurationMs(d: Derived, dest: DestinationDef): number {
  return Math.round((dest.minutes * 60000) / d.expSpeed);
}

export function freeSlots(s: GameState, d: Derived): number {
  return Math.max(0, d.expeditionSlots - s.expeditions.length);
}

export function startExpedition(s: GameState, d: Derived, destId: string, now = Date.now()): boolean {
  const dest = DESTINATION_BY_ID[destId];
  if (!dest || !d.expeditions || freeSlots(s, d) <= 0) return false;
  s.expeditions.push({ id: destId, startedAt: now, returnsAt: now + expeditionDurationMs(d, dest) });
  return true;
}

export function expeditionReward(d: Derived, dest: DestinationDef): number {
  return Math.max(d.baseSps * dest.rewardMinutes * 60, 200 * dest.rewardMinutes);
}

export interface ExpeditionResult {
  destId: string;
  stardust: number;
  relic: string | null;
  relicLevel: number;
}

/** Collects every probe that has returned. */
export function collectExpeditions(s: GameState, d: Derived, now = Date.now(), rng: () => number = Math.random): ExpeditionResult[] {
  const done = s.expeditions.filter((e) => e.returnsAt <= now);
  if (!done.length) return [];
  s.expeditions = s.expeditions.filter((e) => e.returnsAt > now);
  const results: ExpeditionResult[] = [];
  for (const e of done) {
    const dest = DESTINATION_BY_ID[e.id];
    if (!dest) continue;
    const stardust = expeditionReward(d, dest);
    earn(s, stardust);
    s.expeditionsDone++;
    let relic: string | null = null;
    if (rng() < dest.relicChance) {
      const open = RELICS.filter((r) => (s.relics[r.id] ?? 0) < r.maxLevel);
      if (open.length) {
        const pick = open[Math.floor(rng() * open.length) % open.length];
        s.relics[pick.id] = (s.relics[pick.id] ?? 0) + 1;
        relic = pick.id;
      }
    }
    results.push({ destId: e.id, stardust, relic, relicLevel: relic ? s.relics[relic] : 0 });
  }
  return results;
}

export function relicName(id: string): string {
  return RELIC_BY_ID[id]?.name ?? id;
}
