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

test('hyperdrive from rewarded ads doubles production, stacks to a cap, and runs offline', async () => {
  const { grantHyper, hyperCanStack, hyperRemainingMs, interstitialAllowed } = await import('../www/js/core/ads.js');
  const s = newState(0);
  s.generators[1] = 10;
  const t = 1_000_000;
  assert.equal(computeDerived(s, t).sps, 10);
  grantHyper(s, t);
  assert.equal(hyperRemainingMs(s, t), 2 * 3600000);
  assert.equal(computeDerived(s, t).sps, 20);
  grantHyper(s, t); grantHyper(s, t); grantHyper(s, t);
  assert.equal(hyperRemainingMs(s, t), 8 * 3600000);
  assert.ok(!hyperCanStack(s, t));
  grantHyper(s, t);
  assert.equal(hyperRemainingMs(s, t), 8 * 3600000, 'capped');
  assert.equal(computeDerived(s, t + 9 * 3600000).sps, 10, 'expired');

  // Offline: 1 hour away with 30 minutes of Hyperdrive left.
  const o = newState(0);
  o.generators[1] = 10;
  o.lastSeen = 0;
  o.hyperEndsAt = 1800 * 1000;
  const r = applyOffline(o, computeDerived(o, 0), 3600 * 1000);
  assert.equal(r.earned, 10 * 0.25 * (3600 + 1800));

  const p = newState(0);
  assert.ok(!interstitialAllowed(p, 10 ** 12), 'not in the first minutes');
  p.playSeconds = 3600;
  assert.ok(interstitialAllowed(p, 10 ** 12));
  p.lastInterstitialAt = 10 ** 12 - 60000;
  assert.ok(!interstitialAllowed(p, 10 ** 12), 'gap between full-screen ads');
  p.lastInterstitialAt = 0;
  p.noAds = true;
  assert.ok(!interstitialAllowed(p, 10 ** 12));
});

test('missions fill three slots, track progress, pay out and reset with the universe', async () => {
  const { ensureMissions, missionDone, missionProgress, claimMission, swapMission, claimableMissions } = await import('../www/js/core/missions.js');
  const s = newState(0);
  s.generators[0] = 10;
  const d = computeDerived(s, 0);
  ensureMissions(s, d, seq(0.1, 0.5, 0.9, 0.3));
  assert.equal(s.missions.length, 3);
  const keys = s.missions.map((m) => `${m.kind}:${m.gen ?? ''}`);
  assert.equal(new Set(keys).size, 3, 'no duplicate missions');

  // Force a tap mission and complete it.
  s.missions[0] = { kind: 'taps', target: 5, start: s.tapsAll, minutes: 6 };
  assert.equal(missionDone(s, s.missions[0]), false);
  s.tapsAll += 5;
  assert.equal(missionProgress(s, s.missions[0]), 5);
  assert.equal(claimableMissions(s), 1);
  const before = s.stardust;
  const paid = claimMission(s, d, 0, seq(0.7));
  assert.ok(paid > 0 && s.stardust === before + paid);
  assert.equal(s.missionsDone, 1);
  assert.equal(s.missions.length, 3);
  assert.equal(claimMission(s, d, 1), 0, 'unfinished missions pay nothing');

  // Own missions count the absolute number owned.
  s.missions[1] = { kind: 'own', gen: 0, target: 15, start: 10, minutes: 8 };
  s.generators[0] = 15;
  assert.ok(missionDone(s, s.missions[1]));

  assert.ok(swapMission(s, d, 2, seq(0.2)));
  assert.equal(s.missions.length, 3);

  // Collapsing clears the board; it refills from the new universe.
  s.earnedAll = 1e12;
  collapse(s, computeDerived(s, 0), 0);
  assert.equal(s.missions.length, 0);
  assert.equal(s.missionsDone, 1);
});

test('tap frenzy multiplies taps, auto-taps, then recharges', async () => {
  const { grantFrenzy, frenzyReady, frenzyCooldown } = await import('../www/js/core/ads.js');
  const s = newState(0);
  const before = computeDerived(s, 0);
  assert.ok(frenzyReady(s));
  grantFrenzy(s);
  const d = computeDerived(s, 0);
  assert.equal(d.tap, before.tap * 10);
  assert.equal(d.autoTap, before.autoTap + 20);
  assert.equal(frenzyReady(s), false);
  tick(s, d, 61);
  const after = computeDerived(s, 0);
  assert.equal(after.tap, before.tap);
  assert.ok(frenzyCooldown(s) > 0 && !frenzyReady(s), 'still recharging');
  s.time += 300;
  assert.ok(frenzyReady(s));
  assert.equal(s.adsWatched, 1);
});

