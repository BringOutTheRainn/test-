// Game rule tests. Run with `npm test` (compiles first) or `node --test tests/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtTime, fmtPercent, setNumberStyle } from '../www/js/core/format.js';
import { newState } from '../www/js/core/state.js';
import { computeDerived, generatorPrice, maxAffordable, buyGenerator, buyUpgrade, tap, tick, availableUpgrades, buyCosmic } from '../www/js/core/economy.js';
import { catchComet, scheduleNextComet, cometDue } from '../www/js/core/comets.js';
import { darkMatterForEarnings, pendingDarkMatter, collapse, canCollapse } from '../www/js/core/prestige.js';
import { checkAchievements } from '../www/js/core/achievements.js';
import { serialize, deserialize, exportSave, importSave, applyOffline } from '../www/js/core/save.js';
import { claimDaily, dayNumber, dailyReady } from '../www/js/core/daily.js';
import { startExpedition, collectExpeditions } from '../www/js/core/expeditions.js';
import { GENERATORS } from '../www/js/data/generators.js';
import { UPGRADES } from '../www/js/data/upgrades.js';
import { ACHIEVEMENTS } from '../www/js/data/achievements.js';
import { COSMIC } from '../www/js/data/cosmic.js';

const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('formats numbers', () => {
  setNumberStyle('short');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1000), '1K');
  assert.equal(fmt(1234), '1.23K');
  assert.equal(fmt(45678), '45.68K');
  assert.equal(fmt(456789), '456.8K');
  assert.equal(fmt(999999), '1M');
  assert.equal(fmt(1.5e9), '1.5B');
  assert.equal(fmt(2e15), '2Qa');
  assert.equal(fmt(0.1, 1), '0.1');
  assert.equal(fmt(1e70), '1.00e70');
  setNumberStyle('scientific');
  assert.equal(fmt(12345), '1.23e4');
  setNumberStyle('short');
  assert.equal(fmtTime(59), '59s');
  assert.equal(fmtTime(125), '2m 05s');
  assert.equal(fmtTime(3 * 3600 + 120), '3h 2m');
  assert.equal(fmtTime(90000), '1d 1h');
  assert.equal(fmtPercent(0.0001), '<0.1%');
  assert.equal(fmtPercent(0.25), '25%');
});

