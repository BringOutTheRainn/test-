// Pacing simulation: an engaged player taps, catches visitors, buys the best
// payback generator, buys every affordable upgrade and descends when it can.
// Usage: node tools/simulate.mjs [hours=3] [tapsPerSecond=4]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const g = require('../build/core.js');

const hours = Number(process.argv[2] ?? 3);
const tps = Number(process.argv[3] ?? 4);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let seed2 = 11;
const rand2 = () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647);

const s = g.newState(0);
s.settings.sound = false;
const marks = {};
const mark = (name, t) => { if (!(name in marks)) marks[name] = t; };
const step = 250;
for (let t = 0; t < hours * 3600e3; t += step) {
  // Taps, spread over the second.
  if ((t / step) % Math.max(1, Math.round(1000 / step / tps)) === 0) for (let k = 0; k < Math.max(1, tps * step / 1000); k++) g.tap(s, t);
  g.tick(s, t, step, rand); g.fillRequests(s, t, rand2);
  if (s.visitor && t - s.visitor.spawnedAt > 3000) g.catchVisitor(s, t, rand);
  g.startGeyser(s, t);
  if (g.subBack(s, t)) g.collectDive(s, t);
  g.launchDive(s, 1, t);
  for (let i = 0; i < s.requests.list.length; i++) if (g.requestDone(s, s.requests.list[i])) g.claimRequest(s, i, t, rand2);
  if (t % 1000 !== 0) continue;
  for (const u of g.visibleUpgrades(s)) if (s.pearls >= u.cost) g.buyUpgrade(s, u.id);
  // Descend when the cost is under a few minutes of production or the next generator is the zone's.
  if (s.pearls >= g.descendCost(s)) { g.descend(s); mark('zone ' + s.zone, t); }
  for (let guard = 0; guard < 50; guard++) {
    let best = -1, bestScore = Infinity;
    const p = g.rawPPS(s) || 1;
    for (let i = 0; i < g.GENS.length; i++) {
      if (!g.genUnlocked(s, i)) continue;
      const cost = g.genCost(s, i, 1);
      const gain = g.GENS[i].pps * (s.owned[i] ? 1 : 1);
      const score = cost / gain + cost / p;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    // Save for the next zone when it is close.
    const dz = g.descendCost(s);
    if (dz < Infinity && dz < p * 600 && s.pearls < dz) break;
    if (best < 0 || s.pearls < g.genCost(s, best, 1)) break;
    g.buyGen(s, best, 1);
  }
  g.checkAchievements(s);
  for (const n of [1e6, 1e9, 1e11, 1e12]) if (s.earnedLife >= n) mark(g.fmt(n) + ' earned', t);
}
const min = (ms) => (ms / 60000).toFixed(1) + ' min';
for (const [k, v] of Object.entries(marks)) console.log(k.padEnd(14), min(v));
console.log('after', hours, 'h: earned', g.fmt(s.earnedLife), 'pps', g.fmt(g.rawPPS(s)), 'zone', s.zone, 'owned', s.owned.join(','), 'upgrades', Object.keys(s.upgrades).length, 'logbook', Object.keys(s.achievements).length, 'moonstones on migrate', g.moonstonesOnMigrate(s));
