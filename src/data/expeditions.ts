// Expeditions send a probe away for real time and bring back Stardust and,
// sometimes, a Relic. Relics stack and give small permanent bonuses.

export interface DestinationDef {
  id: string;
  name: string;
  desc: string;
  minutes: number;
  /** Reward in minutes of current base production. */
  rewardMinutes: number;
  relicChance: number;
}

export const DESTINATIONS: DestinationDef[] = [
  { id: 'belt', name: 'Kuiper Belt Survey', desc: 'A quick hop to the outer belt.', minutes: 5, rewardMinutes: 15, relicChance: 0.05 },
  { id: 'dwarf', name: 'Red Dwarf Flyby', desc: 'Skim the corona of a sleepy star.', minutes: 30, rewardMinutes: 90, relicChance: 0.2 },
  { id: 'pulsar', name: 'Pulsar Field', desc: 'Dodge the beams, grab the spoils.', minutes: 120, rewardMinutes: 420, relicChance: 0.45 },
  { id: 'core', name: 'Galactic Core', desc: 'Where the oldest secrets orbit a monster.', minutes: 480, rewardMinutes: 1800, relicChance: 0.85 },
];

export type RelicEffect =
  | { k: 'global'; pct: number }
  | { k: 'tap'; pct: number }
  | { k: 'cometFreq'; pct: number }
  | { k: 'offline'; pct: number }
  | { k: 'expSpeed'; pct: number }
  | { k: 'genDiscount'; pct: number };

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  effect: RelicEffect;
}

export const RELICS: RelicDef[] = [
  { id: 'shard', name: 'Meteorite Shard', desc: '+3% Stardust production per level.', maxLevel: 25, effect: { k: 'global', pct: 0.03 } },
  { id: 'drill', name: 'Alien Drill Bit', desc: '+25% tap power per level.', maxLevel: 25, effect: { k: 'tap', pct: 0.25 } },
  { id: 'core', name: 'Frozen Comet Core', desc: 'Comets appear 4% more often per level.', maxLevel: 10, effect: { k: 'cometFreq', pct: 0.04 } },
  { id: 'void', name: 'Void Crystal', desc: '+5% offline production per level.', maxLevel: 10, effect: { k: 'offline', pct: 0.05 } },
  { id: 'glass', name: 'Chronoglass', desc: 'Expeditions return 5% faster per level.', maxLevel: 10, effect: { k: 'expSpeed', pct: 0.05 } },
  { id: 'coin', name: 'Precursor Coin', desc: 'Generators cost 1% less per level.', maxLevel: 10, effect: { k: 'genDiscount', pct: 0.01 } },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export const DESTINATION_BY_ID: Record<string, DestinationDef> = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
