// Permanent perks bought with Dark Matter. They survive every collapse.

export type CosmicEffect =
  | { k: 'offlineRate'; value: number }
  | { k: 'offlineCapHours'; value: number }
  | { k: 'cometFreq'; mult: number }
  | { k: 'cometEffect'; mult: number }
  | { k: 'starter'; gen: number; count: number }
  | { k: 'dmBonus'; pct: number }
  | { k: 'achBonus'; pct: number }
  | { k: 'tapSps'; pct: number }
  | { k: 'autoTap'; perSecond: number }
  | { k: 'genDiscount'; pct: number }
  | { k: 'upgDiscount'; pct: number }
  | { k: 'blackComets' }
  | { k: 'expeditions' }
  | { k: 'expeditionSlots'; value: number }
  | { k: 'keepResearch' };

export interface CosmicDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires: string[];
  /** Column and row in the constellation tree, for the UI. */
  x: number;
  y: number;
  effects: CosmicEffect[];
}

export const COSMIC: CosmicDef[] = [
  { id: 'glow', name: 'Residual Glow', desc: 'Offline production rises from 25% to 50%.', cost: 1, requires: [], x: 2, y: 0, effects: [{ k: 'offlineRate', value: 0.5 }] },
  { id: 'seed', name: 'Seed Swarm', desc: 'Start every universe with 10 Mining Drones.', cost: 2, requires: ['glow'], x: 0, y: 1, effects: [{ k: 'starter', gen: 0, count: 10 }] },
  { id: 'magnet', name: 'Comet Magnet', desc: 'Comets appear 10% more often.', cost: 3, requires: ['glow'], x: 2, y: 1, effects: [{ k: 'cometFreq', mult: 1.1 }] },
  { id: 'fingers', name: 'Quantum Fingers', desc: 'Taps harvest an extra 2% of your Stardust per second.', cost: 5, requires: ['glow'], x: 4, y: 1, effects: [{ k: 'tapSps', pct: 0.02 }] },
  { id: 'kit', name: 'Starter Kit', desc: 'Also start with 5 Asteroid Harvesters and 2 Lunar Bases.', cost: 10, requires: ['seed'], x: 0, y: 2, effects: [{ k: 'starter', gen: 1, count: 5 }, { k: 'starter', gen: 2, count: 2 }] },
  { id: 'tails', name: 'Long Tails', desc: 'Comet effects last 10% longer.', cost: 7, requires: ['magnet'], x: 2, y: 2, effects: [{ k: 'cometEffect', mult: 1.1 }] },
  { id: 'probe', name: 'Autonomous Probe', desc: 'A probe taps the celestial body twice a second for you.', cost: 15, requires: ['fingers'], x: 4, y: 2, effects: [{ k: 'autoTap', perSecond: 2 }] },
  { id: 'cache', name: 'Event Horizon Cache', desc: 'Offline production 75%, and up to 16 hours.', cost: 20, requires: ['kit'], x: 1, y: 3, effects: [{ k: 'offlineRate', value: 0.75 }, { k: 'offlineCapHours', value: 16 }] },
  { id: 'black', name: 'Black Comets', desc: 'Rare black comets appear: huge rewards, small risks.', cost: 25, requires: ['tails'], x: 2, y: 3, effects: [{ k: 'blackComets' }] },
  { id: 'map', name: 'Constellation Map', desc: 'Achievements give 50% more production.', cost: 30, requires: ['probe'], x: 3, y: 3, effects: [{ k: 'achBonus', pct: 0.5 }] },
  { id: 'bay', name: 'Expedition Bay', desc: 'Unlocks Expeditions: send probes to distant systems for loot and Relics.', cost: 40, requires: ['cache'], x: 0, y: 4, effects: [{ k: 'expeditions' }] },
  { id: 'discount', name: 'Cosmic Discount', desc: 'Generators cost 5% less.', cost: 50, requires: ['black'], x: 2, y: 4, effects: [{ k: 'genDiscount', pct: 0.05 }] },
  { id: 'resonance', name: 'Dark Resonance', desc: 'Each Dark Matter gives +3% production instead of +2%.', cost: 75, requires: ['map'], x: 4, y: 4, effects: [{ k: 'dmBonus', pct: 0.01 }] },
  { id: 'timeless', name: 'Timeless Engines', desc: 'Offline production 100%, and up to 24 hours.', cost: 120, requires: ['cache'], x: 1, y: 5, effects: [{ k: 'offlineRate', value: 1 }, { k: 'offlineCapHours', value: 24 }] },
  { id: 'hangar', name: 'Second Hangar', desc: 'Run two Expeditions at once.', cost: 150, requires: ['bay'], x: 0, y: 6, effects: [{ k: 'expeditionSlots', value: 2 }] },
  { id: 'contracts', name: 'Bulk Contracts', desc: 'Upgrades cost 10% less.', cost: 200, requires: ['discount'], x: 2, y: 5, effects: [{ k: 'upgDiscount', pct: 0.1 }] },
  { id: 'echo', name: 'Research Echo', desc: 'Keep all Research upgrades when the universe collapses.', cost: 300, requires: ['contracts'], x: 2, y: 6, effects: [{ k: 'keepResearch' }] },
  { id: 'resonance2', name: 'Deep Resonance', desc: 'Each Dark Matter gives another +1% production.', cost: 500, requires: ['resonance'], x: 4, y: 5, effects: [{ k: 'dmBonus', pct: 0.01 }] },
  { id: 'probe2', name: 'Probe Fleet', desc: 'Probes tap 10 times a second.', cost: 777, requires: ['resonance2'], x: 4, y: 6, effects: [{ k: 'autoTap', perSecond: 8 }] },
  { id: 'hangar3', name: 'Third Hangar', desc: 'Run three Expeditions at once.', cost: 1000, requires: ['hangar'], x: 0, y: 7, effects: [{ k: 'expeditionSlots', value: 3 }] },
];

export const COSMIC_BY_ID: Record<string, CosmicDef> = Object.fromEntries(COSMIC.map((c) => [c.id, c]));
