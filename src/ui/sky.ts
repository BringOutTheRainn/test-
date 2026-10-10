// The canvas in the middle of the screen: starfield, the celestial body you
// tap, orbiting drones, comets, particles and floating numbers.

export const STAGES = [
  { name: 'Asteroid', at: 0 },
  { name: 'Moon', at: 1e5 },
  { name: 'Rocky Planet', at: 1e8 },
  { name: 'Gas Giant', at: 1e11 },
  { name: 'Star', at: 1e14 },
  { name: 'Pulsar', at: 1e18 },
  { name: 'Black Hole', at: 1e22 },
];

export function stageFor(earned: number): number {
  let st = 0;
  STAGES.forEach((s, i) => {
    if (earned >= s.at) st = i;
  });
  return st;
}

interface Star { x: number; y: number; r: number; tw: number; layer: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; color: string; size: number }
interface Comet { x: number; y: number; vx: number; vy: number; age: number; stay: number; black: boolean; trail: Array<[number, number]>; dead: boolean }

export interface SkyHooks {
  /** A tap on the body. Returns the label to float up, or null. */
  onTap: (x: number, y: number) => string | null;
  onComet: (black: boolean, x: number, y: number) => void;
  onCometMissed: () => void;
}

const TAU = Math.PI * 2;

export class Sky {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private nebula: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private comet: Comet | null = null;
  private t = 0;
  private squash = 0;
  private stage = 0;
  private stageFlash = 0;
  private drones = 0;
  private rockShape: number[] = [];
  private craters: Array<[number, number, number]> = [];
  particlesOn = true;
  aura: 'none' | 'rush' | 'horizon' | 'well' | 'supernova' = 'none';

