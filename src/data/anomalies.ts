// Anomalies: optional universes with a twisted rule. Reach the goal inside
// one to earn a permanent reward. Unlocked after the first collapse.

export type AnomalyRule =
  | { k: 'prodMult'; mult: number }
  | { k: 'noTaps' }
  | { k: 'costGrowth'; value: number }
  | { k: 'noComets' }
  | { k: 'maxGen'; index: number }
  | { k: 'noUpgrades' };

export type AnomalyReward =
  | { k: 'global'; pct: number }
  | { k: 'tapMult'; mult: number }
  | { k: 'genDiscount'; pct: number }
  | { k: 'cometFreq'; mult: number }
  | { k: 'droneMult'; mult: number }
  | { k: 'offline'; pct: number };

export interface AnomalyDef {
  id: string;
  name: string;
  rule: string;
  goal: number;
  rewardText: string;
  rules: AnomalyRule[];
  reward: AnomalyReward;
}

export const ANOMALIES: AnomalyDef[] = [
  { id: 'dim', name: 'Dim Universe', rule: 'All production is halved.', goal: 1e11, rewardText: '+10% production forever.',
    rules: [{ k: 'prodMult', mult: 0.5 }], reward: { k: 'global', pct: 0.1 } },
  { id: 'nohands', name: 'Hands Tied', rule: 'Tapping does nothing.', goal: 1e10, rewardText: 'Taps are 3 times stronger forever.',
    rules: [{ k: 'noTaps' }], reward: { k: 'tapMult', mult: 3 } },
  { id: 'lonely', name: 'Lonely Belt', rule: 'Only Mining Drones and Asteroid Harvesters can be built.', goal: 1e8, rewardText: 'Mining Drones are 3 times stronger forever.',
    rules: [{ k: 'maxGen', index: 1 }], reward: { k: 'droneMult', mult: 3 } },
  { id: 'inflation', name: 'Runaway Inflation', rule: 'Generator prices grow 22% per copy instead of 15%.', goal: 1e11, rewardText: 'Generators cost 5% less forever.',
    rules: [{ k: 'costGrowth', value: 1.22 }], reward: { k: 'genDiscount', pct: 0.05 } },
  { id: 'drought', name: 'Comet Drought', rule: 'No comets appear.', goal: 1e11, rewardText: 'Comets appear 20% more often forever.',
    rules: [{ k: 'noComets' }], reward: { k: 'cometFreq', mult: 1.2 } },
  { id: 'primitive', name: 'Primitive Physics', rule: 'Upgrades cannot be bought.', goal: 1e9, rewardText: '+25% offline production forever.',
    rules: [{ k: 'noUpgrades' }], reward: { k: 'offline', pct: 0.25 } },
];

export const ANOMALY_BY_ID: Record<string, AnomalyDef> = Object.fromEntries(ANOMALIES.map((a) => [a.id, a]));
