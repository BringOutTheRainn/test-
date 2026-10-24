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

test('Current Surge doubles production, stacks by 10 minutes and is capped at 4 a day', () => {
  const s = g.newState(0);
  s.owned[1] = 10;
  g.rollAds(s, '2026-10-15');
  assert.equal(g.rewardSurge(s, 0), false, 'locked until 1,000 pearls earned');
  s.earnedRun = 1000;
  const base = g.pps(s, 1);
  assert.ok(g.rewardSurge(s, 0));
  assert.ok(Math.abs(g.pps(s, 1) / base - 2) < 1e-9);
  for (let i = 0; i < 3; i++) assert.ok(g.rewardSurge(s, 0));
  assert.equal(g.rewardSurge(s, 0), false);
  assert.equal(s.boosts.filter((b) => b.kind === 'surge').length, 1);
  assert.equal(s.boosts[0].until, 40 * 60e3);
  g.rollAds(s, '2026-10-16');
  assert.equal(g.surgesLeft(s), 4);
});

test('ads can double offline earnings and the Tide Gift (once a day)', () => {
  const s = g.newState(0);
  s.owned[1] = 10;
  assert.equal(g.rewardOffline(s, 500), 500);
  assert.equal(s.pearls, 500);
  s.daily = { day: '2026-10-15', taps: 200, claimedDay: '', streak: 0 };
  assert.equal(g.canDoubleGift(s), false, 'claim first');
  const r = g.claimDaily(s, 0);
  assert.equal(g.rewardGift(s), r.pearls);
  assert.equal(g.rewardGift(s), 0);
});

test('visitors leave Hearts that adopt permanent rare creatures', () => {
  const s = g.newState(0);
  s.owned[1] = 10;
  g.spawnVisitor(s, 0, fixed(0.5), 'fish');
  g.catchVisitor(s, 100, fixed(0.5));
  g.spawnVisitor(s, 0, fixed(0.5), 'whale');
  g.catchVisitor(s, 100, fixed(0.5));
  assert.equal(s.hearts, 4);
  assert.equal(g.adoptRare(s, 'narwhal'), false, 'needs 6 hearts');
  const before = g.rawPPS(s);
  s.hearts = 6;
  assert.ok(g.adoptRare(s, 'narwhal'));
  assert.equal(s.hearts, 0);
  assert.ok(Math.abs(g.rawPPS(s) / before - 1.1) < 1e-9);
  assert.equal(g.adoptRare(s, 'narwhal'), false, 'only once');
  s.earnedLife = 1e13;
  g.migrate(s, 0);
  assert.equal(s.rares.narwhal, true, 'kept through migration');
  s.hearts = 25;
  const off = g.offlineRate(s);
  g.adoptRare(s, 'turtle');
  assert.ok(Math.abs(g.offlineRate(s) - off - 0.1) < 1e-9);
});

test('Reef Requests: three goals at a time that pay Pearls and a Heart', () => {
  const s = g.newState(0);
  g.fillRequests(s, 0, fixed(0));
  assert.equal(s.requests.list.length, 3);
  assert.equal(new Set(s.requests.list.map((r) => r.kind)).size, 3, 'no two of the same kind');
  s.requests.list.forEach((r) => assert.ok(g.requestText(r).length > 0));
  // Force a taps request and finish it.
  s.requests.list[0] = { kind: 'taps', target: 50, base: s.stats.taps };
  assert.equal(g.claimRequest(s, 0, 0, fixed(0)), null, 'not done yet');
  for (let i = 0; i < 50; i++) g.tap(s, i * 100);
  assert.ok(g.requestDone(s, s.requests.list[0]));
  assert.equal(g.requestsReady(s) >= 1, true);
  const pearls = s.pearls;
  const r = g.claimRequest(s, 0, 0, fixed(0));
  assert.ok(r && r.pearls >= 25);
  assert.equal(s.pearls, pearls + r.pearls);
  assert.equal(s.hearts, 1);
  assert.equal(s.requests.done, 1);
  assert.equal(s.requests.list.length, 2, 'the slot waits');
  g.fillRequests(s, 60e3, fixed(0));
  assert.equal(s.requests.list.length, 2);
  g.fillRequests(s, 300e3, fixed(0));
  assert.equal(s.requests.list.length, 3, 'refilled after 5 minutes');
  // A combo request is latched by tick even after the combo drains.
  s.requests.list[1] = { kind: 'combo', target: 5, base: 0 };
  s.combo = 6;
  g.tick(s, 5000, 16, fixed(0.99));
  s.combo = 0;
  assert.ok(g.requestDone(s, s.requests.list[1]));
  // Migration draws fresh requests; old saves load without them.
  s.earnedLife = 1e12;
  g.migrate(s, 0);
  assert.equal(s.requests.list.length, 0);
  assert.equal(s.requests.done, 1, 'count kept');
  const old = JSON.parse(g.serialize(g.newState(0)));
  delete old.requests;
  assert.deepEqual(g.deserialize(JSON.stringify(old), 0).requests, { list: [], done: 0, nextAt: 0 });
});

