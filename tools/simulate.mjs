// Plays the game with a simple greedy bot to check pacing.
// Usage: node tools/simulate.mjs [hours] [tapsPerSecond]
import { newState } from '../www/js/core/state.js';
import { computeDerived, generatorPrice, buyGenerator, buyUpgrade, availableUpgrades, upgradePrice, tick, tap, buyCosmic, cosmicAvailable } from '../www/js/core/economy.js';
import { catchComet, cometDue, scheduleNextComet } from '../www/js/core/comets.js';
import { checkAchievements } from '../www/js/core/achievements.js';
import { pendingDarkMatter, collapse } from '../www/js/core/prestige.js';
import { GENERATORS } from '../www/js/data/generators.js';
import { COSMIC } from '../www/js/data/cosmic.js';
import { fmt, fmtTime } from '../www/js/core/format.js';

const hours = Number(process.argv[2] ?? 6);
const tps = Number(process.argv[3] ?? 3);
let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const s = newState(0);
let d = computeDerived(s);
const marks = [];
const mark = (label) => marks.push(`${fmtTime(s.time).padStart(8)}  ${label}`);
const seen = new Set();
const once = (key, cond, label) => { if (!seen.has(key) && cond) { seen.add(key); mark(label); } };

function gain(apply) {
  const copy = structuredClone(s);
  apply(copy);
  const nd = computeDerived(copy);
  return nd.baseSps + nd.tap * tps - (d.baseSps + d.tap * tps);
}

function bestBuy() {
  let best = null;
  const income = Math.max(1e-9, d.baseSps + d.tap * tps);
  const consider = (price, g, act) => {
    if (g <= 0) return;
    const score = price / income + price / g;
    if (!best || score < best.score) best = { score, price, act };
  };
  GENERATORS.forEach((_, i) => {
    if (i > 0 && s.generators[i - 1] === 0 && s.generators[i] === 0) return;
    const price = generatorPrice(s, d, i, 1);
    consider(price, gain((c) => { c.generators[i]++; }), () => buyGenerator(s, d, i, 1));
  });
  for (const u of availableUpgrades(s)) {
    const price = upgradePrice(d, u);
    const g = gain((c) => { c.upgrades[u.id] = true; });
    consider(price, Math.max(g, (d.baseSps + 1) * 0.01), () => buyUpgrade(s, d, u.id));
  }
  return best;
}

let runStart = 0;
const end = hours * 3600;
const comets = { seen: 0, caught: 0 };
while (s.time < end) {
  for (let i = 0; i < tps; i++) tap(s, d);
  if (tick(s, d, 1)) d = computeDerived(s);
  if (cometDue(s)) {
    scheduleNextComet(s, d, rng);
    comets.seen++;
    if (rng() < 0.75) { comets.caught++; catchComet(s, d, false, rng); d = computeDerived(s); }
  }
  for (let k = 0; k < 50; k++) {
    const b = bestBuy();
    if (!b || b.price > s.stardust) break;
    b.act();
    d = computeDerived(s);
  }
  if (Math.floor(s.time) % 5 === 0 && checkAchievements(s, d.sps, 0).length) d = computeDerived(s);
  once('d1', s.generators[0] > 0, 'first Mining Drone');
  for (let i = 1; i < GENERATORS.length; i++) once('g' + i, s.generators[i] > 0, `first ${GENERATORS[i].name}`);
  for (const e of [1e3, 1e5, 1e7, 1e9]) once('sps' + e, d.baseSps >= e, `${fmt(e)} per second`);
  once('cosmos', s.earnedAll >= 1e11, 'Cosmos tab unlocks');
  const pending = pendingDarkMatter(s);
  once('dm1', pending >= 1, 'first Dark Matter available');
  // Collapse when it would at least double Dark Matter (and at least 3 on the first one).
  const want = Math.max(10, s.darkMatter);
  if (pending >= want) {
    mark(`collapse #${s.collapses + 1}: +${pending} Dark Matter (run took ${fmtTime(s.time - runStart)}, ${Object.keys(s.achievements).length} achievements)`);
    collapse(s, d, 0);
    let bought = true;
    while (bought) {
      bought = false;
      const open = COSMIC.filter((c) => cosmicAvailable(s, c.id)).sort((a, b) => a.cost - b.cost);
      for (const c of open) if (buyCosmic(s, c.id)) { bought = true; mark(`  cosmic: ${c.name}`); break; }
    }
    d = computeDerived(s);
    runStart = s.time;
  }
}
console.log(marks.join('\n'));
console.log(`\nAfter ${hours}h at ${tps} taps/s: ${fmt(s.earnedAll)} earned, ${fmt(d.baseSps)}/s, DM ${s.darkMatter}, ${Object.keys(s.upgrades).length} upgrades, ${Object.keys(s.achievements).length} achievements, comets ${comets.caught}/${comets.seen}`);
console.log('Generators:', s.generators.join(' '));
