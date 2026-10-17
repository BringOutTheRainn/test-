// Game rules: pure-ish functions over one State object. Time is in milliseconds.

interface Boost { kind: 'rush' | 'burst' | 'whale' | 'surge'; until: number; mult: number; }
interface Visitor { kind: 'fish' | 'whale'; spawnedAt: number; until: number; y: number; dir: 1 | -1; }

interface State {
  v: number;
  pearls: number;
  earnedRun: number;
  earnedLife: number;
  owned: number[];
  upgrades: Record<string, boolean>;
  zone: number;
  combo: number;
  lastTap: number;
  boosts: Boost[];
  visitor: Visitor | null;
  nextVisitorAt: number;
  moonstones: number;
  moonstonesSpent: number;
  perks: Record<string, number>;
  achievements: Record<string, boolean>;
  stats: {
    taps: number; tapsRun: number; fish: number; whales: number; migrations: number;
    bestCombo: number; tapEarned: number; startedAt: number; runStartedAt: number; spawnCatches: number;
  };
  settings: { sound: boolean; vibrate: boolean; sci: boolean; ambience: boolean; reminders: boolean };
  buyAmount: number; // 1, 10, 100 or -1 for max
  lastSeen: number;
  daily: Daily;
  geyser: { until: number; readyAt: number; acc: number; uses: number };
  ads: { day: string; surges: number; giftDoubled: string; watched: number };
  hearts: number;
  rares: Record<string, boolean>;
  requests: { list: ReefRequest[]; done: number; nextAt: number };
  sub: { dive: number; startedAt: number; until: number; dives: number; speeds: number; speedDay: string };
}

// Reef Requests: three short goals at a time, each paying Pearls and a Heart.
interface ReefRequest { kind: 'taps' | 'fish' | 'own' | 'earn' | 'geyser' | 'combo' | 'descend'; target: number; base: number; gen?: number; got?: boolean; }

// Daily Tide Gift: earned by playing (taps today), not just by opening the app.
interface Daily { day: string; taps: number; claimedDay: string; streak: number; }

const SAVE_VERSION = 1;
const OFFLINE_CAP_MS = 8 * 3600e3;
const TIDE_PERIOD_MS = 8 * 60e3;
const VISITOR_LIFE_MS = 12e3;
const COMBO_WINDOW_MS = 700;

function newState(now: number): State {
  return {
    v: SAVE_VERSION,
    pearls: 0, earnedRun: 0, earnedLife: 0,
    owned: GENS.map(() => 0),
    upgrades: {},
    zone: 0,
    combo: 0, lastTap: 0,
    boosts: [],
    visitor: null,
    nextVisitorAt: now + 90e3,
    moonstones: 0, moonstonesSpent: 0,
    perks: {},
    achievements: {},
    stats: { taps: 0, tapsRun: 0, fish: 0, whales: 0, migrations: 0, bestCombo: 0, tapEarned: 0, startedAt: now, runStartedAt: now, spawnCatches: 0 },
    settings: { sound: true, vibrate: true, sci: false, ambience: true, reminders: true },
    buyAmount: 1,
    lastSeen: now,
    daily: { day: '', taps: 0, claimedDay: '', streak: 0 },
    geyser: { until: 0, readyAt: 0, acc: 0, uses: 0 },
    ads: { day: '', surges: 0, giftDoubled: '', watched: 0 },
    hearts: 0,
    rares: {},
    requests: { list: [], done: 0, nextAt: 0 },
    sub: { dive: -1, startedAt: 0, until: 0, dives: 0, speeds: 0, speedDay: '' },
  };
}

const has = (s: State, id: string) => !!s.upgrades[id];
const rare = (s: State, id: string) => !!s.rares[id];
const perk = (s: State, id: string) => s.perks[id] || 0;
const totalOwned = (s: State) => s.owned.reduce((a, b) => a + b, 0);

// ---------- Costs and buying ----------

function genCost(s: State, i: number, count = 1): number {
  const base = GENS[i].cost * Math.pow(COST_GROWTH, s.owned[i]);
  return base * (Math.pow(COST_GROWTH, count) - 1) / (COST_GROWTH - 1);
}

function maxAffordable(s: State, i: number): number {
  const base = GENS[i].cost * Math.pow(COST_GROWTH, s.owned[i]);
  if (s.pearls < base) return 0;
  return Math.floor(Math.log(s.pearls * (COST_GROWTH - 1) / base + 1) / Math.log(COST_GROWTH));
}