test('coral spawning follows the real moon and doubles visitors and Hearts', () => {
  const day = 86400e3;
  // Full moon 2024-04-23 23:49 UTC; new moon 2024-04-08 18:21 UTC.
  assert.ok(g.moonAge(Date.UTC(2024, 3, 8, 18, 21)) < 0.5 * day || g.moonAge(Date.UTC(2024, 3, 8, 18, 21)) > 29 * day, "close to a real new moon (the mean month drifts a few hours)");
  assert.equal(g.spawningActive(Date.UTC(2024, 3, 23, 23)), false, 'not on the full moon itself');
  const mid = Date.UTC(2024, 3, 27, 12);
  assert.equal(g.spawningActive(mid), true, 'a few nights after the full moon');
  assert.equal(g.spawningActive(Date.UTC(2024, 4, 2)), false);
  const next = g.nextSpawningAt(Date.UTC(2024, 3, 10));
  assert.ok(next > Date.UTC(2024, 3, 25) && next < Date.UTC(2024, 3, 26, 12));
  assert.ok(g.spawningEndsAt(mid) > mid && g.spawningEndsAt(mid) - next < 5 * day);
  // Double Hearts while spawning.
  const s = g.newState(mid);
  g.spawnVisitor(s, mid, fixed(0.5), 'fish');
  g.catchVisitor(s, mid + 100, fixed(0.5));
  assert.equal(s.hearts, 2);
  assert.equal(s.stats.spawnCatches, 1);
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'spawn_1'));
});

test('reminders plan the geyser, gift, spawning and full nets, never too soon', () => {
  const now = Date.UTC(2024, 3, 10, 12);
  const s = g.newState(now);
  s.owned[1] = 5;
  s.geyser.uses = 1;
  s.geyser.readyAt = now + 10 * 60e3; // too soon
  const evening = Date.UTC(2024, 3, 10, 18);
  let plan = g.reminderPlan(s, now, evening, '2024-04-10');
  assert.deepEqual(plan.map((r) => r.id), [2, 4], 'gift tonight, nets full in 8 h; no spawning yet, geyser too soon');
  assert.ok(plan.every((r, i) => i === 0 || r.at >= plan[i - 1].at));
  s.geyser.readyAt = now + 20 * 60e3;
  s.daily.claimedDay = '2024-04-10';
  s.daily.streak = 3;
  plan = g.reminderPlan(s, now, evening, '2024-04-10');
  assert.deepEqual(plan.map((r) => r.id), [1, 4], 'gift already claimed for that evening');
  plan = g.reminderPlan(s, now, evening + 86400e3, '2024-04-11');
  assert.match(plan.find((r) => r.id === 2).body, /Day 4/);
  const before = g.nextSpawningAt(now) - 86400e3;
  assert.ok(g.reminderPlan(s, before, evening, '2024-04-24').some((r) => r.id === 3));
});

