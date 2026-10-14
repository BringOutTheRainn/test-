// Rule tests. Run with: npm test (builds first).
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../build/core.js');

const stage = (id) => g.stageDef(id);
const unit = (b, key) => [...b.heroes, ...b.enemies].find((u) => u.key === key);

/** Advances the battle until it is `key`'s turn, letting everyone else act on autopilot. */
function untilTurnOf(b, key) {
  for (let i = 0; i < 200 && !b.over; i++) {
    if (!b.turn) g.advance(b);
    const u = g.current(b);
    if (!u) continue;
    if (u.key === key) return u;
    if (u.side === 'enemy') g.enemyAct(b);
    else { const c = g.autoChoice(b, u); g.heroAct(b, c.skill, c.target); }
  }
  throw new Error('never got a turn for ' + key);
}

/** Makes `u` the next to act (after ticking its effects) and advances to it. */
function giveTurn(b, u) {
  for (const x of [...b.heroes, ...b.enemies]) x.ct = b.time + 1000;
  u.ct = b.time;
  return g.advance(b);
}

test('a new game starts with three level 1 heroes and the first stage open', () => {
  const s = g.newState(1);
  assert.deepEqual(s.heroes.map((h) => h.id), ['knight', 'ranger', 'cleric']);
  assert.ok(s.heroes.every((h) => h.level === 1));
  assert.ok(g.stageUnlocked(s, '1-1'));
  assert.ok(!g.stageUnlocked(s, '1-2'));
  assert.equal(g.frontier(s).id, '1-1');
});

test('every stage refers to real enemies and every hero skill exists', () => {
  for (const st of g.STAGES) for (const w of st.waves) for (const [k] of w) assert.ok(g.ENEMIES[k], `${st.id}: ${k}`);
  for (const h of g.HEROES) for (const sk of h.skills) assert.ok(g.SKILLS[sk], sk);
  for (const e of Object.values(g.ENEMIES)) for (const sk of e.skills) assert.ok(g.SKILLS[sk], sk);
  for (const r of g.REGIONS) for (const id of r.loot) assert.ok(g.ITEMS[id], id);
  for (const st of g.STAGES) if (st.drop) assert.ok(g.ITEMS[st.drop], st.drop);
});

test('battles replay identically from the same seed', () => {
  const s = g.newState(1);
  const run = () => { const b = g.startBattle(stage('1-3'), g.partyUnits(s), 99); return JSON.stringify(g.autoBattle(b)); };
  assert.equal(run(), run());
});

test('the fastest unit goes first and the queue lists upcoming turns', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 5);
  const q = g.turnQueue(b, 6);
  assert.equal(q.length, 6);
  g.advance(b);
  assert.equal(b.turn, q[0]);
});

test('skills go on cooldown and come back', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 7);
  const r = untilTurnOf(b, 'ranger');
  const target = g.validTargets(b, r, 'volley')[0];
  assert.ok(g.canUse(b, r, 'volley'));
  g.heroAct(b, 'volley', target ? target.uid : null);
  untilTurnOf(b, 'ranger');
  assert.ok(!g.canUse(b, r, 'volley'), 'on cooldown the next turn');
  for (let i = 0; i < 3; i++) { g.heroAct(b, 'shot', null); if (b.over) return; untilTurnOf(b, 'ranger'); }
  assert.ok(g.canUse(b, r, 'volley'), 'ready again after its cooldown');
});

test('stunned units skip their turn', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 3);
  const bat = b.enemies[0];
  bat.statuses.push({ kind: 'stun', turns: 1, value: 0 });
  const ev = giveTurn(b, bat);
  assert.deepEqual(ev[0], { k: 'stunned', who: bat.uid });
  assert.ok(bat.ct > b.time - 1, 'its turn was spent');
  assert.ok(!bat.statuses.some((s) => s.kind === 'stun'));
});

test('taunt forces enemies to attack the knight', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 11);
  const k = unit(b, 'knight');
  k.statuses.push({ kind: 'taunt', turns: 2, value: 0 });
  const bat = b.enemies[0];
  const targets = g.validTargets(b, bat, 'bite');
  assert.deepEqual(targets.map((t) => t.uid), [k.uid]);
});

test('poison ticks at the start of a turn and heal cures it', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 13);
  const w = unit(b, 'ranger');
  w.statuses.push({ kind: 'poison', turns: 2, value: 10 });
  const ev = giveTurn(b, w);
  assert.ok(ev.some((e) => e.k === 'dmg' && e.who === w.uid && e.dot === 'poison' && e.amount === 10));
  assert.equal(w.hp, w.maxHp - 10);
  g.heroAct(b, 'shot', null);
  // Mira heals and cleanses.
  giveTurn(b, unit(b, 'cleric'));
  assert.ok(g.heroAct(b, 'heal', w.uid).length > 0);
  assert.ok(!w.statuses.some((s) => s.kind === 'poison'));
  assert.ok(w.hp > w.maxHp - 10);
});

