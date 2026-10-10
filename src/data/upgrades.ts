// One-time purchases that multiply production. Most are generated from the
// generator list so adding a generator adds its upgrade line automatically.

import { GENERATORS } from './generators.js';
import type { GameState } from '../core/state.js';

export type Effect =
  | { k: 'gen'; gen: number; mult: number }
  | { k: 'tap'; mult: number }
  | { k: 'tapSps'; pct: number }
  | { k: 'global'; pct: number }
  | { k: 'droneFlat'; amount: number }
  | { k: 'droneFlatMult'; mult: number }
  | { k: 'synergy'; gen: number; source: number; pct: number }
  | { k: 'cometFreq'; mult: number }
  | { k: 'cometStay'; mult: number }
  | { k: 'cometEffect'; mult: number }
  | { k: 'astronomer'; pct: number };

export type UpgradeGroup = 'generator' | 'tap' | 'research' | 'synergy' | 'comet' | 'astronomer';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  group: UpgradeGroup;
  /** Icon key: a generator id, or 'tap', 'research', 'comet', 'synergy', 'astronomer'. */
  icon: string;
  tier: number;
  unlock: (s: GameState) => boolean;
  effects: Effect[];
}

const TIER_OWNED = [1, 5, 25, 50, 100, 150, 200, 250];
const TIER_COST = [10, 50, 500, 5e4, 5e6, 5e8, 5e11, 5e14];
const TIER_PREFIX = ['Reinforced', 'Overclocked', 'Quantum', 'Hyperdense', 'Exotic', 'Singularity', 'Transcendent', 'Omega'];

const PLURAL: Record<string, string> = {
  drone: 'Mining Drones', harvester: 'Asteroid Harvesters', lunar: 'Lunar Bases', station: 'Orbital Stations',
  siphon: 'Gas Giant Siphons', reactor: 'Fusion Reactors', dyson: 'Dyson Swarms', warp: 'Warp Gates',
  nebula: 'Nebula Refineries', forge: 'Star Forges', quasar: 'Quasar Taps', wormhole: 'Wormhole Networks',
  galaxy: 'Galaxy Engines', compiler: 'Universe Compilers',
};

export function pluralName(genIndex: number): string {
  return PLURAL[GENERATORS[genIndex].id];
}

const owns = (gen: number, n: number) => (s: GameState) => s.generators[gen] >= n;

