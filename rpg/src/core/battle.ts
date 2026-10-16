// The battle rules. A battle is one plain object; every function here changes it and returns
// the events that happened, in order, so the UI can animate them. Nothing here touches the DOM.

type Side = 'hero' | 'enemy';

interface StatusInst { kind: StatusKind; turns: number; value: number }

interface Unit {
  uid: string;
  key: string;
  name: string;
  side: Side;
  art: string;
  tint?: string;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  skills: string[];
  cds: Record<string, number>;
  statuses: StatusInst[];
  /** Battle time of this unit's next turn; the lowest goes next. */
  ct: number;
  boss: boolean;
  enrage: boolean;
  enraged: boolean;
  intent: { skill: string; target: string | null } | null;
}

interface Battle {
  stageId: string;
  stage: StageDef;
  /** Region whose backdrop and loot this fight uses. */
  region: string;
  /** Daily Trial modifier id, if any. */
  mod: string | null;
  wave: number;
  waves: [string, number][][];
  heroes: Unit[];
  enemies: Unit[];
  seed: number;
  time: number;
  turn: string | null;
  heroActions: number;
  fallen: boolean;
  over: null | 'win' | 'lose';
  nextUid: number;
}

type Ev =
  | { k: 'turn'; who: string }
  | { k: 'act'; who: string; skill: string; targets: string[] }
  | { k: 'dmg'; who: string; amount: number; crit: boolean; absorbed: number; hp: number; dot?: StatusKind }
  | { k: 'heal'; who: string; amount: number; hp: number }
  | { k: 'status'; who: string; kind: StatusKind }
  | { k: 'cleanse'; who: string }
  | { k: 'resist'; who: string }
  | { k: 'stunned'; who: string }
  | { k: 'death'; who: string }
  | { k: 'revive'; who: string; hp: number }
  | { k: 'summon'; who: string }
  | { k: 'enrage'; who: string }
  | { k: 'wave'; n: number }
  | { k: 'end'; result: 'win' | 'lose' };

const TURN_COST = 1000;
const MAX_ENEMIES = 3;
// Global difficulty knobs, tuned with tools/simulate.mjs.
const ENEMY_HP = 0.8;
const BOSS_HP = 0.75;
const ENEMY_ATK = 3.6;