test('shields absorb damage before health', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 17);
  const k = unit(b, 'knight');
  k.statuses.push({ kind: 'shield', turns: 3, value: 1000 });
  const bat = b.enemies[0];
  giveTurn(b, bat);
  bat.intent = { skill: 'bite', target: k.uid };
  const ev = g.enemyAct(b);
  const hit = ev.find((e) => e.k === 'dmg');
  assert.equal(hit.amount, 0);
  assert.ok(hit.absorbed > 0);
  assert.equal(k.hp, k.maxHp);
});

test('the cleric can resurrect a fallen hero', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 19);
  const w = unit(b, 'ranger');
  w.hp = 0; b.fallen = true;
  untilTurnOf(b, 'cleric');
  assert.ok(g.canUse(b, g.current(b), 'revive'));
  g.heroAct(b, 'revive', w.uid);
  assert.equal(w.hp, Math.round(w.maxHp * 0.5));
});

test('clearing all waves wins; losing every hero loses', () => {
  const b = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 23);
  for (const e of b.enemies) e.hp = 1;
  b.waves = [b.waves[0]];
  const r = untilTurnOf(b, 'ranger');
  g.heroAct(b, 'volley', null);
  assert.equal(b.over, 'win');
  assert.ok(r);

  const b2 = g.startBattle(stage('1-1'), g.partyUnits(g.newState(1)), 29);
  for (const h of b2.heroes) h.hp = 1;
  g.autoBattle(b2);
  assert.equal(b2.over, 'lose');
});

test('winning pays gold, experience and stars; first clears pay double', () => {
  const s = g.newState(3);
  const b = g.beginBattle(s, '1-1');
  g.autoBattle(b);
  assert.equal(b.over, 'win');
  const r = g.finishBattle(s, b);
  assert.equal(r.first, true);
  assert.equal(r.gold, stage('1-1').gold * 2);
  assert.equal(s.gold, r.gold);
  assert.ok(r.stars >= 1 && r.stars <= 3);
  assert.equal(s.stars['1-1'], r.stars);
  assert.ok(g.stageUnlocked(s, '1-2'));
  assert.ok(s.heroes.every((h) => h.level > 1 || h.xp > 0));
});

test('boss first clears give their item', () => {
  const s = g.newState(5);
  for (const h of s.heroes) h.level = 10;
  for (const st of g.STAGES.slice(0, 4)) s.stars[st.id] = 1;
  const b = g.beginBattle(s, '1-5');
  g.autoBattle(b);
  assert.equal(b.over, 'win');
  const r = g.finishBattle(s, b);
  assert.equal(r.item.id, 'bone_ring');
});

test('levels raise stats and xp needs grow', () => {
  const s = g.newState(1);
  const before = g.heroStats(s, 'knight');
  const ups = g.addXp(s, 500);
  assert.ok(ups.length > 0);
  const after = g.heroStats(s, 'knight');
  assert.ok(after.hp > before.hp && after.atk > before.atk);
  assert.ok(g.xpToNext(5) > g.xpToNext(4));
});

test('buying, equipping, upgrading and selling gear', () => {
  const s = g.newState(1);
  s.gold = 1000;
  const sword = g.buyItem(s, 'rusty_sword');
  assert.ok(sword);
  assert.equal(s.gold, 940);
  assert.ok(!g.equip(s, 'ranger', 'weapon', sword.uid), 'rangers cannot use swords');
  assert.ok(g.equip(s, 'knight', 'weapon', sword.uid));
  const base = g.heroStats(s, 'knight').atk;
  assert.ok(g.upgradeItem(s, sword.uid));
  assert.equal(sword.plus, 1);
  assert.ok(g.heroStats(s, 'knight').atk >= base);
  assert.equal(g.buyItem(s, 'iron_plate'), null, 'deeper stock is locked');
  const goldBefore = s.gold;
  const got = g.sellItem(s, sword.uid);
  assert.ok(got > 0);
  assert.equal(s.gold, goldBefore + got);
  assert.equal(g.heroState(s, 'knight').gear.weapon, null);
});

test('one item can only be worn by one hero', () => {
  const s = g.newState(1);
  const vest = g.giveItem(s, 'padded_vest');
  g.equip(s, 'knight', 'armor', vest.uid);
  g.equip(s, 'cleric', 'armor', vest.uid);
  assert.equal(g.heroState(s, 'knight').gear.armor, null);
  assert.equal(g.heroState(s, 'cleric').gear.armor, vest.uid);
});