function buyCount(s: State, i: number): number {
  return s.buyAmount === -1 ? Math.max(1, maxAffordable(s, i)) : s.buyAmount;
}

function genUnlocked(s: State, i: number): boolean {
  if (GENS[i].zone > s.zone) return false;
  return i === 0 || s.owned[i - 1] > 0 || s.owned[i] > 0;
}

function buyGen(s: State, i: number, count = buyCount(s, i)): boolean {
  if (!genUnlocked(s, i) || count <= 0) return false;
  const cost = genCost(s, i, count);
  if (s.pearls < cost) return false;
  s.pearls -= cost;
  s.owned[i] += count;
  return true;
}

function upgradeAvailable(s: State, u: UpgradeDef): boolean {
  if (has(s, u.id)) return false;
  if (u.gen !== undefined && u.need !== undefined && s.owned[u.gen] < u.need) return false;
  if (u.kind === 'research') {
    const k = Number(u.id.split('_')[1]);
    if (k > 0 && !has(s, `research_${k - 1}`)) return false;
  }
  const m = u.id.match(/^(\w+)_(\d+)$/);
  if (m && u.kind !== 'research' && u.kind !== 'tier') {
    const k = Number(m[2]);
    if (k > 0 && !has(s, `${m[1]}_${k - 1}`)) return false;
  }
  return true;
}

function visibleUpgrades(s: State): UpgradeDef[] {
  return UPGRADES.filter((u) => upgradeAvailable(s, u) && s.earnedRun >= u.cost * 0.4)
    .sort((a, b) => a.cost - b.cost);
}

function buyUpgrade(s: State, id: string): boolean {
  const u = UPGRADE_BY_ID[id];
  if (!u || !upgradeAvailable(s, u) || s.pearls < u.cost) return false;
  s.pearls -= u.cost;
  s.upgrades[id] = true;
  return true;
}

function descendCost(s: State): number {
  return s.zone + 1 < ZONES.length ? ZONES[s.zone + 1].cost : Infinity;
}

function descend(s: State): boolean {
  const cost = descendCost(s);
  if (s.pearls < cost) return false;
  s.pearls -= cost;
  s.zone += 1;
  return true;
}

// ---------- Production ----------

function genMult(s: State, i: number): number {
  let m = 1;
  for (let k = 0; k < TIER_AT.length; k++) if (has(s, `t_${GENS[i].id}_${k}`)) m *= 2;
  return m;
}

function crabBonus(s: State): number {
  let per = 0;
  UPGRADES.forEach((u) => { if (u.kind === 'crab' && has(s, u.id)) per += u.value!; });
  return per * (totalOwned(s) - s.owned[0]);
}

function genPPS(s: State, i: number): number {
  let base = GENS[i].pps;
  if (i === 0) base += crabBonus(s);
  return base * s.owned[i] * genMult(s, i);
}

function isHighTide(s: State, now: number): boolean {
  const high = 0.5 + perk(s, 'tides') * (60e3 / TIDE_PERIOD_MS);
  return ((now % TIDE_PERIOD_MS) / TIDE_PERIOD_MS) < high;
}

function tideTimeLeft(s: State, now: number): number {
  const high = 0.5 + perk(s, 'tides') * (60e3 / TIDE_PERIOD_MS);
  const phase = (now % TIDE_PERIOD_MS) / TIDE_PERIOD_MS;
  const end = phase < high ? high : 1;
  return (end - phase) * TIDE_PERIOD_MS;
}

function boostMult(s: State, kind: Boost['kind'], now: number): number {
  let m = 1;
  s.boosts.forEach((b) => { if (b.kind === kind && b.until > now) m *= b.mult; });
  return m;
}

// Permanent multipliers (moonstones, logbook, zones, research), without temporary effects.
function baseMult(s: State): number {
  let m = 1 + 0.02 * s.moonstones;
  if (rare(s, 'narwhal')) m *= 1.1;
  m *= 1 + 0.01 * Object.keys(s.achievements).length;
  m *= Math.pow(ZONE_MULT, s.zone);
  UPGRADES.forEach((u) => { if (u.kind === 'research' && has(s, u.id)) m *= u.value!; });
  return m;
}

function rawPPS(s: State): number {
  let sum = 0;
  for (let i = 0; i < GENS.length; i++) if (s.owned[i]) sum += genPPS(s, i);
  return sum * baseMult(s);
}

