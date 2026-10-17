// Compiles the TypeScript and joins the scripts, in load order, into
// www/game.js (the game) and build/core.js (rules only, for tests and tools).
// The sources are plain scripts that share one global scope, so no bundler is needed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let tsc;
try { tsc = require.resolve('typescript/bin/tsc'); } catch { tsc = '/opt/node22/lib/node_modules/typescript/bin/tsc'; }
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });

const CORE = ['core/format', 'core/data', 'core/game'];
const UI = ['ui/icons', 'ui/audio', 'ui/platform', 'ui/ads', 'ui/scene', 'ui/app'];
const join = (names) => names.map((n) => `// ---- ${n}.ts\n` + readFileSync(`build/js/${n}.js`, 'utf8')).join('\n');

mkdirSync('build', { recursive: true });
writeFileSync('build/core.js', join(CORE) + '\nif (typeof module !== "undefined") module.exports = { GENS, ZONES, UPGRADES, UPGRADE_BY_ID, PERKS, ACHIEVEMENTS, fmt, fmtTime, newState, tap, tick, pps, rawPPS, genCost, maxAffordable, buyGen, buyUpgrade, visibleUpgrades, descend, descendCost, spawnVisitor, catchVisitor, checkAchievements, migrate, canMigrate, moonstonesOnMigrate, buyPerk, perkCost, applyOffline, serialize, deserialize, isHighTide, tapValue, comboCap, genUnlocked, TIDE_PERIOD_MS, startGeyser, geyserReady, geyserActive, rollDaily, claimDaily, dailyReady, nextStreak, dailyReward, prevDayKey, DAILY_TAPS, rollAds, rewardSurge, rewardOffline, rewardGift, canDoubleGift, surgesLeft, surgeUnlocked, RARES, adoptRare, offlineRate, fillRequests, claimRequest, requestProgress, requestDone, requestsReady, requestText, requestReward, moonAge, spawningActive, spawningEndsAt, nextSpawningAt, reminderPlan, DIVES, subUnlocked, launchDive, collectDive, subBack, diveReward, speedUpDive, subSpeedsLeft };\n');
writeFileSync('www/game.js', '"use strict";\n(() => {\n' + join([...CORE, ...UI]) + '\n})();\n');
console.log('built www/game.js');
