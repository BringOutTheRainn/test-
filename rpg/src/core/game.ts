// The saved game: gold, heroes, gear and dungeon progress, and the rules for changing them.

interface ItemInst { uid: number; id: string; plus: number }
interface HeroState { id: string; level: number; xp: number; gear: Record<Slot, number | null> }

interface GameState {
  v: number;
  gold: number;
  heroes: HeroState[];
  items: ItemInst[];
  nextItem: number;
  /** Best star count per stage id; present means cleared. */
  stars: Record<string, number>;
  seed: number;
  battles: number;
  wins: number;
  settings: { sound: boolean; fast: boolean; auto: boolean };
  seenIntro: boolean;
  /** Daily Trial progress: the last day it was won and the run of consecutive days. */
  trial: { lastWon: string; streak: number };
  /** Rewarded ads watched today. */
  ads: { day: string; used: number };
}

interface Rewards {
  result: 'win' | 'lose';
  stars: number;
  first: boolean;
  gold: number;
  xp: number;
  levelUps: { id: string; level: number }[];
  item: ItemInst | null;
  /** Set for Daily Trial fights. */
  trial?: { streak: number; repeat: boolean };
}

const SAVE_VERSION = 1;
const MAX_PLUS = 5;
const SLOTS: Slot[] = ['weapon', 'armor', 'charm'];

function newState(seed = Date.now()): GameState {
  return {
    v: SAVE_VERSION,
    gold: 0,
    heroes: HEROES.map((h) => ({ id: h.id, level: 1, xp: 0, gear: { weapon: null, armor: null, charm: null } })),
    items: [],
    nextItem: 1,
    stars: {},
    seed: seed | 0,
    battles: 0,
    wins: 0,
    settings: { sound: true, fast: false, auto: false },
    seenIntro: false,
    trial: { lastWon: '', streak: 0 },
    ads: { day: '', used: 0 },
  };
}

const heroDef = (id: string) => HEROES.find((h) => h.id === id)!;
const heroState = (s: GameState, id: string) => s.heroes.find((h) => h.id === id)!;
const stageDef = (id: string) => STAGES.find((st) => st.id === id)!;
const regionOf = (stageId: string) => REGIONS.find((r) => r.stages.some((st) => st.id === stageId))!;
const itemInst = (s: GameState, uid: number | null) => (uid === null ? null : s.items.find((i) => i.uid === uid) ?? null);

function xpToNext(level: number): number { return Math.round(25 * Math.pow(level, 1.5)); }

function itemStats(inst: ItemInst): Partial<Stats> {
  const d = ITEMS[inst.id];
  const m = 1 + 0.15 * inst.plus;
  const out: Partial<Stats> = {};
  for (const k of Object.keys(d.stats) as (keyof Stats)[]) {
    const v = d.stats[k]!;
    out[k] = k === 'crit' ? Math.round(v * m * 1000) / 1000 : k === 'spd' ? v : Math.round(v * m);
  }
  return out;
}

function heroStats(s: GameState, id: string): Stats {
  const d = heroDef(id);
  const h = heroState(s, id);
  const g = 1 + 0.1 * (h.level - 1);
  const st: Stats = {
    hp: Math.round(d.base.hp * (1 + 0.11 * (h.level - 1))),
    atk: Math.round(d.base.atk * g * 10) / 10,
    def: Math.round(d.base.def * g),
    spd: d.base.spd,
    crit: d.base.crit,
  };
  for (const slot of SLOTS) {
    const inst = itemInst(s, h.gear[slot]);
    if (!inst) continue;
    const add = itemStats(inst);
    for (const k of Object.keys(add) as (keyof Stats)[]) st[k] += add[k]!;
  }
  st.atk = Math.round(st.atk * 10) / 10;
  st.crit = Math.round(st.crit * 1000) / 1000;
  return st;
}

/** A rough "how strong is this hero" number for the UI. */
function power(st: Stats): number {
  return Math.round(st.hp * 0.5 + st.atk * 6 + st.def * 4 + st.spd * 3 + st.crit * 200);
}