function pps(s: State, now: number): number {
  let p = rawPPS(s) * boostMult(s, 'rush', now) * boostMult(s, 'whale', now) * boostMult(s, 'surge', now);
  if (!isHighTide(s, now)) p *= 1.25;
  return p;
}

function comboCap(s: State): number {
  let cap = 50 + perk(s, 'mastery') * 25 + (rare(s, 'moonjelly') ? 10 : 0);
  UPGRADES.forEach((u) => { if (u.kind === 'rhythm' && has(s, u.id)) cap += u.value!; });
  return cap;
}

const comboMult = (s: State) => 1 + s.combo * 0.02;

function tapValue(s: State, now: number): number {
  let base = 1;
  UPGRADES.forEach((u) => { if (u.kind === 'tap' && has(s, u.id)) base *= u.value!; });
  let mop = 0;
  UPGRADES.forEach((u) => { if (u.kind === 'mop' && has(s, u.id)) mop += u.value!; });
  let v = (base + mop * pps(s, now)) * comboMult(s) * boostMult(s, 'burst', now);
  if (isHighTide(s, now)) v *= 3;
  if (rare(s, 'dragon')) v *= 1.25;
  return v;
}

function earn(s: State, n: number) {
  s.pearls += n;
  s.earnedRun += n;
  s.earnedLife += n;
}

function tap(s: State, now: number, auto = false): number {
  if (auto) {
    const v = tapValue(s, now);
    earn(s, v);
    s.stats.tapEarned += v;
    return v;
  }
  s.daily.taps += 1;
  if (now - s.lastTap < COMBO_WINDOW_MS || s.combo > 0) s.combo = Math.min(comboCap(s), s.combo + 1);
  s.lastTap = now;
  s.stats.bestCombo = Math.max(s.stats.bestCombo, s.combo);
  const v = tapValue(s, now);
  earn(s, v);
  s.stats.taps += 1;
  s.stats.tapsRun += 1;
  s.stats.tapEarned += v;
  return v;
}

// ---------- Visitors ----------

function visitorInterval(s: State, rand: () => number, now = 0): number {
  let m = Math.pow(0.85, perk(s, 'shoals')) * (rare(s, 'ray') ? 0.9 : 1) * (spawningActive(now) ? 0.5 : 1);
  UPGRADES.forEach((u) => { if (u.kind === 'lure' && has(s, u.id)) m *= u.value!; });
  return (120e3 + rand() * 120e3) * m;
}

function visitorLife(s: State): number {
  return has(s, 'slow_0') ? VISITOR_LIFE_MS * 1.5 : VISITOR_LIFE_MS;
}

function spawnVisitor(s: State, now: number, rand: () => number, kind?: Visitor['kind']) {
  if (!kind) {
    const whaleOk = s.zone >= 1 || perk(s, 'whale') > 0;
    const chance = perk(s, 'whale') > 0 ? 0.25 : 0.125;
    kind = whaleOk && rand() < chance ? 'whale' : 'fish';
  }
  const life = kind === 'whale' ? visitorLife(s) * 1.4 : visitorLife(s);
  s.visitor = { kind, spawnedAt: now, until: now + life, y: kind === 'whale' ? 0.12 + rand() * 0.15 : 0.15 + rand() * 0.5, dir: rand() < 0.5 ? 1 : -1 };
  s.nextVisitorAt = now + life + visitorInterval(s, rand, now);
}

interface CatchResult { kind: string; title: string; text: string; amount?: number; }

function catchVisitor(s: State, now: number, rand: () => number): CatchResult | null {
  const v = s.visitor;
  if (!v || v.until <= now) return null;
  s.visitor = null;
  // During coral spawning every visitor leaves twice the Hearts.
  const spawn = spawningActive(now) ? 2 : 1;
  if (spawn > 1) s.stats.spawnCatches += 1;
  if (v.kind === 'whale') {
    s.stats.whales += 1;
    s.hearts += 3 * spawn;
    s.boosts.push({ kind: 'whale', until: now + 120e3, mult: 4 });
    return { kind: 'whale', title: 'Whale Song', text: 'Production x4 for 2 minutes.' };
  }
  s.stats.fish += 1;
  s.hearts += spawn;
  const r = rand();
  if (r < 0.45) {
    s.boosts.push({ kind: 'rush', until: now + 60e3, mult: 7 });
    return { kind: 'rush', title: 'Pearl Rush', text: 'Production x7 for 60 seconds.' };
  }
  if (r < 0.9) {
    const amount = Math.min(s.pearls * 0.15, pps(s, now) * 900) + 13;
    earn(s, amount);
    return { kind: 'treasure', title: 'Sunken Treasure', text: `+${fmt(amount)} Pearls.`, amount };
  }
  s.boosts.push({ kind: 'burst', until: now + 13e3, mult: 77 });
  return { kind: 'burst', title: 'Bubble Burst', text: 'Tap power x77 for 13 seconds.' };
}