test('reminders cover storage, hyperdrive, probes and the daily drop, never too soon', async () => {
  const { planReminders } = await import('../www/js/core/notify.js');
  const now = new Date(2026, 9, 11, 9, 0, 0).getTime();
  const s = newState(now);
  assert.deepEqual(planReminders(s, computeDerived(s, now), now).map((r) => r.id), [4], 'nothing produced yet: only the daily drop');
  s.generators[0] = 5;
  s.hyperEndsAt = now + 2 * 3600000;
  s.expeditions = [{ id: 'x', startedAt: now, returnsAt: now + 3600000 }, { id: 'y', startedAt: now, returnsAt: now + 7200000 }];
  const list = planReminders(s, computeDerived(s, now), now);
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  assert.equal(byId[1].at, now + 8 * 3600000, 'storage full after the offline cap');
  assert.equal(byId[2].at, s.hyperEndsAt);
  assert.equal(byId[3].at, now + 3600000, 'earliest probe');
  assert.equal(new Date(byId[4].at).getHours(), 18);
  assert.ok(list.every((r, i) => i === 0 || r.at >= list[i - 1].at), 'sorted by time');
  s.hyperEndsAt = now + 60000;
  assert.ok(!planReminders(s, computeDerived(s, now), now).some((r) => r.id === 2), 'skips events under 10 minutes away');
});

test('weekly contracts rotate by week, pay three tiers and award a permanent medal', async () => {
  const { weekNumber, currentContract, contractProgress, contractClaimable, claimContract, contractTimeLeft, CONTRACTS } = await import('../www/js/core/contracts.js');
  const monday = new Date(2026, 9, 12, 0, 0, 1).getTime();
  const sunday = new Date(2026, 9, 11, 23, 59, 0).getTime();
  assert.equal(weekNumber(monday), weekNumber(sunday) + 1, 'weeks turn over on Monday');
  assert.ok(contractTimeLeft(sunday) <= 60000 + 1000 && contractTimeLeft(sunday) > 0);
  assert.equal(new Set([0, 1, 2].map((i) => currentContract(newState(0), monday + i * 7 * 86400000).def.id)).size, CONTRACTS.length);

  const s = newState(monday);
  s.generators[0] = 10;
  const { def } = currentContract(s, monday);
  const bump = (n) => { if (def.counter === 'comets') s.cometsAll += n; else if (def.counter === 'taps') s.tapsAll += n; else s.missionsDone += n; };
  bump(def.goals[0]);
  assert.equal(contractProgress(s, monday), def.goals[0]);
  assert.equal(contractClaimable(s, monday), 1);
  const d = computeDerived(s, monday);
  const r1 = claimContract(s, d, monday);
  assert.ok(r1 && r1.tier === 0 && !r1.medal && r1.amount > 0);
  assert.equal(claimContract(s, d, monday), null, 'nothing more until tier 2');
  bump(def.goals[2]);
  assert.equal(contractClaimable(s, monday), 2);
  claimContract(s, d, monday);
  const r3 = claimContract(s, d, monday);
  assert.ok(r3.medal);
  assert.equal(s.contractMedals, 1);
  assert.ok(computeDerived(s, monday).sps > d.sps * 1.04, 'medal adds production');

  // A new week starts fresh from the current counters.
  const next = monday + 7 * 86400000;
  currentContract(s, next);
  assert.equal(contractProgress(s, next), 0);
  assert.equal(s.contract.claimed, 0);
  assert.equal(s.contractMedals, 1, 'medals are kept');
});

