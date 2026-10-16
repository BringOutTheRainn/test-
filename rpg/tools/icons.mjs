// Draws the Android launcher icons and splash screen from the game's own sprites, in headless
// Chromium, into resources/android. Run once after changing the art: node tools/icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const png = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const knight = png('art/heroes/knight.png');
const ranger = png('art/heroes/ranger.png');
const cleric = png('art/heroes/cleric.png');
const bg = png('art/backgrounds/old_cellar.png');

const glow = 'radial-gradient(circle at 50% 60%, #c4532c, #3a1f2a 45%, #16121f 72%)';
const page = (body, w, h, back) => `<html><body style="margin:0;width:${w}px;height:${h}px;background:${back};overflow:hidden">${body}</body></html>`;
const sprite = (src, h, extra = '') => `<img src="${src}" style="height:${h}px;image-rendering:pixelated;${extra}">`;

// Legacy square icon: the knight on an ember glow. Foreground: the knight alone inside the
// adaptive-icon safe zone (the middle 66%).
const icon = (s, round = false) => page(`<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:${glow};border-radius:${round ? '50%' : '0'}">${sprite(knight, Math.round(s * 0.72))}</div>`, s, s, 'transparent');
const fore = (s) => page(`<div style="width:${s}px;height:${s}px;display:grid;place-items:center">${sprite(knight, Math.round(s * 0.5))}</div>`, s, s, 'transparent');
const splash = (w, h) => page(`
  <div style="position:absolute;inset:0;background:url(${bg}) center/cover;image-rendering:pixelated;opacity:.35"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(#16121fcc,#16121f 70%)"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.03}px">
    <div style="display:flex;align-items:flex-end;gap:${w * 0.02}px">${sprite(ranger, h * 0.13)}${sprite(knight, h * 0.16)}${sprite(cleric, h * 0.13)}</div>
    <div style="font:700 ${w * 0.11}px Georgia,serif;color:#ff7a3d;text-shadow:0 4px 0 #5a1e08">Emberdeep</div>
  </div>`, w, h, '#16121f');

const sizes = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const shoot = async (html, w, h, path, transparent = false) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.waitForTimeout(100);
  await p.screenshot({ path, omitBackground: transparent });
  await p.close();
};
for (const [dpi, [s, f]] of Object.entries(sizes)) {
  const dir = `resources/android/mipmap-${dpi}`;
  mkdirSync(dir, { recursive: true });
  await shoot(icon(s), s, s, `${dir}/ic_launcher.png`);
  await shoot(icon(s, true), s, s, `${dir}/ic_launcher_round.png`, true);
  await shoot(fore(f), f, f, `${dir}/ic_launcher_foreground.png`, true);
}
await shoot(splash(1080, 1920), 1080, 1920, 'resources/android/splash.png');
await shoot(icon(512), 512, 512, 'resources/icon-512.png');
await browser.close();
console.log('wrote resources/android');
