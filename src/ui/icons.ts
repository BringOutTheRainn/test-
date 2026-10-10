// Hand-drawn SVG icons, 64x64. Kept as strings so they work with no assets.

// Each factory returns its gradient defs and its shapes; installIcons() puts
// them all into one hidden sprite so gradients render even inside hidden tabs.
const SEP = '\u0000';
const svg = (body: string, defs = ''): string => defs + SEP + body;

let gid = 0;
function grad(stops: Array<[number, string]>, x1 = 0, y1 = 0, x2 = 0, y2 = 1): [string, string] {
  const id = `g${++gid}`;
  const s = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return [id, `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`];
}
function rgrad(stops: Array<[number, string]>, cx = 0.4, cy = 0.35, r = 0.7): [string, string] {
  const id = `g${++gid}`;
  const s = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return [id, `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${s}</radialGradient>`];
}

function drone(): string {
  const [a, ad] = grad([[0, '#c9d6ff'], [1, '#5f6fa8']]);
  return svg(`
    <rect x="8" y="22" width="14" height="5" rx="2" fill="#8fa3d8"/><rect x="42" y="22" width="14" height="5" rx="2" fill="#8fa3d8"/>
    <rect x="4" y="19" width="22" height="3" rx="1.5" fill="#dfe8ff" opacity=".8"/><rect x="38" y="19" width="22" height="3" rx="1.5" fill="#dfe8ff" opacity=".8"/>
    <rect x="18" y="22" width="28" height="18" rx="9" fill="url(#${a})"/>
    <circle cx="32" cy="31" r="5" fill="#0b1030"/><circle cx="32" cy="31" r="2.5" fill="#5ef0ff"/>
    <path d="M26 40 L22 52 M38 40 L42 52" stroke="#8fa3d8" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 52 h6 M38 52 h6" stroke="#ffcf5a" stroke-width="3" stroke-linecap="round"/>`, ad);
}

function harvester(): string {
  const [a, ad] = grad([[0, '#ffd27a'], [1, '#c4632b']]);
  const [r, rd] = rgrad([[0, '#a39486'], [1, '#4e443c']]);
  return svg(`
    <path d="M44 10 l10 4 l2 10 l-8 6 l-10 -4 l-2 -10z" fill="url(#${r})"/>
    <path d="M10 40 h28 l8 -10 l6 4 l-8 14 h-34z" fill="url(#${a})"/>
    <rect x="12" y="44" width="30" height="6" rx="3" fill="#6b3a1d"/>
    <circle cx="18" cy="52" r="5" fill="#2c2f45"/><circle cx="34" cy="52" r="5" fill="#2c2f45"/>
    <rect x="14" y="32" width="12" height="8" rx="2" fill="#5ef0ff" opacity=".85"/>`, ad + rd);
}

function lunar(): string {
  const [m, md] = rgrad([[0, '#e8e8f0'], [1, '#77788c']], 0.5, 0.2, 0.9);
  return svg(`
    <path d="M2 50 Q32 36 62 50 V62 H2z" fill="url(#${m})"/>
    <circle cx="14" cy="54" r="3" fill="#8b8ca0"/><circle cx="48" cy="56" r="2" fill="#8b8ca0"/>
    <path d="M18 46 a14 14 0 0 1 28 0z" fill="#dfe8ff" stroke="#8fa3d8" stroke-width="2"/>
    <rect x="22" y="38" width="20" height="3" fill="#5ef0ff" opacity=".7"/>
    <rect x="30" y="18" width="3" height="16" fill="#8fa3d8"/><path d="M31.5 18 l10 4 l-10 4z" fill="#ff6b8a"/>
    <circle cx="52" cy="14" r="6" fill="#4ea1ff"/><path d="M47 13 q3 -3 6 0 q2 2 4 1" stroke="#7dffa0" stroke-width="2" fill="none"/>`, md);
}

