// Rule tests. Run with: npm test (builds first).
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../build/core.js');

const fixed = (v) => () => v;

test('number formatting', () => {
  assert.equal(g.fmt(0), '0');
  assert.equal(g.fmt(999), '999');
  assert.equal(g.fmt(1000), '1K');
  assert.equal(g.fmt(1500), '1.5K');
  assert.equal(g.fmt(100e3), '100K');
  assert.equal(g.fmt(2.41e6), '2.41M');
  assert.equal(g.fmt(1e36), '1.00e36');
  assert.equal(g.fmt(1234, true), '1.23e3');
});

test('tapping earns pearls and builds a combo that drains', () => {
  const s = g.newState(0);
  const lowTide = g.TIDE_PERIOD_MS * 0.75;
  for (let i = 0; i < 10; i++) g.tap(s, lowTide + i * 100);
  assert.ok(s.combo >= 9);
  assert.ok(s.pearls > 10, 'combo should make taps worth more than 1');
  g.tick(s, lowTide + 5000, 5000, fixed(0.5));
  assert.equal(s.combo, 0);
});

test('high tide triples taps', () => {
  const s = g.newState(0);
  const high = g.tapValue(s, 1000);
  const low = g.tapValue(s, g.TIDE_PERIOD_MS * 0.75);
  assert.equal(g.isHighTide(s, 1000), true);
  assert.equal(high, low * 3);
});

test('generator prices grow by 1.15 and bulk buying sums them', () => {
  const s = g.newState(0);
  assert.equal(g.genCost(s, 0), 15);
  s.pearls = 1e6;
  assert.ok(g.buyGen(s, 0, 1));
  assert.ok(Math.abs(g.genCost(s, 0) - 15 * 1.15) < 1e-9);
  const ten = g.genCost(s, 0, 10);
  let sum = 0;
  for (let k = 0; k < 10; k++) sum += 15 * Math.pow(1.15, 1 + k);
  assert.ok(Math.abs(ten - sum) < 1e-6);
  const n = g.maxAffordable(s, 0);
  assert.ok(g.genCost(s, 0, n) <= s.pearls && g.genCost(s, 0, n + 1) > s.pearls);
});

test('deeper generators need their zone', () => {
  const s = g.newState(0);
  s.pearls = 1e9;
  s.owned[2] = 1;
  assert.equal(g.genUnlocked(s, 3), false);
  assert.equal(g.buyGen(s, 3, 1), false);
  assert.ok(g.descend(s));
  assert.equal(s.zone, 1);
  assert.ok(g.buyGen(s, 3, 1));
});

test('descending multiplies production by 1.5', () => {
  const s = g.newState(0);
  s.owned[0] = 10;
  const before = g.rawPPS(s);
  s.pearls = 1e6;
  g.descend(s);
  assert.ok(Math.abs(g.rawPPS(s) / before - 1.5) < 1e-9);
});

test('golden fish and whales give their rewards', () => {
  const s = g.newState(0);
  s.owned[1] = 10;
  g.spawnVisitor(s, 1000, fixed(0.9), 'fish');
  const rush = g.catchVisitor(s, 2000, fixed(0.1));
  assert.equal(rush.kind, 'rush');
  assert.ok(g.pps(s, 3000) > g.rawPPS(s) * 6.9);
  g.spawnVisitor(s, 5000, fixed(0.9), 'whale');
  assert.equal(g.catchVisitor(s, 6000, fixed(0.5)).kind, 'whale');
  assert.equal(s.stats.whales, 1);
  assert.equal(g.catchVisitor(s, 6000, fixed(0.5)), null, 'a visitor can only be caught once');
});

test('visitors appear on their own and leave if ignored', () => {
  const s = g.newState(0);
  g.tick(s, s.nextVisitorAt + 1, 16, fixed(0.9));
  assert.ok(s.visitor);
  const until = s.visitor.until;
  g.tick(s, until + 1, 16, fixed(0.9));
  assert.equal(s.visitor, null);
});

test('migration grants moonstones and resets the run', () => {
  const s = g.newState(0);
  assert.equal(g.canMigrate(s), false);
  s.earnedLife = 8e11; s.earnedRun = 8e11; s.pearls = 5e9; s.owned[0] = 50; s.zone = 2;
  s.upgrades = { tap_0: true, research_0: true };
  assert.equal(g.moonstonesOnMigrate(s), 2);
  assert.equal(g.migrate(s, 1000), 2);
  assert.equal(s.moonstones, 2);
  assert.equal(s.pearls, 0);
  assert.equal(s.owned[0], 0);
  assert.equal(s.zone, 0);
  assert.deepEqual(s.upgrades, {});
  assert.equal(g.moonstonesOnMigrate(s), 0, 'no double dipping');
  assert.ok(g.buyPerk(s, 'memory') === false, 'too expensive');
  assert.ok(g.buyPerk(s, 'warm'));
  assert.equal(s.moonstones - s.moonstonesSpent, 1);
});