test('the expedition submarine dives in real time and brings back Pearls and Hearts', () => {
  const s = g.newState(0);
  s.owned[1] = 10;
  assert.equal(g.launchDive(s, 0, 0), false, 'locked in the shallows');
  s.zone = 1;
  assert.ok(g.launchDive(s, 1, 0));
  assert.equal(g.launchDive(s, 0, 0), false, 'one dive at a time');
  assert.equal(g.collectDive(s, 30 * 60e3, fixed(0.99)), null, 'still diving');
  const expect = g.diveReward(s, 1);
  assert.ok(Math.abs(expect.pearls - g.rawPPS(s) * 3600 * 0.2) < 1e-6 || expect.pearls === 50);
  const r = g.collectDive(s, 60 * 60e3, fixed(0.99));
  assert.deepEqual(r, expect);
  assert.equal(s.hearts, 2);
  assert.equal(s.sub.dives, 1);
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'dive_1'));
  // An ad can bring it back early, three times a day, and not in the last five minutes.
  g.launchDive(s, 2, 0);
  assert.ok(g.speedUpDive(s, 60e3, '2026-10-17'));
  assert.ok(g.subBack(s, 60e3));
  g.collectDive(s, 60e3, fixed(0.99));
  g.launchDive(s, 0, 0);
  assert.equal(g.speedUpDive(s, 11 * 60e3, '2026-10-17'), false, 'under five minutes left');
  g.speedUpDive(s, 0, '2026-10-17'); g.collectDive(s, 0, fixed(0.99)); g.launchDive(s, 0, 0); g.speedUpDive(s, 0, '2026-10-17'); g.collectDive(s, 0, fixed(0.99));
  g.launchDive(s, 0, 0);
  assert.equal(g.subSpeedsLeft(s, '2026-10-17'), 0);
  assert.equal(g.speedUpDive(s, 0, '2026-10-17'), false, 'three a day');
  assert.equal(g.subSpeedsLeft(s, '2026-10-18'), 3);
  // A save from before the submarine loads with it docked.
  const old = JSON.parse(g.serialize(g.newState(0)));
  delete old.sub;
  assert.equal(g.deserialize(JSON.stringify(old), 0).sub.dive, -1);
});

test('deep dives find sunken relics that last forever and each bend one rule', () => {
  const s = g.newState(0);
  s.zone = 1; s.owned[1] = 10;
  assert.equal(g.RELICS.length, 8);
  g.launchDive(s, 0, 0);
  let r = g.collectDive(s, 15 * 60e3, fixed(0.5));
  assert.equal(r.relic, undefined, 'a reef dive finds one 10% of the time');
  g.launchDive(s, 2, 0);
  r = g.collectDive(s, 4 * 3600e3, fixed(0));
  assert.equal(r.relic, g.RELICS[0].id, 'an abyss expedition usually does');
  assert.equal(s.relics.doubloon, true);
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'relic_1'));
  // Effects.
  const before = { pps: g.rawPPS(s) / 1.05, tap: g.tapValue(s, 1), life: g.visitorLife(s) };
  s.relics.helmet = true; s.relics.bell = true; s.relics.compass = true;
  assert.ok(Math.abs(g.tapValue(s, 1) / before.tap - 1.1) < 1e-9);
  assert.ok(Math.abs(g.visitorLife(s) / before.life - 1.25) < 1e-9);
  g.launchDive(s, 1, 0);
  assert.equal(s.sub.until, 54 * 60e3, 'compass: 10% shorter');
  // Kept through migration; every relic found means none left to find.
  s.earnedLife = 1e12;
  g.migrate(s, 0);
  assert.equal(Object.keys(s.relics).length, 4);
  g.RELICS.forEach((x) => (s.relics[x.id] = true));
  s.sub.until = 0;
  r = g.collectDive(s, 1, fixed(0));
  assert.equal(r.relic, undefined);
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'relic_8'));
});

