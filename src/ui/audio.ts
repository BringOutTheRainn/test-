// Synthesized sound effects and an ambient pad, so the game ships no audio files.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicNodes: AudioNode[] = [];
let soundOn = true;
let musicOn = true;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** Call from a user gesture: browsers only start audio after one. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
  if (musicOn) startMusic();
}

export function setSound(on: boolean): void {
  soundOn = on;
}

export function setMusic(on: boolean): void {
  musicOn = on;
  if (on) startMusic();
  else stopMusic();
}

export function suspendAudio(): void {
  if (ctx && ctx.state === 'running') void ctx.suspend();
}

export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  if (!soundOn) return;
  const c = ensure();
  if (!c || !master || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let lastTap = 0;
export function sfxTap(): void {
  const now = performance.now();
  if (now - lastTap < 35) return;
  lastTap = now;
  const f = 520 + Math.random() * 160;
  blip(f, 0.09, 'sine', 0.25, f * 1.6);
}

export function sfxBuy(): void {
  blip(440, 0.08, 'triangle', 0.25);
  blip(660, 0.12, 'triangle', 0.25, undefined, 0.06);
}

export function sfxUpgrade(): void {
  [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.14, 'triangle', 0.2, undefined, i * 0.05));
}

export function sfxDenied(): void {
  blip(180, 0.12, 'square', 0.08, 120);
}

export function sfxComet(): void {
  [880, 1175, 1568, 2093].forEach((f, i) => blip(f, 0.25, 'sine', 0.18, f * 1.02, i * 0.07));
}

export function sfxAchievement(): void {
  [659, 784, 988, 1319].forEach((f, i) => blip(f, 0.3, 'sine', 0.2, undefined, i * 0.09));
}

export function sfxCollapse(): void {
  blip(400, 1.6, 'sawtooth', 0.15, 40);
  blip(80, 2.2, 'sine', 0.3, 30, 0.4);
}

function startMusic(): void {
  const c = ensure();
  if (!c || !master || musicGain) return;
  musicGain = c.createGain();
  musicGain.gain.value = 0;
  musicGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(musicGain).connect(master);
  // A soft A minor 9 drone, slightly detuned.
  const nodes: AudioNode[] = [lfo];
  for (const [f, detune] of [[110, -6], [110, 6], [164.8, 0], [246.9, 4], [261.6, -4]]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(filter);
    o.start();
    nodes.push(o);
  }
  lfo.start();
  musicNodes = nodes;
}

function stopMusic(): void {
  if (!ctx || !musicGain) return;
  const g = musicGain;
  const nodes = musicNodes;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  setTimeout(() => nodes.forEach((n) => (n as OscillatorNode).stop?.()), 600);
  musicGain = null;
  musicNodes = [];
}
