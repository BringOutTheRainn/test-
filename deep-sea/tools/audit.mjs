// Checks the layout on small phones: tap targets under 44px, controls that overlap,
// and anything that scrolls sideways. Usage: node tools/audit.mjs [--strict]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

const MIN = 44;
const SIZES = [[320, 568], [360, 640], [390, 844]];
const TABS = ['colony', 'depths', 'migrate', 'logbook', 'stats'];
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const problems = [];

for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await page.goto(url);
  await page.waitForTimeout(600);
  await page.click('#modal .act');
  // A late-game save with every chip and panel showing.
  await page.evaluate(() => {
    const app = window.__fathom, s = app.s;
    s.pearls = 4e12; s.earnedRun = 9e12; s.earnedLife = 4e13; s.zone = 3; s.moonstones = 12; s.hearts = 11;
    s.owned = [120, 110, 100, 90, 80, 60, 40, 30, 20, 8, 2, 0, 0];
    app.panelKey = ''; app.renderPanel();
  });
  await page.waitForTimeout(800);
  for (const tab of TABS) {
    await page.click(`#tabs button[data-tab="${tab}"]`);
    await page.waitForTimeout(300);
    const found = await page.evaluate((MIN) => {
      const out = [];
      const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && !el.closest('[hidden]'); };
      const name = (el) => el.id ? '#' + el.id : (el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase()) + (el.textContent.trim() ? ` "${el.textContent.trim().slice(0, 18)}"` : '');
      const els = [...document.querySelectorAll('button, .plot, [data-i]')].filter(vis);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.height < MIN || r.width < MIN) out.push(`small ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const stage = [...document.querySelectorAll('#stage button')].filter(vis);
      for (let i = 0; i < stage.length; i++) for (let j = i + 1; j < stage.length; j++) {
        const a = stage[i].getBoundingClientRect(), b = stage[j].getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`overlap ${name(stage[i])} / ${name(stage[j])}`);
      }
      const de = document.documentElement;
      if (de.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways (${de.scrollWidth}px)`);
      for (const el of document.querySelectorAll('#panel *')) {
        if (el.closest('.upgrades')) continue;
        const r = el.getBoundingClientRect();
        if (vis(el) && r.right > innerWidth + 1) { out.push(`off-screen ${name(el)} right=${Math.round(r.right)}`); break; }
      }
      return out;
    }, MIN);
    for (const f of found) problems.push(`${w}x${h} ${tab}: ${f}`);
  }
  await page.close();
}
await browser.close();
server.close();
const unique = [...new Set(problems)];
console.log(unique.length ? unique.join('\n') : 'no problems');
console.log(`${unique.length} problems`);
if (process.argv.includes('--strict') && unique.length) process.exit(1);
