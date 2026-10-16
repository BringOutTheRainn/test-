// Tiny synthesized sound effects, so the game needs no audio files.

let audioCtx: AudioContext | null = null;
let soundOn = true;

function setSound(on: boolean): void { soundOn = on; }

function unlockAudio(): void {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor) audioCtx = new Ctor();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0): void {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator();
  const gn = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, delay = 0): void {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime + delay;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  const gn = audioCtx.createGain();
  gn.gain.value = vol;
  src.buffer = buf;
  src.connect(gn).connect(audioCtx.destination);
  src.start(t);
}

function playSfx(name: string): void {
  switch (name) {
    case 'tap': tone(660, 0.05, 'square', 0.04); break;
    case 'hit': noise(0.09, 0.18); tone(180, 0.1, 'square', 0.06, -80); break;
    case 'crit': noise(0.14, 0.25); tone(320, 0.16, 'sawtooth', 0.08, -200); break;
    case 'heal': tone(523, 0.12, 'sine', 0.08, 0); tone(784, 0.18, 'sine', 0.07, 0, 0.08); break;
    case 'buff': tone(440, 0.1, 'triangle', 0.07, 220); break;
    case 'debuff': tone(330, 0.16, 'triangle', 0.07, -160); break;
    case 'death': tone(220, 0.35, 'square', 0.06, -170); break;
    case 'block': tone(900, 0.06, 'square', 0.05, -300); break;
    case 'coin': tone(988, 0.07, 'square', 0.05); tone(1319, 0.12, 'square', 0.05, 0, 0.07); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.05, 0, i * 0.08)); break;
    case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.05, 0, i * 0.1)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, 0, i * 0.16)); break;
    case 'wave': tone(196, 0.3, 'sawtooth', 0.05, 100); break;
  }
}
