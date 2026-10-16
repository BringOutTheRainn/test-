// Opens the game in headless Chromium at phone size, plays a little and saves
// screenshots. Usage: node tools/screens.mjs <outDir> [scenario]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = resolve('www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
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

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: join(out, name + '.png') }); console.log('saved', name); };
const game = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url);
await page.waitForTimeout(800);
await shot('01_first_launch');

// Tap the body a few times.
const box = await page.locator('#sky').boundingBox();
for (let i = 0; i < 25; i++) await page.mouse.click(box.x + box.width / 2 + (i % 5) * 6, box.y + box.height / 2);
await shot('02_tapping');

// Give a mid-game state.
await game(() => {
  const { ctx } = window.__game;
  const s = ctx.s;
  s.stardust = 2.4e6; s.earnedRun = 9e6; s.earnedAll = 9e6; s.tapsAll = 400; s.tapEarnedRun = 2e5;
  s.generators = [32, 18, 12, 6, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  s.upgrades = { drone_0: true, drone_1: true, drone_2: true, harvester_0: true, lunar_0: true };
  ctx.recalc(); ctx.dirty();
});
await page.waitForTimeout(600);
await shot('03_mid_game');
await game(() => window.__game.spawnComet(false));
await page.waitForTimeout(3000);
await shot('04_comet');
const pos = await game(() => window.__game.cometPosition());
if (pos) await page.mouse.click(box.x + pos[0], box.y + pos[1]);
await page.waitForTimeout(500);
await shot('05_comet_caught');
await page.click('[data-tab="upgrades"]');
await shot('06_upgrades');
await page.click('[data-tab="trophies"]');
await shot('07_trophies');
await page.click('[data-tab="cosmos"]');
await shot('08_cosmos_locked');

// Late game with Dark Matter.
await game(() => {
  const { ctx } = window.__game;
  const s = ctx.s;
  s.stardust = 3e14; s.earnedRun = 4e14; s.earnedAll = 9e15; s.darkMatter = 60; s.collapses = 2;
  s.cosmic = { glow: true, seed: true, magnet: true, fingers: true, kit: true, bay: false };
  s.generators = [120, 100, 90, 80, 70, 60, 50, 40, 25, 10, 2, 0, 0, 0];
  ctx.recalc(); ctx.dirty();
});
await page.waitForTimeout(600);
await shot('09_cosmos');
await page.click('[data-tab="build"]');
await shot('10_late_build');
await page.click('#btn-stats');
await shot('11_stats');
await page.click('.modal-x');
await page.click('#btn-settings');
await shot('12_settings');
await page.click('.modal-x');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
server.close();