function station(): string {
  const [a, ad] = grad([[0, '#e6ecff'], [1, '#7c88b8']], 0, 0, 1, 1);
  return svg(`
    <circle cx="32" cy="32" r="22" fill="none" stroke="url(#${a})" stroke-width="7"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#5ef0ff" stroke-width="1.5" stroke-dasharray="3 6" opacity=".8"/>
    <path d="M32 10 V54 M10 32 H54" stroke="#9aa6d6" stroke-width="3"/>
    <circle cx="32" cy="32" r="8" fill="url(#${a})"/><circle cx="32" cy="32" r="3" fill="#ffcf5a"/>`, ad);
}

function siphon(): string {
  const [p, pd] = rgrad([[0, '#ffd8a0'], [0.5, '#e08a4a'], [1, '#7a3a2a']], 0.4, 0.4, 0.75);
  return svg(`
    <circle cx="26" cy="38" r="22" fill="url(#${p})"/>
    <path d="M6 32 q20 6 40 0 M5 42 q21 6 42 0" stroke="#a8502e" stroke-width="3" fill="none" opacity=".6"/>
    <path d="M40 22 L58 6" stroke="#cfd8ff" stroke-width="5" stroke-linecap="round"/>
    <path d="M40 22 L58 6" stroke="#5ef0ff" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 4"/>
    <rect x="52" y="2" width="10" height="8" rx="2" fill="#8fa3d8"/>`, pd);
}

function reactor(): string {
  const [c, cd] = rgrad([[0, '#ffffff'], [0.35, '#9ef7ff'], [1, '#2a68ff']], 0.5, 0.5, 0.5);
  return svg(`
    <rect x="10" y="10" width="44" height="44" rx="10" fill="#1b2350" stroke="#8fa3d8" stroke-width="3"/>
    <circle cx="32" cy="32" r="14" fill="url(#${c})"/>
    <ellipse cx="32" cy="32" rx="20" ry="7" fill="none" stroke="#ffcf5a" stroke-width="2" transform="rotate(30 32 32)"/>
    <ellipse cx="32" cy="32" rx="20" ry="7" fill="none" stroke="#ff6b8a" stroke-width="2" transform="rotate(-30 32 32)"/>`, cd);
}