test('reef garden corals grow, boost production, pay on harvest and cross-breed', () => {
  const s = g.newState(0);
  s.owned[0] = 10;
  assert.equal(g.plantCoral(s, 0, 'staghorn', 0), false, 'locked before the third zone');
  s.zone = 2;
  assert.equal(g.plantCoral(s, 0, 'fire', 0), false, 'hybrids must be discovered first');
  assert.ok(g.plantCoral(s, 0, 'staghorn', 0));
  assert.ok(g.plantCoral(s, 2, 'brain', 0));
  assert.equal(g.plantCoral(s, 0, 'brain', 0), false, 'one coral per plot');
  const before = g.baseMult(s);
  g.gardenTick(s, 10 * 60e3, fixed(0.99));
  assert.equal(s.garden.plots[0].grown, true);
  assert.equal(s.garden.plots[2].grown, false);
  assert.ok(Math.abs(g.baseMult(s) / before - 1.01) < 1e-9, 'a grown staghorn adds 1%');
  // Plot 1 sits between the staghorn and the brain coral: once both are grown it can sprout fire coral.
  assert.deepEqual(g.plotNeighbors(1).sort(), [0, 2, 4]);
  assert.equal(g.sproutCandidate(s, 1), null);
  const found = g.gardenTick(s, 60 * 60e3, fixed(0.05));
  assert.deepEqual(found, ['fire']);
  assert.equal(s.garden.plots[1].c, 'fire');
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'hybrid_1'));
  assert.ok(g.plantCoral(s, 3, 'fire', 0), 'found hybrids can be planted');
  const r = g.harvestCoral(s, 0, 60 * 60e3);
  assert.equal(Math.round(r.pearls), Math.round(Math.max(25, g.rawPPS(s) * 20)));
  assert.equal(s.garden.plots[0].c, '');
  assert.equal(g.harvestCoral(s, 1, 60 * 60e3), null, 'a seedling cannot be harvested');
  assert.ok(g.uprootCoral(s, 1));
  const back = g.deserialize(g.serialize(s), 0);
  assert.equal(back.garden.found.fire, true);
  assert.equal(back.garden.plots[2].c, 'brain');
});

test('a reminder fires when the last growing coral is grown', () => {
  const s = g.newState(0);
  s.zone = 2;
  g.plantCoral(s, 0, 'brain', 0);
  g.plantCoral(s, 1, 'staghorn', 0);
  let r = g.reminderPlan(s, 0, 20 * 3600e3, '1970-01-01').find((x) => x.id === 6);
  assert.equal(r.at, 60 * 60e3, 'waits for the slowest coral');
  g.gardenTick(s, 60 * 60e3, fixed(0.99));
  r = g.reminderPlan(s, 60 * 60e3, 20 * 3600e3, '1970-01-01').find((x) => x.id === 6);
  assert.equal(r, undefined, 'nothing left growing');
});

test('weekly ocean events rotate on UTC Mondays, count from the start and pay three tiers', () => {
  const mon = Date.UTC(2026, 9, 19); // Monday 19 October 2026
  assert.equal(g.eventWeek(mon), g.eventWeek(mon + 6.9 * 86400e3));
  assert.equal(g.eventWeek(mon) + 1, g.eventWeek(mon + 7 * 86400e3));
  assert.equal(g.eventEndsAt(mon + 1000), mon + 7 * 86400e3);
  const s = g.newState(mon);
  s.stats.taps = 500;
  // A fresh player has no submarine or garden, so those weeks fall back to the tapping event.
  for (let w = 0; w < 5; w++) assert.ok(['shoal', 'current', 'vents'].includes(g.eventFor(s, w).id));
  s.zone = 2; s.earnedRun = 1e9;
  assert.deepEqual([0, 1, 2, 3, 4].map((w) => g.eventFor(s, w).id).sort(), g.EVENTS.map((e) => e.id).sort());
  // Force this week to the tapping event and play through it.
  s.event.week = g.eventWeek(mon); s.event.id = 'current'; s.event.base = s.stats.taps; s.event.claimed = 0;
  assert.equal(g.eventProgress(s), 0, 'taps before the event do not count');
  assert.equal(g.claimEvent(s), null);
  s.stats.taps += 50000;
  const hearts = s.hearts;
  for (let tier = 0; tier < 3; tier++) assert.equal(g.claimEvent(s).tier, tier);
  assert.equal(g.claimEvent(s), null, 'three tiers only');
  assert.equal(s.hearts - hearts, 2 + 4 + 8);
  assert.equal(s.event.completed, 1);
  assert.ok(g.checkAchievements(s).some((a) => a.id === 'event_1'));
  // Next week starts fresh.
  g.rollEvent(s, mon + 7 * 86400e3);
  assert.equal(s.event.claimed, 0);
  assert.equal(g.eventProgress(s), 0);
  const back = g.deserialize(g.serialize(s), mon);
  assert.equal(back.event.completed, 1);
});