function buildUpgrades(): UpgradeDef[] {
  const list: UpgradeDef[] = [];

  // Mining Drones: the first tiers also double taps, later ones add a flat
  // bonus for every other generator owned (the Cookie Clicker cursor line).
  const droneTiers: Array<[number, number, string, Effect[], string]> = [
    [1, 100, 'Reinforced Drills', [{ k: 'gen', gen: 0, mult: 2 }, { k: 'tap', mult: 2 }], 'Mining Drones and taps are twice as efficient.'],
    [1, 500, 'Carbide Bits', [{ k: 'gen', gen: 0, mult: 2 }, { k: 'tap', mult: 2 }], 'Mining Drones and taps are twice as efficient.'],
    [10, 10000, 'Plasma Cutters', [{ k: 'gen', gen: 0, mult: 2 }, { k: 'tap', mult: 2 }], 'Mining Drones and taps are twice as efficient.'],
    [25, 1e5, 'Swarm Protocol', [{ k: 'droneFlat', amount: 0.1 }], 'Mining Drones and taps gain +0.1 Stardust for each non-drone generator owned.'],
    [50, 1e7, 'Hive Mind', [{ k: 'droneFlatMult', mult: 5 }], 'Multiplies the Swarm Protocol bonus by 5.'],
    [100, 1e8, 'Collective Uplink', [{ k: 'droneFlatMult', mult: 10 }], 'Multiplies the Swarm Protocol bonus by 10.'],
    [150, 1e10, 'Noosphere', [{ k: 'droneFlatMult', mult: 20 }], 'Multiplies the Swarm Protocol bonus by 20.'],
    [200, 1e12, 'Omnipresence', [{ k: 'droneFlatMult', mult: 20 }], 'Multiplies the Swarm Protocol bonus by 20.'],
    [250, 1e14, 'Everywhere at Once', [{ k: 'droneFlatMult', mult: 20 }], 'Multiplies the Swarm Protocol bonus by 20.'],
  ];
  droneTiers.forEach(([n, cost, name, effects, desc], i) => {
    list.push({ id: `drone_${i}`, name, desc, cost, group: 'generator', icon: 'drone', tier: i, unlock: owns(0, n), effects });
  });

  for (let g = 1; g < GENERATORS.length; g++) {
    const def = GENERATORS[g];
    TIER_OWNED.forEach((n, t) => {
      list.push({
        id: `${def.id}_${t}`,
        name: `${TIER_PREFIX[t]} ${def.name}`,
        desc: `${pluralName(g)} are twice as efficient.`,
        cost: def.baseCost * TIER_COST[t],
        group: 'generator',
        icon: def.id,
        tier: t,
        unlock: owns(g, n),
        effects: [{ k: 'gen', gen: g, mult: 2 }],
      });
    });
  }

  // Gravity Gloves: each tap also gives a percent of production.
  const gloveNames = ['Gravity Gloves', 'Tidal Gauntlets', 'Graviton Grip', 'Event Horizon Palms', 'Spacetime Knuckles', 'Hand of the Cosmos', 'Big Bang Finger'];
  gloveNames.forEach((name, i) => {
    const need = Math.pow(10, 3 + i * 2);
    list.push({
      id: `tap_${i}`,
      name,
      desc: 'Each tap also harvests 1% of your Stardust per second.',
      cost: 50 * Math.pow(10, 3 + i * 2),
      group: 'tap',
      icon: 'tap',
      tier: i,
      unlock: (s) => s.tapEarnedRun >= need,
      effects: [{ k: 'tapSps', pct: 0.01 }],
    });
  });

  // Research: flat production multipliers gated by total Stardust earned.
  const researchNames = ['Star Charts', 'Spectral Analysis', 'Dark Flow Theory', 'Gravitational Lensing', 'Cosmic Inflation Models', 'Brane Cartography',
    'Vacuum Engineering', 'Entropy Reversal', 'Hyperspace Topology', 'Multiverse Accounting', 'Omega Point Studies', 'The Final Equation'];
  const researchPct = [0.05, 0.05, 0.1, 0.1, 0.15, 0.15, 0.2, 0.2, 0.25, 0.25, 0.3, 0.3];
  researchNames.forEach((name, i) => {
    const cost = 5 * Math.pow(10, 3 + i * 2);
    list.push({
      id: `research_${i}`,
      name,
      desc: `Stardust production +${Math.round(researchPct[i] * 100)}%.`,
      cost,
      group: 'research',
      icon: 'research',
      tier: i,
      unlock: (s) => s.earnedRun >= cost / 5,
      effects: [{ k: 'global', pct: researchPct[i] }],
    });
  });

  // Synergies: a cheaper generator gets +5% per copy of a pricier partner,
  // and the partner gets +0.1% per copy of the cheaper one.
  for (let a = 1; a + 2 < GENERATORS.length; a++) {
    const b = a + 2;
    const ga = GENERATORS[a];
    const gb = GENERATORS[b];
    list.push({
      id: `syn_${ga.id}_${gb.id}`,
      name: `${ga.name.split(' ').pop()}-${gb.name.split(' ').pop()} Link`,
      desc: `${pluralName(a)} +5% per ${gb.name}. ${pluralName(b)} +0.1% per ${ga.name}.`,
      cost: (ga.baseCost * 10 + gb.baseCost) * 30,
      group: 'synergy',
      icon: 'synergy',
      tier: a,
      unlock: (s) => s.generators[a] >= 15 && s.generators[b] >= 15,
      effects: [
        { k: 'synergy', gen: a, source: b, pct: 0.05 },
        { k: 'synergy', gen: b, source: a, pct: 0.001 },
      ],
    });
  }

  // Comet upgrades.
  const cometLine: Array<[number, number, string, Effect[], string]> = [
    [7, 7.777e6, 'Comet Lure', [{ k: 'cometFreq', mult: 2 }, { k: 'cometStay', mult: 2 }], 'Comets appear twice as often and stay twice as long.'],
    [27, 7.777e8, 'Tail Spotter', [{ k: 'cometFreq', mult: 2 }, { k: 'cometStay', mult: 2 }], 'Comets appear twice as often and stay twice as long.'],
    [77, 7.777e10, 'Long Exposure', [{ k: 'cometEffect', mult: 2 }], 'Comet effects last twice as long.'],
  ];
  cometLine.forEach(([n, cost, name, effects, desc], i) => {
    list.push({ id: `comet_${i}`, name, desc, cost, group: 'comet', icon: 'comet', tier: i, unlock: (s) => s.cometsAll >= n, effects });
  });

  // Astronomers: each achievement adds a percent of production.
  const astroNames = ['Junior Astronomer', 'Field Astronomer', 'Senior Astronomer', 'Chief Astronomer', 'Astronomer Royal', 'Cosmic Archivist'];
  const astroPct = [0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175];
  const astroNeed = [10, 25, 50, 75, 100, 125];
  astroNames.forEach((name, i) => {
    list.push({
      id: `astro_${i}`,
      name,
      desc: `Each achievement adds ${(astroPct[i] * 100).toFixed(2).replace(/0$/, '')}% Stardust production.`,
      cost: 9 * Math.pow(1000, i + 2),
      group: 'astronomer',
      icon: 'astronomer',
      tier: i,
      unlock: (s) => Object.keys(s.achievements).length >= astroNeed[i],
      effects: [{ k: 'astronomer', pct: astroPct[i] }],
    });
  });

  return list;
}

export const UPGRADES: UpgradeDef[] = buildUpgrades();
export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
