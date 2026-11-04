// Tiny synthesized "psy" chirp — no audio assets. Two quick pitched blips
// through a lowpass, with light randomization so it never sounds identical.
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function blip(at: number, freq: number, dur: number) {
  const c = ac();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2400;
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq * 1.6, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + dur * 0.6);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain); gain.connect(lp); lp.connect(c.destination);
  osc.start(at); osc.stop(at + dur + 0.02);
}

/** Play a short "psy!" (1-2 syllables). */
export function psy(syllables = 2) {
  const c = ac();
  if (c.state === 'suspended') c.resume();
  const base = 520 + Math.random() * 80;
  let t = c.currentTime + 0.01;
  for (let i = 0; i < syllables; i++) {
    blip(t, base * (i === 0 ? 1 : 1.18 + Math.random() * 0.1), 0.12);
    t += 0.16;
  }
}