function partyUnits(s: GameState): Unit[] {
  return HEROES.map((d) => {
    const st = heroStats(s, d.id);
    const h = heroState(s, d.id);
    return {
      uid: 'h_' + d.id, key: d.id, name: d.name, side: 'hero' as Side, art: d.art, level: h.level,
      maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd, crit: st.crit,
      skills: d.skills.slice(), cds: {}, statuses: [], ct: 0,
      boss: false, enrage: false, enraged: false, intent: null,
    };
  });
}

function stageUnlocked(s: GameState, stageId: string): boolean {
  const i = STAGES.findIndex((st) => st.id === stageId);
  return i === 0 || (i > 0 && s.stars[STAGES[i - 1].id] !== undefined);
}

function regionUnlocked(s: GameState, regionId: string): boolean {
  return stageUnlocked(s, REGIONS.find((r) => r.id === regionId)!.stages[0].id);
}

/** The furthest stage the player can fight. */
function frontier(s: GameState): StageDef {
  for (const st of STAGES) if (s.stars[st.id] === undefined) return st;
  return STAGES[STAGES.length - 1];
}

/** Hero turns allowed for the third star, set a little under what the autopilot needs. */
const PAR: Record<string, number> = {
  '1-1': 9, '1-2': 13, '1-3': 16, '1-4': 15, '1-5': 14,
  '2-1': 13, '2-2': 13, '2-3': 14, '2-4': 15, '2-5': 15,
  '3-1': 13, '3-2': 16, '3-3': 17, '3-4': 21, '3-5': 20,
  '4-1': 18, '4-2': 20, '4-3': 18, '4-4': 20, '4-5': 30,
};

function parFor(stage: StageDef): number {
  return PAR[stage.id] ?? stage.waves.flat().length * 3;
}

/** A level the party should be around to fight this stage comfortably. */
function suggestedLevel(stage: StageDef): number {
  const lv = stage.waves.flat().map(([, l]) => l);
  return Math.max(1, Math.max(...lv) - (stage.boss ? 0 : 1));
}

function starsFor(b: Battle, stage: StageDef): number {
  if (b.over !== 'win') return 0;
  return 1 + (b.fallen ? 0 : 1) + (b.heroActions <= parFor(stage) ? 1 : 0);
}

function nextSeed(s: GameState): number {
  s.seed = (Math.imul(s.seed ^ 0x9e3779b9, 0x85ebca6b) + 0x632be5ab) | 0;
  return s.seed;
}

function gameRand(s: GameState): number {
  return (nextSeed(s) >>> 0) / 4294967296;
}

function beginBattle(s: GameState, stageId: string): Battle {
  return startBattle(stageDef(stageId), partyUnits(s), nextSeed(s));
}

// ---- Daily Trial: one generated fight per day with a twist, for a big reward and a streak.

const AD_LIMIT = 3;
const TRIAL_UNLOCK = '1-2';

/** The UTC day, like "2026-10-14". Days roll over at midnight UTC for everyone. */
function dayKey(now: number): string { return new Date(now).toISOString().slice(0, 10); }

function prevDay(day: string): string { return dayKey(Date.parse(day + 'T00:00:00Z') - 86400e3); }

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function trialUnlocked(s: GameState): boolean { return s.stars[TRIAL_UNLOCK] !== undefined; }
function trialWonToday(s: GameState, day: string): boolean { return s.trial.lastWon === day; }

/** Today's streak if the trial is won today. */
function trialNextStreak(s: GameState, day: string): number {
  if (trialWonToday(s, day)) return s.trial.streak;
  return s.trial.lastWon === prevDay(day) ? s.trial.streak + 1 : 1;
}

/** The trial for a day: the same for everyone at the same progress, built from the frontier region. */
function trialFor(s: GameState, day: string): { stage: StageDef; region: RegionDef; mod: string } {
  let r = hashStr(day);
  const pick = <T>(xs: T[]): T => { r = Math.imul(r ^ (r >>> 15), 2246822507) >>> 0; return xs[r % xs.length]; };
  const front = frontier(s);
  const region = regionOf(front.id);
  // A little under the frontier: three waves with a twist is already a harder fight than a stage.
  const level = Math.max(1, Math.max(...front.waves.flat().map(([, l]) => l)) - 2);
  const pool = region.stages.filter((st) => !st.boss).flatMap((st) => st.waves);
  const waves = [pick(pool), pick(pool), pick(pool)].map((w) => w.map(([k]) => [k, level] as [string, number]));
  const streak = trialNextStreak(s, day);
  const bonus = 1 + 0.1 * Math.min(streak - 1, 5);
  const stage: StageDef = {
    id: 'trial', name: 'Daily Trial', waves,
    gold: Math.round(front.gold * 3 * bonus), xp: front.xp * 2,
  };
  return { stage, region, mod: pick(Object.keys(TRIAL_MODS)) };
}