function dyson(): string {
  const [s, sd] = rgrad([[0, '#fffbe0'], [0.5, '#ffcf5a'], [1, '#ff8a2a']], 0.5, 0.5, 0.5);
  let panels = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = 32 + Math.cos(a) * 25;
    const y = 32 + Math.sin(a) * 25;
    panels += `<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="7" height="4" rx="1" fill="#5ef0ff" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return svg(`<circle cx="32" cy="32" r="13" fill="url(#${s})"/>${panels}`, sd);
}

function warp(): string {
  const [v, vd] = rgrad([[0, '#ffffff'], [0.3, '#d38bff'], [1, '#2a0d5e']], 0.5, 0.5, 0.5);
  return svg(`
    <circle cx="32" cy="32" r="20" fill="url(#${v})"/>
    <path d="M32 12 a20 20 0 0 1 0 40 a12 12 0 0 1 0 -24 a6 6 0 0 0 0 12" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
    <circle cx="32" cy="32" r="25" fill="none" stroke="#8fa3d8" stroke-width="5"/>
    <circle cx="32" cy="7" r="3" fill="#ffcf5a"/><circle cx="57" cy="32" r="3" fill="#ffcf5a"/><circle cx="32" cy="57" r="3" fill="#ffcf5a"/><circle cx="7" cy="32" r="3" fill="#ffcf5a"/>`, vd);
}

function nebula(): string {
  const [n, nd] = rgrad([[0, '#ff9ad5'], [0.5, '#8a4dff'], [1, 'rgba(40,20,90,0)']], 0.5, 0.5, 0.5);
  return svg(`
    <circle cx="26" cy="26" r="22" fill="url(#${n})"/><circle cx="40" cy="36" r="18" fill="url(#${n})" opacity=".8"/>
    <path d="M24 44 h22 l-5 14 h-12z" fill="#8fa3d8"/><rect x="20" y="40" width="30" height="5" rx="2" fill="#cfd8ff"/>
    <circle cx="20" cy="18" r="1.5" fill="#fff"/><circle cx="44" cy="24" r="1.2" fill="#fff"/><circle cx="34" cy="14" r="1" fill="#fff"/>`, nd);
}

function forge(): string {
  const [s, sd] = rgrad([[0, '#fff'], [0.4, '#ffe27a'], [1, '#ff5a2a']], 0.5, 0.5, 0.5);
  return svg(`
    <path d="M8 50 h48 l-6 8 h-36z" fill="#59607f"/><path d="M14 44 h36 v6 h-36z" fill="#8fa3d8"/>
    <circle cx="32" cy="26" r="15" fill="url(#${s})"/>
    <path d="M32 4 v6 M32 42 v-4 M10 26 h6 M48 26 h6 M16 10 l4 4 M48 10 l-4 4" stroke="#ffcf5a" stroke-width="2.5" stroke-linecap="round"/>`, sd);
}

function quasar(): string {
  const [c, cd] = rgrad([[0, '#ffffff'], [0.4, '#9ef7ff'], [1, 'rgba(60,90,255,0)']], 0.5, 0.5, 0.5);
  return svg(`
    <path d="M30 0 h4 l2 32 l-2 32 h-4 l-2 -32z" fill="#bff6ff" opacity=".85"/>
    <ellipse cx="32" cy="32" rx="28" ry="9" fill="none" stroke="#ff9a3c" stroke-width="4" transform="rotate(-15 32 32)"/>
    <circle cx="32" cy="32" r="14" fill="url(#${c})"/>`, cd);
}

function wormhole(): string {
  let rings = '';
  for (let i = 0; i < 6; i++) {
    const rx = 28 - i * 4.4;
    const ry = 12 - i * 1.6;
    rings += `<ellipse cx="32" cy="${32 + i * 2}" rx="${rx}" ry="${ry}" fill="none" stroke="${['#5ef0ff', '#4ea1ff', '#8a4dff', '#d38bff', '#ff9ad5', '#fff'][i]}" stroke-width="2.5"/>`;
  }
  return svg(rings + '<circle cx="32" cy="43" r="3" fill="#000"/>');
}

function galaxy(): string {
  const [c, cd] = rgrad([[0, '#fff6d8'], [0.3, '#ffcf5a'], [1, 'rgba(255,120,60,0)']], 0.5, 0.5, 0.5);
  return svg(`
    <path d="M32 32 C 46 20, 58 34, 50 46 C 44 54, 30 52, 26 44" fill="none" stroke="#9ab6ff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <path d="M32 32 C 18 44, 6 30, 14 18 C 20 10, 34 12, 38 20" fill="none" stroke="#d38bff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <circle cx="32" cy="32" r="12" fill="url(#${c})"/>
    <circle cx="10" cy="50" r="1.5" fill="#fff"/><circle cx="54" cy="12" r="1.5" fill="#fff"/>`, cd);
}

function compiler(): string {
  const [a, ad] = grad([[0, '#2b1a5e'], [1, '#0b0f2a']]);
  return svg(`
    <rect x="6" y="8" width="52" height="40" rx="6" fill="url(#${a})" stroke="#8fa3d8" stroke-width="3"/>
    <circle cx="32" cy="28" r="12" fill="none" stroke="#5ef0ff" stroke-width="2"/>
    <circle cx="32" cy="28" r="4" fill="#ffcf5a"/><ellipse cx="32" cy="28" rx="16" ry="5" fill="none" stroke="#ff9ad5" stroke-width="1.5"/>
    <path d="M12 42 l4 -3 l-4 -3 M20 42 h8" stroke="#7dffa0" stroke-width="2" fill="none"/>
    <path d="M22 48 l-4 10 h28 l-4 -10z" fill="#59607f"/>`, ad);
}

function tapIcon(): string {
  const [a, ad] = grad([[0, '#ffe7b0'], [1, '#e0a050']]);
  return svg(`
    <circle cx="32" cy="18" r="12" fill="none" stroke="#5ef0ff" stroke-width="2" opacity=".7"/>
    <circle cx="32" cy="18" r="6" fill="none" stroke="#5ef0ff" stroke-width="2"/>
    <path d="M28 18 v24 l-6 -6 q-4 -2 -5 2 l10 16 h18 l4 -14 v-8 q0 -4 -4 -4 h-2 q0 -4 -4 -4 h-2 q0 -4 -4 -4 h-2 v-2 q0 -4 -4 -4z" fill="url(#${a})" stroke="#8a5a20" stroke-width="2" stroke-linejoin="round"/>`, ad);
}

function research(): string {
  return svg(`
    <rect x="26" y="36" width="12" height="20" fill="#59607f"/><path d="M16 58 h32" stroke="#8fa3d8" stroke-width="4" stroke-linecap="round"/>
    <rect x="10" y="14" width="40" height="14" rx="4" fill="#8fa3d8" transform="rotate(-25 30 21)"/>
    <circle cx="13" cy="30" r="6" fill="#5ef0ff" stroke="#cfd8ff" stroke-width="2"/>
    <circle cx="52" cy="8" r="2" fill="#fff"/><circle cx="58" cy="18" r="1.5" fill="#ffcf5a"/>`);
}

function synergy(): string {
  return svg(`
    <circle cx="22" cy="32" r="14" fill="none" stroke="#5ef0ff" stroke-width="5"/>
    <circle cx="42" cy="32" r="14" fill="none" stroke="#ff9ad5" stroke-width="5"/>
    <circle cx="32" cy="32" r="4" fill="#ffcf5a"/>`);
}

function comet(): string {
  const [t, td] = grad([[0, 'rgba(94,240,255,0)'], [1, '#bff6ff']], 0, 1, 1, 0);
  return svg(`
    <path d="M4 60 L40 18 L48 26 Z" fill="url(#${t})"/>
    <circle cx="46" cy="18" r="11" fill="#fff"/><circle cx="46" cy="18" r="8" fill="#bff6ff"/>`, td);
}

function blackComet(): string {
  const [t, td] = grad([[0, 'rgba(160,60,255,0)'], [1, '#c58bff']], 0, 1, 1, 0);
  return svg(`
    <path d="M4 60 L40 18 L48 26 Z" fill="url(#${t})"/>
    <circle cx="46" cy="18" r="12" fill="#c58bff"/><circle cx="46" cy="18" r="8" fill="#05030c"/>`, td);
}

function astronomer(): string {
  return svg(`
    <path d="M32 6 l6 14 l15 1 l-12 10 l4 15 l-13 -8 l-13 8 l4 -15 l-12 -10 l15 -1z" fill="#ffcf5a" stroke="#fff3c0" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="10" cy="54" r="2" fill="#5ef0ff"/><circle cx="22" cy="58" r="2" fill="#5ef0ff"/><circle cx="34" cy="52" r="2" fill="#5ef0ff"/>
    <path d="M10 54 L22 58 L34 52" stroke="#5ef0ff" stroke-width="1" opacity=".7"/>`);
}

function trophy(): string {
  const [a, ad] = grad([[0, '#fff3c0'], [1, '#e0a020']]);
  return svg(`
    <path d="M18 8 h28 v14 a14 14 0 0 1 -28 0z" fill="url(#${a})"/>
    <path d="M18 12 h-8 q0 14 10 16 M46 12 h8 q0 14 -10 16" fill="none" stroke="#e0a020" stroke-width="3"/>
    <rect x="28" y="34" width="8" height="10" fill="#e0a020"/><rect x="18" y="44" width="28" height="8" rx="2" fill="#b07818"/>
    <path d="M32 12 l2.5 5 l5.5 .5 l-4 3.5 l1.3 5.5 l-5.3 -3 l-5.3 3 l1.3 -5.5 l-4 -3.5 l5.5 -.5z" fill="#fff"/>`, ad);
}

function darkMatter(): string {
  const [c, cd] = rgrad([[0, '#e2c4ff'], [0.5, '#7a3dff'], [1, '#1a0640']], 0.4, 0.35, 0.7);
  return svg(`<circle cx="32" cy="32" r="22" fill="url(#${c})"/>
    <ellipse cx="32" cy="32" rx="29" ry="9" fill="none" stroke="#c58bff" stroke-width="2.5" transform="rotate(-20 32 32)"/>
    <circle cx="25" cy="25" r="4" fill="#fff" opacity=".6"/>`, cd);
}

function probe(): string {
  return svg(`
    <path d="M32 4 l8 18 v20 l-8 6 l-8 -6 v-20z" fill="#cfd8ff" stroke="#8fa3d8" stroke-width="2"/>
    <circle cx="32" cy="22" r="4" fill="#5ef0ff"/>
    <path d="M24 32 l-12 10 v6 l12 -6 M40 32 l12 10 v6 l-12 -6" fill="#8fa3d8"/>
    <path d="M28 50 l4 12 l4 -12z" fill="#ffcf5a"/><path d="M30 50 l2 7 l2 -7z" fill="#fff"/>`);
}

function gift(): string {
  return svg(`
    <rect x="10" y="26" width="44" height="30" rx="4" fill="#8a4dff"/><rect x="6" y="18" width="52" height="10" rx="3" fill="#a774ff"/>
    <rect x="28" y="18" width="8" height="38" fill="#ffcf5a"/>
    <path d="M32 18 q-14 -14 -18 -4 q2 6 18 4 q16 2 18 -4 q-4 -10 -18 4" fill="none" stroke="#ffcf5a" stroke-width="4"/>`);
}

function gear(): string {
  let teeth = '';
  for (let i = 0; i < 8; i++) teeth += `<rect x="28" y="4" width="8" height="12" rx="2" fill="currentColor" transform="rotate(${i * 45} 32 32)"/>`;
  return svg(`${teeth}<circle cx="32" cy="32" r="18" fill="currentColor"/><circle cx="32" cy="32" r="8" fill="var(--bg)"/>`);
}

function chart(): string {
  return svg(`<rect x="8" y="36" width="10" height="20" rx="2" fill="currentColor"/><rect x="27" y="22" width="10" height="34" rx="2" fill="currentColor"/>
    <rect x="46" y="8" width="10" height="48" rx="2" fill="currentColor"/>`);
}

function lock(): string {
  return svg(`<rect x="14" y="28" width="36" height="28" rx="5" fill="currentColor"/><path d="M22 28 v-8 a10 10 0 0 1 20 0 v8" fill="none" stroke="currentColor" stroke-width="6"/>`);
}

function relic(): string {
  return svg(`<path d="M32 4 l20 16 l-8 36 h-24 l-8 -36z" fill="#3fd0b0" stroke="#bfffee" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 4 l-8 52 M32 4 l8 52 M12 20 h40" stroke="#bfffee" stroke-width="1.5" opacity=".7"/>`);
}