function rand(b: Battle): number {
  // mulberry32, kept in the battle so fights replay the same way from a seed.
  let t = (b.seed = (b.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function enemyLevelScale(level: number): number { return 1 + 0.16 * (level - 1); }
function enemyHpScale(level: number): number { return 1 + 0.12 * (level - 1); }

function makeEnemy(b: Battle, key: string, level: number): Unit {
  const d = ENEMIES[key];
  const sc = enemyLevelScale(level);
  const hp = Math.round(d.base.hp * enemyHpScale(level) * ENEMY_HP * (d.boss ? BOSS_HP : 1));
  const u: Unit = {
    uid: 'e' + b.nextUid++, key, name: d.name, side: 'enemy', art: d.art, tint: d.tint, level,
    maxHp: hp, hp, atk: Math.round(d.base.atk * sc * ENEMY_ATK * 10) / 10, def: Math.round(d.base.def * (1 + 0.1 * (level - 1))),
    spd: d.base.spd, crit: d.base.crit, skills: d.skills.slice(), cds: {}, statuses: [],
    ct: b.time + (TURN_COST / d.base.spd) * (0.35 + rand(b) * 0.65),
    boss: !!d.boss, enrage: !!d.enrage, enraged: false, intent: null,
  };
  // Specials start part way charged so the first turns are not all basic attacks.
  for (const s of u.skills) if (SKILLS[s].cd > 0) u.cds[s] = Math.floor(rand(b) * SKILLS[s].cd);
  return u;
}

function startBattle(stage: StageDef, heroes: Unit[], seed: number, region = '', mod: string | null = null): Battle {
  const b: Battle = {
    stageId: stage.id, stage, region: region || (REGIONS.find((r) => r.stages.includes(stage)) ?? REGIONS[0]).id, mod, wave: 0, waves: stage.waves, heroes, enemies: [], seed: seed | 0, time: 0,
    turn: null, heroActions: 0, fallen: false, over: null, nextUid: 1,
  };
  for (const h of heroes) h.ct = (TURN_COST / h.spd) * (0.2 + rand(b) * 0.5);
  if (mod) for (const h of heroes) applyMod(mod, h);
  spawnWave(b);
  return b;
}

function spawnWave(b: Battle): void {
  b.enemies = b.waves[b.wave].map(([key, lvl]) => makeEnemy(b, key, lvl));
  if (b.mod) for (const e of b.enemies) applyMod(b.mod, e);
  for (const e of b.enemies) chooseIntent(b, e);
}

/** Applies a Daily Trial modifier to one unit as it enters the fight. */
function applyMod(mod: string, u: Unit): void {
  const foe = u.side === 'enemy';
  switch (mod) {
    case 'swift': if (foe) u.spd = Math.round(u.spd * 1.2); break;
    case 'ironhide': if (foe) u.def = Math.round(u.def * 1.6); break;
    case 'glass': u.atk = Math.round(u.atk * 1.4 * 10) / 10; break;
    case 'blessed':
      if (!foe) u.statuses.push({ kind: 'regen', turns: 3, value: Math.round(u.maxHp * 0.06) }, { kind: 'atkUp', turns: 2, value: 0 });
      break;
    case 'warded': if (foe) u.statuses.push({ kind: 'shield', turns: 3, value: Math.round(u.maxHp * 0.3) }); break;
    case 'frail': if (!foe) u.hp = Math.round(u.hp * 0.75); break;
  }
}

const alive = (us: Unit[]) => us.filter((u) => u.hp > 0);
const findUnit = (b: Battle, uid: string | null) => (uid ? [...b.heroes, ...b.enemies].find((u) => u.uid === uid) ?? null : null);
const has = (u: Unit, k: StatusKind) => u.statuses.some((s) => s.kind === k);
const statusOf = (u: Unit, k: StatusKind) => u.statuses.find((s) => s.kind === k);
const foes = (b: Battle, u: Unit) => (u.side === 'hero' ? b.enemies : b.heroes);
const friends = (b: Battle, u: Unit) => (u.side === 'hero' ? b.heroes : b.enemies);
const current = (b: Battle) => findUnit(b, b.turn);

/** Who can be picked for this skill. Empty means it targets a group or self and needs no tap. */
function validTargets(b: Battle, u: Unit, skillId: string): Unit[] {
  const sk = SKILLS[skillId];
  switch (sk.target) {
    case 'enemy': {
      const f = alive(foes(b, u));
      const taunters = f.filter((x) => has(x, 'taunt'));
      return taunters.length ? taunters : f;
    }
    case 'ally': return alive(friends(b, u));
    case 'fallen': return friends(b, u).filter((x) => x.hp <= 0);
    default: return [];
  }
}

function needsTarget(skillId: string): boolean {
  const t = SKILLS[skillId].target;
  return t === 'enemy' || t === 'ally' || t === 'fallen';
}

function canUse(b: Battle, u: Unit, skillId: string): boolean {
  if ((u.cds[skillId] ?? 0) > 0) return false;
  const sk = SKILLS[skillId];
  if (needsTarget(skillId) && validTargets(b, u, skillId).length === 0) return false;
  if (sk.below !== undefined && u.hp / u.maxHp >= sk.below) return false;
  return true;
}

function nextActor(b: Battle): Unit | null {
  let best: Unit | null = null;
  for (const u of [...b.heroes, ...b.enemies]) if (u.hp > 0 && (!best || u.ct < best.ct)) best = u;
  return best;
}

/** The next `n` turns as unit ids, assuming nobody dies or changes speed. */
function turnQueue(b: Battle, n: number): string[] {
  const sim = [...b.heroes, ...b.enemies].filter((u) => u.hp > 0).map((u) => ({ uid: u.uid, ct: u.ct, step: TURN_COST / u.spd }));
  const out: string[] = [];
  if (b.turn && findUnit(b, b.turn)?.hp) {
    out.push(b.turn);
    const me = sim.find((s) => s.uid === b.turn);
    if (me) me.ct += me.step;
  }
  while (out.length < n && sim.length) {
    sim.sort((a, c) => a.ct - c.ct);
    out.push(sim[0].uid);
    sim[0].ct += sim[0].step;
  }
  return out;
}

function addStatus(b: Battle, src: Unit, tgt: Unit, e: Extract<Effect, { t: 'status' }>, ev: Ev[]): void {
  if (tgt.hp <= 0) return;
  if (e.chance !== undefined && rand(b) >= e.chance) return;
  // Bosses shrug off most stuns so a stun lock can't trivialise them.
  if (e.kind === 'stun' && tgt.boss && rand(b) < 0.5) { ev.push({ k: 'resist', who: tgt.uid }); return; }
  const value = Math.round(src.atk * (e.mult ?? 0));
  const old = statusOf(tgt, e.kind);
  if (old) { old.turns = Math.max(old.turns, e.turns); old.value = Math.max(old.value, value); }
  else tgt.statuses.push({ kind: e.kind, turns: e.turns, value });
  ev.push({ k: 'status', who: tgt.uid, kind: e.kind });
}

function damage(b: Battle, tgt: Unit, raw: number, ev: Ev[], crit = false, dot?: StatusKind): number {
  let amount = Math.max(1, Math.round(raw));
  let absorbed = 0;
  const sh = statusOf(tgt, 'shield');
  if (sh) {
    absorbed = Math.min(sh.value, amount);
    sh.value -= absorbed;
    amount -= absorbed;
    if (sh.value <= 0) tgt.statuses = tgt.statuses.filter((s) => s !== sh);
  }
  tgt.hp = Math.max(0, tgt.hp - amount);
  ev.push({ k: 'dmg', who: tgt.uid, amount, crit, absorbed, hp: tgt.hp, dot });
  if (tgt.hp <= 0) kill(b, tgt, ev);
  else if (tgt.enrage && !tgt.enraged && tgt.hp < tgt.maxHp / 2) {
    tgt.enraged = true;
    tgt.atk = Math.round(tgt.atk * 1.3 * 10) / 10;
    ev.push({ k: 'enrage', who: tgt.uid });
  }
  return amount;
}

function kill(b: Battle, u: Unit, ev: Ev[]): void {
  u.hp = 0;
  u.statuses = [];
  u.intent = null;
  if (u.side === 'hero') b.fallen = true;
  ev.push({ k: 'death', who: u.uid });
}

function heal(tgt: Unit, amount: number, ev: Ev[]): void {
  if (tgt.hp <= 0 || tgt.hp >= tgt.maxHp) return;
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.maxHp, tgt.hp + Math.round(amount));
  ev.push({ k: 'heal', who: tgt.uid, amount: tgt.hp - before, hp: tgt.hp });
}

function hitFor(b: Battle, src: Unit, tgt: Unit, mult: number, critBonus: number): { raw: number; crit: boolean } {
  let atk = src.atk * (has(src, 'atkUp') ? 1.35 : 1);
  let raw = atk * mult * (60 / (60 + tgt.def));
  if (has(tgt, 'defDown')) raw *= 1.35;
  if (has(tgt, 'guard')) raw *= 0.6;
  raw *= 0.9 + rand(b) * 0.2;
  const crit = rand(b) < src.crit + critBonus;
  if (crit) raw *= 1.6;
  return { raw, crit };
}

function targetsFor(b: Battle, u: Unit, skillId: string, picked: Unit | null): Unit[] {
  const sk = SKILLS[skillId];
  switch (sk.target) {
    case 'enemies': return alive(foes(b, u));
    case 'allies': return alive(friends(b, u));
    case 'self': return [u];
    default: return picked ? [picked] : [];
  }
}

/** Uses a skill. The unit must be the one whose turn it is. */
function useSkill(b: Battle, u: Unit, skillId: string, targetUid: string | null): Ev[] {
  const ev: Ev[] = [];
  const sk = SKILLS[skillId];
  let picked = findUnit(b, targetUid);
  if (needsTarget(skillId)) {
    const valid = validTargets(b, u, skillId);
    if (!picked || !valid.includes(picked)) picked = valid[0] ?? null;
  }
  const targets = targetsFor(b, u, skillId, picked);
  ev.push({ k: 'act', who: u.uid, skill: skillId, targets: targets.map((t) => t.uid) });
  if (sk.cd > 0) u.cds[skillId] = sk.cd + 1;
  if (u.side === 'hero') b.heroActions++;

  for (const t of targets) {
    let dealt = 0;
    for (const e of sk.effects) {
      switch (e.t) {
        case 'dmg': {
          if (t.hp <= 0) break;
          const h = hitFor(b, u, t, e.mult, e.crit ?? 0);
          dealt += damage(b, t, h.raw, ev, h.crit);
          break;
        }
        case 'drain': if (dealt > 0) heal(u, dealt * e.frac, ev); break;
        case 'heal': heal(t, u.atk * e.mult, ev); break;
        case 'status': addStatus(b, u, e.self ? u : t, e, ev); break;
        case 'cleanse': {
          const before = t.statuses.length;
          t.statuses = t.statuses.filter((s) => STATUS_INFO[s.kind].good);
          if (t.statuses.length < before) ev.push({ k: 'cleanse', who: t.uid });
          break;
        }
        case 'revive':
          if (t.hp <= 0) {
            t.hp = Math.round(t.maxHp * e.frac);
            t.statuses = [];
            t.ct = b.time + TURN_COST / t.spd;
            ev.push({ k: 'revive', who: t.uid, hp: t.hp });
          }
          break;
        case 'summon': {
          if (alive(b.enemies).length >= Math.min(e.max, MAX_ENEMIES)) break;
          const s = makeEnemy(b, e.enemy, Math.max(1, u.level - 1));
          s.ct = b.time + TURN_COST / s.spd;
          chooseIntent(b, s);
          const slot = b.enemies.findIndex((x) => x.hp <= 0);
          if (slot >= 0) b.enemies[slot] = s; else b.enemies.push(s);
          ev.push({ k: 'summon', who: s.uid });
          break;
        }
      }
    }
  }
  endTurn(b, u, ev);
  return ev;
}

function endTurn(b: Battle, u: Unit, ev: Ev[]): void {
  for (const s of u.statuses) s.turns--;
  u.statuses = u.statuses.filter((s) => s.turns > 0);
  u.ct += TURN_COST / u.spd;
  if (u.side === 'enemy' && u.hp > 0) chooseIntent(b, u);
  b.turn = null;
  checkEnd(b, ev);
  if (!b.over) retarget(b);
}

function checkEnd(b: Battle, ev: Ev[]): void {
  if (b.over) return;
  if (alive(b.heroes).length === 0) {
    b.over = 'lose';
    ev.push({ k: 'end', result: 'lose' });
  } else if (alive(b.enemies).length === 0) {
    if (b.wave + 1 < b.waves.length) {
      b.wave++;
      spawnWave(b);
      ev.push({ k: 'wave', n: b.wave });
    } else {
      b.over = 'win';
      ev.push({ k: 'end', result: 'win' });
    }
  }
}

/**
 * Runs the clock forward to the next unit that gets to choose an action: ticks poison and
 * regeneration, skips stunned units, and leaves `b.turn` set (unless the battle ended).
 */
function advance(b: Battle): Ev[] {
  const ev: Ev[] = [];
  while (!b.over) {
    const u = nextActor(b);
    if (!u) break;
    b.time = u.ct;
    for (const k of Object.keys(u.cds)) if (u.cds[k] > 0) u.cds[k]--;
    for (const s of u.statuses.slice()) {
      if (s.kind === 'poison' || s.kind === 'burn') damage(b, u, s.value, ev, false, s.kind);
      else if (s.kind === 'regen') heal(u, s.value, ev);
      if (u.hp <= 0) break;
    }
    if (u.hp <= 0) { checkEnd(b, ev); continue; }
    if (has(u, 'stun')) {
      u.statuses = u.statuses.filter((s) => s.kind !== 'stun');
      ev.push({ k: 'stunned', who: u.uid });
      endTurn(b, u, ev);
      continue;
    }
    b.turn = u.uid;
    ev.push({ k: 'turn', who: u.uid });
    break;
  }
  return ev;
}

// ---- Enemy brains

function pickTarget(b: Battle, u: Unit, skillId: string): Unit | null {
  const sk = SKILLS[skillId];
  const valid = validTargets(b, u, skillId);
  if (!valid.length) return null;
  if (sk.target === 'ally') return valid.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
  if (valid.length === 1) return valid[0];
  switch (sk.pick) {
    case 'lowest': return valid.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
    case 'strongest': return valid.slice().sort((a, c) => c.atk - a.atk)[0];
    case 'back': {
      const back = valid.filter((x) => x.key !== 'knight');
      const pool = back.length && rand(b) < 0.75 ? back : valid;
      return pool[Math.floor(rand(b) * pool.length)];
    }
    default: return valid[Math.floor(rand(b) * valid.length)];
  }
}

function chooseIntent(b: Battle, u: Unit): void {
  // Cooldowns tick at the start of the unit's own turn, so plan with one turn already counted.
  const ready = (s: string) => (u.cds[s] ?? 0) <= 1;
  let skill = u.skills[0];
  const specials = u.skills.slice(1).filter(ready);
  for (const s of specials) {
    const sk = SKILLS[s];
    if (sk.below !== undefined && u.hp / u.maxHp >= sk.below) continue;
    if (s === 'mend' && !alive(b.enemies).some((x) => x.hp < x.maxHp * 0.7)) continue;
    if (sk.effects.some((e) => e.t === 'summon') && alive(b.enemies).length >= MAX_ENEMIES) continue;
    if (rand(b) < 0.75) { skill = s; break; }
  }
  const t = needsTarget(skill) ? pickTarget(b, u, skill) : null;
  u.intent = { skill, target: t ? t.uid : null };
}

/** Keeps every enemy's announced target valid after deaths, revives and taunts. */
function retarget(b: Battle): void {
  for (const e of alive(b.enemies)) {
    if (!e.intent || !needsTarget(e.intent.skill)) continue;
    const valid = validTargets(b, e, e.intent.skill);
    if (!valid.some((v) => v.uid === e.intent!.target)) {
      const t = pickTarget(b, e, e.intent.skill);
      e.intent.target = t ? t.uid : null;
    }
  }
}

function enemyAct(b: Battle): Ev[] {
  const u = current(b);
  if (!u || u.side !== 'enemy') return [];
  let intent = u.intent;
  if (!intent || !canUse(b, u, intent.skill)) {
    chooseIntent(b, u);
    intent = u.intent!;
    if (!canUse(b, u, intent.skill)) intent = { skill: u.skills[0], target: pickTarget(b, u, u.skills[0])?.uid ?? null };
  }
  return useSkill(b, u, intent.skill, intent.target);
}

// ---- Hero autopilot, used by the Auto button and by the balance simulator

function autoChoice(b: Battle, u: Unit): { skill: string; target: string | null } {
  const ok = (s: string) => u.skills.includes(s) && canUse(b, u, s);
  const enemies = alive(b.enemies);
  const party = alive(b.heroes);
  const weakest = (xs: Unit[]) => xs.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
  const lowestHp = (xs: Unit[]) => xs.slice().sort((a, c) => a.hp - c.hp)[0];
  const biggest = (xs: Unit[]) => xs.slice().sort((a, c) => (c.boss ? 1 : 0) - (a.boss ? 1 : 0) || c.atk - a.atk)[0];
  const pick = (skill: string, t: Unit | null) => ({ skill, target: t ? t.uid : null });
  const valid = (s: string) => validTargets(b, u, s);
  const killable = (xs: Unit[]) => lowestHp(xs);

  if (u.key === 'cleric') {
    const fallen = b.heroes.filter((h) => h.hp <= 0);
    if (fallen.length && ok('revive')) return pick('revive', fallen[0]);
    const hurt = weakest(party);
    if (ok('heal') && hurt.hp < hurt.maxHp * 0.55) return pick('heal', hurt);
    if (ok('bless') && party.filter((h) => h.hp < h.maxHp * 0.8).length >= 2) return pick('bless', null);
    if (ok('heal') && party.some((h) => statusOf(h, 'poison') || statusOf(h, 'burn')) && hurt.hp < hurt.maxHp * 0.8) {
      return pick('heal', party.find((h) => has(h, 'poison') || has(h, 'burn')) ?? hurt);
    }
    if (ok('bless') && enemies.some((e) => e.boss)) return pick('bless', null);
    return pick('smite', killable(valid('smite')));
  }
  if (u.key === 'knight') {
    const threatened = enemies.some((e) => e.intent && e.intent.target && e.intent.target !== u.uid);
    if (ok('rally') && (enemies.some((e) => e.intent && SKILLS[e.intent.skill].target === 'enemies') || party.some((h) => h.hp < h.maxHp * 0.5))) return pick('rally', null);
    if (ok('taunt') && threatened && u.hp > u.maxHp * 0.45) return pick('taunt', null);
    if (ok('bash')) return pick('bash', biggest(valid('bash')));
    return pick('slash', killable(valid('slash')));
  }
  if (u.key === 'ranger') {
    if (ok('volley') && enemies.length >= 2) return pick('volley', null);
    if (ok('aimed')) return pick('aimed', biggest(valid('aimed')));
    const unpoisoned = valid('venom').filter((e) => !has(e, 'poison') && e.hp > e.maxHp * 0.4);
    if (ok('venom') && unpoisoned.length) return pick('venom', biggest(unpoisoned));
    return pick('shot', killable(valid('shot')));
  }
  if (u.key === 'duelist') {
    const target = biggest(valid('finisher'));
    if (ok('parry') && enemies.some((e) => e.intent && e.intent.target === u.uid) && u.hp < u.maxHp * 0.6) return pick('parry', null);
    if (ok('finisher')) return pick('finisher', enemies.some((e) => e.boss) ? target : killable(valid('finisher')));
    if (ok('flurry')) return pick('flurry', killable(valid('flurry')));
    if (ok('parry') && enemies.some((e) => e.boss)) return pick('parry', null);
    return pick('lunge', killable(valid('lunge')));
  }
  if (u.key === 'druid') {
    const hurt = weakest(party);
    const targeted = party.filter((h) => enemies.some((e) => e.intent && e.intent.target === h.uid));
    if (ok('grove') && party.filter((h) => h.hp < h.maxHp * 0.75 && !has(h, 'regen')).length >= 2) return pick('grove', null);
    if (ok('bark') && hurt.hp < hurt.maxHp * 0.5) return pick('bark', hurt);
    if (ok('roots') && enemies.length >= 2) return pick('roots', null);
    if (ok('bark') && targeted.length) return pick('bark', weakest(targeted));
    const fresh = valid('thorn').filter((e) => !has(e, 'poison'));
    return pick('thorn', fresh.length ? biggest(fresh) : killable(valid('thorn')));
  }
  if (u.key === 'pyromancer') {
    if (ok('inferno') && enemies.length >= 2) return pick('inferno', null);
    if (ok('fireball') && enemies.length >= 2) return pick('fireball', null);
    const cold = valid('ignite').filter((e) => !has(e, 'burn') && e.hp > e.maxHp * 0.35);
    if (ok('ignite') && cold.length) return pick('ignite', biggest(cold));
    return pick('firebolt', killable(valid('firebolt')));
  }
  const s = u.skills.find((x) => canUse(b, u, x)) ?? u.skills[0];
  return pick(s, valid(s)[0] ?? null);
}

function heroAct(b: Battle, skillId: string, targetUid: string | null): Ev[] {
  const u = current(b);
  if (!u || u.side !== 'hero' || !canUse(b, u, skillId)) return [];
  return useSkill(b, u, skillId, targetUid);
}

/** Plays a whole battle with the autopilot. For tests and the balance simulator. */
function autoBattle(b: Battle, maxTurns = 600): Ev[] {
  const all: Ev[] = [];
  for (let i = 0; i < maxTurns && !b.over; i++) {
    all.push(...advance(b));
    if (b.over) break;
    const u = current(b)!;
    if (u.side === 'enemy') all.push(...enemyAct(b));
    else { const c = autoChoice(b, u); all.push(...heroAct(b, c.skill, c.target)); }
  }
  return all;
}