// ---------- Coral spawning (real moon) ----------
// Reefs spawn a few nights after the full moon. Fathom follows the real moon: from 2 to 6 days after each
// full moon the water fills with spawn, visitors come twice as often and leave twice the Hearts.

const SYNODIC_MS = 29.530588853 * 86400e3;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
const SPAWN_FROM = 16.5 * 86400e3; // moon age (full moon is about 14.77 days)
const SPAWN_TO = 21 * 86400e3;

const moonAge = (now: number) => (((now - NEW_MOON_REF) % SYNODIC_MS) + SYNODIC_MS) % SYNODIC_MS;
const spawningActive = (now: number) => { const a = moonAge(now); return a >= SPAWN_FROM && a < SPAWN_TO; };
const spawningEndsAt = (now: number) => now - moonAge(now) + SPAWN_TO;

function nextSpawningAt(now: number): number {
  const start = now - moonAge(now) + SPAWN_FROM;
  return start > now ? start : start + SYNODIC_MS;
}

// ---------- Geyser (active skill) ----------

const GEYSER_UNLOCK = 500;
const GEYSER_TAPS_PER_S = 10;
const GEYSER_LENGTH_MS = 20e3;
const GEYSER_COOLDOWN_MS = 10 * 60e3;

const geyserUnlocked = (s: State) => s.earnedRun >= GEYSER_UNLOCK || s.geyser.uses > 0;
const geyserActive = (s: State, now: number) => s.geyser.until > now;
const geyserReady = (s: State, now: number) => geyserUnlocked(s) && now >= s.geyser.readyAt;

function startGeyser(s: State, now: number): boolean {
  if (!geyserReady(s, now)) return false;
  s.geyser.until = now + GEYSER_LENGTH_MS;
  s.geyser.readyAt = now + GEYSER_COOLDOWN_MS * (rare(s, 'glasssquid') ? 0.8 : 1);
  s.geyser.acc = 0;
  s.geyser.uses += 1;
  return true;
}

// ---------- Daily Tide Gift ----------

const DAILY_TAPS = 150;
const DAILY_MINUTES = [10, 15, 20, 30, 45, 60, 90];

function prevDayKey(day: string): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Called with the player's local date (YYYY-MM-DD); starts a new day's goal when it changes.
function rollDaily(s: State, day: string) {
  if (s.daily.day === day) return;
  s.daily.day = day;
  s.daily.taps = 0;
}

const dailyClaimed = (s: State) => s.daily.claimedDay === s.daily.day;
const dailyReady = (s: State) => !dailyClaimed(s) && s.daily.taps >= DAILY_TAPS;

// The streak day the next gift counts as (1 to 7, then it starts over).
function nextStreak(s: State): number {
  const continues = s.daily.claimedDay === prevDayKey(s.daily.day);
  return continues ? (s.daily.streak % 7) + 1 : 1;
}

function dailyReward(s: State, streak: number): number {
  return Math.max(rawPPS(s) * 60 * DAILY_MINUTES[streak - 1], 100 * streak);
}

function claimDaily(s: State, now: number): { streak: number; pearls: number; whale: boolean } | null {
  if (!dailyReady(s)) return null;
  const streak = nextStreak(s);
  const pearls = dailyReward(s, streak);
  earn(s, pearls);
  s.daily.streak = streak;
  s.daily.claimedDay = s.daily.day;
  const whale = streak === 7;
  if (whale) s.boosts.push({ kind: 'whale', until: now + 120e3, mult: 4 });
  return { streak, pearls, whale };
}

// ---------- Opt-in rewarded ads ----------
// Every ad is the player's choice. Rewards are capped per day so ads stay a bonus, not a chore.

const SURGE_UNLOCK = 1000;
const SURGE_MS = 10 * 60e3;
const SURGE_PER_DAY = 4;

function rollAds(s: State, day: string) {
  if (s.ads.day === day) return;
  s.ads.day = day;
  s.ads.surges = 0;
}

