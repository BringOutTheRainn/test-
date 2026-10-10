// Achievements. Each one earned adds +1% Stardust production.

import { GENERATORS } from './generators.js';
import { pluralName } from './upgrades.js';
import { totalGenerators, upgradeCount, type GameState } from '../core/state.js';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Hidden achievements show as "???" until earned. */
  hidden?: boolean;
  check: (s: GameState, sps: number) => boolean;
}

function short(n: number): string {
  const names: Array<[number, string]> = [[1e33, 'decillion'], [1e30, 'nonillion'], [1e27, 'octillion'], [1e24, 'septillion'], [1e21, 'sextillion'],
    [1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [v, name] of names) if (n >= v) return `${n / v} ${name}`;
  return n.toLocaleString('en-US');
}

function build(): AchievementDef[] {
  const list: AchievementDef[] = [];

  const earned: Array<[number, string]> = [
    [1, 'First Speck'], [1000, 'Dust Bunny'], [1e5, 'Cloud of Dust'], [1e6, 'Millionaire Miner'], [1e8, 'Dust Storm'],
    [1e9, 'Billionaire Belt'], [1e11, 'Planetary Mass'], [1e12, 'Trillion Twinkles'], [1e14, 'Stellar Nursery'], [1e15, 'Quadrillion Quarry'],
    [1e18, 'Galactic Hoard'], [1e21, 'Cluster Wealth'], [1e24, 'Supercluster'], [1e27, 'Cosmic Web'], [1e30, 'Observable Universe'], [1e33, 'Beyond the Horizon'],
  ];
  earned.forEach(([n, name], i) => {
    list.push({ id: `earn_${i}`, name, desc: `Earn ${short(n)} Stardust in one universe.`, check: (s) => s.earnedRun >= n });
  });

  const sps: Array<[number, string]> = [
    [1, 'Trickle'], [10, 'Stream'], [100, 'Current'], [1000, 'River of Stars'], [1e4, 'Solar Wind'], [1e5, 'Stellar Flood'],
    [1e6, 'Million per Second'], [1e8, 'Torrent'], [1e10, 'Cascade'], [1e12, 'Big Bang Lite'], [1e14, 'Cosmic Firehose'], [1e16, 'Infinite Flow'],
  ];
  sps.forEach(([n, name], i) => {
    list.push({ id: `sps_${i}`, name, desc: `Reach ${short(n)} Stardust per second.`, check: (_s, rate) => rate >= n });
  });

  const taps: Array<[number, string]> = [[1, 'First Contact'], [100, 'Tapper'], [1000, 'Dedicated Tapper'], [10000, 'Tap Dancer'], [50000, 'Finger of God']];
  taps.forEach(([n, name], i) => {
    list.push({ id: `taps_${i}`, name, desc: `Tap the celestial body ${n.toLocaleString('en-US')} time${n === 1 ? '' : 's'}.`, check: (s) => s.tapsAll >= n });
  });

  const tapEarn: Array<[number, string]> = [[1000, 'Handpicked'], [1e5, 'Hand Miner'], [1e7, 'Iron Fist'], [1e9, 'Golden Touch'], [1e11, 'Midas of the Void'], [1e13, 'Tap Titan']];
  tapEarn.forEach(([n, name], i) => {
    list.push({ id: `tapearn_${i}`, name, desc: `Harvest ${short(n)} Stardust by tapping in one universe.`, check: (s) => s.tapEarnedRun >= n });
  });

  const ownLevels: Array<[number, string]> = [[1, ''], [50, 'Fleet'], [100, 'Armada'], [200, 'Empire']];
  GENERATORS.forEach((g, gi) => {
    ownLevels.forEach(([n, suffix], li) => {
      const name = n === 1 ? `First ${g.name}` : `${g.name.split(' ').pop()} ${suffix}`;
      list.push({ id: `own_${g.id}_${li}`, name, desc: `Own ${n} ${n === 1 ? g.name : pluralName(gi)}.`, check: (s) => s.generators[gi] >= n });
    });
  });

  const total: Array<[number, string]> = [[100, 'Busy Sector'], [500, 'Industrial System'], [1000, 'Machine Galaxy'], [2000, 'Gray Goo Adjacent']];
  total.forEach(([n, name], i) => {
    list.push({ id: `total_${i}`, name, desc: `Own ${n} generators in total.`, check: (s) => totalGenerators(s) >= n });
  });

  const comets: Array<[number, string]> = [[1, 'Shooting Star'], [7, 'Make a Wish'], [27, 'Comet Chaser'], [77, 'Tail Collector'], [777, 'Halley Would Be Proud']];
  comets.forEach(([n, name], i) => {
    list.push({ id: `comet_${i}`, name, desc: `Catch ${n} comet${n === 1 ? '' : 's'}.`, check: (s) => s.cometsAll >= n });
  });

  const upg: Array<[number, string]> = [[10, 'Tinkerer'], [25, 'Engineer'], [50, 'Architect'], [100, 'Grand Designer'], [150, 'Upgrade Everything']];
  upg.forEach(([n, name], i) => {
    list.push({ id: `upg_${i}`, name, desc: `Buy ${n} upgrades.`, check: (s) => upgradeCount(s) >= n });
  });

  const collapses: Array<[number, string]> = [[1, 'Big Crunch'], [5, 'Cyclic Cosmos'], [10, 'Eternal Return'], [25, 'Groundhog Universe']];
  collapses.forEach(([n, name], i) => {
    list.push({ id: `collapse_${i}`, name, desc: `Collapse the universe ${n} time${n === 1 ? '' : 's'}.`, check: (s) => s.collapses >= n });
  });

  const dm: Array<[number, string]> = [[10, 'Dark Dabbler'], [100, 'Dark Collector'], [1000, 'Dark Lord'], [10000, 'Made of Shadow']];
  dm.forEach(([n, name], i) => {
    list.push({ id: `dm_${i}`, name, desc: `Own ${n.toLocaleString('en-US')} Dark Matter.`, check: (s) => s.darkMatter >= n });
  });

  const exp: Array<[number, string]> = [[1, 'Bon Voyage'], [10, 'Frequent Flyer'], [50, 'Star Trekker'], [200, 'Mapped It All']];
  exp.forEach(([n, name], i) => {
    list.push({ id: `exp_${i}`, name, desc: `Complete ${n} expedition${n === 1 ? '' : 's'}.`, check: (s) => s.expeditionsDone >= n });
  });

  list.push({ id: 'daily_7', name: 'Creature of Habit', desc: 'Reach a 7 day login streak.', check: (s) => s.dailyStreak >= 7 });
  list.push({ id: 'offline_hour', name: 'Patience Pays', desc: 'Earn Stardust while away for over an hour.', hidden: true, check: () => false });
  list.push({ id: 'one_drone', name: 'Lone Drone', desc: 'Earn 1 million Stardust in a universe while owning only Mining Drones.', hidden: true,
    check: (s) => s.earnedRun >= 1e6 && s.generators.every((c, i) => i === 0 || c === 0) });
  list.push({ id: 'no_tap', name: 'Hands Off', desc: 'Earn 1 billion Stardust in a universe with 15 taps or fewer.', hidden: true,
    check: (s) => s.earnedRun >= 1e9 && s.tapsRun <= 15 });
  list.push({ id: 'speedy', name: 'Speedrunner', desc: 'Earn 1 trillion Stardust within an hour of a collapse.', hidden: true,
    check: (s) => s.collapses > 0 && s.earnedRun >= 1e12 && s.time - s.runStartClock <= 3600 });
  list.push({ id: 'well', name: 'Fell In', desc: 'Get caught in a Gravity Well.', hidden: true, check: (s) => s.buffs.some((b) => b.kind === 'well') });
  return list;
}

export const ACHIEVEMENTS: AchievementDef[] = build();
export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