function beginTrial(s: GameState, day: string): Battle {
  const t = trialFor(s, day);
  return startBattle(t.stage, partyUnits(s), nextSeed(s), t.region.id, t.mod);
}

function finishTrial(s: GameState, b: Battle, day: string): Rewards {
  s.battles++;
  const repeat = trialWonToday(s, day);
  const stage = b.stage;
  if (b.over !== 'win') {
    const xp = repeat ? 0 : Math.round(stage.xp * 0.3 * (1 + b.wave) / stage.waves.length);
    return { result: 'lose', stars: 0, first: false, gold: 0, xp, levelUps: addXp(s, xp), item: null, trial: { streak: s.trial.streak, repeat } };
  }
  s.wins++;
  if (repeat) return { result: 'win', stars: 0, first: false, gold: 0, xp: 0, levelUps: [], item: null, trial: { streak: s.trial.streak, repeat } };
  s.trial.streak = trialNextStreak(s, day);
  s.trial.lastWon = day;
  s.gold += stage.gold;
  const levelUps = addXp(s, stage.xp);
  const loot = REGIONS.find((r) => r.id === b.region)!.loot;
  const item = giveItem(s, loot[Math.floor(gameRand(s) * loot.length)]);
  return { result: 'win', stars: 0, first: true, gold: stage.gold, xp: stage.xp, levelUps, item, trial: { streak: s.trial.streak, repeat } };
}

// ---- Rewarded ads: optional, a few a day, double the gold from a win.

function adsLeft(s: GameState, day: string): number {
  return s.ads.day === day ? Math.max(0, AD_LIMIT - s.ads.used) : AD_LIMIT;
}

/** Call after the player finished watching an ad. Returns false when today's ads are used up. */
function claimAdBonus(s: GameState, gold: number, day: string): boolean {
  if (gold <= 0 || adsLeft(s, day) <= 0) return false;
  if (s.ads.day !== day) s.ads = { day, used: 0 };
  s.ads.used++;
  s.gold += gold;
  return true;
}

function addXp(s: GameState, amount: number): { id: string; level: number }[] {
  const ups: { id: string; level: number }[] = [];
  for (const h of s.heroes) {
    if (h.level >= MAX_LEVEL) continue;
    h.xp += amount;
    while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
      h.xp -= xpToNext(h.level);
      h.level++;
      ups.push({ id: h.id, level: h.level });
    }
    if (h.level >= MAX_LEVEL) h.xp = 0;
  }
  return ups;
}

function giveItem(s: GameState, id: string): ItemInst {
  const inst = { uid: s.nextItem++, id, plus: 0 };
  s.items.push(inst);
  return inst;
}

function rollLoot(s: GameState, stage: StageDef): string {
  const pool = regionOf(stage.id).loot;
  return pool[Math.floor(gameRand(s) * pool.length)];
}

/** Applies the outcome of a finished battle to the save and says what the player got. */
function finishBattle(s: GameState, b: Battle, now = Date.now()): Rewards {
  if (b.stageId === 'trial') return finishTrial(s, b, dayKey(now));
  const stage = b.stage;
  s.battles++;
  if (b.over !== 'win') {
    const xp = Math.round(stage.xp * 0.3 * (1 + b.wave) / stage.waves.length);
    return { result: 'lose', stars: 0, first: false, gold: 0, xp, levelUps: addXp(s, xp), item: null };
  }
  s.wins++;
  const first = s.stars[stage.id] === undefined;
  const stars = starsFor(b, stage);
  s.stars[stage.id] = Math.max(s.stars[stage.id] ?? 0, stars);
  const gold = stage.gold * (first ? 2 : 1);
  s.gold += gold;
  const levelUps = addXp(s, stage.xp);
  let item: ItemInst | null = null;
  if (first && stage.drop) item = giveItem(s, stage.drop);
  else if (gameRand(s) < (stage.boss ? 0.6 : 0.25)) item = giveItem(s, rollLoot(s, stage));
  return { result: 'win', stars, first, gold, xp: stage.xp, levelUps, item };
}