function build(): string {
  return svg(`<path d="M8 56 V30 l12 -8 v8 l12 -8 v8 l12 -8 v34z" fill="currentColor"/><rect x="46" y="10" width="8" height="46" fill="currentColor"/>`);
}

function upgrade(): string {
  return svg(`<path d="M32 6 l22 24 h-13 v28 h-18 v-28 h-13z" fill="currentColor"/>`);
}

function cosmos(): string {
  return svg(`<circle cx="32" cy="32" r="12" fill="currentColor"/><ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="currentColor" stroke-width="4" transform="rotate(-25 32 32)"/>`);
}

const FACTORIES: Record<string, () => string> = {
  drone, harvester, lunar, station, siphon, reactor, dyson, warp, nebula, forge, quasar, wormhole, galaxy, compiler,
  tap: tapIcon, research, synergy, comet, blackComet, astronomer, trophy, darkMatter, probe, gift, gear, chart, lock, relic,
  build, upgrade, cosmos,
};

let installed = false;

/** Adds the icon sprite to the page once. */
export function installIcons(): void {
  if (installed) return;
  installed = true;
  let defs = '';
  let symbols = '';
  for (const [name, make] of Object.entries(FACTORIES)) {
    const [d, body] = make().split(SEP);
    defs += d;
    symbols += `<symbol id="ico-${name}" viewBox="0 0 64 64">${body}</symbol>`;
  }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>${defs}</defs>${symbols}</svg>`;
  document.body.prepend(holder);
}

export function icon(name: string): string {
  const id = name in FACTORIES ? name : 'research';
  return `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><use href="#ico-${id}"/></svg>`;
}
