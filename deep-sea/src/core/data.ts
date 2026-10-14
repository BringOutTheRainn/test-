// Static game data: zones, generators, upgrades, logbook entries and heritage perks.

interface ZoneDef { name: string; depth: number; cost: number; flavor: string; }

const ZONES: ZoneDef[] = [
  { name: 'Sunlit Shallows', depth: 0, cost: 0, flavor: 'Warm water, soft sand, one very patient clam.' },
  { name: 'Twilight Reef', depth: 200, cost: 50e3, flavor: 'The light fades to blue. Things start to glow.' },
  { name: 'Midnight Trench', depth: 1000, cost: 250e6, flavor: 'No sunlight reaches here. Only the creatures shine.' },
  { name: 'Abyssal Plain', depth: 4000, cost: 2e12, flavor: 'Cold, crushing and full of old shipwrecks.' },
  { name: 'Hadal Deep', depth: 10000, cost: 300e12, flavor: 'The bottom of the world. Something enormous sleeps here.' },
];
const ZONE_MULT = 1.5;

interface GenDef { id: string; name: string; zone: number; cost: number; pps: number; flavor: string; }

const GENS: GenDef[] = [
  { id: 'crab', name: 'Hermit Crab', zone: 0, cost: 15, pps: 0.1, flavor: 'Picks loose pearls out of the sand.' },
  { id: 'seahorse', name: 'Seahorse Ranch', zone: 0, cost: 100, pps: 1, flavor: 'Seahorses ferry pearls home in their pouches.' },
  { id: 'kelp', name: 'Kelp Farm', zone: 0, cost: 1100, pps: 8, flavor: 'Tall kelp shelters a nursery of baby clams.' },
  { id: 'lantern', name: 'Lanternfish School', zone: 1, cost: 12e3, pps: 47, flavor: 'A thousand tiny lights search the reef.' },
  { id: 'octopus', name: 'Octopus Workshop', zone: 1, cost: 130e3, pps: 260, flavor: 'Eight arms, eight pearls at a time.' },
  { id: 'jelly', name: 'Jellyfish Lamps', zone: 1, cost: 1.4e6, pps: 1400, flavor: 'Glowing jellies light the night shift.' },
  { id: 'angler', name: 'Anglerfish Lure', zone: 2, cost: 20e6, pps: 7800, flavor: 'Its lantern draws pearls out of the dark.' },
  { id: 'squid', name: 'Giant Squid Press', zone: 2, cost: 330e6, pps: 44e3, flavor: 'Squeezes nacre into flawless spheres.' },
  { id: 'vent', name: 'Hydrothermal Vent', zone: 2, cost: 5.1e9, pps: 260e3, flavor: 'Mineral smoke crystallises into pearls.' },
  { id: 'galleon', name: 'Sunken Galleon', zone: 3, cost: 75e9, pps: 1.6e6, flavor: 'A pirate fortune, salvaged chest by chest.' },
  { id: 'leviathan', name: 'Leviathan Stable', zone: 3, cost: 1e12, pps: 10e6, flavor: 'Tame sea giants haul pearls by the ton.' },
  { id: 'forge', name: 'Trench Forge', zone: 4, cost: 14e12, pps: 65e6, flavor: 'Pressure and heat forge pearls from bedrock.' },
  { id: 'cathedral', name: 'Abyssal Cathedral', zone: 4, cost: 170e12, pps: 430e6, flavor: 'The ancient ones sing pearls into being.' },
];
const COST_GROWTH = 1.15;

type UpgradeKind = 'tier' | 'crab' | 'tap' | 'mop' | 'rhythm' | 'slack' | 'lure' | 'slow' | 'research';

interface UpgradeDef {
  id: string; name: string; desc: string; cost: number; kind: UpgradeKind;
  gen?: number; need?: number; value?: number;
}

const TIER_AT = [1, 5, 25, 50, 100, 150, 200];
const TIER_COST = [10, 50, 500, 5e4, 5e6, 5e8, 5e10];
const TIER_NAMES = ['Polished', 'Shiny', 'Lustrous', 'Iridescent', 'Radiant', 'Mythic', 'Abyssal'];

