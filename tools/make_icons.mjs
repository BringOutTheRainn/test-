// Renders the app icon and splash screen PNGs from the SVG sources with
// headless Chromium. Run after changing www/icon.svg or resources/*.svg:
//   node tools/make_icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const icon = readFileSync('www/icon.svg', 'utf8');
const fg = readFileSync('resources/icon-foreground.svg', 'utf8');
const iconData = 'data:image/svg+xml;base64,' + Buffer.from(icon).toString('base64');
const splash = readFileSync('resources/splash.svg', 'utf8').replace('ICON', iconData);

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
async function render(svg, size, out, transparent = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: transparent });
  console.log('wrote', out);
}

const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [dpi, size] of Object.entries(legacy)) {
  mkdirSync(`resources/android/mipmap-${dpi}`, { recursive: true });
  await render(icon, size, `resources/android/mipmap-${dpi}/ic_launcher.png`, true);
  await render(icon, size, `resources/android/mipmap-${dpi}/ic_launcher_round.png`, true);
  await render(fg, adaptive[dpi], `resources/android/mipmap-${dpi}/ic_launcher_foreground.png`, true);
}
await render(splash, 1366, 'resources/android/splash.png');
await render(icon, 512, 'www/icon-512.png', true);
await render(icon, 1024, 'resources/icon-1024.png', true);
await browser.close();
