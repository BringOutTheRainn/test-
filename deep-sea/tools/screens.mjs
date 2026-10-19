// Opens the game in headless Chromium at phone size, plays a little and saves
// screenshots. Usage: node tools/screens.mjs <outDir>
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
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: join(out, name + '.png') }); console.log('saved', name); };
const game = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForTimeout(800);
await shot('01_intro');
await page.click('#modal .act');

const box = await page.locator('#scene').boundingBox();
for (let i = 0; i < 30; i++) await page.mouse.click(box.x + box.width / 2 + (i % 5) * 8, box.y + box.height * 0.65);
await shot('02_tapping');

// A mid-game colony in the Twilight Reef.
await game(() => {
  const app = window.__fathom, s = app.s;
  s.pearls = 2.4e6; s.earnedRun = 9e6; s.earnedLife = 9e6; s.zone = 1;
  s.owned = [32, 26, 18, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0];
  s.upgrades = { t_crab_0: true, t_crab_1: true, t_seahorse_0: true, tap_0: true, tap_1: true };
  app.panelKey = ''; app.renderPanel();
});
await page.waitForTimeout(300);
await game(() => { const a = window.__fathom; a.s.nextVisitorAt = 0; a.s.visitor = null; });
await page.waitForTimeout(1500);
await shot('03_twilight_fish');

// Geyser erupting, then the Daily Tide Gift ready to claim.
await page.click('#geyser');
await page.waitForTimeout(1200);
await shot('10_geyser');
await game(() => { const s = window.__fathom.s; s.daily.taps = 150; s.daily.claimedDay = ''; s.daily.streak = 2; });
await page.waitForTimeout(300);
await shot('11_gift_ready');
await page.click('#gift');
await shot('12_gift_modal');
await page.click('#modal .act');
await page.waitForTimeout(300);
await shot('13_gift_double');
await page.click('#modal .act.ghost');

// Current Surge through the browser stand-in ad.
await page.click('#surge');
await shot('14_surge_offer');
await page.click('#modal .act:not(.ghost)');
await page.waitForTimeout(1200);
await shot('15_ad_standin');
await page.waitForTimeout(5000);
await shot('16_surge_active');

// Reef Requests: one finished and ready to claim, then claimed.
await game(() => { const s = window.__fathom.s; s.requests.list[0].got = true; });
await page.waitForTimeout(400);
await shot('17_request_ready');
await page.click('#requests');
await shot('18_requests');
await page.click('#modal .claim');
await page.waitForTimeout(300);
await shot('19_request_claimed');
await page.click('#modal .btns .act');

await page.click('#tabs button[data-tab="depths"]');
await shot('04_depths');
// Expedition submarine: launch a trench dive, then bring it home.
await page.click('#panel .act.dive >> nth=1');
await page.waitForTimeout(300);
await shot('21_sub_diving');
await game(() => { window.__fathom.s.sub.until = Date.now() - 1000; });
await page.waitForTimeout(600);
await shot('22_sub_back');
// Force the relic roll so the found-relic modal shows.
await game(() => { window.__realRandom = Math.random; Math.random = () => 0.01; });
await page.click('#panel .act.dive');
await page.waitForTimeout(400);
await game(() => { Math.random = window.__realRandom; });
await shot('23_relic_found');
await page.click('#modal .btns .act');
await page.waitForTimeout(300);
await shot('24_relic_strip');

// Reef garden in the Midnight Trench: two grown parents cross-breed fire coral in the plot between them.
await game(() => {
  const s = window.__fathom.s, now = Date.now();
  s.zone = 2;
  const P = (c, ago) => ({ c, at: now - ago, grown: false });
  s.garden.plots = [P('staghorn', 11 * 60e3), P('', 0), P('brain', 61 * 60e3), P('fan', 75 * 60e3), P('', 0), P('staghorn', 4 * 60e3)];
  s.garden.plots[1].c = ''; s.garden.plots[4].c = '';
  s.garden.checkAt = 0;
  window.__realRandom = Math.random; Math.random = () => 0.01;
});
await page.waitForTimeout(400);
await game(() => { Math.random = window.__realRandom; });
await page.evaluate(() => document.querySelector('#panel .garden').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(4500); // let the toasts fade
await shot('25_garden');
await page.click('#panel .plot[data-i="4"]');
await page.waitForTimeout(300);
await shot('26_garden_plant');
await page.click('#modal .btns .act');

// Weekly ocean event: Coral Bloom Week with the second tier ready.
await game(() => {
  const s = window.__fathom.s;
  s.event.id = 'bloom'; s.event.claimed = 1; s.event.base = s.garden.harvests - 13;
});
await page.evaluate(() => document.querySelector('#panel').scrollTo(0, 0));
await page.waitForTimeout(400);
await shot('29_event_chip');
await page.click('#eventchip');
await page.waitForTimeout(300);
await shot('27_event');
await page.click('#modal .claim');
await page.waitForTimeout(400);
await shot('28_event_claimed');
await page.click('#modal .btns .act');

// Late game in the Midnight Trench and deeper.
await game(() => {
  const app = window.__fathom, s = app.s;
  s.pearls = 4e12; s.earnedRun = 9e12; s.earnedLife = 4e13; s.zone = 3; s.moonstones = 12; s.hearts = 11; s.rares = { moonjelly: true, narwhal: true, glasssquid: true };
  s.owned = [120, 110, 100, 90, 80, 60, 40, 30, 20, 8, 2, 0, 0];
  s.visitor = { kind: 'whale', spawnedAt: Date.now() - 6000, until: Date.now() + 10000, y: 0.18, dir: 1 };
  app.tab = 'colony'; app.panelKey = ''; app.renderPanel();
});
await page.waitForTimeout(1500);
await shot('05_abyss_whale');

await page.click('#tabs button[data-tab="migrate"]');
await shot('06_migrate');
await page.click('#tabs button[data-tab="logbook"]');
await shot('07_logbook');
await page.click('#tabs button[data-tab="stats"]');
await shot('08_stats');

// Offline popup after reload.
await game(() => { const a = window.__fathom; a.s.lastSeen = Date.now() - 3 * 3600e3; localStorage.setItem('fathom.save', JSON.stringify(a.s)); window.onbeforeunload = null; });
await page.evaluate(() => { window.__fathom.save = () => {}; });
await page.reload();
await page.waitForTimeout(800);
await shot('09_welcome_back');

// Coral spawning: a fresh page with the clock moved to a spawning night (Oct 29, 2026).
const spawnPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
spawnPage.on('pageerror', (e) => errors.push(String(e)));
await spawnPage.addInitScript(() => {
  const shift = Date.UTC(2026, 9, 29, 20) - Date.now();
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + shift;
  localStorage.clear();
});
await spawnPage.goto(url);
await spawnPage.waitForTimeout(600);
await spawnPage.click('#modal .act');
await spawnPage.evaluate(() => {
  const app = window.__fathom, s = app.s;
  s.pearls = 2.4e6; s.earnedRun = 9e6; s.earnedLife = 9e6; s.zone = 1;
  s.owned = [32, 26, 18, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0];
  app.panelKey = ''; app.renderPanel();
});
await spawnPage.waitForTimeout(2500);
await spawnPage.screenshot({ path: join(out, '20_coral_spawning.png') });
console.log('saved 20_coral_spawning');

await browser.close();
server.close();
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