const surgeUnlocked = (s: State) => s.earnedRun >= SURGE_UNLOCK || s.ads.watched > 0;
const surgesLeft = (s: State) => Math.max(0, SURGE_PER_DAY - s.ads.surges);

// Current Surge: production x2 for 10 minutes; another ad adds 10 more (up to 4 a day).
function rewardSurge(s: State, now: number): boolean {
  if (!surgeUnlocked(s) || surgesLeft(s) <= 0) return false;
  const cur = s.boosts.find((b) => b.kind === 'surge' && b.until > now);
  if (cur) cur.until += SURGE_MS;
  else s.boosts.push({ kind: 'surge', until: now + SURGE_MS, mult: 2 });
  s.ads.surges += 1;
  s.ads.watched += 1;
  return true;
}

// Doubles the welcome-back haul (the ad pays the same amount again).
function rewardOffline(s: State, pearls: number): number {
  if (pearls <= 0) return 0;
  earn(s, pearls);
  s.ads.watched += 1;
  return pearls;
}

// Doubles today's Tide Gift, once a day, right after it is claimed.
const canDoubleGift = (s: State) => dailyClaimed(s) && s.ads.giftDoubled !== s.daily.day;

function rewardGift(s: State): number {
  if (!canDoubleGift(s)) return 0;
  const pearls = dailyReward(s, s.daily.streak);
  earn(s, pearls);
  s.ads.giftDoubled = s.daily.day;
  s.ads.watched += 1;
  return pearls;
}

// ---------- Reef Requests (missions) ----------

const REQUEST_SLOTS = 3;
const REQUEST_COOLDOWN_MS = 5 * 60e3; // after a claim, new requests come in after this

// Two significant digits, so targets read as round numbers.
function roundNice(n: number): number {
  if (n < 10) return Math.ceil(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / p) * p;
}

function requestProgress(s: State, r: ReefRequest): number {
  switch (r.kind) {
    case 'taps': return s.stats.taps - r.base;
    case 'fish': return s.stats.fish + s.stats.whales - r.base;
    case 'own': return s.owned[r.gen!] || 0;
    case 'earn': return s.earnedRun - r.base;
    case 'geyser': return s.geyser.uses - r.base;
    case 'combo': return s.combo;
    case 'descend': return s.zone;
  }
}

const requestDone = (s: State, r: ReefRequest) => !!r.got || requestProgress(s, r) >= r.target;
const requestsReady = (s: State) => s.requests.list.filter((r) => requestDone(s, r)).length;

function makeRequest(s: State, now: number, rand: () => number, taken: string[]): ReefRequest {
  const lvl = Math.min(s.requests.done, 10);
  const options: ReefRequest[] = [];
  options.push({ kind: 'taps', target: 50 + 25 * lvl, base: s.stats.taps });
  options.push({ kind: 'earn', target: roundNice(Math.max(300, rawPPS(s) * 600 + tapValue(s, now) * 150)), base: s.earnedRun });
  // Own more of one of the last few creatures you have found.
  const found = GENS.map((_, i) => i).filter((i) => genUnlocked(s, i)).slice(-3);
  const gi = found[Math.floor(rand() * found.length)];
  const owned = s.owned[gi];
  options.push({ kind: 'own', gen: gi, target: owned === 0 ? 1 : Math.ceil((owned + 1) / 5) * 5, base: 0 });
  if (s.earnedRun >= 50) options.push({ kind: 'fish', target: s.requests.done >= 8 ? 2 : 1, base: s.stats.fish + s.stats.whales });
  if (geyserUnlocked(s)) options.push({ kind: 'geyser', target: 1, base: s.geyser.uses });
  if (s.stats.taps >= 30) options.push({ kind: 'combo', target: Math.min(comboCap(s), 15 + 5 * Math.min(lvl, 5)), base: 0 });
  if (s.zone < ZONES.length - 1 && s.earnedRun >= descendCost(s) * 0.1) options.push({ kind: 'descend', target: s.zone + 1, base: 0 });
  const free = options.filter((o) => !taken.includes(o.kind) && requestProgress(s, o) < o.target);
  const pool = free.length ? free : options;
  return pool[Math.floor(rand() * pool.length)];
}

function fillRequests(s: State, now: number, rand: () => number) {
  if (now < s.requests.nextAt) return;
  while (s.requests.list.length < REQUEST_SLOTS) {
    s.requests.list.push(makeRequest(s, now, rand, s.requests.list.map((r) => r.kind)));
  }
}

