// Game content: heroes, enemies, skills, items and the dungeon. Plain data, no logic.

type StatusKind = 'stun' | 'poison' | 'burn' | 'shield' | 'taunt' | 'regen' | 'atkUp' | 'defDown' | 'guard';
type TargetKind = 'enemy' | 'enemies' | 'ally' | 'allies' | 'self' | 'fallen';
type TargetPick = 'random' | 'lowest' | 'back' | 'strongest';

type Effect =
  | { t: 'dmg'; mult: number; crit?: number }
  | { t: 'heal'; mult: number }
  | { t: 'drain'; frac: number }
  | { t: 'status'; kind: StatusKind; turns: number; mult?: number; chance?: number; self?: boolean }
  | { t: 'revive'; frac: number }
  | { t: 'cleanse' }
  | { t: 'summon'; enemy: string; max: number };

interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cd: number;
  target: TargetKind;
  effects: Effect[];
  /** How enemies choose a single target. */
  pick?: TargetPick;
  /** Enemy only: use this skill only below this HP fraction. */
  below?: number;
}

interface Stats { hp: number; atk: number; def: number; spd: number; crit: number }

interface HeroDef {
  id: string;
  name: string;
  cls: string;
  art: string;
  base: Stats;
  skills: string[];
  blurb: string;
}

interface EnemyDef {
  id: string;
  name: string;
  art: string;
  base: Stats;
  skills: string[];
  boss?: boolean;
  /** CSS filter that recolours shared art. */
  tint?: string;
  /** Turns this boss's attack up once it drops below half health. */
  enrage?: boolean;
}

type Slot = 'weapon' | 'armor' | 'charm';

interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  art: string;
  /** Hero ids allowed to equip it; empty means anyone. */
  only: string[];
  stats: Partial<Stats>;
  price: number;
  tier: number;
}

interface StageDef {
  id: string;
  name: string;
  waves: [string, number][][];
  gold: number;
  xp: number;
  boss?: boolean;
  /** Item given for the first clear. */
  drop?: string;
}

interface RegionDef {
  id: string;
  name: string;
  art: string;
  blurb: string;
  stages: StageDef[];
  loot: string[];
}

const STATUS_INFO: Record<StatusKind, { name: string; icon: string; good: boolean; desc: string }> = {
  stun: { name: 'Stunned', icon: '💫', good: false, desc: 'Skips its next turn.' },
  poison: { name: 'Poison', icon: '☠', good: false, desc: 'Loses health at the start of each turn.' },
  burn: { name: 'Burn', icon: '🔥', good: false, desc: 'Loses health at the start of each turn.' },
  shield: { name: 'Shield', icon: '🛡', good: true, desc: 'Absorbs damage.' },
  taunt: { name: 'Taunt', icon: '❗', good: true, desc: 'Enemies must attack this hero.' },
  regen: { name: 'Regen', icon: '✚', good: true, desc: 'Heals at the start of each turn.' },
  atkUp: { name: 'Fury', icon: '⚔', good: true, desc: 'Deals 35% more damage.' },
  defDown: { name: 'Exposed', icon: '⬇', good: false, desc: 'Takes 35% more damage.' },
  guard: { name: 'Guard', icon: '◆', good: true, desc: 'Takes 40% less damage.' },
};

