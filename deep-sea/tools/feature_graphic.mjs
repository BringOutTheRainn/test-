// Renders the 1024x500 Play Store feature graphic from the icon and a game screenshot:
//   node tools/screens.mjs build/screens && node tools/feature_graphic.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const shotPath = process.argv[2] ?? 'build/screens/20_coral_spawning.png';
const b64 = (path, type) => `data:${type};base64,` + readFileSync(path).toString('base64');
const icon = b64('www/icon.svg', 'image/svg+xml');
const shot = b64(shotPath, 'image/png');

const html = `<html><head><style>
  body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: system-ui, sans-serif;
    background: radial-gradient(120% 140% at 75% 10%, #1f7fb8 0%, #0b3a63 45%, #04182c 100%); color: #fff; position: relative; }
  .rays { position: absolute; inset: 0; background: repeating-linear-gradient(100deg, rgba(255,255,255,0.05) 0 40px, transparent 40px 120px); }
  .text { position: absolute; left: 64px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 18px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand img { width: 120px; height: 120px; border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
  h1 { font-size: 96px; margin: 0; letter-spacing: 2px; text-shadow: 0 4px 18px rgba(0,0,0,0.35); }
  p { font-size: 30px; margin: 0; line-height: 1.3; color: #cfefff; }
  .phone { position: absolute; right: 70px; top: 36px; width: 300px; height: 560px; border-radius: 36px; overflow: hidden;
    box-shadow: 0 0 0 10px #071a2e, 0 20px 50px rgba(0,0,0,0.55); transform: rotate(4deg); }
  .phone img { width: 100%; display: block; }
  .dot { position: absolute; border-radius: 50%; background: rgba(255,190,220,0.7); }
</style></head><body><div class="rays"></div>
  <div class="text"><div class="brand"><img src="${icon}"><h1>Fathom</h1></div>
  <p>Tap the giant clam, grow a glowing reef and sink into the deep.</p></div>
  <div class="phone"><img src="${shot}"></div>
  ${Array.from({ length: 26 }, (_, i) => `<div class="dot" style="left:${(i * 137) % 1000}px;top:${(i * 89) % 480}px;width:${3 + (i % 4) * 2}px;height:${3 + (i % 4) * 2}px"></div>`).join('')}
</body></html>`;

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
await page.setContent(html);
await page.waitForTimeout(200);
mkdirSync('resources/store', { recursive: true });
await page.screenshot({ path: 'resources/store/feature-graphic.png' });
await browser.close();
console.log('wrote resources/store/feature-graphic.png');