// Worth a minute of production, with a floor that grows as you finish more.
const requestReward = (s: State) => Math.max(rawPPS(s) * 60, 25 * (s.requests.done + 1));

function claimRequest(s: State, index: number, now: number, rand: () => number): { pearls: number; hearts: number } | null {
  const r = s.requests.list[index];
  if (!r || !requestDone(s, r)) return null;
  const pearls = requestReward(s);
  earn(s, pearls);
  s.hearts += 1;
  s.requests.done += 1;
  s.requests.list.splice(index, 1);
  s.requests.nextAt = now + REQUEST_COOLDOWN_MS;
  return { pearls, hearts: 1 };
}

function requestText(r: ReefRequest): string {
  switch (r.kind) {
    case 'taps': return `Tap the clam ${fmt(r.target)} times`;
    case 'fish': return r.target > 1 ? `Catch ${r.target} visitors` : 'Catch a visitor';
    case 'own': return `Own ${r.target} ${GENS[r.gen!].name}${r.target > 1 ? 's' : ''}`;
    case 'earn': return `Gather ${fmt(r.target)} Pearls`;
    case 'geyser': return 'Erupt the geyser';
    case 'combo': return `Reach a x${(1 + r.target * 0.02).toFixed(2)} combo`;
    case 'descend': return `Descend to the ${ZONES[r.target].name}`;
  }
}

// ---------- Expedition submarine ----------
// One submarine, sent on a timed dive that keeps going while the app is closed. It brings back Pearls worth a
// share of the dive's production and Hearts, so a dive before bed is always worth it.

interface DiveDef { id: string; name: string; ms: number; hearts: number; }
const DIVES: DiveDef[] = [
  { id: 'short', name: 'Reef dive', ms: 15 * 60e3, hearts: 1 },
  { id: 'long', name: 'Trench dive', ms: 60 * 60e3, hearts: 2 },
  { id: 'deep', name: 'Abyss expedition', ms: 4 * 3600e3, hearts: 5 },
];
const DIVE_SHARE = 0.2; // Pearls = 20% of the production during the dive
const SUB_SPEEDS_PER_DAY = 3;

const subUnlocked = (s: State) => s.zone >= 1 || s.stats.migrations > 0 || s.sub.dives > 0;
const subDiving = (s: State) => s.sub.dive >= 0;
const subBack = (s: State, now: number) => subDiving(s) && now >= s.sub.until;
const diveReward = (s: State, i: number) => ({ pearls: Math.max(50, rawPPS(s) * (DIVES[i].ms / 1000) * DIVE_SHARE), hearts: DIVES[i].hearts });

function launchDive(s: State, i: number, now: number): boolean {
  if (!subUnlocked(s) || subDiving(s) || !DIVES[i]) return false;
  s.sub.dive = i;
  s.sub.startedAt = now;
  s.sub.until = now + DIVES[i].ms;
  return true;
}

function collectDive(s: State, now: number): { pearls: number; hearts: number } | null {
  if (!subBack(s, now)) return null;
  const r = diveReward(s, s.sub.dive);
  earn(s, r.pearls);
  s.hearts += r.hearts;
  s.sub.dive = -1;
  s.sub.dives += 1;
  return r;
}

function subSpeedsLeft(s: State, day: string): number {
  return s.sub.speedDay === day ? Math.max(0, SUB_SPEEDS_PER_DAY - s.sub.speeds) : SUB_SPEEDS_PER_DAY;
}

// Rewarded ad: bring the submarine straight back (only worth it with 5+ minutes left).
function speedUpDive(s: State, now: number, day: string): boolean {
  if (!subDiving(s) || s.sub.until - now < 5 * 60e3 || subSpeedsLeft(s, day) <= 0) return false;
  if (s.sub.speedDay !== day) { s.sub.speedDay = day; s.sub.speeds = 0; }
  s.sub.speeds += 1;
  s.sub.until = now;
  s.ads.watched += 1;
  return true;
}

// ---------- Reminders (local notifications on phones) ----------

interface Reminder { id: number; at: number; title: string; body: string; }
const REMINDER_MIN_MS = 15 * 60e3; // never nag about something only minutes away

