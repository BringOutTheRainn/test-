// Inlines the stylesheet, script and icon into one self-contained HTML file
// (build/fathom.html) that can be opened or shared anywhere.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('www/index.html', 'utf8');
const css = readFileSync('www/styles.css', 'utf8');
const js = readFileSync('www/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const icon = 'data:image/svg+xml;base64,' + readFileSync('www/icon.svg').toString('base64');
const out = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`)
  .replace('href="icon.svg"', () => `href="${icon}"`)
  .replace('<script src="game.js"></script>', () => `<script>\n${js}</script>`);
mkdirSync('build', { recursive: true });
writeFileSync('build/fathom.html', out);
console.log('wrote build/fathom.html', (out.length / 1024).toFixed(0) + ' KB');

// The same game as a page body (no html/head/body wrapper), for hosts that add their own.
const body = `<title>Fathom</title>\n<style>\n:root { color-scheme: dark; }\n${css}</style>\n<div id="app"><div class="boot">Fathom</div></div>\n<script>\n${js}</script>\n`;
writeFileSync('build/fathom-page.html', body);