test('auto-fabricators buy the best-value generator only when unlocked and switched on', async () => {
  const { bestGenerator, autoBuyStep } = await import('../www/js/core/autobuy.js');
  const s = newState(0);
  s.stardust = 1e6;
  s.generators[0] = 10; s.generators[1] = 5;
  let d = computeDerived(s, 0);
  assert.equal(d.autoBuy, false);
  assert.equal(autoBuyStep(s, d), 0, 'locked without the Cosmic upgrade');
  s.cosmic.fabricators = true;
  d = computeDerived(s, 0);
  assert.ok(d.autoBuy);
  const best = bestGenerator(s, d);
  assert.ok(best >= 0 && best <= 2, 'only visible generators');
  const before = s.generators.reduce((a, b) => a + b, 0);
  const n = autoBuyStep(s, d, 5);
  assert.equal(n, 5);
  assert.equal(s.generators.reduce((a, b) => a + b, 0), before + 5);
  assert.ok(s.stardust < 1e6);
  s.autoBuyOn = false;
  assert.equal(autoBuyStep(s, computeDerived(s, 0)), 0, 'switched off');
  s.autoBuyOn = true; s.stardust = 0;
  assert.equal(autoBuyStep(s, computeDerived(s, 0)), 0, 'nothing affordable');
});

test('quasar crystals grow in real time, level generators for good, and an ad speeds one up', async () => {
  const c = await import('../www/js/core/crystals.js');
  const H = 3600000;
  const s = newState(0);
  assert.equal(c.growCrystals(s, 0), 0);
  assert.equal(s.crystalNextAt, 0, 'locked before a billion Stardust');
  s.earnedAll = 2e9;
  c.growCrystals(s, 0);
  assert.equal(s.crystalNextAt, 20 * H);
  assert.equal(c.growCrystals(s, 19 * H), 0);
  assert.ok(Math.abs(c.crystalProgress(s, 10 * H) - 0.5) < 1e-9);
  assert.ok(c.speedUpCrystal(s, 10 * H));
  assert.equal(s.crystalNextAt, 18 * H);
  assert.equal(c.speedUpCrystal(s, 10 * H), false, 'once per crystal');
  assert.equal(c.growCrystals(s, 18 * H + 41 * H), 3, 'time away counts');
  assert.equal(s.crystals, 3);
  assert.equal(s.crystalAdUsed, false);

  s.generators[0] = 10;
  const before = computeDerived(s, 0).genSps[0];
  assert.ok(c.levelUp(s, 0));
  assert.ok(c.levelUp(s, 0), 'second level costs 2');
  assert.equal(s.crystals, 0);
  assert.equal(c.levelUp(s, 0), false);
  assert.ok(Math.abs(computeDerived(s, 0).genSps[0] / before - 1.1) < 1e-9, '+5% per level');
  s.earnedAll = 1e12;
  collapse(s, computeDerived(s, 0), 0);
  assert.equal(s.genLevels[0], 2, 'levels survive a collapse');
  const back = deserialize(serialize(s));
  assert.equal(back.genLevels[0], 2);
});

test('nebula garden opens at refinery level 1, grows in real time and pays on harvest', async () => {
  const g = await import('../www/js/core/garden.js');
  const M = 60000;
  const s = newState(0);
  assert.equal(g.plotCount(s), 0);
  assert.equal(g.plant(s, 0, 'moss', 0), false, 'locked');
  s.genLevels[g.GARDEN_GEN] = 1;
  assert.equal(g.plotCount(s), 4);
  s.genLevels[g.GARDEN_GEN] = 10;
  assert.equal(g.plotCount(s), 9, 'capped at 3 by 3');
  s.genLevels[g.GARDEN_GEN] = 1;
  s.generators[0] = 100;
  const d = computeDerived(s, 0);
  assert.ok(g.plant(s, 0, 'moss', 0));
  assert.equal(g.plant(s, 0, 'bloom', 0), false, 'plot taken');
  assert.ok(g.plant(s, 3, 'orchid', 0));
  assert.equal(g.plant(s, 4, 'moss', 0), false, 'beyond plot count');
  assert.equal(g.harvest(s, d, 0, 4 * M), 0, 'not ripe');
  assert.equal(g.readyPlots(s, 5 * M), 1);
  const before = s.stardust;
  const paid = g.harvest(s, d, 0, 5 * M);
  const want = Math.max(d.baseSps * 90, 75) * 1.05;
  assert.ok(Math.abs(paid - want) < 1e-6);
  assert.ok(Math.abs(s.stardust - before - paid) < 1e-6);
  assert.equal(s.garden[0], null);
  assert.equal(s.gardenHarvests, 1);
  // Fertilizer: 2 hours of growth, then a 4 hour cooldown.
  assert.ok(g.fertilizeReady(s, 10 * M));
  assert.ok(g.fertilize(s, 10 * M));
  assert.ok(Math.abs(g.plotProgress(s.garden[3], 10 * M) - 130 / 480) < 1e-9);
  assert.equal(g.fertilize(s, 20 * M), false, 'cooldown');
  // Harvest all replants the same spore.
  const total = g.harvestAll(s, d, 480 * M);
  assert.ok(total > 0);
  assert.equal(s.garden[3].seed, 'orchid');
  assert.equal(s.garden[3].plantedAt, 480 * M);
  // Plots survive a save round trip; bad entries are dropped.
  const raw = JSON.parse(serialize(s));
  raw.garden.push({ seed: 'weeds', plantedAt: 1 });
  const back = deserialize(JSON.stringify(raw), 0);
  assert.equal(back.garden[3].seed, 'orchid');
  assert.equal(back.garden[4], null);
});

