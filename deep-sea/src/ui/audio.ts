// Synthesised sounds with Web Audio: a bubbly tap, a chime for rewards.

let audioCtx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!audioCtx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx!.state === 'suspended') audioCtx!.resume();
  return audioCtx;
}

function playBubble(pitch = 1) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  const f = (380 + Math.random() * 120) * pitch;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + 0.14);
}

function playChime() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [523, 659, 784, 1047].forEach((f, k) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + k * 0.07);
    g.gain.exponentialRampToValueAtTime(0.12, t + k * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.07 + 0.5);
    o.connect(g).connect(ac.destination);
    o.start(t + k * 0.07);
    o.stop(t + k * 0.07 + 0.55);
  });
}

function playWhale() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.linearRampToValueAtTime(320, t + 0.6);
  o.frequency.linearRampToValueAtTime(140, t + 1.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + 1.9);
}