function buildUpgrades(): UpgradeDef[] {
  const list: UpgradeDef[] = [];
  GENS.forEach((g, i) => {
    TIER_AT.forEach((at, k) => {
      list.push({
        id: `t_${g.id}_${k}`, kind: 'tier', gen: i, need: at, cost: g.cost * TIER_COST[k],
        name: `${TIER_NAMES[k]} ${g.name}s`, desc: `${g.name} production x2.`,
      });
    });
  });
  const crab = [[1, 0.1, 1e3], [10, 0.5, 1e5], [25, 5, 1e7], [50, 50, 1e9], [100, 500, 1e11], [150, 5e3, 1e13]];
  crab.forEach(([need, value, cost], k) => list.push({
    id: `crab_${k}`, kind: 'crab', gen: 0, need, value, cost,
    name: ['Crab Pickers', 'Busy Claws', 'Crab Union', 'Crab Kingdom', 'Crab Empire', 'Crab Cosmos'][k],
    desc: `Hermit Crabs gain +${fmt(value)} PPS for every other creature you own.`,
  }));
  [100, 500, 1e4, 1e6, 1e8, 1e10].forEach((cost, k) => list.push({
    id: `tap_${k}`, kind: 'tap', cost, value: 2,
    name: ['Strong Grip', 'Steady Hands', 'Pearl Diver', 'Free Diver', 'Deep Diver', 'Ocean Hands'][k],
    desc: 'Tap power x2.',
  }));
  [5e4, 5e6, 5e8, 5e10, 5e12, 5e14].forEach((cost, k) => list.push({
    id: `mop_${k}`, kind: 'mop', cost, value: 0.01,
    name: ['Mother of Pearl', 'Nacre Layers', 'Pearl Heart', 'Pearl Soul', 'Pearl Spirit', 'Pearl Legend'][k],
    desc: 'Each tap also gives 1% of your PPS.',
  }));
  list.push({ id: 'rhythm_0', kind: 'rhythm', cost: 5e3, value: 25, name: 'Rhythm of the Tide', desc: 'Combo cap +25 (up to x2.5).' });
  list.push({ id: 'rhythm_1', kind: 'rhythm', cost: 5e7, value: 25, name: 'Riptide Rhythm', desc: 'Combo cap +25 (up to x3).' });
  list.push({ id: 'slack_0', kind: 'slack', cost: 2e5, value: 0.5, name: 'Slack Water', desc: 'Your combo drains half as fast.' });
  list.push({ id: 'lure_0', kind: 'lure', cost: 5e5, value: 0.8, name: 'Shiny Lures', desc: 'Visitors come 20% more often.' });
  list.push({ id: 'lure_1', kind: 'lure', cost: 5e9, value: 0.8, name: 'Glitter Bait', desc: 'Visitors come 20% more often.' });
  list.push({ id: 'slow_0', kind: 'slow', cost: 5e6, value: 1.5, name: 'Slow Swimmers', desc: 'Visitors stay 50% longer.' });
  for (let k = 0; k < 10; k++) {
    list.push({
      id: `research_${k}`, kind: 'research', cost: 1e6 * Math.pow(60, k), value: 1.15,
      name: `Reef Research ${k + 1}`, desc: 'All production x1.15.',
    });
  }
  return list;
}
const UPGRADES = buildUpgrades();
const UPGRADE_BY_ID: Record<string, UpgradeDef> = {};
UPGRADES.forEach((u) => (UPGRADE_BY_ID[u.id] = u));

interface PerkDef { id: string; name: string; desc: string; costs: number[]; }