test('weekend events run Friday to Sunday, keep flowing while away and pay badges', async () => {
  const ev = await import('../www/js/core/event.js');
  const fri = new Date(2026, 9, 16, 10).getTime();
  const wed = new Date(2026, 9, 14, 10).getTime();
  const sun = new Date(2026, 9, 18, 23).getTime();
  assert.ok(ev.eventActive(fri) && ev.eventActive(sun));
  assert.equal(ev.eventActive(wed), false);
  assert.equal(ev.eventTimeLeft(wed), new Date(2026, 9, 16).getTime() - wed, 'counts down to Friday');
  assert.equal(ev.eventTimeLeft(sun), 3600000, 'ends Monday midnight');
  const s = newState(0);
  assert.equal(ev.currentEvent(s, fri), null, 'locked for brand new players');
  s.earnedAll = 2e6;
  assert.equal(ev.currentEvent(s, wed), null, 'nothing midweek');
  const e = ev.currentEvent(s, fri);
  assert.ok(e && e.flux === 0);
  for (let i = 0; i < 10; i++) ev.eventTapOnce(e);
  assert.equal(e.flux, 10);
  assert.ok(ev.buyEventGen(e, 0));
  assert.equal(e.flux, 0);
  assert.equal(ev.buyEventGen(e, 1), false, 'too expensive');
  // An hour away at 1 Flux/s.
  const later = ev.currentEvent(s, fri + 3600000);
  assert.equal(later, e);
  assert.ok(Math.abs(e.flux - 3600) < 1e-6);
  // Badges.
  const d = computeDerived(s, 0);
  e.earned = ev.BADGE_GOALS[2];
  for (let tier = 0; tier < 3; tier++) assert.ok(ev.claimBadge(s, d, e) > 0);
  assert.equal(ev.claimBadge(s, d, e), 0);
  assert.equal(s.contractMedals, 1, 'gold gives a medal');
  assert.equal(s.eventGolds, 1);
  // Rewarded ad: 10 minutes of Flux, then a 2 hour cooldown.
  const now = fri + 3600000;
  const before = e.flux;
  assert.equal(ev.eventAdBoost(e, now), 600);
  assert.equal(e.flux, before + 600);
  assert.equal(ev.eventAdBoost(e, now + 60000), 0);
  // Save round trip, then a new weekend wipes the economy but keeps the golds.
  const back = deserialize(serialize(s), 0);
  assert.equal(back.event.gens[0], 1);
  const next = ev.currentEvent(back, fri + 7 * 86400000);
  assert.equal(next.gens[0], 0);
  assert.equal(next.claimed, 0);
  assert.equal(back.eventGolds, 1);
});

test('star forge heat refills in real time and pays for forgings', async () => {
  const f = await import('../www/js/core/forge.js');
  const M = 60000;
  const T = 1.7e12;
  const s = newState(0);
  s.generators[0] = 100;
  const d = computeDerived(s, 0);
  assert.equal(f.cast(s, d, 'smelt', T).ok, false, 'locked');
  s.genLevels[f.FORGE_GEN] = 1;
  assert.equal(f.maxHeat(s), 50);
  assert.equal(f.syncHeat(s, T), 50, 'starts full');
  const before = s.stardust;
  const r = f.cast(s, d, 'smelt', T, () => 0.5);
  assert.ok(r.ok && !r.failed && r.amount > 0);
  assert.ok(Math.abs(s.stardust - before - r.amount) < 1e-6);
  assert.equal(s.forgeHeat, 30);
  assert.ok(f.cast(s, d, 'smelt', T, () => 0.01).failed, 'a cracked melt');
  assert.equal(s.forgeHeat, 10);
  assert.equal(f.cast(s, d, 'lure', T).ok, false, 'not enough heat');
  // 120 minutes refill 50 heat: 60 minutes give 25.
  assert.ok(Math.abs(f.syncHeat(s, T + 60 * M) - 35) < 1e-9);
  s.time = 500; s.nextCometAt = 9999;
  assert.ok(f.cast(s, d, 'lure', T + 60 * M).ok);
  assert.equal(s.nextCometAt, 500, 'comet due now');
  assert.ok(Math.abs(f.heatFullIn(s) - 96 * M) < 1);
  // Stoke ad refills, then waits 4 hours.
  assert.ok(f.stoke(s, T + 60 * M));
  assert.equal(s.forgeHeat, 50);
  assert.ok(f.cast(s, d, 'overclock', T + 60 * M).ok);
  assert.ok(s.buffs.some((b) => b.kind === 'rush'));
  assert.equal(f.stoke(s, T + 61 * M), false);
  assert.equal(s.forgeCasts, 4);
});

