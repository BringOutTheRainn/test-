// The underwater scene on a canvas: water, light, seabed, the clam, the living reef and visitors.

interface Floater { x: number; y: number; text: string; born: number; color: string; size: number; }
interface Bubble { x: number; y: number; r: number; vy: number; wob: number; }
interface Mote { x: number; y: number; r: number; vy: number; glow: boolean; }

const ZONE_COLORS = [
  { top: [79, 195, 232], bottom: [14, 111, 158], sand: [232, 210, 154], rock: [150, 132, 110] },
  { top: [30, 111, 168], bottom: [8, 44, 88], sand: [138, 122, 100], rock: [86, 80, 92] },
  { top: [10, 34, 70], bottom: [4, 10, 30], sand: [58, 53, 70], rock: [40, 38, 56] },
  { top: [6, 18, 38], bottom: [2, 4, 12], sand: [38, 35, 48], rock: [28, 26, 38] },
  { top: [4, 7, 19], bottom: [0, 0, 2], sand: [23, 21, 29], rock: [18, 16, 26] },
];

function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function mixArr(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i] - v) * t);
}

class Scene {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;
  floaters: Floater[] = [];
  bubbles: Bubble[] = [];
  motes: Mote[] = [];
  squash = 0;
  depthShown = 0;
  t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.resize();
    for (let i = 0; i < 40; i++) this.motes.push(this.newMote(true));
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  newMote(anywhere: boolean): Mote {
    return { x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : -5, r: 0.6 + Math.random() * 1.6, vy: 4 + Math.random() * 10, glow: Math.random() < 0.3 };
  }

  get clamX() { return this.w / 2; }
  get clamY() { return this.h * 0.7; }
  get clamR() { return Math.min(this.w * 0.24, this.h * 0.22); }
  get sandY() { return this.h * 0.8; }

  tapAt(x: number, y: number, text: string, color = '#ffffff') {
    this.squash = 1;
    this.floaters.push({ x: x + (Math.random() - 0.5) * 50, y: y - 10 - Math.random() * 20, text, born: this.t, color, size: 20 });
    for (let i = 0; i < 4; i++) {
      this.bubbles.push({ x: this.clamX + (Math.random() - 0.5) * this.clamR, y: this.clamY - this.clamR * 0.2, r: 2 + Math.random() * 5, vy: 40 + Math.random() * 60, wob: Math.random() * 6 });
    }
    if (this.bubbles.length > 120) this.bubbles.splice(0, this.bubbles.length - 120);
    if (this.floaters.length > 40) this.floaters.splice(0, this.floaters.length - 40);
  }

  announce(text: string, color: string) {
    this.floaters.push({ x: this.w / 2, y: this.h * 0.35, text, born: this.t, color, size: 26 });
  }

  visitorPos(v: Visitor, now: number): { x: number; y: number } {
    const p = Math.min(1, Math.max(0, (now - v.spawnedAt) / (v.until - v.spawnedAt)));
    const span = this.w + (v.kind === 'whale' ? 360 : 100);
    const off = v.kind === 'whale' ? 180 : 50;
    const x = v.dir > 0 ? -off + p * span : this.w + off - p * span;
    const y = v.y * this.h + Math.sin(now / 400) * (v.kind === 'whale' ? 6 : 12);
    return { x, y };
  }

  hitVisitor(s: State, x: number, y: number, now: number): boolean {
    const v = s.visitor;
    if (!v || v.until <= now) return false;
    const p = this.visitorPos(v, now);
    if (v.kind === 'whale') return Math.abs(x - p.x) < 110 && Math.abs(y - p.y) < 50;
    return Math.hypot(x - p.x, y - p.y) < 42;
  }