// eveningAt: the next 6 pm local time, and eveningDay its day key (the UI knows the local calendar).
function reminderPlan(s: State, now: number, eveningAt: number, eveningDay: string): Reminder[] {
  const list: Reminder[] = [];
  if (geyserUnlocked(s) && s.geyser.readyAt > now) list.push({ id: 1, at: s.geyser.readyAt, title: 'The geyser is ready', body: 'Erupt it for 20 seconds of free taps.' });
  if (s.daily.claimedDay !== eveningDay) {
    const day = s.daily.claimedDay === prevDayKey(eveningDay) ? s.daily.streak + 1 : 1;
    list.push({ id: 2, at: eveningAt, title: 'Your Tide Gift is waiting', body: day > 1 ? `Day ${Math.min(day, 7)} of your streak: tap the clam to open it.` : 'Tap the clam to open today\'s gift.' });
  }
  const spawn = nextSpawningAt(now);
  if (spawn - now < 3 * 86400e3) list.push({ id: 3, at: spawn, title: 'The coral is spawning', body: 'Visitors come twice as often and leave double Hearts.' });
  if (subDiving(s) && s.sub.until > now) list.push({ id: 5, at: s.sub.until, title: 'Your submarine is back', body: `The ${DIVES[s.sub.dive].name.toLowerCase()} brought back Pearls and Hearts.` });
  if (rawPPS(s) > 0) list.push({ id: 4, at: now + OFFLINE_CAP_MS, title: 'Your colony\'s nets are full', body: 'Eight hours of Pearls are waiting for you.' });
  return list.filter((r) => r.at - now >= REMINDER_MIN_MS).sort((a, b) => a.at - b.at);
}

// ---------- Tick ----------

// Returns the pearls from geyser auto-taps this tick (so the scene can show them).
function tick(s: State, now: number, dtMs: number, rand: () => number): { autoTaps: number; autoPearls: number } {
  const dt = Math.max(0, dtMs) / 1000;
  earn(s, pps(s, now) * dt);
  let autoTaps = 0, autoPearls = 0;
  if (geyserActive(s, now)) {
    s.geyser.acc += GEYSER_TAPS_PER_S * dt;
    while (s.geyser.acc >= 1) { s.geyser.acc -= 1; autoTaps += 1; autoPearls += tap(s, now, true); }
  }
  if (now - s.lastTap > COMBO_WINDOW_MS && s.combo > 0) {
    const drain = has(s, 'slack_0') ? 6 : 12;
    s.combo = Math.max(0, s.combo - drain * dt);
  }
  s.boosts = s.boosts.filter((b) => b.until > now);
  if (s.visitor && s.visitor.until <= now) s.visitor = null;
  if (!s.visitor && now >= s.nextVisitorAt) spawnVisitor(s, now, rand);
  fillRequests(s, now, rand);
  s.requests.list.forEach((r) => { if (!r.got && requestProgress(s, r) >= r.target) r.got = true; });
  s.lastSeen = now;
  return { autoTaps, autoPearls };
}

// ---------- Logbook ----------

function checkAchievements(s: State): AchDef[] {
  const got: AchDef[] = [];
  const give = (id: string) => {
    if (s.achievements[id]) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    s.achievements[id] = true;
    got.push(a);
  };
  [1e3, 1e6, 1e9, 1e12, 1e15, 1e18, 1e21].forEach((n) => { if (s.earnedLife >= n) give(`earn_${n}`); });
  [100, 1000, 10000, 100000].forEach((n) => { if (s.stats.taps >= n) give(`taps_${n}`); });
  if (s.stats.bestCombo >= comboCap(s) && s.stats.bestCombo >= 50) give('combo_max');
  GENS.forEach((g, i) => [1, 50, 100].forEach((n) => { if (s.owned[i] >= n) give(`gen_${g.id}_${n}`); }));
  [1, 10, 50].forEach((n) => { if (s.stats.fish >= n) give(`fish_${n}`); });
  [1, 10].forEach((n) => { if (s.stats.whales >= n) give(`whale_${n}`); });
  for (let i = 1; i <= s.zone; i++) give(`zone_${i}`);
  [1, 5, 20].forEach((n) => { if (s.stats.migrations >= n) give(`mig_${n}`); });
  if (s.daily.claimedDay) give('daily_1');
  if (s.daily.streak >= 7) give('daily_7');
  [1, 25].forEach((n) => { if (s.geyser.uses >= n) give(`geyser_${n}`); });
  const rares = Object.keys(s.rares).length;
  if (rares >= 1) give('rare_1');
  if (rares >= RARES.length) give('rare_6');
  [10, 50].forEach((n) => { if (s.requests.done >= n) give(`req_${n}`); });
  if (s.stats.spawnCatches >= 1) give('spawn_1');
  [1, 25].forEach((n) => { if (s.sub.dives >= n) give(`dive_${n}`); });
  return got;
}