test('shop purchases grant once, the vault fills in real time, and the event pass adds a tier', async () => {
  const shop = await import('../www/js/core/shop.js');
  const ev = await import('../www/js/core/event.js');
  const H = 3600000;
  const T = new Date(2026, 9, 17, 12).getTime(); // a Saturday
  const s = newState(T);
  s.generators[0] = 100;
  let d = computeDerived(s, 0);
  const base = d.baseSps;
  // Supporter: no ads, x2 forever, only once.
  assert.ok(shop.canBuy(s, 'supporter_pack', T));
  assert.ok(shop.grant(s, d, 'supporter_pack', T));
  assert.equal(s.noAds, true);
  assert.equal(shop.grant(s, d, 'supporter_pack', T), null, 'restores do not double up');
  assert.equal(shop.canBuy(s, 'supporter_pack', T), false);
  d = computeDerived(s, 0);
  assert.ok(Math.abs(d.baseSps - base * 2) < 1e-9);
  // Starter: limited to the first 3 days.
  assert.ok(shop.canBuy(s, 'starter_pack', T + 71 * H));
  assert.equal(shop.canBuy(s, 'starter_pack', T + 73 * H), false);
  const g = shop.grant(s, d, 'starter_pack', T);
  assert.equal(g.crystals, 10);
  assert.ok(Math.abs(computeDerived(s, 0).baseSps - base * 2.2) < 1e-9);
  // Crystal packs need crystals unlocked; consumables stack.
  assert.equal(shop.canBuy(s, 'crystals_5', T), false);
  s.earnedAll = 2e9;
  assert.ok(shop.canBuy(s, 'crystals_5', T));
  shop.grant(s, d, 'crystals_5', T); shop.grant(s, d, 'crystals_5', T);
  assert.equal(s.crystals, 20);
  assert.equal(s.purchases.crystals_5, 2);
  // Vault: 15 minutes per hour, capped at 12 hours.
  shop.fillVault(s, T);
  assert.equal(shop.canBuy(s, 'vault_open', T), false, 'empty');
  shop.fillVault(s, T + 8 * H);
  assert.ok(Math.abs(s.vaultHours - 2) < 1e-9);
  shop.fillVault(s, T + 100 * H);
  assert.equal(s.vaultHours, 12);
  d = computeDerived(s, 0);
  const before = s.stardust;
  const v = shop.grant(s, d, 'vault_open', T + 100 * H);
  assert.ok(Math.abs(v.stardust - d.baseSps * 12 * 3600) < 1e-6);
  assert.equal(v.crystals, 3);
  assert.ok(s.stardust > before);
  assert.equal(s.vaultHours, 0);
  // Event pass: double Flux and a fourth badge.
  const e = ev.currentEvent(s, T);
  assert.equal(ev.badgeCount(e), 3);
  ev.buyEventGen(e, 0) || (e.flux = 10, ev.buyEventGen(e, 0));
  const rate = ev.eventRate(e);
  shop.grant(s, d, 'event_pass', T);
  assert.ok(e.pass);
  assert.equal(ev.eventRate(e), rate * 2);
  assert.equal(ev.badgeCount(e), 4);
  assert.equal(shop.canBuy(s, 'event_pass', T), false, 'one pass per weekend');
  e.earned = ev.BADGE_GOALS[3];
  const crystals = s.crystals;
  for (let i = 0; i < 4; i++) assert.ok(ev.claimBadge(s, d, e) > 0);
  assert.equal(s.crystals, crystals + 10, 'platinum pays crystals');
  // Skins.
  assert.equal(shop.setSkin(s, 'lava'), false);
  shop.grant(s, d, 'skin_lava', T);
  assert.equal(s.skin, 'lava');
  assert.ok(shop.setSkin(s, 'default'));
  // Saves keep purchases.
  const back = deserialize(serialize(s), 0);
  assert.equal(back.purchases.supporter_pack, 1);
  assert.equal(back.event.pass, true);
});

