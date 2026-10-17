// Compiles the TypeScript and joins the scripts, in load order, into
// www/game.js (the game, with its pixel art inlined) and build/core.js (rules only, for tests and tools).
// The sources are plain scripts that share one global scope, so no bundler is needed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let tsc;
try { tsc = require.resolve('typescript/bin/tsc'); } catch { tsc = '/opt/node22/lib/node_modules/typescript/bin/tsc'; }
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });

// The sprites live in ./art (copied from the old shared art folder, plus Emberdeep's own heroes).
const art = {};
for (const dir of ['heroes', 'enemies', 'items', 'backgrounds', 'resources']) {
  for (const f of readdirSync(`art/${dir}`).filter((n) => n.endsWith('.png')).sort()) {
    art[`${dir}/${f.slice(0, -4)}`] = 'data:image/png;base64,' + readFileSync(`art/${dir}/${f}`).toString('base64');
  }
}
const artJs = `const ART = ${JSON.stringify(art)};\n`;

const CORE = ['core/data', 'core/battle', 'core/game'];
const UI = ['ui/audio', 'ui/app'];
const join = (names) => names.map((n) => `// ---- ${n}.ts\n` + readFileSync(`build/js/${n}.js`, 'utf8')).join('\n');

const exportsList = [
  'HEROES', 'ENEMIES', 'SKILLS', 'ITEMS', 'REGIONS', 'STAGES', 'STATUS_INFO', 'MAX_LEVEL',
  'startBattle', 'advance', 'enemyAct', 'heroAct', 'autoChoice', 'autoBattle', 'validTargets', 'canUse', 'turnQueue', 'current', 'alive',
  'newState', 'heroStats', 'partyUnits', 'beginBattle', 'finishBattle', 'stageUnlocked', 'regionUnlocked', 'frontier', 'starsFor', 'parFor',
  'xpToNext', 'addXp', 'giveItem', 'equip', 'canEquip', 'shopStock', 'buyItem', 'sellItem', 'upgradeItem', 'upgradeCost', 'itemStats',
  'serialize', 'deserialize', 'stageDef', 'heroState', 'suggestedLevel', 'power',
  'titheReady', 'claimTithe', 'titheRate', 'TITHE_CAP_HOURS', 'towerUnlocked', 'towerFloor', 'towerLevel', 'towerNext', 'beginTower', 'towerChest', 'towerNextChest', 'TOWER_CHEST_EVERY',
  'PARTY_SIZE', 'canRecruit', 'recruitHero', 'recruitLevel', 'setPartySlot', 'heroDef',
  'TRIAL_MODS', 'dayKey', 'prevDay', 'trialFor', 'beginTrial', 'trialUnlocked', 'trialWonToday', 'adsLeft', 'claimAdBonus',
];
mkdirSync('build', { recursive: true });
writeFileSync('build/core.js', join(CORE) + `\nif (typeof module !== "undefined") module.exports = { ${exportsList.join(', ')} };\n`);
writeFileSync('www/game.js', '"use strict";\n(() => {\n' + artJs + join([...CORE, ...UI]) + '\n})();\n');
console.log('built www/game.js', (readFileSync('www/game.js').length / 1024).toFixed(0) + ' KB');