test('every id is unique', () => {
  for (const list of [GENERATORS, UPGRADES, ACHIEVEMENTS, COSMIC]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('cosmic tree requirements exist and form no loops', () => {
  const ids = new Set(COSMIC.map((c) => c.id));
  for (const c of COSMIC) for (const r of c.requires) assert.ok(ids.has(r), `${c.id} needs unknown ${r}`);
  const depth = (id, seen = new Set()) => {
    assert.ok(!seen.has(id), 'loop at ' + id);
    seen.add(id);
    const c = COSMIC.find((x) => x.id === id);
    return 1 + Math.max(0, ...c.requires.map((r) => depth(r, new Set(seen))));
  };
  for (const c of COSMIC) depth(c.id);
});

test('generator prices grow by 15% per copy', () => {
  const s = newState(0);
  const d = computeDerived(s);
  assert.equal(generatorPrice(s, d, 0), 15);
  s.generators[0] = 1;
  assert.equal(generatorPrice(s, d, 0), Math.ceil(15 * 1.15));
  s.generators[0] = 0;
  const ten = generatorPrice(s, d, 0, 10);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += 15 * Math.pow(1.15, i);
  assert.ok(Math.abs(ten - sum) <= 1);
});

test('buy max buys as many as affordable', () => {
  const s = newState(0);
  s.stardust = 1000;
  const d = computeDerived(s);
  const n = maxAffordable(s, d, 0);
  assert.ok(generatorPrice(s, d, 0, n) <= 1000);
  assert.ok(generatorPrice(s, d, 0, n + 1) > 1000);
  assert.equal(buyGenerator(s, d, 0, 'max'), n);
  assert.equal(s.generators[0], n);
  assert.ok(s.stardust >= 0);
});

test('cannot buy without enough stardust', () => {
  const s = newState(0);
  s.stardust = 10;
  assert.equal(buyGenerator(s, computeDerived(s), 0, 1), 0);
  assert.equal(s.stardust, 10);
});

test('production and taps', () => {
  const s = newState(0);
  s.generators[0] = 10;
  s.generators[1] = 2;
  let d = computeDerived(s);
  assert.ok(Math.abs(d.baseSps - (10 * 0.1 + 2 * 1)) < 1e-9);
  tick(s, d, 2);
  assert.ok(Math.abs(s.stardust - 6) < 1e-9);
  assert.equal(tap(s, d), 1);
  s.stardust = 1e6;
  s.earnedRun = 1e6;
  assert.ok(buyUpgrade(s, d, 'drone_0'));
  d = computeDerived(s);
  assert.equal(d.tap, 2);
  assert.ok(Math.abs(d.genSps[0] - 10 * 0.2) < 1e-9);
});

test('upgrades unlock by condition and cannot be bought twice', () => {
  const s = newState(0);
  assert.equal(availableUpgrades(s).length, 0);
  s.generators[1] = 1;
  assert.ok(availableUpgrades(s).some((u) => u.id === 'harvester_0'));
  s.stardust = 1e9;
  const d = computeDerived(s);
  assert.ok(buyUpgrade(s, d, 'harvester_0'));
  assert.ok(!buyUpgrade(s, d, 'harvester_0'));
  assert.ok(!buyUpgrade(s, d, 'harvester_1'));
});

test('swarm protocol adds a flat bonus per non-drone generator', () => {
  const s = newState(0);
  s.generators[0] = 25;
  s.generators[2] = 10;
  s.upgrades.drone_3 = true;
  const d = computeDerived(s);
  assert.ok(Math.abs(d.genSps[0] - 25 * (0.1 + 0.1 * 10)) < 1e-9);
  assert.ok(Math.abs(d.tap - (1 + 1)) < 1e-9);
});

test('achievements add production', () => {
  const s = newState(0);
  s.generators[1] = 10;
  const before = computeDerived(s).baseSps;
  s.earnedRun = 1000;
  const got = checkAchievements(s, 10, 0);
  assert.ok(got.includes('earn_0') && got.includes('earn_1'));
  const after = computeDerived(s).baseSps;
  assert.ok(after > before);
  assert.deepEqual(checkAchievements(s, 10, 0).filter((id) => got.includes(id)), []);
});

test('comets: rush, haul and supernova', () => {
  const s = newState(0);
  s.generators[1] = 10;
  let d = computeDerived(s);
  const rush = catchComet(s, d, false, seq(0.1));
  assert.equal(rush.kind, 'rush');
  d = computeDerived(s);
  assert.ok(Math.abs(d.sps - d.baseSps * 7) < 1e-9);
  tick(s, d, 78);
  assert.equal(s.buffs.length, 0);
  s.stardust = 1000;
  const haul = catchComet(s, computeDerived(s), false, seq(0.5));
  assert.equal(haul.kind, 'haul');
  assert.ok(Math.abs(haul.amount - (Math.min(150, 10 * 900) + 13)) < 1e-9);
  const nova = catchComet(s, computeDerived(s), false, seq(0.95));
  assert.equal(nova.kind, 'supernova');
  assert.equal(computeDerived(s).tapBuff, 777);
  assert.equal(s.cometsAll, 3);
});

test('comet schedule respects frequency', () => {
  const s = newState(0);
  const d = computeDerived(s);
  scheduleNextComet(s, d, seq(0));
  assert.equal(s.nextCometAt, 120);
  assert.ok(!cometDue(s));
  s.time = 120;
  assert.ok(cometDue(s));
  s.upgrades.comet_0 = true;
  scheduleNextComet(s, computeDerived(s), seq(0));
  assert.equal(s.nextCometAt, 180);
});

test('dark matter follows the cube root of lifetime earnings', () => {
  assert.equal(darkMatterForEarnings(0), 0);
  assert.equal(darkMatterForEarnings(1e10), 1);
  assert.equal(darkMatterForEarnings(7.99e10), 1);
  assert.equal(darkMatterForEarnings(8e10), 2);
  assert.equal(darkMatterForEarnings(1e13), 10);
});

test('collapse resets the run and keeps permanent progress', () => {
  const s = newState(0);
  s.earnedAll = 27e10;
  s.earnedRun = 27e10;
  s.stardust = 5e12;
  s.generators[3] = 40;
  s.upgrades.station_0 = true;
  s.upgrades.research_0 = true;
  s.achievements.earn_0 = 1;
  s.cosmic.seed = true;
  assert.ok(canCollapse(s));
  assert.equal(pendingDarkMatter(s), 3);
  const gained = collapse(s, computeDerived(s), 5);
  assert.equal(gained, 3);
  assert.equal(s.darkMatter, 3);
  assert.equal(s.stardust, 0);
  assert.equal(s.generators[3], 0);
  assert.equal(s.generators[0], 10, 'Seed Swarm gives 10 drones');
  assert.deepEqual(s.upgrades, {});
  assert.ok(s.achievements.earn_0);
  assert.equal(pendingDarkMatter(s), 0);
  assert.ok(!canCollapse(s));
  // Dark Matter boosts production by 2% each.
  s.generators[1] = 1;
  assert.ok(Math.abs(computeDerived(s).genSps[1] - 1.06 * 1.01) < 1e-9, "3 Dark Matter and 1 achievement");
});

test('research echo keeps research upgrades', () => {
  const s = newState(0);
  s.earnedAll = 1e12;
  s.upgrades = { research_0: true, harvester_0: true };
  s.cosmic.echo = true;
  collapse(s, computeDerived(s));
  assert.deepEqual(Object.keys(s.upgrades), ['research_0']);
});

test('cosmic upgrades need dark matter and prerequisites', () => {
  const s = newState(0);
  s.darkMatter = 3;
  assert.ok(!buyCosmic(s, 'seed'), 'needs glow first');
  assert.ok(buyCosmic(s, 'glow'));
  assert.ok(buyCosmic(s, 'seed'));
  assert.equal(s.darkMatterSpent, 3);
  assert.ok(!buyCosmic(s, 'magnet'), 'out of dark matter');
  assert.equal(computeDerived(s).offlineRate, 0.5);
});

test('save round trip and migration of missing fields', () => {
  const s = newState(1000);
  s.stardust = 123;
  s.generators[2] = 4;
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
  const old = JSON.parse(serialize(s));
  delete old.relics;
  old.generators = [1, 2];
  const migrated = deserialize(JSON.stringify(old));
  assert.deepEqual(migrated.relics, {});
  assert.equal(migrated.generators.length, GENERATORS.length);
  assert.equal(migrated.generators[1], 2);
  assert.deepEqual(importSave(exportSave(s)), s);
  assert.throws(() => deserialize('{"hello":1}'));
  assert.throws(() => importSave('not base64!!'));
});

test('offline earnings are capped and reduced', () => {
  const s = newState(0);
  s.generators[1] = 10;
  const d = computeDerived(s);
  s.lastSeen = 0;
  const r = applyOffline(s, d, 3600 * 1000);
  assert.equal(r.earned, 10 * 3600 * 0.25);
  const s2 = newState(0);
  s2.generators[1] = 10;
  s2.lastSeen = 0;
  const r2 = applyOffline(s2, d, 48 * 3600 * 1000);
  assert.equal(r2.counted, 8 * 3600);
});

test('daily reward streak', () => {
  const day = 86400000;
  const t0 = 1_700_000_000_000;
  const s = newState(t0);
  const d = computeDerived(s);
  const a = claimDaily(s, d, t0);
  assert.equal(a.day, 1);
  assert.equal(claimDaily(s, d, t0 + 1000), null);
  const b = claimDaily(s, d, t0 + day);
  assert.equal(b.day, 2);
  assert.ok(!dailyReady(s, t0 + day));
  const c = claimDaily(s, d, t0 + 3 * day);
  assert.equal(c.day, 1, 'missing a day resets the streak');
  assert.equal(dayNumber(t0 + day) - dayNumber(t0), 1);
});

test('expeditions need the bay and return stardust', () => {
  const s = newState(0);
  s.generators[1] = 100;
  let d = computeDerived(s);
  assert.ok(!startExpedition(s, d, 'belt', 0));
  s.cosmic.bay = true;
  d = computeDerived(s);
  assert.ok(startExpedition(s, d, 'belt', 0));
  assert.ok(!startExpedition(s, d, 'dwarf', 0), 'one slot only');
  assert.deepEqual(collectExpeditions(s, d, 1000, seq(0.99)), []);
  const res = collectExpeditions(s, d, 5 * 60000, seq(0.01, 0));
  assert.equal(res.length, 1);
  assert.ok(res[0].stardust >= d.baseSps * 15 * 60);
  assert.equal(res[0].relic, 'shard');
  assert.equal(s.relics.shard, 1);
  assert.equal(s.expeditionsDone, 1);
  assert.ok(computeDerived(s).globalMult > d.globalMult);
});

test('anomalies twist the rules and reward completion', async () => {
  const { enterAnomaly, checkAnomaly, abandonAnomaly } = await import('../www/js/core/anomalies.js');
  const s = newState(0);
  s.generators[1] = 10;
  assert.equal(enterAnomaly(s, computeDerived(s), 'nohands'), -1, 'locked before the first collapse');
  s.collapses = 1;
  s.earnedAll = 8e10;
  s.darkMatter = 1;
  assert.equal(enterAnomaly(s, computeDerived(s), 'nohands'), 1, 'collects pending Dark Matter');
  assert.equal(s.anomaly, 'nohands');
  assert.equal(s.generators[1], 0);
  let d = computeDerived(s);
  assert.equal(tap(s, d), 0);
  s.earnedRun = 1e10;
  assert.equal(checkAnomaly(s), 'nohands');
  assert.equal(s.anomaly, null);
  d = computeDerived(s);
  assert.equal(d.tap, 3, 'taps are tripled forever');

  s.anomaly = null;
  enterAnomaly(s, d, 'lonely');
  d = computeDerived(s);
  s.stardust = 1e9;
  assert.equal(buyGenerator(s, d, 2, 1), 0, 'Lunar Base locked');
  assert.equal(buyGenerator(s, d, 1, 1), 1);
  assert.equal(abandonAnomaly(s, d), 0);
  assert.equal(s.anomaly, null);
  assert.ok(!s.anomaliesDone.lonely);

  enterAnomaly(s, computeDerived(s), 'primitive');
  s.stardust = 1e9;
  s.generators[1] = 5;
  assert.ok(!buyUpgrade(s, computeDerived(s), 'harvester_0'));
  enterAnomaly(s, computeDerived(s), 'inflation');
  assert.equal(computeDerived(s).costGrowth, 1.22);
});