test('saves round-trip and bad saves are ignored', () => {
  const s = g.newState(1);
  s.gold = 123; s.stars['1-1'] = 2;
  const vest = g.giveItem(s, 'padded_vest');
  g.equip(s, 'knight', 'armor', vest.uid);
  const back = g.deserialize(g.serialize(s));
  assert.equal(back.gold, 123);
  assert.equal(back.stars['1-1'], 2);
  assert.equal(g.heroState(back, 'knight').gear.armor, vest.uid);
  assert.equal(g.deserialize('not json'), null);
  assert.equal(g.deserialize(null), null);
  // Unknown items are dropped and their slots cleared.
  const raw = JSON.parse(g.serialize(s));
  raw.items[0].id = 'gone';
  const fixed = g.deserialize(JSON.stringify(raw));
  assert.equal(fixed.items.length, 0);
  assert.equal(g.heroState(fixed, 'knight').gear.armor, null);
});

test('a geared party at the suggested level usually beats each stage on autopilot', () => {
  for (const [ri, region] of g.REGIONS.entries()) {
    for (const st of region.stages) {
      const s = g.newState(1);
      for (const h of s.heroes) h.level = g.suggestedLevel(st);
      // Gear a player could have bought by now: the best shop item per slot, upgraded twice.
      const stock = Object.values(g.ITEMS).filter((d) => d.tier <= ri + 1 && d.id !== 'troll_heart');
      for (const h of g.HEROES) {
        for (const slot of ['weapon', 'armor', 'charm']) {
          const best = stock.filter((d) => d.slot === slot && g.canEquip(h.id, d.id)).sort((a, b) => b.price - a.price)[0];
          if (!best) continue;
          const inst = g.giveItem(s, best.id);
          inst.plus = 2;
          g.equip(s, h.id, slot, inst.uid);
        }
      }
      let wins = 0;
      for (let i = 0; i < 30; i++) {
        const b = g.startBattle(st, g.partyUnits(s), 500 + i);
        g.autoBattle(b);
        if (b.over === 'win') wins++;
      }
      assert.ok(wins >= 15, `${st.id}: ${wins}/30`);
    }
  }
});

test('the opening stage is beatable by a fresh party', () => {
  const s = g.newState(1);
  let wins = 0;
  for (let i = 0; i < 30; i++) {
    const b = g.startBattle(stage('1-1'), g.partyUnits(s), 900 + i);
    g.autoBattle(b);
    if (b.over === 'win') wins++;
  }
  assert.ok(wins >= 28, `${wins}/30`);
});

test('the daily trial is the same all day, changes by day and unlocks after 1-2', () => {
  const s = g.newState(1);
  assert.ok(!g.trialUnlocked(s));
  s.stars['1-1'] = 3; s.stars['1-2'] = 3;
  assert.ok(g.trialUnlocked(s));
  const a = g.trialFor(s, '2026-10-14');
  const b = g.trialFor(s, '2026-10-14');
  assert.deepEqual(a.stage.waves, b.stage.waves);
  assert.equal(a.mod, b.mod);
  assert.equal(a.stage.waves.length, 3);
  assert.ok(g.TRIAL_MODS[a.mod]);
  const days = new Set(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) => g.trialFor(s, d).mod + JSON.stringify(g.trialFor(s, d).stage.waves)));
  assert.ok(days.size > 1, 'varies between days');
});

test('winning the trial pays once a day and builds a streak', () => {
  const s = g.newState(2);
  for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5']) s.stars[id] = 3;
  for (const h of s.heroes) h.level = 12;
  const win = (day) => {
    for (let i = 0; i < 5; i++) {
      const b = g.beginTrial(s, day);
      assert.equal(b.stageId, 'trial');
      assert.ok(b.mod);
      g.autoBattle(b);
      const r = g.finishBattle(s, b, Date.parse(day + 'T12:00:00Z'));
      if (r.result === 'win') return r;
    }
    throw new Error('could not win the trial');
  };
  const d1 = win('2026-10-14');
  assert.ok(d1.gold > 0 && d1.item);
  assert.equal(d1.trial.streak, 1);
  assert.ok(g.trialWonToday(s, '2026-10-14'));
  const again = win('2026-10-14');
  assert.equal(again.gold, 0, 'no second reward the same day');
  assert.equal(again.trial.repeat, true);
  assert.equal(win('2026-10-15').trial.streak, 2);
  assert.equal(win('2026-10-17').trial.streak, 1, 'missing a day resets the streak');
});

test('rewarded ads add gold up to a daily limit', () => {
  const s = g.newState(1);
  const day = '2026-10-14';
  assert.equal(g.adsLeft(s, day), 3);
  for (let i = 0; i < 3; i++) assert.ok(g.claimAdBonus(s, 10, day));
  assert.equal(s.gold, 30);
  assert.ok(!g.claimAdBonus(s, 10, day));
  assert.equal(g.adsLeft(s, '2026-10-15'), 3, 'resets the next day');
  assert.equal(g.prevDay('2026-03-01'), '2026-02-28');
});