  constructor(private canvas: HTMLCanvasElement, private hooks: SkyHooks) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 20; i++) this.rockShape.push(0.82 + Math.random() * 0.22);
    for (let i = 0; i < 9; i++) this.craters.push([Math.random() * TAU, Math.random() * 0.75, 0.08 + Math.random() * 0.13]);
    canvas.addEventListener('pointerdown', (e) => this.pointer(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  get center(): [number, number] {
    return [this.w / 2, this.h * 0.5];
  }

  get radius(): number {
    return Math.min(this.w, this.h) * 0.27;
  }

  get hasComet(): boolean {
    return !!this.comet && !this.comet.dead;
  }

  setStage(stage: number): void {
    if (stage !== this.stage) {
      this.stage = stage;
      this.stageFlash = 1;
    }
  }

  setDrones(n: number): void {
    this.drones = n;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const count = Math.round((this.w * this.h) / 2200);
    this.stars = [];
    for (let i = 0; i < count; i++) {
      const layer = i % 3;
      this.stars.push({ x: Math.random() * this.w, y: Math.random() * this.h, r: 0.4 + layer * 0.45 + Math.random() * 0.4, tw: Math.random() * TAU, layer });
    }
    this.buildNebula();
  }

  private buildNebula(): void {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w / 2));
    c.height = Math.max(1, Math.round(this.h / 2));
    const g = c.getContext('2d')!;
    const blobs: Array<[number, number, number, string]> = [
      [0.2, 0.25, 0.6, 'rgba(110,60,220,0.35)'],
      [0.85, 0.7, 0.55, 'rgba(40,120,255,0.28)'],
      [0.6, 0.1, 0.4, 'rgba(255,80,180,0.18)'],
      [0.1, 0.9, 0.45, 'rgba(40,200,220,0.16)'],
    ];
    for (const [x, y, r, col] of blobs) {
      const rad = r * Math.max(c.width, c.height);
      const gr = g.createRadialGradient(x * c.width, y * c.height, 0, x * c.width, y * c.height, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.nebula = c;
  }

  private pointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = this.comet;
    if (c && !c.dead) {
      const hit = Math.max(44, this.radius * 0.35);
      if (Math.hypot(x - c.x, y - c.y) < hit) {
        c.dead = true;
        this.burst(c.x, c.y, c.black ? '#c58bff' : '#bff6ff', 40, 260);
        this.hooks.onComet(c.black, c.x, c.y);
        return;
      }
    }
    const [cx, cy] = this.center;
    if (Math.hypot(x - cx, y - cy) <= this.radius * 1.35) {
      e.preventDefault();
      this.tapAt(x, y);
    }
  }

  /** A tap at a point (also used by the auto-tapping probes). */
  tapAt(x: number, y: number): void {
    const label = this.hooks.onTap(x, y);
    if (label === null) return;
    this.squash = 1;
    this.floaters.push({ x: x + (Math.random() - 0.5) * 20, y: y - 10, text: label, life: 1.1, color: '#ffffff', size: 22 });
    if (this.particlesOn) this.burst(x, y, '#ffe9a8', 7, 140);
  }

  autoTap(): void {
    const [cx, cy] = this.center;
    const a = Math.random() * TAU;
    const r = this.radius * Math.sqrt(Math.random()) * 0.8;
    this.tapAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }

  burst(x: number, y: number, color: string, n: number, speed: number): void {
    if (!this.particlesOn && n < 20) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.5 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 1.5 + Math.random() * 2.5 });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  floatText(x: number, y: number, text: string, color = '#ffcf5a', size = 24): void {
    this.floaters.push({ x, y, text, life: 2.2, color, size });
  }

  floatCenter(text: string, color = '#ffcf5a', size = 26): void {
    const [cx, cy] = this.center;
    this.floatText(cx, cy + (this.floaters.length % 2) * 30, text, color, size);
  }

  spawnComet(stay: number, black: boolean): void {
    const fromLeft = Math.random() < 0.5;
    const y0 = this.h * (0.1 + Math.random() * 0.25);
    const y1 = this.h * (0.55 + Math.random() * 0.35);
    const x0 = fromLeft ? -30 : this.w + 30;
    const x1 = fromLeft ? this.w + 30 : -30;
    this.comet = { x: x0, y: y0, vx: (x1 - x0) / stay, vy: (y1 - y0) / stay, age: 0, stay, black, trail: [], dead: false };
  }

  /** Where the comet is, for tests and hints. */
  cometPosition(): [number, number] | null {
    return this.comet && !this.comet.dead ? [this.comet.x, this.comet.y] : null;
  }

  frame(dt: number): void {
    this.t += dt;
    this.squash = Math.max(0, this.squash - dt * 6);
    this.stageFlash = Math.max(0, this.stageFlash - dt * 0.8);
    this.updateEntities(dt);
    this.draw();
  }

  private updateEntities(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= dt * 60;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    if (this.floaters.length > 40) this.floaters.splice(0, this.floaters.length - 40);
    const c = this.comet;
    if (c) {
      if (!c.dead) {
        c.age += dt;
        // Slow wobble so it is easier to catch near the middle.
        const slow = 0.6 + 0.4 * Math.abs(c.age / c.stay - 0.5) * 2;
        c.x += c.vx * dt * slow * 1.15;
        c.y += c.vy * dt * slow * 1.15 + Math.sin(c.age * 2) * 0.3;
        c.trail.unshift([c.x, c.y]);
        if (c.trail.length > 28) c.trail.pop();
        if (c.age >= c.stay || c.x < -60 || c.x > this.w + 60) {
          c.dead = true;
          this.hooks.onCometMissed();
        }
      }
      if (c.dead) {
        c.trail.pop();
        if (!c.trail.length) this.comet = null;
      }
    }
  }

  private draw(): void {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#04050d';
    g.fillRect(0, 0, this.w, this.h);
    if (this.nebula) {
      g.globalAlpha = 0.9;
      g.drawImage(this.nebula, 0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }
    for (const s of this.stars) {
      const speed = [2, 5, 10][s.layer];
      s.x -= speed * 0.016;
      if (s.x < 0) s.x += this.w;
      const a = 0.45 + 0.55 * Math.abs(Math.sin(this.t * (0.6 + s.layer * 0.4) + s.tw));
      g.globalAlpha = a;
      g.fillStyle = s.layer === 2 ? '#dfe8ff' : '#9fb0e0';
      g.fillRect(s.x, s.y, s.r, s.r);
    }
    g.globalAlpha = 1;

    const [cx, cy] = this.center;
    const r = this.radius;
    this.drawAura(cx, cy, r);
    const sq = Math.sin(this.squash * Math.PI) * 0.05;
    g.save();
    g.translate(cx, cy);
    g.scale(1 + sq, 1 - sq);
    this.drawBody(r);
    g.restore();
    this.drawDrones(cx, cy, r);

    if (this.stageFlash > 0) {
      g.globalAlpha = this.stageFlash * 0.7;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, this.w, this.h);
      g.globalAlpha = 1;
    }

    this.drawComet();

    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.floaters) {
      g.globalAlpha = Math.min(1, f.life * 1.5);
      g.font = `800 ${f.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }

  private drawAura(cx: number, cy: number, r: number): void {
    const g = this.ctx;
    const colors: Record<string, string> = { rush: '255,207,90', horizon: '197,139,255', supernova: '255,255,255', well: '40,0,60' };
    const base = ['200,200,220', '200,210,255', '90,170,255', '255,170,90', '255,220,120', '140,220,255', '255,140,60'][this.stage];
    const col = this.aura !== 'none' ? colors[this.aura] : base;
    const pulse = this.aura !== 'none' ? 0.25 + 0.15 * Math.sin(this.t * 6) : 0.12;
    const big = this.stage >= 4 ? 2.4 : 1.8;
    const gr = g.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * big);
    gr.addColorStop(0, `rgba(${col},${pulse + (this.stage >= 4 ? 0.25 : 0)})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, r * big, 0, TAU);
    g.fill();
  }

  private shade(r: number): void {
    const g = this.ctx;
    const gr = g.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    gr.addColorStop(0, 'rgba(255,255,255,0.18)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,10,0.6)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  }

  private craterField(r: number, color: string, spin: number): void {
    const g = this.ctx;
    for (const [lon, lat, size] of this.craters) {
      const a = lon + spin;
      const x = Math.cos(a) * lat * r;
      const y = Math.sin(a) * lat * r * 0.9;
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, size * r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x - 1, y - 1, size * r, Math.PI * 0.9, Math.PI * 1.7);
      g.stroke();
    }
  }

  private drawBody(r: number): void {
    const g = this.ctx;
    const t = this.t;
    switch (this.stage) {
      case 0: {
        g.rotate(t * 0.08);
        g.beginPath();
        this.rockShape.forEach((k, i) => {
          const a = (i / this.rockShape.length) * TAU;
          const x = Math.cos(a) * r * k;
          const y = Math.sin(a) * r * k * 0.88;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.closePath();
        const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        gr.addColorStop(0, '#a99a8a');
        gr.addColorStop(1, '#4a3f37');
        g.fillStyle = gr;
        g.fill();
        g.save();
        g.clip();
        this.craterField(r, 'rgba(40,30,25,0.55)', 0);
        // Glittering stardust veins.
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          const d = (i % 5) / 5 + 0.1;
          g.fillStyle = `rgba(255,230,140,${0.5 + 0.5 * Math.sin(t * 3 + i)})`;
          g.fillRect(Math.cos(a) * d * r, Math.sin(a) * d * r, 3, 3);
        }
        g.restore();
        break;
      }
      case 1: {
        g.fillStyle = '#c8c9d4';
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = 'rgba(120,120,140,0.5)';
        g.beginPath();
        g.ellipse(-r * 0.3, r * 0.1, r * 0.35, r * 0.25, 0.4, 0, TAU);
        g.fill();
        this.craterField(r, 'rgba(110,110,130,0.7)', t * 0.05);
        g.restore();
        this.shade(r);
        break;
      }
      case 2: {
        g.fillStyle = '#1f6fd1';
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        g.save();
        g.clip();
        const spin = (t * 0.06) % TAU;
        g.fillStyle = '#3fae5a';
        for (let i = 0; i < 6; i++) {
          const a = i * 1.1 + spin;
          const x = Math.sin(a) * r * 0.9;
          if (Math.cos(a) < -0.1) continue;
          g.beginPath();
          g.ellipse(x, (i % 3 - 1) * r * 0.45, r * 0.28 * Math.cos(a) + 2, r * 0.2, 0, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 5; i++) {
          const a = i * 1.4 + spin * 1.6;
          if (Math.cos(a) < 0) continue;
          g.beginPath();
          g.ellipse(Math.sin(a) * r * 0.85, (i - 2) * r * 0.32, r * 0.3 * Math.cos(a) + 2, r * 0.05, 0, 0, TAU);
          g.fill();
        }
        g.restore();
        this.shade(r);
        g.strokeStyle = 'rgba(120,190,255,0.5)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(0, 0, r + 2, 0, TAU);
        g.stroke();
        break;
      }
      case 3: {
        this.ring(r, true);
        g.save();
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.clip();
        const bands = ['#e9b97a', '#c7804a', '#f1d3a0', '#a85d3a', '#e2a066', '#f6e0b8', '#b86a40'];
        const off = (t * 6) % (r * 2);
        for (let i = -1; i < 9; i++) {
          g.fillStyle = bands[(i + 7) % bands.length];
          g.fillRect(-r, -r + i * (r / 4) + Math.sin(t + i) * 2, r * 2, r / 4 + 1);
        }
        g.fillStyle = 'rgba(200,80,50,0.8)';
        g.beginPath();
        g.ellipse(((off / (r * 2)) * 2 - 1) * r * 0.9, r * 0.3, r * 0.16, r * 0.09, 0, 0, TAU);
        g.fill();
        g.restore();
        this.shade(r);
        this.ring(r, false);
        break;
      }
      case 4: {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, '#fffbe8');
        gr.addColorStop(0.6, '#ffd35a');
        gr.addColorStop(1, '#ff8a2a');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        g.save();
        g.clip();
        // Soft convection cells drifting across the surface.
        for (let i = 0; i < 40; i++) {
          const a = i * 2.39996 + t * 0.03;
          const d = Math.sqrt(i / 40) * r;
          const x = Math.cos(a) * d;
          const y = Math.sin(a) * d;
          const cr = r * 0.16;
          const cg = g.createRadialGradient(x, y, 0, x, y, cr);
          cg.addColorStop(0, `rgba(255,250,220,${0.18 + 0.12 * Math.sin(t * 1.5 + i)})`);
          cg.addColorStop(1, 'rgba(255,200,80,0)');
          g.fillStyle = cg;
          g.fillRect(x - cr, y - cr, cr * 2, cr * 2);
        }
        g.restore();
        for (let i = 0; i < 3; i++) {
          const a = t * 0.3 + i * 2.1;
          g.strokeStyle = 'rgba(255,170,60,0.6)';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.18, a + Math.PI * 0.2, a + Math.PI * 1.1);
          g.stroke();
        }
        break;
      }
      case 5: {
        g.save();
        g.rotate(t * 2.5);
        for (const dir of [1, -1]) {
          const gr = g.createLinearGradient(0, 0, 0, dir * r * 3);
          gr.addColorStop(0, 'rgba(190,240,255,0.9)');
          gr.addColorStop(1, 'rgba(190,240,255,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(-r * 0.12, 0);
          g.lineTo(r * 0.12, 0);
          g.lineTo(r * 0.5, dir * r * 3);
          g.lineTo(-r * 0.5, dir * r * 3);
          g.fill();
        }
        g.restore();
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.5, '#9ef7ff');
        gr.addColorStop(1, 'rgba(60,120,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, r * 0.7, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(160,220,255,0.5)';
        g.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(0, 0, r * (0.9 + i * 0.15), r * (0.3 + i * 0.05), t * 0.5 + i, 0, TAU);
          g.stroke();
        }
        break;
      }
      default: {
        this.disk(r, true);
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(0, 0, r * 0.62, 0, TAU);
        g.fill();
        g.strokeStyle = `rgba(255,200,140,${0.7 + 0.3 * Math.sin(t * 3)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, r * 0.64, 0, TAU);
        g.stroke();
        this.disk(r, false);
      }
    }
  }

  private ring(r: number, back: boolean): void {
    const g = this.ctx;
    g.save();
    g.rotate(-0.35);
    g.beginPath();
    if (back) g.rect(-r * 2.2, -r * 2, r * 4.4, r * 2);
    else g.rect(-r * 2.2, 0, r * 4.4, r * 2);
    g.clip();
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = ['rgba(240,210,160,0.8)', 'rgba(200,160,110,0.6)', 'rgba(250,230,190,0.7)', 'rgba(180,140,100,0.5)'][i];
      g.lineWidth = r * 0.07;
      g.beginPath();
      g.ellipse(0, 0, r * (1.35 + i * 0.12), r * (0.28 + i * 0.03), 0, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  private disk(r: number, back: boolean): void {
    const g = this.ctx;
    g.save();
    g.rotate(-0.25);
    g.beginPath();
    if (back) g.rect(-r * 2.5, -r * 2, r * 5, r * 2);
    else g.rect(-r * 2.5, 0, r * 5, r * 2);
    g.clip();
    for (let i = 0; i < 6; i++) {
      const a = 0.8 - i * 0.12;
      g.strokeStyle = `rgba(255,${150 + i * 15},${60 + i * 20},${a})`;
      g.lineWidth = r * 0.09;
      g.beginPath();
      g.ellipse(0, 0, r * (0.85 + i * 0.16), r * (0.22 + i * 0.04), 0, 0, TAU);
      g.stroke();
    }
    g.restore();
    if (back) {
      // Light bent over the top of the hole.
      g.strokeStyle = 'rgba(255,190,120,0.55)';
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.arc(0, 0, r * 0.78, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    }
  }

  private drawDrones(cx: number, cy: number, r: number): void {
    const n = Math.min(this.drones, 50);
    if (!n) return;
    const g = this.ctx;
    for (let i = 0; i < n; i++) {
      const ring = i < 25 ? 0 : 1;
      const inRing = ring === 0 ? Math.min(n, 25) : n - 25;
      const idx = ring === 0 ? i : i - 25;
      const a = (idx / inRing) * TAU + this.t * (ring === 0 ? 0.25 : -0.18);
      const rr = r * (ring === 0 ? 1.42 : 1.62);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.92;
      const bob = Math.sin(this.t * 4 + i) * 1.5;
      g.fillStyle = '#8fa3d8';
      g.fillRect(x - 6, y - 1 + bob, 12, 2);
      g.fillStyle = '#dfe8ff';
      g.beginPath();
      g.arc(x, y + bob, 3.2, 0, TAU);
      g.fill();
      g.fillStyle = '#5ef0ff';
      g.fillRect(x - 1, y - 1 + bob, 2, 2);
      // A tiny mining laser now and then.
      if (Math.sin(this.t * 3 + i * 1.7) > 0.93) {
        g.strokeStyle = 'rgba(94,240,255,0.7)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y + bob);
        g.lineTo(cx + (x - cx) * 0.7, cy + (y - cy) * 0.7);
        g.stroke();
      }
    }
  }

  private drawComet(): void {
    const c = this.comet;
    if (!c) return;
    const g = this.ctx;
    const head = c.black ? '#c58bff' : '#e8fdff';
    for (let i = c.trail.length - 1; i > 0; i--) {
      const [x, y] = c.trail[i];
      const k = 1 - i / c.trail.length;
      g.fillStyle = c.black ? `rgba(160,80,255,${k * 0.5})` : `rgba(150,240,255,${k * 0.5})`;
      g.beginPath();
      g.arc(x, y, 3 + k * 9, 0, TAU);
      g.fill();
    }
    if (c.dead) return;
    const pulse = 1 + 0.15 * Math.sin(this.t * 10);
    const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 30 * pulse);
    gr.addColorStop(0, head);
    gr.addColorStop(0.4, c.black ? 'rgba(120,40,220,0.8)' : 'rgba(120,230,255,0.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c.x, c.y, 30 * pulse, 0, TAU);
    g.fill();
    g.fillStyle = c.black ? '#120420' : '#ffffff';
    g.beginPath();
    g.arc(c.x, c.y, 8, 0, TAU);
    g.fill();
  }
}
