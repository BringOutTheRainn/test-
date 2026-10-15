// Plays the whole campaign with the autopilot to check the difficulty curve.
// For each stage it prints how many tries it took, the party level, and the win rate over
// 200 fresh fights with that party. Gear is bought greedily, like a sensible player would.
// Usage: node tools/simulate.mjs [runs]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const g = require('../build/core.js');

function shop(s) {
  // Buy the best affordable item for an empty or weaker slot, then spend the rest on upgrades.
  for (let guard = 0; guard < 20; guard++) {
    let best = null;
    for (const d of g.shopStock(s)) {
      if (d.price > s.gold) continue;
      for (const h of s.heroes.filter((x) => s.party.includes(x.id))) {
        if (!g.canEquip(h.id, d.id)) continue;
        const cur = s.items.find((i) => i.uid === g.heroState(s, h.id).gear[d.slot]);
        if (cur && g.ITEMS[cur.id].price >= d.price) continue;
        if (!best || d.price > best.d.price) best = { d, h };
      }
    }
    if (!best) break;
    const inst = g.buyItem(s, best.d.id);
    g.equip(s, best.h.id, best.d.slot, inst.uid);
  }
  for (let guard = 0; guard < 30; guard++) {
    const worn = s.heroes.flatMap((h) => Object.values(h.gear)).filter((u) => u !== null).map((u) => s.items.find((i) => i.uid === u));
    const next = worn.map((i) => ({ i, c: g.upgradeCost(i) })).filter((x) => x.c !== null && x.c <= s.gold).sort((a, b) => a.c - b.c)[0];
    if (!next) break;
    g.upgradeItem(s, next.i.uid);
  }
  // Equip drops that beat what's worn.
  for (const inst of s.items) {
    for (const h of s.heroes.filter((x) => s.party.includes(x.id))) {
      const d = g.ITEMS[inst.id];
      if (!g.canEquip(h.id, inst.id)) continue;
      const cur = s.items.find((i) => i.uid === g.heroState(s, h.id).gear[d.slot]);
      if (!cur || g.ITEMS[cur.id].price < d.price) { if (!s.heroes.some((x) => Object.values(x.gear).includes(inst.uid))) g.equip(s, h.id, d.slot, inst.uid); }
    }
  }
}

function winRate(s, stageId, n = 200, party = s.party) {
  const saved = s.party; s.party = party;
  let wins = 0, stars = 0, turns = 0, hpLeft = 0;
  for (let i = 0; i < n; i++) {
    const b = g.startBattle(g.stageDef(stageId), g.partyUnits(s), 1000 + i * 7919);
    g.autoBattle(b);
    if (b.over === 'win') { wins++; stars += g.starsFor(b, g.stageDef(stageId)); turns += b.heroActions; hpLeft += b.heroes.reduce((a, h) => a + h.hp / h.maxHp, 0) / 3; }
  }
  s.party = saved;
  return { rate: wins / n, stars: wins ? stars / wins : 0, turns: wins ? turns / wins : 0, hp: wins ? hpLeft / wins : 0 };
}

const s = g.newState(42);
let fights = 0;
console.log('stage  tries  lvl      gold   win%  stars  hpLeft heroTurns(par)');
for (const st of g.STAGES) {
  let tries = 0;
  while (true) {
    shop(s);
    const wr = winRate(s, st.id, 60);
    const b = g.beginBattle(s, st.id);
    g.autoBattle(b);
    tries++; fights++;
    const r = g.finishBattle(s, b);
    if (r.result === 'win') {
      for (const d of g.HEROES) if (g.canRecruit(s, d.id) && s.gold >= d.recruit.cost) { g.recruitHero(s, d.id); console.log(`       recruited ${d.name} the ${d.cls}`); }
      const lv = s.party.map((id) => g.heroState(s, id).level).join('/');
      console.log(`${st.id.padEnd(6)} ${String(tries).padStart(5)}  ${lv.padEnd(8)} ${String(s.gold).padStart(5)}  ${(wr.rate * 100).toFixed(0).padStart(4)}  ${wr.stars.toFixed(1)}   ${(wr.hp * 100).toFixed(0).padStart(3)}%  ${wr.turns.toFixed(1)} (${g.parFor(st)})`);
      break;
    }
    // Lost: farm the previous stage a couple of times.
    const i = g.STAGES.indexOf(st);
    for (let k = 0; k < 2 && i > 0; k++) {
      const fb = g.beginBattle(s, g.STAGES[i - 1].id); g.autoBattle(fb); g.finishBattle(s, fb); fights++;
    }
    if (tries > 40) { console.log(st.id, 'stuck'); process.exit(1); }
  }
}
console.log('total fights', fights, 'items', s.items.map((i) => i.id + '+' + i.plus).join(' '));

// How every possible party does on the boss stages at the run's final level.
// Everyone gets the same standard: the best shop item per slot at +2.
for (const d of g.HEROES) if (d.recruit && !s.heroes.some((h) => h.id === d.id)) { s.gold += d.recruit.cost; g.recruitHero(s, d.id); }
const ids = s.heroes.map((h) => h.id);
{
  for (const h of s.heroes) h.level = Math.max(...s.heroes.map((x) => x.level));
  const stock = Object.values(g.ITEMS).filter((d) => d.tier <= 4 && d.id !== 'troll_heart');
  for (const h of s.heroes) for (const slot of ['weapon', 'armor', 'charm']) {
    const best = stock.filter((d) => d.slot === slot && g.canEquip(h.id, d.id)).sort((a, b) => b.price - a.price)[0];
    if (best) { const inst = g.giveItem(s, best.id); inst.plus = 2; h.gear[slot] = inst.uid; }
  }
  const combos = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) combos.push([ids[a], ids[b], ids[c]]);
  const bosses = g.STAGES.filter((st) => st.boss).map((st) => st.id);
  console.log('\nparty win% at level', s.heroes[0].level, '  ' + bosses.join('   '));
  const rows = combos.map((p) => ({ p, r: bosses.map((id) => winRate(s, id, 40, p).rate) }));
  rows.sort((x, y) => y.r[y.r.length - 1] - x.r[x.r.length - 1]);
  for (const { p, r } of rows) console.log(p.join('+').padEnd(28), r.map((x) => (x * 100).toFixed(0).padStart(4) + '% ').join(''));
}
