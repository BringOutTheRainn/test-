// Renders the captioned 1080x1920 Play Store phone screenshots from the game screenshots:
//   node tools/screens.mjs build/screens && node tools/store_shots.mjs
// One short, benefit-led caption per frame, in story order: hook, core loop, differentiators, the return.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const SHOTS = [
  ['05_abyss_whale', 'Sink into the glowing deep'],
  ['02_tapping', 'Tap, combo, gather Pearls'],
  ['25_garden', 'Grow and cross-breed corals'],
  ['23_relic_found', 'Dive for sunken relics'],
  ['20_coral_spawning', 'Real full moons spawn the coral'],
  ['27_event', 'A new ocean event every week'],
  ['09_welcome_back', 'Your reef works while you sleep'],
];

const dir = process.argv[2] ?? 'build/screens';
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
mkdirSync('resources/store/screenshots', { recursive: true });
for (const [i, [name, caption]] of SHOTS.entries()) {
  const shot = 'data:image/png;base64,' + readFileSync(`${dir}/${name}.png`).toString('base64');
  await page.setContent(`<html><head><style>
    body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; font-family: system-ui, sans-serif;
      background: radial-gradient(120% 90% at 50% 0%, #1f7fb8 0%, #0b3a63 45%, #04182c 100%); color: #fff; }
    h1 { position: absolute; left: 60px; right: 60px; top: 90px; margin: 0; text-align: center; font-size: 78px;
      line-height: 1.1; font-weight: 800; text-shadow: 0 4px 18px rgba(0,0,0,0.35); }
    .phone { position: absolute; left: 50%; top: 330px; width: 720px; height: 1558px; transform: translateX(-50%);
      border-radius: 64px; overflow: hidden; box-shadow: 0 0 0 14px #071a2e, 0 30px 70px rgba(0,0,0,0.55); }
    .phone img { width: 100%; display: block; }
  </style></head><body><h1>${caption}</h1><div class="phone"><img src="${shot}"></div></body></html>`);
  await page.waitForTimeout(150);
  const out = `resources/store/screenshots/${String(i + 1).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out);
}
await browser.close();