test('star pass counts XP from existing counters and pays both tracks', async () => {
  const pass = await import('../www/js/core/pass.js');
  const shop = await import('../www/js/core/shop.js');
  const T = new Date(2026, 9, 14, 12).getTime();
  const s = newState(T);
  s.generators[0] = 100;
  s.missionsDone = 5; s.cometsAll = 40;
  const d = computeDerived(s, 0);
  const p = pass.currentPass(s, T);
  assert.equal(pass.passXp(s, p), 0, 'counts from the season start');
  s.missionsDone += 10; s.cometsAll += 20; s.dailyClaims += 2;
  assert.equal(pass.passXp(s, p), 10 * 20 + 20 * 3 + 2 * 25);
  assert.equal(pass.passTier(s, p), 1);
  assert.equal(pass.passClaimable(s, T), 1);
  let r = pass.claimPass(s, d, T);
  assert.equal(r.tiers, 1);
  assert.ok(r.stardust > 0);
  assert.equal(pass.passClaimable(s, T), 0);
  // Premium pays every reached tier on its track at once.
  s.missionsDone += 200; // 4000 XP more: tier 17
  assert.equal(pass.passTier(s, p), 17);
  assert.ok(shop.canBuy(s, 'star_pass', T));
  shop.grant(s, d, 'star_pass', T);
  assert.equal(shop.canBuy(s, 'star_pass', T), false);
  assert.equal(pass.passClaimable(s, T), 16 + 17);
  const medals = s.contractMedals;
  r = pass.claimPass(s, d, T);
  assert.equal(r.tiers, 33);
  assert.equal(s.contractMedals, medals + 1, 'premium medal at tier 10');
  assert.equal(r.crystals, 3 + 2 * 5, 'free every 5th tier, premium 2 every 3rd');
  // The top premium tier gives the Aurora skin.
  s.missionsDone += 1000;
  r = pass.claimPass(s, d, T);
  assert.equal(r.skin, 'aurora');
  assert.equal(s.skin, 'aurora');
  assert.equal(pass.passTier(s, p), 30);
  // A new season starts fresh.
  const next = pass.currentPass(s, T + 29 * 86400000);
  assert.notEqual(next.season, p.season);
  assert.equal(pass.passXp(s, next), 0);
  assert.equal(next.premium, false);
  assert.ok(pass.seasonTimeLeft(T) > 0 && pass.seasonTimeLeft(T) <= 28 * 86400000);
});

test('rewarded boosts last twice as long during weekend events', async () => {
  const ads = await import('../www/js/core/ads.js');
  const fri = new Date(2026, 9, 16, 10).getTime();
  const wed = new Date(2026, 9, 14, 10).getTime();
  assert.equal(ads.boostMult(fri), 2);
  assert.equal(ads.boostMult(wed), 1);
  const s = newState(0);
  ads.grantHyper(s, wed);
  const normal = s.hyperEndsAt - wed;
  s.hyperEndsAt = 0;
  ads.grantHyper(s, fri);
  assert.equal(s.hyperEndsAt - fri, normal * 2);
});

