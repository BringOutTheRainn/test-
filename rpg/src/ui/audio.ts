// Tiny synthesized sound effects, so the game needs no audio files.

let audioCtx: AudioContext | null = null;
let soundOn = true;

function setSound(on: boolean): void {
  soundOn = on;
  if (!on) stopMusic(); else if (wantSong) playMusic(wantSong);
}

function unlockAudio(): void {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor) audioCtx = new Ctor();
  if (wantSong) playMusic(wantSong);
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

// ---- Music: a tiny chiptune sequencer. Each song is a chord loop; bass, arpeggio, drums and a
// melody are generated from it, so there are no audio files to ship.

interface Song {
  bpm: number;
  /** One chord per bar: MIDI root and minor or major. */
  prog: [number, 'm' | 'M'][];
  bass: number[];
  kick: number[];
  hat: boolean;
  arp: OscillatorType;
  lead: OscillatorType;
  /** Chance per beat of a melody note. */
  busy: number;
  vol: number;
}

const SONGS: Record<string, Song> = {
  // The keep and the map: slow, warm, a little uneasy.
  town: { bpm: 84, prog: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M'], [57, 'm'], [53, 'M'], [52, 'M'], [52, 'M']], bass: [0, 4], kick: [], hat: false, arp: 'triangle', lead: 'sine', busy: 0.45, vol: 0.5 },
  // Ordinary fights: driving minor loop.
  battle: { bpm: 132, prog: [[57, 'm'], [57, 'm'], [53, 'M'], [55, 'M'], [57, 'm'], [57, 'm'], [50, 'm'], [52, 'M']], bass: [0, 2, 3, 4, 6], kick: [0, 4], hat: true, arp: 'square', lead: 'square', busy: 0.6, vol: 0.42 },
  // Bosses: faster and darker.
  boss: { bpm: 150, prog: [[50, 'm'], [46, 'M'], [43, 'm'], [45, 'M'], [50, 'm'], [46, 'M'], [48, 'M'], [45, 'M']], bass: [0, 1, 2, 3, 4, 5, 6, 7], kick: [0, 2, 4, 6], hat: true, arp: 'sawtooth', lead: 'square', busy: 0.7, vol: 0.4 },
};

let musicOn = true;
let musicGain: GainNode | null = null;
let song: string | null = null;
let wantSong: string | null = null;
let step = 0;
let nextTime = 0;
let melodySeed = 1;
let timer: number | null = null;

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function setMusic(on: boolean): void {
  musicOn = on;
  if (!on) stopMusic(); else if (wantSong) playMusic(wantSong);
}

/** Starts a song, or keeps the current one playing if it's the same. */
function playMusic(name: string): void {
  wantSong = name;
  if (!audioCtx || !musicOn || !soundOn || document.hidden) return;
  if (song === name && timer !== null) return;
  song = name;
  step = 0;
  melodySeed = 1;
  if (!musicGain) { musicGain = audioCtx.createGain(); musicGain.connect(audioCtx.destination); }
  musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
  musicGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  musicGain.gain.exponentialRampToValueAtTime(SONGS[name].vol, audioCtx.currentTime + 0.8);
  nextTime = audioCtx.currentTime + 0.1;
  if (timer === null) timer = window.setInterval(schedule, 60);
}

function stopMusic(): void {
  if (timer !== null) { clearInterval(timer); timer = null; }
  song = null;
  if (audioCtx && musicGain) {
    musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.1);
  }
}

function note(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
  const o = audioCtx!.createOscillator();
  const gn = audioCtx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(musicGain!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(t: number, kick: boolean): void {
  if (kick) {
    const o = audioCtx!.createOscillator();
    const gn = audioCtx!.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    gn.gain.setValueAtTime(0.22, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(gn).connect(musicGain!);
    o.start(t); o.stop(t + 0.16);
    return;
  }
  const len = Math.floor(audioCtx!.sampleRate * 0.03);
  const buf = audioCtx!.createBuffer(1, len, audioCtx!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx!.createBufferSource();
  const gn = audioCtx!.createGain();
  gn.gain.value = 0.05;
  src.buffer = buf;
  src.connect(gn).connect(musicGain!);
  src.start(t);
}

function rnd(): number {
  melodySeed = (Math.imul(melodySeed, 1103515245) + 12345) >>> 0;
  return (melodySeed >>> 8) / 16777216;
}

function schedule(): void {
  if (!audioCtx || !song) return;
  if (document.hidden) { stopMusic(); return; }
  const sg = SONGS[song];
  const eighth = 30 / sg.bpm;
  while (nextTime < audioCtx.currentTime + 0.2) {
    const bar = Math.floor(step / 8) % sg.prog.length;
    const s8 = step % 8;
    const [root, q] = sg.prog[bar];
    const chord = [root, root + (q === 'm' ? 3 : 4), root + 7];
    if (sg.bass.includes(s8)) note(midiHz(root - 24), nextTime, eighth * 0.9, 'square', 0.07);
    note(midiHz(chord[[0, 1, 2, 1][s8 % 4]]), nextTime, eighth * 0.8, sg.arp, 0.025);
    if (sg.kick.includes(s8)) drum(nextTime, true);
    if (sg.hat && s8 % 2 === 1) drum(nextTime, false);
    // The melody repeats every 8 bars: reset the seed at the top of the loop.
    if (step % (8 * sg.prog.length) === 0) melodySeed = 7;
    if (s8 % 2 === 0 && rnd() < sg.busy) {
      const scale = q === 'm' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
      const deg = s8 === 0 ? [0, 2, 4][Math.floor(rnd() * 3)] : Math.floor(rnd() * scale.length);
      note(midiHz(root + 12 + scale[deg]), nextTime, eighth * (rnd() < 0.3 ? 3.5 : 1.8), sg.lead, 0.035);
    }
    nextTime += eighth;
    step++;
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && wantSong) playMusic(wantSong); });