test('the welcome back card lists only what finished while the player was away', () => {
  const t0 = Date.UTC(2026, 9, 20, 12); // a Tuesday
  const s = g.newState(t0);
  s.zone = 2;
  g.rollEvent(s, t0);
  g.launchDive(s, 0, t0); // back after 15 minutes
  g.plantCoral(s, 0, 'staghorn', t0); // 10 minutes
  g.plantCoral(s, 1, 'fan', t0); // 4 hours
  assert.deepEqual(g.awaySummary(s, t0, t0 + 5 * 60e3), [], 'nothing finished yet');
  const items = g.awaySummary(s, t0, t0 + 60 * 60e3);
  assert.equal(items.length, 2);
  assert.match(items[0].text, /submarine is back/);
  assert.match(items[1].text, /^1 coral finished/);
  assert.deepEqual(g.awaySummary(s, t0 + 30 * 60e3, t0 + 60 * 60e3), [], 'already seen before the last visit');
  const later = g.awaySummary(s, t0, t0 + 7 * 86400e3);
  assert.ok(later.some((x) => /new weekly event/.test(x.text)));
  const left = s.lastSeen;
  assert.equal(g.applyOffline(s, t0 + 60e3).since, left, 'applyOffline reports when the player left');
});

test('the first-week guide hints one open step at a time and pays a Heart per step', () => {
  const s = g.newState(0);
  assert.equal(g.guideHint(s).id, 'tap');
  s.stats.taps = 10; s.owned[0] = 1;
  const got = g.advanceGuide(s);
  assert.deepEqual(got.map((x) => x.id), ['tap', 'crab']);
  assert.equal(s.hearts, 2);
  assert.deepEqual(g.advanceGuide(s), [], 'each step pays once');
  assert.equal(g.guideHint(s).id, 'upgrade');
  // Steps for locked features are skipped until they open.
  ['upgrade', 'fish', 'gift', 'twilight', 'request'].forEach((id) => (s.guide[id] = true));
  assert.notEqual(g.guideHint(s) && g.guideHint(s).id, 'geyser', 'geyser is still locked');
  assert.equal(g.guideHint(s), null, 'nothing open to point at yet');
  assert.equal(g.guideFinished(s), false);
  // An old save without guide data is credited silently.
  const old = JSON.parse(g.serialize(s));
  delete old.guide; old.hearts = 0; old.zone = 1;
  const back = g.deserialize(JSON.stringify(old), 0);
  assert.equal(back.guide.twilight, true);
  assert.equal(back.hearts, 0);
});

test('release notes show once to returning players and never to new ones', () => {
  const fresh = g.newState(0);
  assert.equal(g.whatsNew(fresh).length, 0);
  const old = JSON.parse(g.serialize(g.newState(0)));
  delete old.seen;
  const s = g.deserialize(JSON.stringify(old), 0);
  const notes = g.whatsNew(s);
  assert.ok(notes.length >= 1 && notes.length <= 2);
  assert.equal(notes[notes.length - 1].id, g.UPDATES[g.UPDATES.length - 1].id);
  g.markSeen(s);
  assert.equal(g.whatsNew(s).length, 0);
  assert.equal(g.whatsNew(g.deserialize(g.serialize(s), 0)).length, 0);
  s.seen = g.UPDATES[g.UPDATES.length - 1].id - 1;
  assert.deepEqual(g.whatsNew(s).map((u) => u.id), [g.UPDATES[g.UPDATES.length - 1].id]);
  assert.ok(g.UPDATES.every((u, i) => u.id === i + 1 && u.items.length > 0));
});

test('reduce motion is off by default and old saves load with it off', () => {
  assert.equal(g.newState(0).settings.calm, false);
  const old = JSON.parse(g.serialize(g.newState(0)));
  delete old.settings.calm;
  assert.equal(g.deserialize(JSON.stringify(old), 0).settings.calm, false);
  const on = g.newState(0); on.settings.calm = true;
  assert.equal(g.deserialize(g.serialize(on), 0).settings.calm, true);
});