const PERKS: PerkDef[] = [
  { id: 'warm', name: 'Warm Currents', desc: 'Offline earnings +25% per level (base 25%).', costs: [1, 5, 20] },
  { id: 'shoals', name: 'Golden Shoals', desc: 'Visitors come 15% more often per level.', costs: [2, 8, 30] },
  { id: 'inherit', name: 'Pearl Inheritance', desc: 'Start each migration with 1K, then 1M, then 1B Pearls.', costs: [3, 15, 60] },
  { id: 'mastery', name: 'Clam Mastery', desc: 'Combo cap +25 per level.', costs: [4, 20] },
  { id: 'tides', name: 'Long Tides', desc: 'High tide lasts 1 minute longer per level.', costs: [5, 25] },
  { id: 'memory', name: 'Deep Memory', desc: 'Start each migration in the Twilight Reef.', costs: [10] },
  { id: 'whale', name: 'Whale Friend', desc: 'Whales visit twice as often, even in the shallows.', costs: [12] },
  { id: 'notes', name: 'Research Notes', desc: 'Keep Reef Research through migrations.', costs: [40] },
];
const PERK_BY_ID: Record<string, PerkDef> = {};
PERKS.forEach((p) => (PERK_BY_ID[p.id] = p));

interface AchDef { id: string; name: string; desc: string; }

function buildAchievements(): AchDef[] {
  const list: AchDef[] = [];
  const earned = [[1e3, 'Pocket Change'], [1e6, 'Pearl Necklace'], [1e9, 'Treasure Chest'], [1e12, 'Sunken Fortune'],
    [1e15, 'Ocean of Pearls'], [1e18, 'Seven Seas'], [1e21, 'Tidal Wealth']] as const;
  earned.forEach(([n, name]) => list.push({ id: `earn_${n}`, name, desc: `Earn ${fmt(n)} Pearls in total.` }));
  const taps = [[100, 'Knock Knock'], [1000, 'Tap Dancer'], [10000, 'Woodpecker of the Sea'], [100000, 'Unstoppable Fingers']] as const;
  taps.forEach(([n, name]) => list.push({ id: `taps_${n}`, name, desc: `Tap ${fmt(n)} times.` }));
  list.push({ id: 'combo_max', name: 'Riding the Current', desc: 'Fill the combo bar.' });
  GENS.forEach((g) => [1, 50, 100].forEach((n) => list.push({ id: `gen_${g.id}_${n}`, name: `${g.name} x${n}`, desc: `Own ${n} ${g.name}${n > 1 ? 's' : ''}.` })));
  ([[1, 'Gone Fishing'], [10, 'Fish Whisperer'], [50, 'Golden Net']] as [number, string][]).forEach(([n, name]) =>
    list.push({ id: `fish_${n}`, name, desc: `Catch ${n} golden fish.` }));
  ([[1, 'Whale Watcher'], [10, 'Song of the Deep']] as [number, string][]).forEach(([n, name]) =>
    list.push({ id: `whale_${n}`, name, desc: `Greet ${n} whale${n > 1 ? 's' : ''}.` }));
  ZONES.forEach((z, i) => { if (i > 0) list.push({ id: `zone_${i}`, name: z.name, desc: `Descend to ${z.depth.toLocaleString('en-US')} m.` }); });
  ([[1, 'Moving House'], [5, 'Nomad Colony'], [20, 'Eternal Tides']] as [number, string][]).forEach(([n, name]) =>
    list.push({ id: `mig_${n}`, name, desc: `Migrate ${n} time${n > 1 ? 's' : ''}.` }));
  return list;
}
const ACHIEVEMENTS = buildAchievements();

const NEWS = [
  'Local crab insists it found the pearl first.',
  'Seahorse ranchers report record pouch sizes.',
  'Kelp grows 30 cm overnight, shades three confused fish.',
  'Lanternfish union demands brighter working hours.',
  'Octopus completes eight tasks at once, still bored.',
  'Jellyfish lamps voted most relaxing night light of the reef.',
  'Anglerfish denies its lure is "a bit much".',
  'Giant squid press accused of squeezing too hard.',
  'Hydrothermal vent tourism booming, visitors advised to bring nothing flammable.',
  'Pirate ghost files complaint about salvage crews.',
  'Leviathan stable adds second, larger stable for the first stable.',
  'Scientists confirm the ocean is, in fact, quite deep.',
  'Clam reports feeling "seen" after millionth tap.',
  'Whale song tops the reef charts for the 40th week.',
];