// ---------- Migration (prestige) ----------

const MIGRATE_AT = 1e11;

function moonstonesTotalFor(earnedLife: number): number {
  return Math.floor(Math.cbrt(earnedLife / MIGRATE_AT));
}

function moonstonesOnMigrate(s: State): number {
  return Math.max(0, moonstonesTotalFor(s.earnedLife) - s.moonstones);
}

function nextMoonstoneAt(s: State): number {
  return Math.pow(Math.max(moonstonesTotalFor(s.earnedLife), s.moonstones) + 1, 3) * MIGRATE_AT;
}

const canMigrate = (s: State) => moonstonesOnMigrate(s) > 0;

function migrate(s: State, now: number): number {
  const gain = moonstonesOnMigrate(s);
  if (gain <= 0) return 0;
  s.moonstones += gain;
  const keepResearch = perk(s, 'notes') > 0;
  const kept: Record<string, boolean> = {};
  if (keepResearch) Object.keys(s.upgrades).forEach((id) => { if (id.startsWith('research_')) kept[id] = true; });
  s.upgrades = kept;
  s.owned = GENS.map(() => 0);
  s.zone = perk(s, 'memory') > 0 ? 1 : 0;
  s.pearls = [0, 1e3, 1e6, 1e9][perk(s, 'inherit')];
  s.earnedRun = s.pearls;
  s.combo = 0;
  s.boosts = [];
  s.visitor = null;
  s.nextVisitorAt = now + 60e3;
  s.requests.list = [];
  s.requests.nextAt = 0;
  s.stats.migrations += 1;
  s.stats.tapsRun = 0;
  s.stats.runStartedAt = now;
  return gain;
}

function perkCost(s: State, id: string): number {
  const p = PERK_BY_ID[id];
  const lvl = perk(s, id);
  return lvl < p.costs.length ? p.costs[lvl] : Infinity;
}

function buyPerk(s: State, id: string): boolean {
  const cost = perkCost(s, id);
  if (s.moonstones - s.moonstonesSpent < cost) return false;
  s.moonstonesSpent += cost;
  s.perks[id] = perk(s, id) + 1;
  return true;
}

// ---------- Offline and saving ----------

const offlineRate = (s: State) => 0.25 + 0.25 * perk(s, 'warm') + (rare(s, 'turtle') ? 0.1 : 0);

// ---------- Rare creatures ----------

function adoptRare(s: State, id: string): boolean {
  const r = RARE_BY_ID[id];
  if (!r || rare(s, id) || s.hearts < r.hearts) return false;
  s.hearts -= r.hearts;
  s.rares[id] = true;
  return true;
}

function applyOffline(s: State, now: number): { seconds: number; pearls: number } {
  const away = Math.min(Math.max(0, now - s.lastSeen), OFFLINE_CAP_MS);
  s.lastSeen = now;
  if (away < 30e3) return { seconds: 0, pearls: 0 };
  const gained = rawPPS(s) * (away / 1000) * offlineRate(s);
  earn(s, gained);
  s.boosts = s.boosts.filter((b) => b.until > now);
  if (s.nextVisitorAt < now) s.nextVisitorAt = now + 20e3;
  s.visitor = null;
  return { seconds: away / 1000, pearls: gained };
}

function serialize(s: State): string {
  return JSON.stringify(s);
}

function deserialize(text: string, now: number): State {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || typeof data.pearls !== 'number') throw new Error('Not a Fathom save');
  const s = newState(now);
  Object.assign(s, data);
  s.stats = Object.assign(newState(now).stats, data.stats || {});
  s.settings = Object.assign(newState(now).settings, data.settings || {});
  s.daily = Object.assign(newState(now).daily, data.daily || {});
  s.geyser = Object.assign(newState(now).geyser, data.geyser || {});
  s.ads = Object.assign(newState(now).ads, data.ads || {});
  s.rares = data.rares || {};
  s.hearts = data.hearts || 0;
  s.requests = Object.assign(newState(now).requests, data.requests || {});
  s.sub = Object.assign(newState(now).sub, data.sub || {});
  s.owned = GENS.map((_, i) => (data.owned && data.owned[i]) || 0);
  s.v = SAVE_VERSION;
  return s;
}