test('warp exchange prices drift, goods trade at a profit, and tips lift the cheapest good', async () => {
  const mk = await import('../www/js/core/market.js');
  const M = 60000;
  const T = 1.7e12;
  const s = newState(0);
  s.generators[0] = 100;
  const d = computeDerived(s, 0);
  assert.equal(mk.syncMarket(s, T), null, 'locked');
  s.genLevels[mk.MARKET_GEN] = 1;
  assert.equal(mk.holdSize(s), 50);
  const m = mk.syncMarket(s, T, () => 0.5);
  assert.equal(m.goods[0].price, mk.GOODS[0].rest);
  // A day and a half away only catches up a day of ticks.
  let n = 0;
  mk.syncMarket(s, T + 36 * 60 * M, () => { n++; return 0.5; });
  assert.ok(n > 0 && n <= mk.MAX_CATCHUP * mk.GOODS.length * 3);
  assert.equal(m.last, T + 36 * 60 * M);
  for (const g of m.goods) assert.ok(g.hist.length <= mk.HISTORY && g.price > 0);
  // Buy at a set price, sell higher: only the profit counts as earned.
  const unit = mk.creditValue(d);
  m.goods[1].price = 10;
  s.stardust = 1000 * unit;
  assert.equal(mk.buyGood(s, d, 1, 80, T + 36 * 60 * M), 50, 'hold caps the buy');
  assert.ok(Math.abs(s.stardust - 500 * unit) < 1e-6);
  m.goods[1].price = 14;
  const earned = s.earnedAll;
  const r = mk.sellGood(s, d, 1, Infinity, T + 36 * 60 * M);
  assert.equal(r.sold, 50);
  assert.ok(Math.abs(r.profit - 200) < 1e-9);
  assert.ok(Math.abs(s.stardust - 1200 * unit) < 1e-6);
  assert.ok(Math.abs(s.earnedAll - earned - 200 * unit) < 1e-6);
  assert.equal(s.marketWins, 1);
  // A loss returns what the goods fetch and earns nothing.
  mk.buyGood(s, d, 1, 10, T + 36 * 60 * M);
  m.goods[1].price = 7;
  assert.ok(mk.sellGood(s, d, 1, 10, T + 36 * 60 * M).profit < 0);
  assert.equal(s.marketWins, 1);
  // The tip goes to the good furthest under its resting price and rises.
  m.goods[2].price = mk.GOODS[2].rest * 0.3;
  const at = T + 36 * 60 * M;
  assert.equal(mk.insiderTip(s, at), 2);
  assert.equal(mk.insiderTip(s, at), -1, 'one at a time');
  const before = m.goods[2].price;
  mk.syncMarket(s, at + 30 * M, () => 0.5);
  assert.ok(m.goods[2].price > before);
  mk.syncMarket(s, at + 70 * M, () => 0.5);
  assert.equal(m.tip, -1, 'tip ends after an hour');
  // Saves round-trip.
  const back = deserialize(serialize(s), at);
  assert.equal(back.market.goods[2].hist.length, m.goods[2].hist.length);
  assert.equal(back.marketWins, 1);
});

test('lucky orbit gives one free spin a day and two ad spins, and goods are sold before a collapse', async () => {
  const w = await import('../www/js/core/wheel.js');
  const mk = await import('../www/js/core/market.js');
  const day = 86400000;
  const T = 1.7e12;
  const s = newState(0);
  s.generators[0] = 100;
  const d = computeDerived(s, 0);
  assert.ok(w.freeSpinReady(s, T));
  assert.equal(w.adSpinsLeft(s, T), 0, 'free spin first');
  assert.equal(w.spin(s, d, true, T), null);
  const r = w.spin(s, d, false, T, () => 0);
  assert.equal(r.slice, 0);
  assert.ok(r.amount > 0 && s.stardust >= r.amount);
  assert.equal(w.spin(s, d, false, T), null, 'one free spin');
  assert.equal(w.adSpinsLeft(s, T), 2);
  // Weight just past the 15 min slice lands on Hyperdrive.
  assert.equal(w.spin(s, d, true, T, () => 25 / 100).slice, 1);
  assert.ok(s.hyperEndsAt >= T + 30 * 60000);
  assert.equal(w.spin(s, d, true, T, () => 0.999).slice, 7, 'jackpot is last');
  assert.equal(w.adSpinsLeft(s, T), 0);
  assert.equal(s.adsWatched, 2);
  assert.ok(w.freeSpinReady(s, T + day), 'resets the next day');
  assert.equal(s.wheelSpins, 3);
  // Goods are sold before a collapse, so their profit counts toward Dark Matter.
  s.genLevels[mk.MARKET_GEN] = 1;
  const m = mk.syncMarket(s, T);
  m.goods[0].price = 5;
  s.stardust += 100 * mk.creditValue(d);
  mk.buyGood(s, d, 0, 10, T);
  m.goods[0].price = 9;
  s.earnedAll = 1e13; s.earnedRun = 1e13;
  const earnedBefore = s.earnedAll;
  assert.ok(collapse(s, d, T) >= 1);
  assert.equal(m.goods[0].held, 0);
  assert.ok(s.earnedAll > earnedBefore, 'profit counted');
});