// ---- Gear

function canEquip(heroId: string, itemId: string): boolean {
  const d = ITEMS[itemId];
  return d.only.length === 0 || d.only.includes(heroId);
}

function wornBy(s: GameState, uid: number): string | null {
  for (const h of s.heroes) for (const slot of SLOTS) if (h.gear[slot] === uid) return h.id;
  return null;
}

function equip(s: GameState, heroId: string, slot: Slot, uid: number | null): boolean {
  const h = heroState(s, heroId);
  if (uid === null) { h.gear[slot] = null; return true; }
  const inst = itemInst(s, uid);
  if (!inst || ITEMS[inst.id].slot !== slot || !canEquip(heroId, inst.id)) return false;
  for (const other of s.heroes) for (const sl of SLOTS) if (other.gear[sl] === uid) other.gear[sl] = null;
  h.gear[slot] = uid;
  return true;
}

function shopTier(s: GameState): number {
  let tier = 1;
  REGIONS.forEach((r, i) => { if (regionUnlocked(s, r.id)) tier = i + 1; });
  return tier;
}

function shopStock(s: GameState): ItemDef[] {
  const tier = shopTier(s);
  return Object.values(ITEMS).filter((d) => d.tier <= tier && d.id !== 'troll_heart').sort((a, c) => a.price - c.price);
}

function buyItem(s: GameState, id: string): ItemInst | null {
  const d = ITEMS[id];
  if (!d || s.gold < d.price || !shopStock(s).includes(d)) return null;
  s.gold -= d.price;
  return giveItem(s, id);
}

function sellPrice(inst: ItemInst): number {
  return Math.round(ITEMS[inst.id].price * 0.4 + upgradeSpent(inst) * 0.5);
}

function upgradeSpent(inst: ItemInst): number {
  let t = 0;
  for (let p = 0; p < inst.plus; p++) t += upgradeCostAt(inst.id, p);
  return t;
}

function upgradeCostAt(id: string, plus: number): number {
  return Math.round(ITEMS[id].price * 0.6 * (plus + 1));
}

function upgradeCost(inst: ItemInst): number | null {
  return inst.plus >= MAX_PLUS ? null : upgradeCostAt(inst.id, inst.plus);
}

function upgradeItem(s: GameState, uid: number): boolean {
  const inst = itemInst(s, uid);
  if (!inst) return false;
  const cost = upgradeCost(inst);
  if (cost === null || s.gold < cost) return false;
  s.gold -= cost;
  inst.plus++;
  return true;
}

function sellItem(s: GameState, uid: number): number {
  const inst = itemInst(s, uid);
  if (!inst) return 0;
  for (const h of s.heroes) for (const sl of SLOTS) if (h.gear[sl] === uid) h.gear[sl] = null;
  s.items = s.items.filter((i) => i !== inst);
  const price = sellPrice(inst);
  s.gold += price;
  return price;
}

// ---- Saving

function serialize(s: GameState): string { return JSON.stringify(s); }

function deserialize(text: string | null): GameState | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || typeof raw.v !== 'number') return null;
    const s = Object.assign(newState(raw.seed ?? 1), raw) as GameState;
    s.settings = Object.assign(newState().settings, raw.settings ?? {});
    s.trial = Object.assign(newState().trial, raw.trial ?? {});
    s.ads = Object.assign(newState().ads, raw.ads ?? {});
    // Heroes added in later versions join at level 1.
    for (const d of HEROES) if (!s.heroes.some((h) => h.id === d.id)) s.heroes.push({ id: d.id, level: 1, xp: 0, gear: { weapon: null, armor: null, charm: null } });
    s.items = s.items.filter((i) => ITEMS[i.id]);
    for (const h of s.heroes) for (const sl of SLOTS) if (h.gear[sl] !== null && !itemInst(s, h.gear[sl])) h.gear[sl] = null;
    s.v = SAVE_VERSION;
    return s;
  } catch {
    return null;
  }
}