  draw(s: State, now: number, dt: number) {
    this.t += dt;
    const g = this.g;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.depthShown += (s.zone - this.depthShown) * Math.min(1, dt * 1.5);
    const z0 = Math.floor(this.depthShown);
    const z1 = Math.min(ZONE_COLORS.length - 1, z0 + 1);
    const zt = this.depthShown - z0;
    const A = ZONE_COLORS[z0], B = ZONE_COLORS[z1];

    // Water.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, mix(A.top, B.top, zt));
    grad.addColorStop(1, mix(A.bottom, B.bottom, zt));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // Light rays fade with depth.
    const rayA = Math.max(0, 0.16 - this.depthShown * 0.08);
    if (rayA > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = w * (0.1 + i * 0.2) + Math.sin(this.t * 0.3 + i) * 20;
        const rg = g.createLinearGradient(0, 0, 0, h * 0.8);
        rg.addColorStop(0, `rgba(255,255,255,${rayA})`);
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.moveTo(x - 10, 0); g.lineTo(x + 18, 0); g.lineTo(x + 70, h * 0.8); g.lineTo(x - 30, h * 0.8);
        g.fill();
      }
      g.restore();
    }

    this.drawBackdrop(s);

    // Drifting motes (marine snow; glowing plankton in the deep).
    const glowAmt = Math.min(1, this.depthShown / 2);
    this.motes.forEach((m, i) => {
      m.y += m.vy * dt; m.x += Math.sin(this.t + i) * 4 * dt;
      if (m.y > h) this.motes[i] = this.newMote(false);
      if (m.glow && glowAmt > 0.2) {
        g.fillStyle = `rgba(120,255,240,${0.5 * glowAmt})`;
        g.beginPath(); g.arc(m.x, m.y, m.r * 1.6, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(m.x, m.y, m.r, m.r);
      }
    });

    this.drawSeabed(A, B, zt);
    this.drawReef(s);
    this.drawClam(s);
    this.drawVisitor(s, now);

    // Bubbles.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.2;
    this.bubbles = this.bubbles.filter((b) => b.y > -10);
    this.bubbles.forEach((b) => {
      b.y -= b.vy * dt; b.x += Math.sin(this.t * 4 + b.wob) * 10 * dt;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke();
    });

    // Floating numbers.
    this.floaters = this.floaters.filter((f) => this.t - f.born < 1.3);
    g.textAlign = 'center';
    this.floaters.forEach((f) => {
      const age = this.t - f.born;
      g.globalAlpha = Math.max(0, 1 - age / 1.3);
      g.font = `800 ${f.size}px system-ui, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,20,40,0.55)';
      g.strokeText(f.text, f.x, f.y - age * 60);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y - age * 60);
    });
    g.globalAlpha = 1;
    this.squash = Math.max(0, this.squash - dt * 6);
  }

  drawBackdrop(s: State) {
    const g = this.g, { w, h } = this, t = this.t;
    // Far silhouettes for deep generators.
    if (s.owned[12] > 0) { // Abyssal Cathedral
      g.fillStyle = 'rgba(90,70,160,0.35)';
      [[0.12, 0.35], [0.2, 0.25], [0.28, 0.4]].forEach(([x, top]) => {
        g.beginPath(); g.moveTo(w * x - 14, this.sandY); g.lineTo(w * x - 14, h * (top + 0.08)); g.lineTo(w * x, h * top); g.lineTo(w * x + 14, h * (top + 0.08)); g.lineTo(w * x + 14, this.sandY); g.fill();
      });
      g.fillStyle = 'rgba(170,240,255,0.6)';
      g.beginPath(); g.arc(w * 0.2, h * 0.33, 3, 0, Math.PI * 2); g.fill();
    }
    if (s.owned[10] > 0) { // Leviathan passing far away
      const x = ((t * 12) % (w + 300)) - 150;
      g.fillStyle = 'rgba(30,90,100,0.35)';
      g.beginPath(); g.ellipse(x, h * 0.2, 90, 16, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x - 85, h * 0.2); g.lineTo(x - 120, h * 0.2 - 18); g.lineTo(x - 115, h * 0.2 + 16); g.fill();
    }
    if (s.owned[7] > 0) { // Giant squid lurking
      const x = w * 0.85, y = h * 0.28 + Math.sin(t * 0.5) * 8;
      g.fillStyle = 'rgba(160,40,40,0.3)';
      g.beginPath(); g.ellipse(x, y, 12, 26, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(160,40,40,0.3)'; g.lineWidth = 3;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 4, y + 22); g.quadraticCurveTo(x + k * 8 + Math.sin(t + k) * 8, y + 45, x + k * 6, y + 65); g.stroke(); }
    }
  }

  drawSeabed(A: typeof ZONE_COLORS[0], B: typeof ZONE_COLORS[0], zt: number) {
    const g = this.g, { w, h } = this;
    const sand = mixArr(A.sand, B.sand, zt), rock = mixArr(A.rock, B.rock, zt);
    g.fillStyle = mix(rock, rock, 0);
    g.beginPath(); g.ellipse(w * 0.1, this.sandY + 4, w * 0.16, 26, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.ellipse(w * 0.92, this.sandY + 6, w * 0.14, 34, 0, Math.PI, 0); g.fill();
    g.fillStyle = mix(sand, sand, 0);
    g.beginPath();
    g.moveTo(0, this.sandY + 8);
    g.quadraticCurveTo(w * 0.25, this.sandY - 8, w * 0.5, this.sandY);
    g.quadraticCurveTo(w * 0.75, this.sandY + 8, w, this.sandY - 4);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse((i * 97) % w, this.sandY + 14 + (i * 37) % (h - this.sandY - 10), 6, 2, 0, 0, Math.PI * 2); g.fill(); }
  }

  drawReef(s: State) {
    const g = this.g, { w, h } = this, t = this.t;
    const deep = Math.min(1, this.depthShown / 2);

    // Kelp.
    const kelp = s.owned[2] > 0 ? Math.min(8, Math.ceil(s.owned[2] / 4)) : 0;
    const kx = [0.06, 0.94, 0.16, 0.84, 0.03, 0.97, 0.24, 0.76];
    for (let i = 0; i < kelp; i++) {
      const x = w * kx[i], base = this.sandY + 4, len = h * (0.35 + (i % 3) * 0.08);
      g.strokeStyle = i % 2 ? '#3fae6a' : '#2f8f56';
      g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, base);
      for (let k = 1; k <= 6; k++) {
        const yy = base - (len * k) / 6;
        g.lineTo(x + Math.sin(t * 1.2 + k * 0.7 + i) * k * 2.5, yy);
      }
      g.stroke();
      g.fillStyle = i % 2 ? '#55c97f' : '#3fae6a';
      for (let k = 2; k <= 6; k += 2) {
        const yy = base - (len * k) / 6, xx = x + Math.sin(t * 1.2 + k * 0.7 + i) * k * 2.5;
        g.beginPath(); g.ellipse(xx + (k % 4 ? 7 : -7), yy, 8, 3.5, k % 4 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill();
      }
    }

    // Glowing deep-sea plankton for later generators.
    if (s.owned[8] > 0) { // Hydrothermal vent
      const x = w * 0.9, y = this.sandY - 20;
      g.fillStyle = '#4a3c36';
      g.beginPath(); g.moveTo(x - 18, this.sandY + 4); g.lineTo(x - 7, y); g.lineTo(x + 7, y); g.lineTo(x + 18, this.sandY + 4); g.fill();
      for (let k = 0; k < 6; k++) {
        const p = ((t * 0.4 + k / 6) % 1);
        g.fillStyle = `rgba(180,160,150,${0.35 * (1 - p)})`;
        g.beginPath(); g.arc(x + Math.sin(p * 6 + k) * 8, y - p * h * 0.4, 6 + p * 18, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,140,60,0.8)';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    if (s.owned[9] > 0) { // Sunken galleon
      const x = w * 0.13, y = this.sandY + 2;
      g.fillStyle = '#4a3020';
      g.beginPath(); g.moveTo(x - 48, y - 18); g.lineTo(x + 40, y - 26); g.lineTo(x + 30, y + 4); g.lineTo(x - 40, y + 6); g.fill();
      g.strokeStyle = '#3a2416'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 5, y - 22); g.lineTo(x + 6, y - 70); g.stroke();
      g.fillStyle = 'rgba(255,215,110,0.9)';
      g.beginPath(); g.arc(x + 22, y - 10, 3, 0, Math.PI * 2); g.fill();
    }
    if (s.owned[11] > 0) { // Trench forge glow
      const gl = g.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, w * 0.6);
      gl.addColorStop(0, `rgba(255,110,40,${0.25 + 0.05 * Math.sin(t * 2)})`);
      gl.addColorStop(1, 'rgba(255,110,40,0)');
      g.fillStyle = gl; g.fillRect(0, this.sandY - 40, w, h);
    }

    // Crabs walking on the sand.
    const crabs = s.owned[0] > 0 ? Math.min(6, Math.ceil(s.owned[0] / 5)) : 0;
    for (let i = 0; i < crabs; i++) {
      const side = i % 2 ? 1 : -1;
      const x = this.clamX + side * (this.clamR * 1.35 + 18 + (i >> 1) * 34) + Math.sin(t * 0.8 + i * 2) * 10;
      const y = this.sandY + 14 + (i >> 1) * 6;
      this.drawCrab(x, y, Math.sin(t * 6 + i) * 1.5);
    }

    // Seahorses bobbing.
    const horses = s.owned[1] > 0 ? Math.min(4, Math.ceil(s.owned[1] / 8)) : 0;
    const hx = [0.18, 0.82, 0.3, 0.7];
    for (let i = 0; i < horses; i++) this.drawSeahorse(w * hx[i], h * (0.42 + (i % 2) * 0.1) + Math.sin(t * 1.5 + i) * 6, i % 2 ? -1 : 1);

    // Lanternfish school.
    const lf = Math.min(16, s.owned[3]);
    for (let i = 0; i < lf; i++) {
      const cx = w * 0.5 + Math.sin(t * 0.35) * w * 0.3, cy = h * 0.22 + Math.sin(t * 0.5) * h * 0.05;
      const x = cx + Math.sin(i * 2.4 + t * 1.3) * 34, y = cy + Math.cos(i * 1.7 + t * 1.1) * 16;
      g.fillStyle = `rgba(110,240,255,${0.5 + 0.4 * deep})`;
      g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(80,130,210,0.9)';
      g.beginPath(); g.ellipse(x - Math.cos(t * 0.35) * 4, y, 4, 2, 0, 0, Math.PI * 2); g.fill();
    }

    // Octopus on the rocks.
    if (s.owned[4] > 0) this.drawOctopus(w * 0.9, this.sandY - 30 + Math.sin(t) * 2);
    if (s.owned[4] >= 25) this.drawOctopus(w * 0.1, this.sandY - 22 + Math.sin(t + 1) * 2);

    // Jellyfish drifting.
    const jellies = s.owned[5] > 0 ? Math.min(5, Math.ceil(s.owned[5] / 6)) : 0;
    const jx = [0.25, 0.75, 0.12, 0.88, 0.5];
    for (let i = 0; i < jellies; i++) this.drawJelly(w * jx[i] + Math.sin(t * 0.4 + i) * 10, h * (0.18 + (i % 3) * 0.12) + Math.sin(t * 0.9 + i * 1.3) * 14, t + i);

    // Adopted rare creatures glide around the reef with a soft glow.
    RARES.forEach((r, i) => {
      if (!s.rares[r.id]) return;
      const x = w * 0.5 + Math.sin(t * (0.18 + i * 0.03) + i * 1.7) * w * 0.42;
      const y = h * (0.15 + i * 0.07) + Math.sin(t * 0.7 + i) * 8;
      const dir = Math.cos(t * (0.18 + i * 0.03) + i * 1.7) > 0 ? 1 : -1;
      g.save(); g.translate(x, y); g.scale(dir, 1);
      g.shadowColor = r.color; g.shadowBlur = 16;
      g.fillStyle = r.color;
      g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(-20, -6); g.lineTo(-20, 6); g.fill();
      g.restore();
    });

    // Anglerfish prowling.
    if (s.owned[6] > 0) {
      const x = w * 0.5 + Math.sin(t * 0.25) * w * 0.38, y = h * 0.5 + Math.sin(t * 0.6) * 10;
      this.drawAngler(x, y, Math.cos(t * 0.25) > 0 ? 1 : -1);
    }
  }

  drawCrab(x: number, y: number, leg: number) {
    const g = this.g;
    g.fillStyle = '#e7b46a';
    g.beginPath(); g.arc(x + 4, y - 7, 8, Math.PI, 0); g.fill();
    g.fillStyle = '#ff6b4a';
    g.beginPath(); g.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ff6b4a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 6, y + 3); g.lineTo(x - 10, y + 7 + leg); g.moveTo(x + 6, y + 3); g.lineTo(x + 10, y + 7 - leg); g.stroke();
    g.beginPath(); g.arc(x - 10, y - 2, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222';
    g.fillRect(x - 4, y - 6, 2, 2); g.fillRect(x, y - 6, 2, 2);
  }

  drawSeahorse(x: number, y: number, dir: number) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(dir, 1);
    g.strokeStyle = '#ffb547'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(8, -4, 2, 6); g.quadraticCurveTo(-4, 14, 4, 18); g.stroke();
    g.fillStyle = '#ffb547';
    g.beginPath(); g.ellipse(2, -16, 5, 4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(5, -17); g.lineTo(13, -15); g.lineTo(5, -13); g.fill();
    g.fillStyle = '#222'; g.fillRect(2, -18, 2, 2);
    g.restore();
  }

  drawOctopus(x: number, y: number) {
    const g = this.g, t = this.t;
    g.fillStyle = '#c95bd6';
    g.beginPath(); g.ellipse(x, y, 13, 12, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c95bd6'; g.lineWidth = 3.5; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const a = -0.9 + k * 0.45;
      g.beginPath(); g.moveTo(x + Math.sin(a) * 8, y + 8);
      g.quadraticCurveTo(x + Math.sin(a) * 20 + Math.sin(t * 2 + k) * 4, y + 18, x + Math.sin(a) * 24, y + 26);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x - 4, y - 1, 3, 0, Math.PI * 2); g.arc(x + 4, y - 1, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222';
    g.fillRect(x - 4, y - 1, 1.6, 1.6); g.fillRect(x + 4, y - 1, 1.6, 1.6);
  }

  drawJelly(x: number, y: number, t: number) {
    const g = this.g;
    const pulse = 1 + Math.sin(t * 2.5) * 0.08;
    g.save();
    g.shadowColor = 'rgba(255,143,216,0.9)'; g.shadowBlur = 14;
    g.fillStyle = 'rgba(255,143,216,0.75)';
    g.beginPath(); g.ellipse(x, y, 14 * pulse, 11 / pulse, 0, Math.PI, 0); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,194,236,0.7)'; g.lineWidth = 1.6;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(x + k * 5, y);
      g.quadraticCurveTo(x + k * 5 + Math.sin(t * 3 + k) * 5, y + 14, x + k * 4, y + 26); g.stroke();
    }
  }

  drawAngler(x: number, y: number, dir: number) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(dir, 1);
    g.fillStyle = '#3b3456';
    g.beginPath(); g.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-20, 0); g.lineTo(-32, -10); g.lineTo(-32, 10); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(12, 5); g.lineTo(15, 9); g.lineTo(18, 4); g.lineTo(21, 8); g.stroke();
    g.strokeStyle = '#5c5480'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(8, -13); g.quadraticCurveTo(18, -32, 28, -22); g.stroke();
    g.shadowColor = '#fff6a1'; g.shadowBlur = 18;
    g.fillStyle = '#fff6a1';
    g.beginPath(); g.arc(28, -20, 4.5, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#ffe14a';
    g.beginPath(); g.arc(10, -4, 2.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  pearlColors(s: State): [string, string] {
    const m = s.moonstones;
    if (m >= 200) return [`hsl(${(this.t * 60) % 360},90%,85%)`, `hsl(${(this.t * 60 + 120) % 360},70%,55%)`];
    if (m >= 50) return ['#b9d4ff', '#2a3d66'];
    if (m >= 10) return ['#fff2b8', '#d9a520'];
    if (m >= 1) return ['#ffe3ef', '#e28ab0'];
    return ['#ffffff', '#b9a6d8'];
  }

  drawClam(s: State) {
    const g = this.g;
    const x = this.clamX, y = this.clamY, r = this.clamR;
    const sq = this.squash;
    g.save();
    g.translate(x, y);
    g.scale(1 + sq * 0.06, 1 - sq * 0.08);

    // Shadow.
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(0, r * 0.45, r * 1.1, r * 0.18, 0, 0, Math.PI * 2); g.fill();

    // Upper shell (open, behind the pearl).
    const open = 0.55 - sq * 0.25;
    g.save();
    g.translate(0, r * 0.05);
    g.rotate(0);
    g.scale(1, -open);
    this.shellPath(r);
    g.fillStyle = '#9a6fc4'; g.fill();
    g.restore();
    g.save(); g.translate(0, r * 0.05); g.scale(1, -open * 0.85); this.shellPath(r * 0.9); g.fillStyle = '#f2dcff'; g.fill(); g.restore();

    // Pearl.
    const [c1, c2] = this.pearlColors(s);
    const pr = r * 0.32;
    g.save();
    g.shadowColor = c1; g.shadowBlur = 24 + Math.sin(this.t * 2) * 6;
    const pg = g.createRadialGradient(-pr * 0.35, -pr * 0.45 - r * 0.05, pr * 0.1, 0, -r * 0.05, pr);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.45, c1); pg.addColorStop(1, c2);
    g.fillStyle = pg;
    g.beginPath(); g.arc(0, -r * 0.05, pr, 0, Math.PI * 2); g.fill();
    g.restore();

    // Lower shell.
    this.shellPath(r);
    const lg = g.createLinearGradient(0, 0, 0, r * 0.5);
    lg.addColorStop(0, '#c592ef'); lg.addColorStop(1, '#7a4fa8');
    g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(80,40,120,0.5)'; g.lineWidth = 2;
    for (let k = -3; k <= 3; k++) {
      g.beginPath(); g.moveTo(k * r * 0.08, r * 0.42); g.lineTo(k * r * 0.26, r * 0.04); g.stroke();
    }
    g.restore();
  }

  // A scalloped half shell from the hinge (bottom) up to the rim at y = 0.
  shellPath(r: number) {
    const g = this.g;
    g.beginPath();
    g.moveTo(-r, 0);
    const bumps = 7;
    for (let k = 0; k < bumps; k++) {
      const x0 = -r + (2 * r * k) / bumps, x1 = -r + (2 * r * (k + 1)) / bumps;
      g.quadraticCurveTo((x0 + x1) / 2, -r * 0.08, x1, 0);
    }
    g.quadraticCurveTo(r * 0.9, r * 0.45, 0, r * 0.45);
    g.quadraticCurveTo(-r * 0.9, r * 0.45, -r, 0);
    g.closePath();
  }

  drawVisitor(s: State, now: number) {
    const v = s.visitor;
    if (!v || v.until <= now) return;
    const g = this.g;
    const { x, y } = this.visitorPos(v, now);
    const fade = Math.min(1, (v.until - now) / 1500);
    g.save();
    g.globalAlpha = fade;
    g.translate(x, y);
    g.scale(v.dir, 1);
    if (v.kind === 'whale') {
      g.fillStyle = '#4d6b8a';
      g.beginPath(); g.ellipse(0, 0, 110, 32, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-90, -14); g.quadraticCurveTo(-130, -6, -140, -4); g.lineTo(-140, 4); g.quadraticCurveTo(-130, 8, -90, 18); g.fill();
      g.beginPath(); g.ellipse(-146, 0, 8, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9fb8cf';
      g.beginPath(); g.ellipse(14, 16, 80, 14, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#4d6b8a';
      g.beginPath(); g.ellipse(-10, 26, 26, 8, 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#10202e';
      g.beginPath(); g.arc(72, -2, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(90 + k * 14, -30 - k * 10, 6 + k * 4, -1.2, 1.2); g.stroke(); }
    } else {
      const wig = Math.sin(now / 90) * 0.15;
      g.rotate(wig * 0.3);
      g.shadowColor = '#ffd84a'; g.shadowBlur = 22;
      const fg = g.createLinearGradient(0, -14, 0, 14);
      fg.addColorStop(0, '#fff3a0'); fg.addColorStop(1, '#ffb000');
      g.fillStyle = fg;
      g.beginPath(); g.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-20, 0); g.lineTo(-38, -14 + wig * 20); g.lineTo(-38, 14 + wig * 20); g.fill();
      g.beginPath(); g.moveTo(-2, -12); g.lineTo(8, -22); g.lineTo(12, -10); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#222';
      g.beginPath(); g.arc(13, -3, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      const sp = (now / 300) % 1;
      g.globalAlpha = fade * (1 - sp);
      g.beginPath(); g.arc(-6 + sp * 10, -18 - sp * 10, 2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}
