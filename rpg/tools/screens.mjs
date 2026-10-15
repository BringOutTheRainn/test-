// Opens the game in headless Chromium at phone size, plays a little and saves
// screenshots. Fails if the page logs an error. Usage: node tools/screens.mjs <outDir>
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = resolve('www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const out = process.argv[2] ?? 'screens';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: join(out, name + '.png') }); console.log('saved', name); };
const game = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForTimeout(600);
await shot('01_intro');
await page.click('[data-act="intro"]');
await shot('02_map');
await page.click('.stage[data-id="1-1"]');
await shot('03_stage');
await page.click('.modal [data-act="fight"]');
// Wait for the first hero turn.
await page.waitForSelector('.skill:not([disabled])', { timeout: 15000 });
await shot('04_battle', 300);

// Play by hand: pick the second skill if usable, then tap a target.
await page.click('.skill[data-skill]:not([disabled]) >> nth=1').catch(() => {});
await shot('05_targeting', 200);
const pickable = page.locator('.unit.pickable').first();
if (await pickable.count()) await pickable.click();
else await page.click('.skill.on');
await page.waitForTimeout(900);
await shot('06_action', 0);

// Let the autopilot finish at double speed.
await page.click('[data-act="auto"]');
await page.click('[data-act="fast"]');
await page.waitForSelector('.result', { timeout: 120000 });
await shot('07_result', 1200);
await page.click('.modal [data-act="leave"]');

// A mid-game save: Spider Caves with gear.
await game(() => {
  const a = window.__emberdeep, s = a.s;
  const ids = ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1'];
  for (const id of ids) s.stars[id] = id === '2-5' ? 2 : 3;
  s.gold = 1840;
  for (const h of s.heroes) { h.level = 8; h.xp = 210; }
  s.items = [
    { uid: 1, id: 'rusty_sword', plus: 3 }, { uid: 2, id: 'oak_bow', plus: 2 }, { uid: 3, id: 'blessed_mace', plus: 2 },
    { uid: 4, id: 'leather_armor', plus: 1 }, { uid: 5, id: 'padded_vest', plus: 2 }, { uid: 6, id: 'bone_ring', plus: 0 },
    { uid: 7, id: 'lucky_charm', plus: 0 }, { uid: 8, id: 'goblin_tooth', plus: 0 },
  ];
  s.nextItem = 9;
  s.heroes[0].gear = { weapon: 1, armor: 4, charm: 6 };
  s.heroes[1].gear = { weapon: 2, armor: null, charm: 7 };
  s.heroes[2].gear = { weapon: 3, armor: 5, charm: null };
  s.settings.auto = false; s.settings.fast = false;
  a.tab = 'map'; a.save(); a.render();
});
await shot('08_map_mid');
await page.click('[data-act="tab"][data-tab="heroes"]');
await shot('09_heroes');
await page.click('.slot >> nth=4');
await shot('10_gear_pick');
await page.click('.modal [data-act="close"]');
await page.click('[data-act="tab"][data-tab="forge"]');
await shot('11_forge');
await page.click('[data-act="forgetab"][data-t="bag"]');
await shot('12_bag');

// Recruit Sera at the Tavern and swap her into the party.
await page.click('[data-act="tab"][data-tab="heroes"]');
await page.evaluate(() => document.getElementById('main').scrollTop = 0);
await page.click('[data-act="recruit"][data-hero="duelist"]');
await shot('21_recruited', 300);
await page.waitForTimeout(3500);
await page.click('.pslot[data-slot="1"]');
await shot('22_party_pick');
await page.click('.modal [data-act="setparty"][data-hero="duelist"]');
await page.evaluate(() => document.getElementById('main').scrollTop = 0);
await shot('23_party_new');
await page.click('[data-act="tab"][data-tab="map"]');
await page.click('.stage[data-id="3-2"]');
await shot('24_stage_party');
await page.click('.modal [data-act="close"]');

// The Daily Trial, won on autopilot, with the rewarded-ad button.
await page.click('[data-act="tab"][data-tab="map"]');
await page.evaluate(() => document.getElementById('main').scrollTop = 0);
await page.click('.trial');
await shot('16_trial');
await page.click('.modal [data-act="fight"]');
await page.waitForSelector('.skill:not([disabled])', { timeout: 20000 });
await shot('17_trial_battle', 300);
await page.click('[data-act="auto"]');
await page.click('[data-act="fast"]');
await page.waitForSelector('.result', { timeout: 180000 });
await shot('18_trial_result', 1200);
const ad = page.locator('.adbtn');
if (await ad.count()) {
  await ad.click();
  await shot('19_ad', 600);
  await page.waitForSelector('.adlayer', { state: 'detached', timeout: 10000 });
}
await page.click('.modal [data-act="leave"]');
await page.evaluate(() => { const s = window.__emberdeep.s; s.settings.auto = false; s.settings.fast = false; window.__emberdeep.save(); });
await page.evaluate(() => document.getElementById('main').scrollTop = 0);
await shot('20_map_trial_done');

// The Ember Spire: open floor 5 (a boss floor) and climb it on autopilot.
await game(() => { const s = window.__emberdeep.s; s.tower.best = 4; window.__emberdeep.save(); window.__emberdeep.render(); });
await page.evaluate(() => document.getElementById('main').scrollTop = 0);
await shot('25_map_spire');
await page.click('.trial.tower');
await shot('26_spire_floor');
await page.click('.modal [data-act="fight"]');
await page.waitForSelector('.skill:not([disabled])', { timeout: 20000 });
await shot('27_spire_battle', 300);
await page.click('[data-act="auto"]');
await page.click('[data-act="fast"]');
await page.waitForSelector('.result', { timeout: 180000 });
await shot('28_spire_result', 1200);
await page.click('.modal [data-act="leave"]');
await page.evaluate(() => { const s = window.__emberdeep.s; s.settings.auto = false; s.settings.fast = false; window.__emberdeep.save(); });

// A boss fight.
await page.click('[data-act="tab"][data-tab="map"]');
await game(() => { const s = window.__emberdeep.s; for (const id of ['3-2', '3-3', '3-4']) s.stars[id] = 2; window.__emberdeep.render(); });
await page.click('.stage[data-id="3-5"]');
await page.click('.modal [data-act="fight"]');
await page.waitForSelector('.skill:not([disabled])', { timeout: 20000 });
await shot('13_boss', 300);
await page.click('.skill[data-skill="aimed"]').catch(() => {});
await page.waitForTimeout(100);
const t2 = page.locator('.unit.pickable').first();
if (await t2.count()) await t2.click();
await page.waitForSelector('.skill:not([disabled])', { timeout: 20000 });
await page.click('[data-act="auto"]');
await page.waitForTimeout(3500);
await shot('14_boss_later', 0);
await page.click('[data-act="pause"]');
await shot('15_pause');

await browser.close();
server.close();
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