const SKILLS: Record<string, SkillDef> = {
  // Knight
  slash: { id: 'slash', name: 'Slash', desc: 'Hit one enemy.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1 }] },
  bash: {
    id: 'bash', name: 'Shield Bash', desc: 'Hit and stun one enemy for a turn.', cd: 3, target: 'enemy',
    effects: [{ t: 'dmg', mult: 0.8 }, { t: 'status', kind: 'stun', turns: 1 }],
  },
  taunt: {
    id: 'taunt', name: 'Challenge', desc: 'Taunt all enemies for 2 turns and take 40% less damage.', cd: 4, target: 'self',
    effects: [{ t: 'status', kind: 'taunt', turns: 2 }, { t: 'status', kind: 'guard', turns: 2 }],
  },
  rally: {
    id: 'rally', name: 'Rally', desc: 'Shield every hero for 120% of your attack.', cd: 5, target: 'allies',
    effects: [{ t: 'status', kind: 'shield', turns: 3, mult: 1.2 }],
  },
  // Ranger
  shot: { id: 'shot', name: 'Quick Shot', desc: 'Hit one enemy. Crits more often.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1, crit: 0.1 }] },
  venom: {
    id: 'venom', name: 'Venom Arrow', desc: 'Hit and poison for 3 turns.', cd: 2, target: 'enemy',
    effects: [{ t: 'dmg', mult: 0.7 }, { t: 'status', kind: 'poison', turns: 3, mult: 0.45 }],
  },
  volley: { id: 'volley', name: 'Volley', desc: 'Hit every enemy.', cd: 3, target: 'enemies', effects: [{ t: 'dmg', mult: 0.6 }] },
  aimed: {
    id: 'aimed', name: 'Aimed Shot', desc: 'A huge hit that exposes the target for 2 turns.', cd: 4, target: 'enemy',
    effects: [{ t: 'dmg', mult: 2.2, crit: 0.2 }, { t: 'status', kind: 'defDown', turns: 2 }],
  },
  // Cleric
  smite: { id: 'smite', name: 'Smite', desc: 'Holy damage to one enemy.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 0.9 }] },
  heal: { id: 'heal', name: 'Heal', desc: 'Restore a lot of health to one hero and cure poison.', cd: 1, target: 'ally', effects: [{ t: 'heal', mult: 2.4 }, { t: 'cleanse' }] },
  bless: {
    id: 'bless', name: 'Blessing', desc: 'Every hero regenerates for 3 turns and gains Fury.', cd: 4, target: 'allies',
    effects: [{ t: 'status', kind: 'regen', turns: 3, mult: 0.7 }, { t: 'status', kind: 'atkUp', turns: 2 }],
  },
  revive: { id: 'revive', name: 'Resurrect', desc: 'Bring a fallen hero back with half health.', cd: 6, target: 'fallen', effects: [{ t: 'revive', frac: 0.5 }] },

  // Enemies
  bite: { id: 'bite', name: 'Bite', desc: 'A quick bite.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1 }], pick: 'random' },
  leech: { id: 'leech', name: 'Leech', desc: 'Bites and drinks blood.', cd: 2, target: 'enemy', effects: [{ t: 'dmg', mult: 0.9 }, { t: 'drain', frac: 1 }], pick: 'lowest' },
  club: { id: 'club', name: 'Bone Club', desc: 'A heavy swing.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1 }], pick: 'random' },
  boneWall: { id: 'boneWall', name: 'Bone Wall', desc: 'Raises its shield.', cd: 3, target: 'self', effects: [{ t: 'status', kind: 'shield', turns: 2, mult: 1.6 }] },
  stab: { id: 'stab', name: 'Stab', desc: 'A dirty stab.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1 }], pick: 'random' },
  frenzy: { id: 'frenzy', name: 'Frenzy', desc: 'Works itself into a rage.', cd: 4, target: 'self', effects: [{ t: 'status', kind: 'atkUp', turns: 3 }] },
  arrow: { id: 'arrow', name: 'Arrow', desc: 'Shoots the weakest hero.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1 }], pick: 'lowest' },
  rain: { id: 'rain', name: 'Arrow Rain', desc: 'Hits every hero.', cd: 3, target: 'enemies', effects: [{ t: 'dmg', mult: 0.55 }] },
  hex: {
    id: 'hex', name: 'Hex', desc: 'Curses a hero to take more damage.', cd: 0, target: 'enemy',
    effects: [{ t: 'dmg', mult: 0.7 }, { t: 'status', kind: 'defDown', turns: 2 }], pick: 'back',
  },
  mend: { id: 'mend', name: 'Mend', desc: 'Heals its most wounded ally.', cd: 2, target: 'ally', effects: [{ t: 'heal', mult: 1.8 }] },
  bolt: { id: 'bolt', name: 'Bone Bolt', desc: 'A bolt of dark magic.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1.05 }], pick: 'back' },
  nova: { id: 'nova', name: 'Grave Chill', desc: 'Chills every hero.', cd: 3, target: 'enemies', effects: [{ t: 'dmg', mult: 0.6 }] },
  raise: { id: 'raise', name: 'Raise Dead', desc: 'Calls a skeleton from the floor.', cd: 4, target: 'self', effects: [{ t: 'summon', enemy: 'skeleton', max: 3 }] },
  fang: {
    id: 'fang', name: 'Venom Fang', desc: 'A poisoned bite.', cd: 0, target: 'enemy',
    effects: [{ t: 'dmg', mult: 0.75 }, { t: 'status', kind: 'poison', turns: 3, mult: 0.4 }], pick: 'random',
  },
  web: { id: 'web', name: 'Web', desc: 'Wraps a hero in webbing so it skips a turn.', cd: 4, target: 'enemy', effects: [{ t: 'dmg', mult: 0.5 }, { t: 'status', kind: 'stun', turns: 1 }], pick: 'strongest' },
  brood: { id: 'brood', name: 'Brood', desc: 'Calls a spiderling.', cd: 4, target: 'self', effects: [{ t: 'summon', enemy: 'spider', max: 3 }] },
  cleave: { id: 'cleave', name: 'Cleave', desc: 'A wide swing at every hero.', cd: 2, target: 'enemies', effects: [{ t: 'dmg', mult: 0.7 }] },
  crush: { id: 'crush', name: 'Crush', desc: 'A crushing blow.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1.25 }], pick: 'random' },
  warcry: { id: 'warcry', name: 'War Cry', desc: 'Calls a goblin to fight.', cd: 4, target: 'self', effects: [{ t: 'summon', enemy: 'goblin', max: 3 }, { t: 'status', kind: 'atkUp', turns: 2, self: true }] },
  smash: { id: 'smash', name: 'Smash', desc: 'Pounds a hero into the floor.', cd: 0, target: 'enemy', effects: [{ t: 'dmg', mult: 1.3 }], pick: 'random' },
  quake: {
    id: 'quake', name: 'Ground Pound', desc: 'Shakes the cave; may stun.', cd: 3, target: 'enemies',
    effects: [{ t: 'dmg', mult: 0.75 }, { t: 'status', kind: 'stun', turns: 1, chance: 0.3 }],
  },
  stoneSkin: { id: 'stoneSkin', name: 'Stone Skin', desc: 'Regrows its stony hide.', cd: 4, target: 'self', effects: [{ t: 'status', kind: 'regen', turns: 3, mult: 0.8 }, { t: 'status', kind: 'guard', turns: 2 }], below: 0.75 },
  flame: { id: 'flame', name: 'Ember Spit', desc: 'Sets a hero alight.', cd: 2, target: 'enemy', effects: [{ t: 'dmg', mult: 0.8 }, { t: 'status', kind: 'burn', turns: 3, mult: 0.5 }], pick: 'random' },
};

const HEROES: HeroDef[] = [
  {
    id: 'knight', name: 'Aldric', cls: 'Knight', art: 'heroes/knight',
    base: { hp: 150, atk: 13, def: 10, spd: 9, crit: 0.05 },
    skills: ['slash', 'bash', 'taunt', 'rally'],
    blurb: 'Holds the line. Stuns, taunts and shields the party.',
  },
  {
    id: 'ranger', name: 'Wren', cls: 'Ranger', art: 'heroes/ranger',
    base: { hp: 95, atk: 17, def: 5, spd: 13, crit: 0.12 },
    skills: ['shot', 'venom', 'volley', 'aimed'],
    blurb: 'Fast and deadly. Poison, volleys and huge aimed shots.',
  },
  {
    id: 'cleric', name: 'Mira', cls: 'Cleric', art: 'heroes/cleric',
    base: { hp: 100, atk: 12, def: 6, spd: 11, crit: 0.05 },
    skills: ['smite', 'heal', 'bless', 'revive'],
    blurb: 'Keeps everyone standing. Heals, blesses and resurrects.',
  },
];

const ENEMIES: Record<string, EnemyDef> = {
  bat: { id: 'bat', name: 'Cave Bat', art: 'enemies/cave_bat', base: { hp: 30, atk: 9, def: 1, spd: 15, crit: 0.05 }, skills: ['bite', 'leech'] },
  skeleton: { id: 'skeleton', name: 'Skeleton', art: 'enemies/skeleton', base: { hp: 48, atk: 10, def: 8, spd: 7, crit: 0.05 }, skills: ['club', 'boneWall'] },
  goblin: { id: 'goblin', name: 'Goblin', art: 'enemies/goblin', base: { hp: 44, atk: 11, def: 3, spd: 10, crit: 0.08 }, skills: ['stab', 'frenzy'] },
  archer: { id: 'archer', name: 'Goblin Archer', art: 'enemies/goblin_archer', base: { hp: 34, atk: 12, def: 2, spd: 12, crit: 0.1 }, skills: ['arrow', 'rain'] },
  shaman: { id: 'shaman', name: 'Goblin Shaman', art: 'enemies/goblin_shaman', base: { hp: 38, atk: 9, def: 3, spd: 9, crit: 0.05 }, skills: ['hex', 'mend'] },
  mage: { id: 'mage', name: 'Skeleton Mage', art: 'enemies/skeleton_mage', base: { hp: 40, atk: 12, def: 4, spd: 8, crit: 0.05 }, skills: ['bolt', 'nova'] },
  spider: { id: 'spider', name: 'Cave Spider', art: 'enemies/cave_spider', base: { hp: 40, atk: 10, def: 4, spd: 11, crit: 0.05 }, skills: ['fang'] },
  acolyte: {
    id: 'acolyte', name: 'Hollow Acolyte', art: 'enemies/skeleton_mage', boss: true, tint: 'hue-rotate(150deg) saturate(1.4)',
    base: { hp: 230, atk: 13, def: 6, spd: 9, crit: 0.05 }, skills: ['bolt', 'nova', 'raise'],
  },
  chief: {
    id: 'chief', name: 'Orc Warchief', art: 'enemies/orc_chief', boss: true, enrage: true,
    base: { hp: 330, atk: 15, def: 8, spd: 8, crit: 0.08 }, skills: ['crush', 'cleave', 'warcry'],
  },
  queen: {
    id: 'queen', name: 'Spider Queen', art: 'enemies/spider_queen', boss: true,
    base: { hp: 380, atk: 14, def: 7, spd: 10, crit: 0.05 }, skills: ['fang', 'web', 'brood'],
  },
  troll: {
    id: 'troll', name: 'Stone Troll', art: 'enemies/stone_troll', boss: true, enrage: true,
    base: { hp: 440, atk: 18, def: 12, spd: 6, crit: 0.05 }, skills: ['smash', 'quake', 'stoneSkin'],
  },
  ember: {
    id: 'ember', name: 'Ember Goblin', art: 'enemies/goblin', tint: 'hue-rotate(-95deg) saturate(1.5)', base: { hp: 46, atk: 12, def: 4, spd: 11, crit: 0.08 }, skills: ['stab', 'flame'],
  },
};

const ITEMS: Record<string, ItemDef> = {
  rusty_sword: { id: 'rusty_sword', name: 'Rusty Sword', slot: 'weapon', art: 'items/rusty_sword', only: ['knight'], stats: { atk: 4 }, price: 60, tier: 1 },
  iron_sword: { id: 'iron_sword', name: 'Iron Sword', slot: 'weapon', art: 'items/iron_sword', only: ['knight'], stats: { atk: 10, crit: 0.03 }, price: 420, tier: 2 },
  oak_bow: { id: 'oak_bow', name: 'Oak Bow', slot: 'weapon', art: 'items/oak_bow', only: ['ranger'], stats: { atk: 5 }, price: 70, tier: 1 },
  longbow: { id: 'longbow', name: 'Longbow', slot: 'weapon', art: 'items/longbow', only: ['ranger'], stats: { atk: 11, crit: 0.05 }, price: 460, tier: 2 },
  blessed_mace: { id: 'blessed_mace', name: 'Blessed Mace', slot: 'weapon', art: 'items/blessed_mace', only: ['cleric'], stats: { atk: 4, def: 2 }, price: 65, tier: 1 },
  holy_staff: { id: 'holy_staff', name: 'Holy Staff', slot: 'weapon', art: 'items/holy_staff', only: ['cleric'], stats: { atk: 10, hp: 20 }, price: 440, tier: 2 },
  padded_vest: { id: 'padded_vest', name: 'Padded Vest', slot: 'armor', art: 'items/padded_vest', only: [], stats: { hp: 20, def: 2 }, price: 50, tier: 1 },
  leather_armor: { id: 'leather_armor', name: 'Leather Armor', slot: 'armor', art: 'items/leather_armor', only: [], stats: { hp: 32, def: 4, spd: 1 }, price: 180, tier: 2 },
  silk_cloak: { id: 'silk_cloak', name: 'Silk Cloak', slot: 'armor', art: 'items/silk_cloak', only: ['ranger', 'cleric'], stats: { hp: 40, def: 4, spd: 3 }, price: 520, tier: 3 },
  chain_mail: { id: 'chain_mail', name: 'Chain Mail', slot: 'armor', art: 'items/chain_mail', only: [], stats: { hp: 60, def: 7 }, price: 560, tier: 3 },
  iron_plate: { id: 'iron_plate', name: 'Iron Plate', slot: 'armor', art: 'items/iron_plate', only: ['knight'], stats: { hp: 110, def: 13, spd: -1 }, price: 1300, tier: 4 },
  goblin_tooth: { id: 'goblin_tooth', name: 'Goblin Tooth', slot: 'charm', art: 'items/goblin_tooth', only: [], stats: { atk: 3, crit: 0.04 }, price: 150, tier: 2 },
  lucky_charm: { id: 'lucky_charm', name: 'Lucky Charm', slot: 'charm', art: 'items/lucky_charm', only: [], stats: { crit: 0.1, spd: 1 }, price: 380, tier: 3 },
  bone_ring: { id: 'bone_ring', name: 'Bone Ring', slot: 'charm', art: 'items/bone_ring', only: [], stats: { hp: 30, def: 4 }, price: 300, tier: 2 },
  troll_heart: { id: 'troll_heart', name: 'Troll Heart', slot: 'charm', art: 'items/troll_heart', only: [], stats: { hp: 90, def: 4, atk: 4 }, price: 1500, tier: 4 },
};

const W = (...e: [string, number][]): [string, number][] => e;

const REGIONS: RegionDef[] = [
  {
    id: 'cellar', name: 'The Old Cellar', art: 'backgrounds/old_cellar',
    blurb: 'Something has been knocking under the keep. The cellar floor has cracked open.',
    loot: ['rusty_sword', 'oak_bow', 'blessed_mace', 'padded_vest'],
    stages: [
      { id: '1-1', name: 'Wine Racks', waves: [W(['bat', 1], ['bat', 1]), W(['skeleton', 1])], gold: 20, xp: 30 },
      { id: '1-2', name: 'Dusty Crates', waves: [W(['skeleton', 1], ['bat', 1]), W(['bat', 2], ['bat', 2], ['bat', 1])], gold: 26, xp: 40 },
      { id: '1-3', name: 'The Crack', waves: [W(['skeleton', 2], ['skeleton', 2]), W(['bat', 2], ['skeleton', 2], ['bat', 2])], gold: 32, xp: 52 },
      { id: '1-4', name: 'Bone Pit', waves: [W(['skeleton', 3], ['bat', 3], ['skeleton', 3]), W(['mage', 3], ['skeleton', 3])], gold: 40, xp: 66 },
      { id: '1-5', name: 'The Acolyte', boss: true, drop: 'bone_ring', waves: [W(['skeleton', 3], ['acolyte', 3], ['skeleton', 3])], gold: 90, xp: 110 },
    ],
  },
  {
    id: 'warren', name: 'Goblin Warren', art: 'backgrounds/goblin_warren',
    blurb: 'Lantern-lit tunnels dug by goblins. They are not happy to see you.',
    loot: ['padded_vest', 'leather_armor', 'goblin_tooth', 'rusty_sword', 'oak_bow', 'blessed_mace'],
    stages: [
      { id: '2-1', name: 'Mine Cart Tracks', waves: [W(['goblin', 4], ['goblin', 4]), W(['archer', 4], ['goblin', 4], ['archer', 4])], gold: 48, xp: 80 },
      { id: '2-2', name: 'Lookout Post', waves: [W(['archer', 5], ['archer', 5], ['goblin', 5]), W(['shaman', 5], ['goblin', 5])], gold: 56, xp: 95 },
      { id: '2-3', name: 'Mushroom Den', waves: [W(['goblin', 5], ['shaman', 5], ['goblin', 5]), W(['archer', 5], ['shaman', 5], ['archer', 5])], gold: 64, xp: 110 },
      { id: '2-4', name: 'War Camp', waves: [W(['goblin', 6], ['goblin', 6], ['shaman', 6]), W(['archer', 6], ['goblin', 6], ['archer', 6])], gold: 74, xp: 128 },
      { id: '2-5', name: 'The Warchief', boss: true, drop: 'lucky_charm', waves: [W(['shaman', 6], ['chief', 6], ['archer', 6])], gold: 160, xp: 200 },
    ],
  },
  {
    id: 'caves', name: 'Spider Caves', art: 'backgrounds/spider_caves',
    blurb: 'Glowing fungus and webs thick as rope. Mind the eggs.',
    loot: ['leather_armor', 'goblin_tooth', 'bone_ring', 'silk_cloak', 'chain_mail', 'lucky_charm'],
    stages: [
      { id: '3-1', name: 'Silk Curtain', waves: [W(['spider', 7], ['spider', 7]), W(['bat', 7], ['spider', 7], ['bat', 7])], gold: 86, xp: 150 },
      { id: '3-2', name: 'Fungus Grove', waves: [W(['spider', 8], ['mage', 8], ['spider', 8]), W(['bat', 8], ['bat', 8], ['spider', 8])], gold: 96, xp: 170 },
      { id: '3-3', name: 'Egg Chamber', waves: [W(['spider', 8], ['spider', 8], ['spider', 8]), W(['mage', 8], ['spider', 8], ['mage', 8])], gold: 108, xp: 190 },
      { id: '3-4', name: 'Bone Bridge', waves: [W(['skeleton', 9], ['mage', 9], ['skeleton', 9]), W(['spider', 9], ['bat', 9], ['spider', 9])], gold: 120, xp: 215 },
      { id: '3-5', name: 'The Queen', boss: true, drop: 'iron_plate', waves: [W(['spider', 9], ['queen', 9], ['spider', 9])], gold: 260, xp: 330 },
    ],
  },
  {
    id: 'depths', name: 'Iron Depths', art: 'backgrounds/iron_depths',
    blurb: 'Old dwarven mines glowing with molten rock. The Ember Gate is close.',
    loot: ['chain_mail', 'silk_cloak', 'lucky_charm', 'bone_ring', 'iron_sword', 'longbow', 'holy_staff', 'iron_plate'],
    stages: [
      { id: '4-1', name: 'Rail Junction', waves: [W(['ember', 10], ['skeleton', 10], ['ember', 10]), W(['archer', 10], ['ember', 10], ['archer', 10])], gold: 135, xp: 240 },
      { id: '4-2', name: 'Forge Hall', waves: [W(['ember', 11], ['shaman', 11], ['ember', 11]), W(['mage', 11], ['skeleton', 11], ['mage', 11])], gold: 150, xp: 265 },
      { id: '4-3', name: 'Lava Bridge', waves: [W(['ember', 11], ['ember', 11], ['ember', 11]), W(['goblin', 12], ['shaman', 12], ['archer', 12])], gold: 165, xp: 290 },
      { id: '4-4', name: 'The Deep Vein', waves: [W(['skeleton', 12], ['mage', 12], ['ember', 12]), W(['spider', 12], ['ember', 12], ['shaman', 12])], gold: 180, xp: 320 },
      { id: '4-5', name: 'The Ember Gate', boss: true, drop: 'troll_heart', waves: [W(['ember', 12], ['troll', 12], ['ember', 12])], gold: 400, xp: 500 },
    ],
  },
];

const STAGES: StageDef[] = REGIONS.flatMap((r) => r.stages);
const MAX_LEVEL = 30;