test('heritage perks change the next migration', () => {
  const s = g.newState(0);
  s.moonstones = 60;
  ['memory', 'inherit', 'notes'].forEach((id) => assert.ok(g.buyPerk(s, id)));
  s.earnedLife = 1e17; s.upgrades = { research_0: true, tap_0: true };
  g.migrate(s, 0);
  assert.equal(s.zone, 1);
  assert.equal(s.pearls, 1e3);
  assert.deepEqual(s.upgrades, { research_0: true });
});

test('offline earnings use the offline rate and the 8 hour cap', () => {
  const s = g.newState(0);
  s.owned[1] = 10; // 10 PPS
  s.lastSeen = 0;
  const res = g.applyOffline(s, 24 * 3600e3);
  assert.equal(res.seconds, 8 * 3600);
  assert.ok(Math.abs(res.pearls - 10 * 8 * 3600 * 0.25) < 1e-6);
});

test('saves round trip and tolerate missing fields', () => {
  const s = g.newState(0);
  s.pearls = 123; s.owned[3] = 4; s.achievements.taps_100 = true;
  const back = g.deserialize(g.serialize(s), 0);
  assert.equal(back.pearls, 123);
  assert.equal(back.owned[3], 4);
  assert.equal(back.achievements.taps_100, true);
  const old = g.deserialize(JSON.stringify({ pearls: 5, owned: [1] }), 0);
  assert.equal(old.owned.length, g.GENS.length);
  assert.equal(old.settings.sound, true);
  assert.throws(() => g.deserialize('{"foo":1}', 0));
});

test('achievements unlock once', () => {
  const s = g.newState(0);
  s.earnedLife = 2e6; s.stats.taps = 150; s.owned[0] = 1;
  const got = g.checkAchievements(s).map((a) => a.id);
  assert.ok(got.includes('earn_1000') && got.includes('earn_1000000') && got.includes('taps_100') && got.includes('gen_crab_1'));
  assert.equal(g.checkAchievements(s).length, 0);
});

test('every upgrade can eventually be bought', () => {
  const s = g.newState(0);
  s.pearls = Infinity; s.earnedRun = Infinity; s.zone = 4;
  s.owned = g.GENS.map(() => 300);
  for (let round = 0; round < 20; round++) g.visibleUpgrades(s).forEach((u) => g.buyUpgrade(s, u.id));
  assert.equal(Object.keys(s.upgrades).length, g.UPGRADES.length);
});

test('the geyser auto-taps for 20 seconds, then recharges for 10 minutes', () => {
  const s = g.newState(0);
  assert.equal(g.geyserReady(s, 0), false, 'locked until 500 pearls earned');
  s.earnedRun = 500;
  assert.ok(g.startGeyser(s, 1000));
  assert.equal(g.startGeyser(s, 2000), false);
  let taps = 0;
  for (let t = 1000; t < 21000; t += 100) taps += g.tick(s, t, 100, fixed(0.9)).autoTaps;
  assert.equal(taps, 200);
  assert.equal(g.geyserActive(s, 21001), false);
  assert.equal(s.daily.taps, 0, 'geyser taps do not count toward the daily gift');
  assert.equal(g.geyserReady(s, 1000 + 10 * 60e3), true);
});

test('daily tide gift needs taps and grows a 7 day streak', () => {
  const s = g.newState(0);
  s.owned[1] = 10; // 10 PPS
  g.rollDaily(s, '2026-10-14');
  assert.equal(g.claimDaily(s, 0), null);
  for (let i = 0; i < g.DAILY_TAPS; i++) g.tap(s, i * 2000);
  const r = g.claimDaily(s, 0);
  assert.equal(r.streak, 1);
  assert.equal(r.pearls, 10 * 60 * 10);
  assert.equal(g.claimDaily(s, 0), null, 'once a day');
  g.rollDaily(s, '2026-10-15');
  assert.equal(s.daily.taps, 0);
  assert.equal(g.nextStreak(s), 2);
  g.rollDaily(s, '2026-10-17');
  assert.equal(g.nextStreak(s), 1, 'a missed day restarts the streak');
  assert.equal(g.prevDayKey('2026-11-01'), '2026-10-31');
});

test('day 7 of the streak adds a whale song, then the streak starts over', () => {
  const s = g.newState(0);
  s.daily = { day: '2026-10-20', taps: 200, claimedDay: '2026-10-19', streak: 6 };
  const r = g.claimDaily(s, 0);
  assert.equal(r.streak, 7);
  assert.ok(r.whale);
  s.daily.day = '2026-10-21'; s.daily.taps = 200;
  assert.equal(g.nextStreak(s), 1);
});
